import { randomUUID } from 'node:crypto';
import { one, rows } from '../lib/database.mjs';

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function setupNativeTableProof(db) {
  await db.exec(`
    CREATE ROLE tabular_owner NOLOGIN;
    CREATE ROLE tabular_editor NOLOGIN;
    CREATE ROLE tabular_other NOLOGIN;
    CREATE SCHEMA workspace;
    CREATE SCHEMA tabular;
    GRANT USAGE ON SCHEMA workspace
      TO tabular_owner, tabular_editor, tabular_other;

    CREATE TABLE workspace.organizations (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name text NOT NULL UNIQUE
    );
    INSERT INTO workspace.organizations(name) VALUES ('Acme');

    CREATE TABLE workspace.contacts (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organization_id bigint REFERENCES workspace.organizations(id),
      owner_name text NOT NULL DEFAULT current_user,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      price numeric(12, 2) CHECK (price >= 0),
      active boolean NOT NULL DEFAULT false,
      display_label text GENERATED ALWAYS AS
        (name || ' <' || email || '>') STORED
    );
    CREATE FUNCTION workspace.reject_blocked_name()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.name = 'Blocked' THEN
        RAISE EXCEPTION 'cell:name:blocklisted';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER contacts_reject_blocked
      BEFORE INSERT OR UPDATE ON workspace.contacts
      FOR EACH ROW EXECUTE FUNCTION workspace.reject_blocked_name();
    ALTER TABLE workspace.contacts OWNER TO tabular_owner;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace.contacts
      TO tabular_editor, tabular_other;
    GRANT USAGE, SELECT ON SEQUENCE workspace.contacts_id_seq
      TO tabular_editor, tabular_other;
    ALTER TABLE workspace.contacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace.contacts FORCE ROW LEVEL SECURITY;
    CREATE POLICY contacts_owner_policy ON workspace.contacts
      TO tabular_editor, tabular_other
      USING (owner_name = current_user)
      WITH CHECK (owner_name = current_user);

    CREATE TABLE workspace.order_items (
      order_id bigint NOT NULL,
      line_no integer NOT NULL,
      label text,
      PRIMARY KEY (order_id, line_no)
    );
    CREATE TABLE workspace.no_key (
      label text
    );
    CREATE TABLE workspace.legacy_records (
      external_id text PRIMARY KEY,
      payload text NOT NULL
    );
    CREATE TABLE workspace.drift_fixture (
      id bigint PRIMARY KEY,
      old_name text,
      quantity integer,
      to_drop text
    );

    CREATE TABLE tabular.table_metadata (
      id text PRIMARY KEY,
      relation_oid oid NOT NULL UNIQUE,
      schema_name text NOT NULL,
      table_name text NOT NULL,
      key_kind text NOT NULL,
      key_columns jsonb NOT NULL,
      observed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE tabular.column_metadata (
      id text PRIMARY KEY,
      table_id text NOT NULL REFERENCES tabular.table_metadata(id),
      attnum smallint NOT NULL,
      column_name text NOT NULL,
      observed_type text NOT NULL,
      field_type text NOT NULL DEFAULT 'text',
      output_format text NOT NULL DEFAULT 'plain',
      state text NOT NULL DEFAULT 'active',
      UNIQUE (table_id, attnum)
    );
    CREATE TABLE tabular.drafts (
      id text PRIMARY KEY,
      table_id text NOT NULL REFERENCES tabular.table_metadata(id),
      patch jsonb NOT NULL,
      state text NOT NULL DEFAULT 'open',
      error jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE tabular.action_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      table_id text NOT NULL,
      draft_id text,
      action text NOT NULL,
      row_data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function catalogTable(db, schemaName, tableName) {
  return one(
    db,
    `SELECT c.oid AS relation_oid, n.nspname AS schema_name, c.relname AS table_name,
            c.relrowsecurity, c.relforcerowsecurity, c.relacl::text AS relacl
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r', 'p')`,
    [schemaName, tableName]
  );
}

async function catalogColumns(db, relationOid) {
  return rows(
    db,
    `SELECT a.attnum, a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            a.attnotnull, a.attidentity, a.attgenerated
     FROM pg_attribute a
     WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [relationOid]
  );
}

async function keyShape(db, relationOid) {
  const primary = await one(
    db,
    `SELECT jsonb_agg(a.attname ORDER BY key_part.ordinality) AS columns
     FROM pg_index i
     JOIN unnest(i.indkey) WITH ORDINALITY
       AS key_part(attnum, ordinality) ON true
     JOIN pg_attribute a
       ON a.attrelid = i.indrelid AND a.attnum = key_part.attnum
     WHERE i.indrelid = $1 AND i.indisprimary`,
    [relationOid]
  );
  const columns = primary?.columns ?? [];
  return {
    kind:
      columns.length === 0
        ? 'absent'
        : columns.length === 1
          ? 'single'
          : 'composite',
    columns
  };
}

export class NativeTableService {
  constructor(db) {
    this.db = db;
  }

  async createSpreadsheet(schemaName, tableName) {
    const schema = quoteIdentifier(schemaName);
    const table = quoteIdentifier(tableName);
    await this.db.exec(`
      CREATE TABLE ${schema}.${table} (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
      )
    `);
    return this.register(schemaName, tableName);
  }

  async addHeader(tableId, columnName) {
    const metadata = await one(
      this.db,
      'SELECT * FROM tabular.table_metadata WHERE id = $1',
      [tableId]
    );
    await this.db.exec(
      `ALTER TABLE ${quoteIdentifier(metadata.schema_name)}.${quoteIdentifier(metadata.table_name)}
       ADD COLUMN ${quoteIdentifier(columnName)} text`
    );
    await this.reconcile(tableId);
    return one(
      this.db,
      `SELECT * FROM tabular.column_metadata
       WHERE table_id = $1 AND column_name = $2`,
      [tableId, columnName]
    );
  }

  async register(schemaName, tableName) {
    const catalog = await catalogTable(this.db, schemaName, tableName);
    if (!catalog) throw new Error('table-not-found');
    const existing = await one(
      this.db,
      'SELECT * FROM tabular.table_metadata WHERE relation_oid = $1',
      [catalog.relation_oid]
    );
    const key = await keyShape(this.db, catalog.relation_oid);
    const tableId = existing?.id ?? randomUUID();
    if (existing) {
      await this.db.query(
        `UPDATE tabular.table_metadata
         SET schema_name = $2, table_name = $3, key_kind = $4,
             key_columns = $5::jsonb, observed_at = now()
         WHERE id = $1`,
        [
          tableId,
          schemaName,
          tableName,
          key.kind,
          JSON.stringify(key.columns)
        ]
      );
    } else {
      await this.db.query(
        `INSERT INTO tabular.table_metadata
          (id, relation_oid, schema_name, table_name, key_kind, key_columns)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          tableId,
          catalog.relation_oid,
          schemaName,
          tableName,
          key.kind,
          JSON.stringify(key.columns)
        ]
      );
    }
    const columns = await catalogColumns(this.db, catalog.relation_oid);
    for (const column of columns) {
      await this.db.query(
        `INSERT INTO tabular.column_metadata
          (id, table_id, attnum, column_name, observed_type)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (table_id, attnum) DO UPDATE SET
           column_name = EXCLUDED.column_name,
           observed_type = EXCLUDED.observed_type,
           state = 'active'`,
        [
          randomUUID(),
          tableId,
          column.attnum,
          column.column_name,
          column.data_type
        ]
      );
    }
    return one(
      this.db,
      'SELECT * FROM tabular.table_metadata WHERE id = $1',
      [tableId]
    );
  }

  async setPresentation(tableId, columnName, fieldType, outputFormat) {
    await this.db.query(
      `UPDATE tabular.column_metadata
       SET field_type = $3, output_format = $4
       WHERE table_id = $1 AND column_name = $2`,
      [tableId, columnName, fieldType, outputFormat]
    );
  }

  async reconcile(tableId) {
    const metadata = await one(
      this.db,
      'SELECT * FROM tabular.table_metadata WHERE id = $1',
      [tableId]
    );
    const liveTable = await one(
      this.db,
      `SELECT c.oid AS relation_oid, n.nspname AS schema_name,
              c.relname AS table_name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.oid = $1`,
      [metadata.relation_oid]
    );
    if (!liveTable) return [{ kind: 'table-dropped' }];
    const events = [];
    if (
      liveTable.schema_name !== metadata.schema_name ||
      liveTable.table_name !== metadata.table_name
    ) {
      events.push({
        kind: 'table-renamed',
        from: `${metadata.schema_name}.${metadata.table_name}`,
        to: `${liveTable.schema_name}.${liveTable.table_name}`
      });
    }
    const liveColumns = await catalogColumns(this.db, metadata.relation_oid);
    const knownColumns = await rows(
      this.db,
      `SELECT * FROM tabular.column_metadata
       WHERE table_id = $1 ORDER BY attnum`,
      [tableId]
    );
    const liveByAttnum = new Map(
      liveColumns.map((column) => [column.attnum, column])
    );
    const knownByAttnum = new Map(
      knownColumns.map((column) => [column.attnum, column])
    );
    for (const known of knownColumns) {
      const live = liveByAttnum.get(known.attnum);
      if (!live) {
        events.push({ kind: 'column-dropped', columnId: known.id });
        await this.db.query(
          `UPDATE tabular.column_metadata SET state = 'dropped' WHERE id = $1`,
          [known.id]
        );
        continue;
      }
      if (live.column_name !== known.column_name) {
        events.push({
          kind: 'column-renamed',
          columnId: known.id,
          from: known.column_name,
          to: live.column_name
        });
      }
      if (live.data_type !== known.observed_type) {
        events.push({
          kind: 'column-type-changed',
          columnId: known.id,
          from: known.observed_type,
          to: live.data_type
        });
      }
      await this.db.query(
        `UPDATE tabular.column_metadata
         SET column_name = $2, observed_type = $3, state = 'active'
         WHERE id = $1`,
        [known.id, live.column_name, live.data_type]
      );
    }
    for (const live of liveColumns) {
      if (knownByAttnum.has(live.attnum)) continue;
      const columnId = randomUUID();
      events.push({
        kind: 'column-added',
        columnId,
        column: live.column_name
      });
      await this.db.query(
        `INSERT INTO tabular.column_metadata
          (id, table_id, attnum, column_name, observed_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [columnId, tableId, live.attnum, live.column_name, live.data_type]
      );
    }
    const key = await keyShape(this.db, metadata.relation_oid);
    await this.db.query(
      `UPDATE tabular.table_metadata
       SET schema_name = $2, table_name = $3, key_kind = $4,
           key_columns = $5::jsonb, observed_at = now()
       WHERE id = $1`,
      [
        tableId,
        liveTable.schema_name,
        liveTable.table_name,
        key.kind,
        JSON.stringify(key.columns)
      ]
    );
    return events;
  }

  async createDraft(tableId, patch) {
    return one(
      this.db,
      `INSERT INTO tabular.drafts(id, table_id, patch)
       VALUES ($1, $2, $3::jsonb) RETURNING *`,
      [randomUUID(), tableId, JSON.stringify(patch)]
    );
  }

  async updateDraft(draftId, patch) {
    return one(
      this.db,
      `UPDATE tabular.drafts
       SET patch = patch || $2::jsonb, error = NULL
       WHERE id = $1 AND state = 'open'
       RETURNING *`,
      [draftId, JSON.stringify(patch)]
    );
  }

  async mapError(error, relationOid) {
    if (error.code === '23502') {
      return {
        code: error.code,
        fields: [error.column],
        message: 'required-value-missing'
      };
    }
    if (error.constraint) {
      const constrained = await one(
        this.db,
        `SELECT jsonb_agg(a.attname ORDER BY key_part.ordinality) AS fields
         FROM pg_constraint c
         JOIN unnest(c.conkey) WITH ORDINALITY
           AS key_part(attnum, ordinality) ON true
         JOIN pg_attribute a
           ON a.attrelid = c.conrelid AND a.attnum = key_part.attnum
         WHERE c.conrelid = $1 AND c.conname = $2`,
        [relationOid, error.constraint]
      );
      return {
        code: error.code,
        constraint: error.constraint,
        fields: constrained?.fields ?? [],
        message: 'constraint-failed'
      };
    }
    const triggerField = /cell:([^:]+):/.exec(error.message)?.[1];
    return {
      code: error.code,
      fields: triggerField ? [triggerField] : [],
      message: triggerField ? 'trigger-rejected' : 'database-rejected'
    };
  }

  async promoteDraft(draftId, role = 'tabular_editor') {
    if (!['tabular_editor', 'tabular_other'].includes(role)) {
      throw new Error('unknown-role');
    }
    const draft = await one(
      this.db,
      `SELECT d.*, t.relation_oid, t.schema_name, t.table_name
       FROM tabular.drafts d
       JOIN tabular.table_metadata t ON t.id = d.table_id
       WHERE d.id = $1`,
      [draftId]
    );
    const liveColumns = await catalogColumns(this.db, draft.relation_oid);
    const writable = new Set(
      liveColumns
        .filter(
          (column) => column.attidentity === '' && column.attgenerated === ''
        )
        .map((column) => column.column_name)
    );
    const keys = Object.keys(draft.patch);
    if (keys.some((key) => !writable.has(key))) {
      return { status: 'invalid', fields: keys.filter((key) => !writable.has(key)) };
    }
    const table = `${quoteIdentifier(draft.schema_name)}.${quoteIdentifier(draft.table_name)}`;
    const columns = keys.map(quoteIdentifier).join(', ');
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    try {
      return await this.db.transaction(async (tx) => {
        const locked = await one(
          tx,
          `SELECT state FROM tabular.drafts WHERE id = $1 FOR UPDATE`,
          [draftId]
        );
        if (locked.state !== 'open') {
          return { status: 'not-open' };
        }
        await tx.exec(`SET LOCAL ROLE ${role}`);
        const inserted = await one(
          tx,
          `INSERT INTO ${table} (${columns})
           VALUES (${placeholders})
           RETURNING *`,
          keys.map((key) => draft.patch[key])
        );
        await tx.exec('RESET ROLE');
        await tx.query(
          `UPDATE tabular.drafts
           SET state = 'committed', error = NULL WHERE id = $1`,
          [draftId]
        );
        await tx.query(
          `INSERT INTO tabular.action_history
            (table_id, draft_id, action, row_data)
           VALUES ($1, $2, 'draft.promoted', $3::jsonb)`,
          [draft.table_id, draftId, JSON.stringify(inserted)]
        );
        return { status: 'committed', row: inserted };
      });
    } catch (error) {
      const mapped = await this.mapError(error, draft.relation_oid);
      await this.db.query(
        `UPDATE tabular.drafts SET error = $2::jsonb
         WHERE id = $1 AND state = 'open'`,
        [draftId, JSON.stringify(mapped)]
      );
      return { status: 'rejected', error: mapped };
    }
  }
}

export const catalog = {
  table: catalogTable,
  columns: catalogColumns,
  key: keyShape
};
