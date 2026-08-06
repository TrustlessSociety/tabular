import { createHash } from 'node:crypto';
import { one, rows } from '../lib/database.mjs';

const ROLE_BY_ACTOR = {
  alice: 'tab_alice',
  bob: 'tab_bob',
  charlie: 'tab_charlie'
};

export async function setupAuthorizationProof(db) {
  await db.exec(`
    CREATE ROLE tab_owner NOLOGIN;
    CREATE ROLE tab_alice NOLOGIN;
    CREATE ROLE tab_bob NOLOGIN;
    CREATE ROLE tab_charlie NOLOGIN;
    CREATE SCHEMA workspace;
    CREATE SCHEMA tabular;
    GRANT USAGE ON SCHEMA workspace
      TO tab_owner, tab_alice, tab_bob, tab_charlie;

    CREATE TABLE workspace.secured_rows (
      id integer PRIMARY KEY,
      owner_name text NOT NULL,
      public_value text NOT NULL,
      secret_value text NOT NULL
    );
    INSERT INTO workspace.secured_rows VALUES
      (1, 'tab_alice', 'Alice row', 'alice-secret'),
      (2, 'tab_bob', 'Bob row', 'bob-secret');
    ALTER TABLE workspace.secured_rows OWNER TO tab_owner;
    GRANT SELECT, UPDATE(public_value)
      ON workspace.secured_rows TO tab_alice, tab_bob, tab_charlie;
    ALTER TABLE workspace.secured_rows ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace.secured_rows FORCE ROW LEVEL SECURITY;
    CREATE POLICY own_rows_select ON workspace.secured_rows
      FOR SELECT TO tab_alice, tab_bob, tab_charlie
      USING (owner_name = current_user);
    CREATE POLICY own_rows_update ON workspace.secured_rows
      FOR UPDATE TO tab_alice, tab_bob, tab_charlie
      USING (owner_name = current_user)
      WITH CHECK (owner_name = current_user);

    CREATE TABLE tabular.capabilities (
      actor text NOT NULL,
      surface text NOT NULL,
      operation text NOT NULL,
      PRIMARY KEY (actor, surface, operation)
    );
    INSERT INTO tabular.capabilities VALUES
      ('alice', 'page', 'read'),
      ('alice', 'page', 'update'),
      ('alice', 'api', 'read'),
      ('alice', 'api', 'update'),
      ('bob', 'api', 'read'),
      ('bob', 'api', 'update');

    CREATE TABLE tabular.audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor text NOT NULL,
      surface text NOT NULL,
      operation text NOT NULL,
      outcome text NOT NULL,
      target_id integer,
      request_digest text NOT NULL,
      details jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export class CapabilityService {
  constructor(db) {
    this.db = db;
  }

  async appAllows(actor, surface, operation) {
    const result = await one(
      this.db,
      `SELECT EXISTS (
         SELECT 1 FROM tabular.capabilities
         WHERE actor = $1 AND surface = $2 AND operation = $3
       ) AS allowed`,
      [actor, surface, operation]
    );
    return result.allowed;
  }

  async audit(input, outcome, source) {
    await this.db.query(
      `INSERT INTO tabular.audit
        (actor, surface, operation, outcome, target_id, request_digest, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.actor,
        input.surface,
        input.operation,
        outcome,
        input.rowId ?? null,
        digest({
          actor: input.actor,
          surface: input.surface,
          operation: input.operation,
          rowId: input.rowId ?? null
        }),
        JSON.stringify({ source })
      ]
    );
  }

  async execute(input) {
    const { actor, surface, operation } = input;
    const role = ROLE_BY_ACTOR[actor];
    if (!role || !(await this.appAllows(actor, surface, operation))) {
      await this.audit(input, 'denied', 'application-policy');
      return {
        status: 'denied',
        source: 'application-policy',
        operation
      };
    }

    const result = await this.db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${role}`);
      if (operation === 'read') {
        const visible = await rows(
          tx,
          `SELECT id, owner_name, public_value
           FROM workspace.secured_rows
           ORDER BY id`
        );
        return {
          status: 'authorized',
          operation,
          rows: visible
        };
      }
      if (operation === 'update') {
        const updated = await rows(
          tx,
          `UPDATE workspace.secured_rows
           SET public_value = $2
           WHERE id = $1
           RETURNING id, owner_name, public_value`,
          [input.rowId, input.value]
        );
        if (updated.length === 0) {
          return {
            status: 'denied',
            source: 'postgresql-policy',
            operation
          };
        }
        return {
          status: 'authorized',
          operation,
          row: updated[0]
        };
      }
      return {
        status: 'denied',
        source: 'application-policy',
        operation
      };
    });
    await this.audit(
      input,
      result.status,
      result.source ?? 'application-and-postgresql'
    );
    return result;
  }
}
