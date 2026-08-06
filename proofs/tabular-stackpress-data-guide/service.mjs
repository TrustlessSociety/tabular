import { createHash } from 'node:crypto';
import { one, rows } from '../lib/database.mjs';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const ROLE_BY_ACTOR = {
  alice: 'tab_alice',
  bob: 'tab_bob',
  owner: 'tab_publisher',
  admin: 'tab_admin'
};
const MIGRATION_ROLE = 'tab_migrator';

function quoteIdentifier(value) {
  if (!IDENTIFIER.test(value)) throw new Error(`unsafe-identifier:${value}`);
  return `"${value}"`;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const ORDER_COLUMNS = new Set(['id', 'order_number', 'customer', 'amount', 'version']);
const FILTER_OPERATORS = { eq: '=', ne: '<>', ge: '>=', le: '<=', gt: '>', lt: '<' };

function orderQuery(definition = {}, select = `id, order_number, customer,
  amount::float8 AS amount, amount_with_tax::float8 AS amount_with_tax,
  invoice_id, version`) {
  const clauses = [];
  const values = [];
  for (const filter of definition.filters ?? []) {
    if (!ORDER_COLUMNS.has(filter.column) || !FILTER_OPERATORS[filter.op]) {
      throw new Error('unsupported-filter');
    }
    values.push(filter.value);
    clauses.push(`${quoteIdentifier(filter.column)} ${FILTER_OPERATORS[filter.op]} $${values.length}`);
  }
  const sort = definition.sort?.[0]?.split(':') ?? ['id', 'asc'];
  if (!ORDER_COLUMNS.has(sort[0]) || !['asc', 'desc'].includes(sort[1]?.toLowerCase())) {
    throw new Error('unsupported-sort');
  }
  return {
    sql: `SELECT ${select} FROM operations.orders${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY ${quoteIdentifier(sort[0])} ${sort[1].toUpperCase()} LIMIT 40`,
    values
  };
}

function sqlLiteral(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function publishedViewQuery(definition = {}) {
  const clauses = (definition.filters ?? []).map((filter) => {
    if (!ORDER_COLUMNS.has(filter.column) || !FILTER_OPERATORS[filter.op]) {
      throw new Error('unsupported-published-filter');
    }
    return `${quoteIdentifier(filter.column)} ${FILTER_OPERATORS[filter.op]} ${sqlLiteral(filter.value)}`;
  });
  const sort = definition.sort?.[0]?.split(':') ?? ['id', 'asc'];
  if (!ORDER_COLUMNS.has(sort[0]) || !['asc', 'desc'].includes(sort[1]?.toLowerCase())) {
    throw new Error('unsupported-published-sort');
  }
  return `SELECT id, order_number, customer, amount, version FROM operations.orders
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY ${quoteIdentifier(sort[0])} ${sort[1].toUpperCase()}`;
}

export async function setupDataGuide(db) {
  await db.exec(`
    CREATE ROLE tab_owner NOLOGIN;
    CREATE ROLE tab_migrator NOLOGIN BYPASSRLS;
    CREATE ROLE tab_publisher NOLOGIN;
    CREATE ROLE tab_alice NOLOGIN;
    CREATE ROLE tab_bob NOLOGIN;
    CREATE ROLE tab_admin NOLOGIN;
    GRANT tab_owner TO tab_migrator, tab_publisher;

    CREATE SCHEMA operations;
    CREATE SCHEMA finance;
    CREATE SCHEMA tabular;
    GRANT USAGE ON SCHEMA operations, finance TO tab_owner, tab_migrator,
      tab_publisher, tab_alice, tab_bob, tab_admin;
    GRANT CREATE ON SCHEMA operations TO tab_migrator;

    CREATE TABLE finance.invoices (
      id bigint PRIMARY KEY,
      invoice_number text UNIQUE NOT NULL,
      customer_name text NOT NULL
    );
    INSERT INTO finance.invoices VALUES
      (1, 'INV-9321', 'Northstar Market'),
      (2, 'INV-9322', 'Lumen Workshop');
    ALTER TABLE finance.invoices OWNER TO tab_owner;
    GRANT SELECT ON finance.invoices TO tab_alice, tab_bob;

    CREATE TABLE operations.orders (
      id bigint PRIMARY KEY,
      owner_role text NOT NULL,
      order_number text UNIQUE NOT NULL,
      customer text NOT NULL,
      amount numeric(12,2) NOT NULL CHECK (amount >= 0),
      amount_with_tax numeric(12,2) GENERATED ALWAYS AS (amount * 1.12) STORED,
      invoice_id bigint REFERENCES finance.invoices(id) ON DELETE NO ACTION,
      version bigint NOT NULL DEFAULT 1,
      "__tabular_v1_cells" text NOT NULL DEFAULT 'legacy-user-column'
    );
    INSERT INTO operations.orders
      (id, owner_role, order_number, customer, amount, invoice_id)
    VALUES
      (1, 'tab_alice', 'ORD-1048', 'Northstar Market', 12500.00, 1),
      (2, 'tab_bob', 'ORD-1049', 'Lumen Workshop', 8840.50, 2),
      (3, 'tab_alice', 'ORD-1050', 'Arc & Field', 1200.00, NULL);
    ALTER TABLE operations.orders OWNER TO tab_owner;
    GRANT SELECT, UPDATE(customer, amount, version) ON operations.orders TO tab_alice, tab_bob;
    ALTER TABLE operations.orders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE operations.orders FORCE ROW LEVEL SECURITY;
    CREATE POLICY own_order_read ON operations.orders
      FOR SELECT TO tab_alice, tab_bob
      USING (owner_role = current_user);
    CREATE POLICY own_order_update ON operations.orders
      FOR UPDATE TO tab_alice, tab_bob
      USING (owner_role = current_user)
      WITH CHECK (owner_role = current_user);

    CREATE TABLE operations.readonly_feed (
      source text NOT NULL,
      payload text NOT NULL
    );
    INSERT INTO operations.readonly_feed VALUES ('legacy', 'No stable key');
    ALTER TABLE operations.readonly_feed OWNER TO tab_owner;
    GRANT SELECT ON operations.readonly_feed TO tab_alice, tab_bob;

    CREATE VIEW finance.invoice_lookup
      WITH (security_invoker = true)
      AS SELECT id, invoice_number, customer_name FROM finance.invoices;
    ALTER VIEW finance.invoice_lookup OWNER TO tab_owner;
    GRANT SELECT ON finance.invoice_lookup TO tab_alice, tab_bob;

    CREATE TABLE tabular.system_version (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      version integer NOT NULL,
      installed_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO tabular.system_version(singleton, version) VALUES (true, 1);

    CREATE TABLE tabular.system_migrations (
      version integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO tabular.system_migrations(version) VALUES (1);

    CREATE TABLE tabular.objects (
      stable_id text PRIMARY KEY,
      schema_name text NOT NULL,
      object_name text NOT NULL,
      object_kind text NOT NULL,
      oid_hint oid,
      expected_columns jsonb NOT NULL,
      status text NOT NULL DEFAULT 'current',
      UNIQUE(schema_name, object_name)
    );
    INSERT INTO tabular.objects VALUES
      ('obj-orders-v1', 'operations', 'orders', 'table', 'operations.orders'::regclass::oid,
       '["id","owner_role","order_number","customer","amount","amount_with_tax","invoice_id","version","__tabular_v1_cells"]', 'current'),
      ('obj-readonly-v1', 'operations', 'readonly_feed', 'table', 'operations.readonly_feed'::regclass::oid,
       '["source","payload"]', 'current'),
      ('obj-invoices-v1', 'finance', 'invoices', 'table', 'finance.invoices'::regclass::oid,
       '["id","invoice_number","customer_name"]', 'current');

    CREATE TABLE tabular.capabilities (
      actor text NOT NULL,
      surface text NOT NULL,
      operation text NOT NULL,
      resource text NOT NULL,
      PRIMARY KEY(actor, surface, operation, resource)
    );
    INSERT INTO tabular.capabilities VALUES
      ('alice', 'page', 'discover', '*'), ('alice', 'mcp', 'discover', '*'),
      ('alice', 'page', 'read', 'operations.orders'), ('alice', 'mcp', 'read', 'operations.orders'),
      ('alice', 'page', 'edit', 'operations.orders'), ('alice', 'mcp', 'edit', 'operations.orders'),
      ('alice', 'page', 'draft', 'operations.orders'), ('alice', 'mcp', 'draft', 'operations.orders'),
      ('alice', 'page', 'export', 'operations.orders'), ('alice', 'mcp', 'export', 'operations.orders'),
      ('alice', 'page', 'save-view', 'operations.orders'), ('alice', 'mcp', 'save-view', 'operations.orders'),
      ('alice', 'page', 'unstructured-edit', 'operations.orders'), ('alice', 'mcp', 'unstructured-edit', 'operations.orders'),
      ('alice', 'page', 'frontend-contract', '*'), ('alice', 'mcp', 'frontend-contract', '*'),
      ('bob', 'page', 'discover', '*'), ('bob', 'mcp', 'discover', '*'),
      ('bob', 'page', 'read', 'operations.orders'), ('bob', 'mcp', 'read', 'operations.orders'),
      ('bob', 'page', 'edit', 'operations.orders'), ('bob', 'mcp', 'edit', 'operations.orders'),
      ('owner', 'page', 'ddl', 'operations.orders'), ('owner', 'mcp', 'ddl', 'operations.orders'),
      ('owner', 'page', 'publish-view', 'operations.orders'),
      ('admin', 'page', 'jobs', '*');

    CREATE TABLE tabular.field_metadata (
      stable_id text PRIMARY KEY,
      object_id text NOT NULL REFERENCES tabular.objects(stable_id),
      column_name text,
      label text NOT NULL,
      field_type text NOT NULL,
      format_type text NOT NULL,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      ui_hidden boolean NOT NULL DEFAULT false
    );
    INSERT INTO tabular.field_metadata VALUES
      ('field-order-number', 'obj-orders-v1', 'order_number', 'Order ID', 'text', 'plain', '{}', false),
      ('field-customer', 'obj-orders-v1', 'customer', 'Customer', 'text', 'plain', '{}', false),
      ('field-amount', 'obj-orders-v1', 'amount', 'Total', 'price', 'currency', '{"currency":"PHP"}', false),
      ('field-taxed', 'obj-orders-v1', 'amount_with_tax', 'Total with tax', 'number', 'currency', '{"generated":true}', false);

    CREATE TABLE tabular.drafts (
      id text PRIMARY KEY,
      actor text NOT NULL,
      object_id text NOT NULL REFERENCES tabular.objects(stable_id),
      row_identity jsonb NOT NULL,
      base_version bigint,
      patch jsonb NOT NULL,
      errors jsonb NOT NULL,
      state text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE tabular.saved_views (
      id text PRIMARY KEY,
      owner_actor text NOT NULL,
      object_id text NOT NULL REFERENCES tabular.objects(stable_id),
      name text NOT NULL,
      visibility text NOT NULL CHECK (visibility IN ('private', 'shared')),
      definition jsonb NOT NULL,
      published_view text,
      UNIQUE(owner_actor, object_id, name)
    );

    CREATE TABLE tabular.journal (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor text NOT NULL,
      surface text NOT NULL,
      operation text NOT NULL,
      resource text NOT NULL,
      target jsonb NOT NULL,
      expected_version bigint,
      committed_version bigint,
      outcome text NOT NULL,
      request_digest text NOT NULL,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE tabular.outbox (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      topic text NOT NULL,
      payload jsonb NOT NULL,
      dedupe_key text UNIQUE NOT NULL,
      state text NOT NULL DEFAULT 'ready',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE tabular.jobs (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      kind text NOT NULL,
      payload jsonb NOT NULL,
      state text NOT NULL DEFAULT 'ready',
      attempts integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 3,
      dedupe_key text UNIQUE NOT NULL,
      locked_by text,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE tabular.import_runs (
      id text PRIMARY KEY,
      actor text NOT NULL,
      source_kind text NOT NULL,
      source_fingerprint text NOT NULL,
      target_schema text NOT NULL,
      target_table text NOT NULL,
      rows jsonb NOT NULL,
      warnings jsonb NOT NULL,
      state text NOT NULL,
      UNIQUE(actor, source_fingerprint, target_schema, target_table)
    );
  `);
}

export function createSurfaceAdapter(surface, kernel) {
  if (!['page', 'mcp'].includes(surface)) throw new Error('unsupported-surface');
  return async (input) => {
    if (!input || typeof input.actor !== 'string' || typeof input.operation !== 'string') {
      return { status: 'denied', source: 'invalid-structured-input' };
    }
    if ('sql' in input || 'ddl' in input) {
      return { status: 'denied', source: 'arbitrary-database-input' };
    }
    return kernel.invoke({ ...input, surface });
  };
}

export class TabularKernel {
  constructor(db) {
    this.db = db;
  }

  async migrateSystemSchema(targetVersion = 2, { failAfterDdl = false } = {}) {
    return this.db.transaction(async (tx) => {
      const current = await one(tx, 'SELECT version FROM tabular.system_version FOR UPDATE');
      if (current.version >= targetVersion) {
        return { status: 'current', version: current.version };
      }
      if (targetVersion !== 2 || current.version !== 1) throw new Error('unsupported-migration-path');
      await tx.exec('ALTER TABLE tabular.outbox ADD COLUMN published_at timestamptz');
      if (failAfterDdl) throw new Error('forced-migration-failure');
      await tx.query('INSERT INTO tabular.system_migrations(version) VALUES (2)');
      await tx.query('UPDATE tabular.system_version SET version = 2 WHERE singleton');
      return { status: 'migrated', from: 1, version: 2 };
    });
  }

  async appAllows(actor, surface, operation, resource = '*') {
    const result = await one(
      this.db,
      `SELECT EXISTS (
         SELECT 1 FROM tabular.capabilities
         WHERE actor = $1 AND surface = $2 AND operation = $3
           AND (resource = $4 OR resource = '*')
       ) AS allowed`,
      [actor, surface, operation, resource]
    );
    return result.allowed;
  }

  async audit(input, outcome, detail = {}) {
    return one(
      this.db,
      `INSERT INTO tabular.journal
        (actor, surface, operation, resource, target, expected_version,
         committed_version, outcome, request_digest, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb)
       RETURNING id`,
      [
        input.actor,
        input.surface,
        input.operation,
        input.resource ?? '*',
        JSON.stringify(input.target ?? {}),
        input.expectedVersion ?? null,
        detail.committedVersion ?? null,
        outcome,
        digest({
          actor: input.actor,
          surface: input.surface,
          operation: input.operation,
          resource: input.resource,
          target: input.target
        }),
        JSON.stringify(detail)
      ]
    );
  }

  async invoke(input) {
    const resource = input.resource ?? '*';
    if (!(await this.appAllows(input.actor, input.surface, input.operation, resource))) {
      await this.audit(input, 'denied', { source: 'application-policy' });
      return { status: 'denied', source: 'application-policy' };
    }
    let result;
    switch (input.operation) {
      case 'discover': result = await this.discover(input); break;
      case 'read': result = await this.readOrders(input); break;
      case 'edit': result = await this.editOrder(input); break;
      case 'draft': result = await this.saveDraft(input); break;
      case 'export': result = await this.exportCsv(input); break;
      case 'save-view': result = await this.saveView(input); break;
      case 'unstructured-edit': result = await this.editUnstructured(input); break;
      case 'frontend-contract': result = await this.frontendContract(input); break;
      default: result = { status: 'denied', source: 'operation-not-allowlisted' };
    }
    if (input.operation !== 'edit' && input.operation !== 'draft') {
      await this.audit(input, result.status ?? 'authorized', { source: result.source ?? 'capability' });
    }
    return result;
  }

  async withRole(actor, callback) {
    const role = ROLE_BY_ACTOR[actor];
    if (!role) throw new Error('unknown-actor-role');
    return this.db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${quoteIdentifier(role)}`);
      return callback(tx, role);
    });
  }

  async withMigrationRole(callback) {
    return this.db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${quoteIdentifier(MIGRATION_ROLE)}`);
      return callback(tx, MIGRATION_ROLE);
    });
  }

  async discover(input) {
    const role = ROLE_BY_ACTOR[input.actor];
    const objects = await rows(
      this.db,
      `SELECT o.stable_id, o.schema_name, o.object_name, o.object_kind, o.status
       FROM tabular.objects o
       WHERE has_table_privilege($1,
         quote_ident(o.schema_name) || '.' || quote_ident(o.object_name), 'SELECT')
       ORDER BY o.schema_name, o.object_name`,
      [role]
    );
    return { status: 'authorized', hierarchy: 'connection/database/schema/file', objects };
  }

  async readOrders(input) {
    return this.withRole(input.actor, async (tx) => {
      const query = orderQuery(input.query);
      return { status: 'authorized', rows: await rows(tx, query.sql, query.values) };
    });
  }

  async editOrder(input) {
    const role = ROLE_BY_ACTOR[input.actor];
    const result = await this.db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${quoteIdentifier(role)}`);
      const updated = await rows(
        tx,
        `UPDATE operations.orders
         SET amount = $3, version = version + 1
         WHERE id = $1 AND version = $2
         RETURNING id, amount::float8 AS amount, amount_with_tax::float8 AS amount_with_tax, version`,
        [input.target.id, input.expectedVersion, input.value]
      );
      if (!updated.length) {
        const visible = await one(tx, 'SELECT version FROM operations.orders WHERE id = $1', [input.target.id]);
        return visible
          ? { status: 'conflict', actualVersion: visible.version }
          : { status: 'denied', source: 'postgresql-policy' };
      }
      await tx.exec('RESET ROLE');
      await tx.query(
        `INSERT INTO tabular.outbox(topic, payload, dedupe_key)
         VALUES ('tabular.order.changed', $1::jsonb, $2)`,
        [JSON.stringify(updated[0]), `order:${updated[0].id}:v${updated[0].version}`]
      );
      return { status: 'committed', row: updated[0] };
    });
    await this.audit(input, result.status, {
      source: result.source ?? 'application-and-postgresql',
      committedVersion: result.row?.version
    });
    return result;
  }

  async saveDraft(input) {
    const id = `draft:${input.actor}:${input.target.id}`;
    const errors = {};
    if (input.patch.customer != null && String(input.patch.customer).trim() === '') {
      errors.customer = 'Customer is required.';
    }
    if (input.patch.amount != null && (!Number.isFinite(Number(input.patch.amount)) || Number(input.patch.amount) < 0)) {
      errors.amount = 'Amount must be a non-negative number.';
    }
    const draft = await one(
      this.db,
      `INSERT INTO tabular.drafts
        (id, actor, object_id, row_identity, base_version, patch, errors, state)
       VALUES ($1, $2, 'obj-orders-v1', $3::jsonb, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT(id) DO UPDATE SET patch = excluded.patch,
         errors = excluded.errors, state = excluded.state, updated_at = now()
       RETURNING *`,
      [
        id,
        input.actor,
        JSON.stringify(input.target),
        input.expectedVersion,
        JSON.stringify(input.patch),
        JSON.stringify(errors),
        Object.keys(errors).length ? 'invalid' : 'pending'
      ]
    );
    await this.audit(input, 'drafted', { source: 'tabular-system-schema' });
    return { status: 'drafted', draft };
  }

  async unstructuredColumn(connection = this.db) {
    const metadata = await one(
      connection,
      `SELECT column_name FROM tabular.field_metadata
       WHERE object_id = 'obj-orders-v1' AND ui_hidden
       ORDER BY stable_id DESC LIMIT 1`
    );
    return metadata?.column_name ?? null;
  }

  async installUnstructuredColumn() {
    return this.withMigrationRole(async (tx) => {
      const existing = await rows(
        tx,
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'operations' AND table_name = 'orders'`
      );
      let version = 1;
      let column = `__tabular_v${version}_cells`;
      while (existing.some((entry) => entry.column_name === column)) {
        version += 1;
        column = `__tabular_v${version}_cells`;
      }
      const quoted = quoteIdentifier(column);
      await tx.exec(`ALTER TABLE operations.orders
        ADD COLUMN ${quoted} jsonb NOT NULL DEFAULT '{}'::jsonb`);
      await tx.exec(`GRANT UPDATE(${quoted}) ON operations.orders TO tab_alice, tab_bob`);
      await tx.exec('RESET ROLE');
      await tx.query(
        `INSERT INTO tabular.field_metadata
          (stable_id, object_id, column_name, label, field_type, format_type, config, ui_hidden)
         VALUES ($1, 'obj-orders-v1', $2,
                 'Tabular cells', 'json', 'hidden', $3::jsonb, true)`,
        [`field-unstructured-v${version}`, column, JSON.stringify({ version })]
      );
      await tx.query(
        `UPDATE tabular.objects
         SET expected_columns = expected_columns || to_jsonb($2::text)
         WHERE stable_id = $1`,
        ['obj-orders-v1', column]
      );
      return { status: 'installed', column, collisionAvoided: version > 1, version };
    });
  }

  async editUnstructured(input) {
    const column = await this.unstructuredColumn();
    if (!column) throw new Error('unstructured-column-not-installed');
    const quoted = quoteIdentifier(column);
    return this.withRole(input.actor, async (tx) => {
      const updated = await rows(
        tx,
        `UPDATE operations.orders
         SET ${quoted} = jsonb_set(${quoted}, $2::text[], $3::jsonb),
             version = version + 1
         WHERE id = $1
         RETURNING id, ${quoted} AS cells, version`,
        [input.target.id, [input.columnId], JSON.stringify(input.value)]
      );
      return updated.length
        ? { status: 'committed', row: updated[0] }
        : { status: 'denied', source: 'postgresql-policy' };
    });
  }

  async promoteUnstructured(columnId, targetName) {
    const sourceName = await this.unstructuredColumn();
    if (!sourceName) throw new Error('unstructured-column-not-installed');
    const source = quoteIdentifier(sourceName);
    const target = quoteIdentifier(targetName);
    return this.withMigrationRole(async (tx) => {
      await tx.exec(`ALTER TABLE operations.orders ADD COLUMN ${target} text`);
      await tx.query(
        `UPDATE operations.orders
         SET ${target} = ${source} ->> $1,
             ${source} = ${source} - $1`,
        [columnId]
      );
      await tx.exec('RESET ROLE');
      await tx.query(
        `INSERT INTO tabular.field_metadata
          (stable_id, object_id, column_name, label, field_type, format_type, config)
         VALUES ($1, 'obj-orders-v1', $2, $3, 'text', 'plain', $4::jsonb)`,
        [`field-${targetName}`, targetName, targetName[0].toUpperCase() + targetName.slice(1), JSON.stringify({ promotedFrom: columnId })]
      );
      await tx.query(
        `UPDATE tabular.objects
         SET expected_columns = expected_columns || to_jsonb($2::text)
         WHERE stable_id = $1`,
        ['obj-orders-v1', targetName]
      );
      return { status: 'promoted', column: targetName };
    });
  }

  async copyUnstructured(input) {
    const column = await this.unstructuredColumn();
    if (!column) throw new Error('unstructured-column-not-installed');
    const quoted = quoteIdentifier(column);
    return this.withRole(input.actor, async (tx) => {
      const result = await one(
        tx,
        `SELECT ${quoted} ->> $2 AS value FROM operations.orders WHERE id = $1`,
        [input.target.id, input.columnId]
      );
      return result ? { status: 'authorized', value: result.value } : { status: 'denied' };
    });
  }

  async exportUnstructuredCsv(input) {
    const column = await this.unstructuredColumn();
    if (!column) throw new Error('unstructured-column-not-installed');
    const quoted = quoteIdentifier(column);
    return this.withRole(input.actor, async (tx) => {
      const result = await rows(
        tx,
        `SELECT order_number, ${quoted} ->> $1 AS value
         FROM operations.orders ORDER BY id`,
        [input.columnId]
      );
      const header = `order_number,${input.columnId}`;
      const body = result.map((row) => [row.order_number, row.value ?? '']
        .map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
      return { status: 'authorized', csv: `${header}\n${body}\n`, rowCount: result.length };
    });
  }

  async identityPolicy(schemaName, tableName) {
    const keys = await rows(
      this.db,
      `SELECT a.attname AS column_name
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN unnest(i.indkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = key.attnum
       WHERE n.nspname = $1 AND c.relname = $2 AND i.indisprimary
       ORDER BY key.ordinality`,
      [schemaName, tableName]
    );
    return keys.length
      ? { mode: 'editable', key: keys.length === 1 ? 'single' : 'composite', columns: keys.map((key) => key.column_name) }
      : { mode: 'read-only', reason: 'no-stable-key' };
  }

  async saveView(input) {
    const id = `view:${input.actor}:${digest(input.definition).slice(0, 10)}`;
    const view = await one(
      this.db,
      `INSERT INTO tabular.saved_views
        (id, owner_actor, object_id, name, visibility, definition)
       VALUES ($1, $2, 'obj-orders-v1', $3, 'private', $4::jsonb)
       ON CONFLICT(id) DO UPDATE SET definition = excluded.definition
       RETURNING *`,
      [id, input.actor, input.name, JSON.stringify(input.definition)]
    );
    return { status: 'saved', view };
  }

  async canPublishView(actor) {
    const role = ROLE_BY_ACTOR[actor];
    if (!role) return false;
    const result = await one(
      this.db,
      `SELECT pg_has_role($1, pg_get_userbyid(c.relowner), 'MEMBER') AS allowed
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'operations' AND c.relname = 'orders'`,
      [role]
    );
    return Boolean(result?.allowed);
  }

  async publishView(actor, viewId, viewName = 'orders_ready') {
    if (!(await this.canPublishView(actor))) {
      return { status: 'denied', source: 'table-ownership' };
    }
    const saved = await one(this.db, 'SELECT * FROM tabular.saved_views WHERE id = $1', [viewId]);
    if (!saved) throw new Error('saved-view-not-found');
    const query = publishedViewQuery(saved.definition);
    const safeName = quoteIdentifier(viewName);
    return this.withMigrationRole(async (tx) => {
      await tx.exec(`CREATE VIEW operations.${safeName}
        WITH (security_invoker = true)
        AS ${query}`);
      await tx.exec(`GRANT SELECT ON operations.${safeName} TO tab_alice, tab_bob`);
      await tx.exec('RESET ROLE');
      await tx.query(
        `UPDATE tabular.saved_views
         SET visibility = 'shared', published_view = $2 WHERE id = $1`,
        [viewId, `operations.${viewName}`]
      );
      return {
        status: 'published', view: `operations.${viewName}`,
        securityInvoker: true, compiledDefinition: saved.definition
      };
    });
  }

  async exportCsv(input) {
    const result = await this.readOrders(input);
    const header = 'order_number,customer,amount';
    const body = result.rows.map((row) => [row.order_number, row.customer, row.amount]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    return {
      status: 'authorized', csv: `${header}\n${body}\n`,
      rowCount: result.rows.length, query: input.query ?? {}
    };
  }

  async frontendContract(input) {
    const discovery = await this.discover(input);
    return {
      status: 'authorized',
      contract: {
        version: '1.0.0',
        caller: input.actor,
        objects: discovery.objects,
        operators: ['eq', 'ne', 'ge', 'le', 'like'],
        limits: { maxRows: 40, maxColumns: 20 },
        operations: ['discover', 'read', 'edit', 'draft', 'export', 'save-view'],
        concurrency: { expectedVersion: true, silentOverwrite: false },
        arbitrarySql: false,
        arbitraryDdl: false
      }
    };
  }

  async stageImport(input) {
    const id = `import:${input.actor}:${digest(input.fingerprint).slice(0, 10)}`;
    const run = await one(
      this.db,
      `INSERT INTO tabular.import_runs
        (id, actor, source_kind, source_fingerprint, target_schema,
         target_table, rows, warnings, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'staged')
       ON CONFLICT(actor, source_fingerprint, target_schema, target_table)
       DO UPDATE SET rows = excluded.rows, warnings = excluded.warnings
       RETURNING *`,
      [
        id, input.actor, input.sourceKind, input.fingerprint,
        input.schemaName, input.tableName,
        JSON.stringify(input.rows), JSON.stringify(input.warnings)
      ]
    );
    return { status: 'staged', run };
  }

  async commitImport(importId) {
    return this.db.transaction(async (tx) => {
      const run = await one(tx, 'SELECT * FROM tabular.import_runs WHERE id = $1 FOR UPDATE', [importId]);
      if (!run) throw new Error('import-not-found');
      if (run.state === 'committed') return { status: 'already-committed', importId };
      const schemaName = quoteIdentifier(run.target_schema);
      const tableName = quoteIdentifier(run.target_table);
      await tx.exec(`CREATE TABLE ${schemaName}.${tableName} (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        source_value text NOT NULL
      )`);
      for (const row of run.rows) {
        await tx.query(`INSERT INTO ${schemaName}.${tableName}(source_value) VALUES ($1)`, [row.value]);
      }
      await tx.query("UPDATE tabular.import_runs SET state = 'committed' WHERE id = $1", [importId]);
      await tx.query(
        `INSERT INTO tabular.outbox(topic, payload, dedupe_key)
         VALUES ('tabular.import.committed', $1::jsonb, $2)`,
        [JSON.stringify({ importId, rows: run.rows.length }), `import:${importId}`]
      );
      return { status: 'committed', importId, rows: run.rows.length };
    });
  }

  async enqueueJob(kind, payload, dedupeKey = `${kind}:${digest(payload)}`) {
    return one(
      this.db,
      `INSERT INTO tabular.jobs(kind, payload, dedupe_key)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT(dedupe_key) DO UPDATE SET dedupe_key = excluded.dedupe_key
       RETURNING *`,
      [kind, JSON.stringify(payload), dedupeKey]
    );
  }

  async claimJob(worker) {
    return this.db.transaction(async (tx) => {
      const job = await one(
        tx,
        `SELECT * FROM tabular.jobs
         WHERE state = 'ready' ORDER BY id LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );
      if (!job) return null;
      return one(
        tx,
        `UPDATE tabular.jobs SET state = 'running', locked_by = $2,
           attempts = attempts + 1, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [job.id, worker]
      );
    });
  }

  async failJob(jobId, message) {
    return one(
      this.db,
      `UPDATE tabular.jobs SET
         state = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'ready' END,
         locked_by = NULL, last_error = $2, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [jobId, message]
    );
  }

  async claimOutbox() {
    return this.db.transaction(async (tx) => {
      const event = await one(
        tx,
        `SELECT * FROM tabular.outbox
         WHERE state = 'ready' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`
      );
      if (!event) return null;
      return one(
        tx,
        `UPDATE tabular.outbox SET state = 'publishing'
         WHERE id = $1 RETURNING *`,
        [event.id]
      );
    });
  }

  async completeOutbox(outboxId) {
    return one(
      this.db,
      `UPDATE tabular.outbox
       SET state = 'published', published_at = now()
       WHERE id = $1 AND state = 'publishing'
       RETURNING *`,
      [outboxId]
    );
  }

  async reconcileObject(stableId) {
    const object = await one(this.db, 'SELECT * FROM tabular.objects WHERE stable_id = $1', [stableId]);
    const current = await rows(
      this.db,
      `SELECT a.attname AS name
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum`,
      [object.schema_name, object.object_name]
    );
    const currentColumns = current.map((entry) => entry.name);
    const expected = object.expected_columns;
    const status = JSON.stringify(currentColumns) === JSON.stringify(expected) ? 'current' : 'drifted';
    await this.db.query('UPDATE tabular.objects SET status = $2 WHERE stable_id = $1', [stableId, status]);
    return { stableId, status, expected, current: currentColumns, silentlyRebound: false };
  }
}
