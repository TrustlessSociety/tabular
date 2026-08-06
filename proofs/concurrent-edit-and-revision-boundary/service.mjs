import { one, rows } from '../lib/database.mjs';

const SETUP_SQL = `
  CREATE SCHEMA tabular;
  CREATE SCHEMA workspace;

  CREATE TABLE workspace.records (
    id integer PRIMARY KEY,
    label text NOT NULL,
    amount integer NOT NULL
  );

  CREATE TABLE tabular.row_state (
    row_id integer PRIMARY KEY REFERENCES workspace.records(id),
    version bigint NOT NULL DEFAULT 1
  );

  CREATE TABLE tabular.capabilities (
    actor text NOT NULL,
    capability text NOT NULL,
    PRIMARY KEY (actor, capability)
  );

  CREATE TABLE tabular.actions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor text NOT NULL,
    kind text NOT NULL,
    row_id integer,
    base_version bigint,
    committed_version bigint,
    before_row jsonb,
    after_row jsonb,
    reverses_action_id bigint,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO workspace.records VALUES
    (1, 'Alpha', 10),
    (2, 'Beta', 20);
  INSERT INTO tabular.row_state VALUES (1, 1), (2, 1);
  INSERT INTO tabular.capabilities VALUES
    ('alice', 'row.update'),
    ('alice', 'row.undo'),
    ('bob', 'row.update'),
    ('bob', 'row.undo');
`;

export async function setupRevisionProof(db) {
  await db.exec(SETUP_SQL);
}

export class RevisionService {
  constructor(db) {
    this.db = db;
    this.published = [];
  }

  async snapshot(rowId) {
    return one(
      this.db,
      `SELECT r.id, r.label, r.amount, s.version
       FROM workspace.records r
       JOIN tabular.row_state s ON s.row_id = r.id
       WHERE r.id = $1`,
      [rowId]
    );
  }

  async can(actor, capability, tx = this.db) {
    const result = await one(
      tx,
      `SELECT EXISTS (
         SELECT 1 FROM tabular.capabilities
         WHERE actor = $1 AND capability = $2
       ) AS allowed`,
      [actor, capability]
    );
    return result.allowed;
  }

  async update({ actor, rowId, baseVersion, patch }) {
    if (!(await this.can(actor, 'row.update'))) {
      return { status: 'denied', reason: 'capability' };
    }
    const allowed = new Set(['label', 'amount']);
    if (Object.keys(patch).some((key) => !allowed.has(key))) {
      return { status: 'invalid', reason: 'unknown-field' };
    }

    const result = await this.db.transaction(async (tx) => {
      const current = await one(
        tx,
        `SELECT r.id, r.label, r.amount, s.version
         FROM workspace.records r
         JOIN tabular.row_state s ON s.row_id = r.id
         WHERE r.id = $1
         FOR UPDATE`,
        [rowId]
      );
      if (current.version !== baseVersion) {
        return {
          status: 'conflict',
          expectedVersion: baseVersion,
          actualVersion: current.version
        };
      }
      const before = {
        id: current.id,
        label: current.label,
        amount: current.amount
      };
      const next = { ...before, ...patch };
      await tx.query(
        `UPDATE workspace.records
         SET label = $2, amount = $3
         WHERE id = $1`,
        [rowId, next.label, next.amount]
      );
      const version = current.version + 1;
      await tx.query(
        'UPDATE tabular.row_state SET version = $2 WHERE row_id = $1',
        [rowId, version]
      );
      const action = await one(
        tx,
        `INSERT INTO tabular.actions
          (actor, kind, row_id, base_version, committed_version, before_row, after_row)
         VALUES ($1, 'update', $2, $3, $4, $5::jsonb, $6::jsonb)
         RETURNING id`,
        [
          actor,
          rowId,
          baseVersion,
          version,
          JSON.stringify(before),
          JSON.stringify(next)
        ]
      );
      return { status: 'committed', actionId: action.id, version, row: next };
    });
    if (result.status === 'committed') {
      this.published.push({
        type: 'row.changed',
        actionId: result.actionId,
        rowId,
        version: result.version
      });
    }
    return result;
  }

  async reverse({ actor, actionId, baseVersion, mode }) {
    if (!(await this.can(actor, 'row.undo'))) {
      return { status: 'denied', reason: 'capability' };
    }
    const result = await this.db.transaction(async (tx) => {
      const action = await one(
        tx,
        `SELECT * FROM tabular.actions
         WHERE id = $1 AND kind = 'update'`,
        [actionId]
      );
      const current = await one(
        tx,
        `SELECT r.id, r.label, r.amount, s.version
         FROM workspace.records r
         JOIN tabular.row_state s ON s.row_id = r.id
         WHERE r.id = $1
         FOR UPDATE`,
        [action.row_id]
      );
      if (current.version !== baseVersion) {
        return {
          status: 'conflict',
          expectedVersion: baseVersion,
          actualVersion: current.version
        };
      }
      if (mode === 'undo' && current.version !== action.committed_version) {
        return {
          status: 'conflict',
          reason: 'later-work',
          actualVersion: current.version
        };
      }
      const target = mode === 'undo' ? action.before_row : action.after_row;
      const before = {
        id: current.id,
        label: current.label,
        amount: current.amount
      };
      await tx.query(
        `UPDATE workspace.records
         SET label = $2, amount = $3
         WHERE id = $1`,
        [action.row_id, target.label, target.amount]
      );
      const version = current.version + 1;
      await tx.query(
        'UPDATE tabular.row_state SET version = $2 WHERE row_id = $1',
        [action.row_id, version]
      );
      const reversal = await one(
        tx,
        `INSERT INTO tabular.actions
          (actor, kind, row_id, base_version, committed_version,
           before_row, after_row, reverses_action_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
         RETURNING id`,
        [
          actor,
          mode,
          action.row_id,
          baseVersion,
          version,
          JSON.stringify(before),
          JSON.stringify(target),
          actionId
        ]
      );
      return {
        status: 'committed',
        actionId: reversal.id,
        version,
        row: target
      };
    });
    if (result.status === 'committed') {
      this.published.push({
        type: `row.${mode}`,
        actionId: result.actionId,
        version: result.version
      });
    }
    return result;
  }

  async setCapability(actor, capability, allowed) {
    await this.db.transaction(async (tx) => {
      if (allowed) {
        await tx.query(
          `INSERT INTO tabular.capabilities(actor, capability)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [actor, capability]
        );
      } else {
        await tx.query(
          `DELETE FROM tabular.capabilities
           WHERE actor = $1 AND capability = $2`,
          [actor, capability]
        );
      }
      await tx.query(
        `INSERT INTO tabular.actions(actor, kind, after_row)
         VALUES ($1, 'permission', $2::jsonb)`,
        [actor, JSON.stringify({ capability, allowed })]
      );
    });
  }

  async reconstruct() {
    const actions = await rows(
      this.db,
      `SELECT row_id, after_row
       FROM tabular.actions
       WHERE row_id IS NOT NULL
       ORDER BY id`
    );
    const state = new Map();
    for (const action of actions) {
      state.set(action.row_id, action.after_row);
    }
    return Object.fromEntries(state);
  }
}
