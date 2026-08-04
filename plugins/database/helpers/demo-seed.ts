//client
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import type { StableCatalogSnapshot } from '../../catalog/helpers/contracts.js';
import type { DatabaseExecutor } from './executor.js';
import { quoteIdentifier, validateIdentifier } from './identifiers.js';

const DEMO_SEED_LOCK = '-4887435399321779074';
const DEMO_SCHEMAS = ['operations', 'finance'] as const;

type DemoSchema = typeof DEMO_SCHEMAS[number];

type DemoTable = {
  schema: DemoSchema;
  table: string;
  displayName: string;
  createSql: string;
  insertSql: string;
  columns: Array<{
    name: string;
    dataType: string;
    nullable: 'YES' | 'NO';
    displayName: string;
    field: string;
    format: string;
    hidden?: boolean;
    hiddenPurpose?: 'shared-rank';
    fieldConfig?: Record<string, unknown>;
    formatConfig?: Record<string, unknown>;
  }>;
};

// Representative files cover cross-schema relations and ordinary spreadsheet fields.
const DEMO_TABLES: DemoTable[] = [
  {
    schema: 'finance',
    table: 'customers',
    displayName: 'Customers',
    createSql: `
      CREATE TABLE finance.customers (
        customer_id text PRIMARY KEY,
        company text NOT NULL,
        contact_email text NOT NULL,
        credit_limit numeric(12, 2) NOT NULL,
        active boolean NOT NULL DEFAULT true
      )
    `,
    insertSql: `
      INSERT INTO finance.customers
        (customer_id, company, contact_email, credit_limit, active)
      VALUES
        ('cust-001', 'Atlas Hardware', 'orders@atlas.example', 25000.00, true),
        ('cust-002', 'Beacon Foods', 'finance@beacon.example', 18000.00, true),
        ('cust-003', 'Cedar Labs', 'team@cedar.example', 12000.00, false)
      ON CONFLICT (customer_id) DO NOTHING
    `,
    columns: [
      column('customer_id', 'text', 'NO', 'Customer ID', 'text', 'plain-text'),
      column('company', 'text', 'NO', 'Company', 'text', 'plain-text'),
      column('contact_email', 'text', 'NO', 'Contact email', 'email', 'email-link'),
      column('credit_limit', 'numeric', 'NO', 'Credit limit', 'price', 'currency'),
      column('active', 'boolean', 'NO', 'Active', 'switch', 'yes-no')
    ]
  },
  {
    schema: 'finance',
    table: 'invoices',
    displayName: 'Invoices',
    createSql: `
      CREATE TABLE finance.invoices (
        invoice_id text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES finance.customers(customer_id),
        amount numeric(12, 2) NOT NULL,
        issued_on date NOT NULL,
        due_on date NOT NULL,
        status text NOT NULL CHECK (status IN ('Draft', 'Sent', 'Paid', 'Overdue'))
      )
    `,
    insertSql: `
      INSERT INTO finance.invoices
        (invoice_id, customer_id, amount, issued_on, due_on, status)
      VALUES
        ('inv-1001', 'cust-001', 4250.00, DATE '2026-07-15', DATE '2026-08-14', 'Paid'),
        ('inv-1002', 'cust-002', 1875.50, DATE '2026-07-22', DATE '2026-08-21', 'Sent'),
        ('inv-1003', 'cust-003', 960.00, DATE '2026-06-30', DATE '2026-07-30', 'Overdue')
      ON CONFLICT (invoice_id) DO NOTHING
    `,
    columns: [
      column('invoice_id', 'text', 'NO', 'Invoice ID', 'text', 'plain-text'),
      column('customer_id', 'text', 'NO', 'Customer', 'relation', 'related-record', {
        pickerTemplate: '{{company}} — {{customer_id}}'
      }, { outputTemplate: '{{company}}' }),
      column('amount', 'numeric', 'NO', 'Amount', 'price', 'currency'),
      column('issued_on', 'date', 'NO', 'Issued on', 'date', 'date'),
      column('due_on', 'date', 'NO', 'Due on', 'date', 'date'),
      column('status', 'text', 'NO', 'Status', 'select', 'badge', options([
        'Draft', 'Sent', 'Paid', 'Overdue'
      ]))
    ]
  },
  {
    schema: 'operations',
    table: 'customer_orders',
    displayName: 'Customer orders',
    createSql: `
      CREATE TABLE operations.customer_orders (
        order_id text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES finance.customers(customer_id),
        status text NOT NULL CHECK (status IN ('New', 'Picking', 'Shipped', 'Held')),
        units bigint NOT NULL CHECK (units BETWEEN 1 AND 10000),
        unit_price numeric(12, 2) NOT NULL,
        ordered_on date NOT NULL,
        expedited boolean NOT NULL DEFAULT false,
        notes text,
        total numeric(14, 2) GENERATED ALWAYS AS (units * unit_price) STORED,
        __tabular_row_v1 text COLLATE "C"
      )
    `,
    insertSql: `
      INSERT INTO operations.customer_orders
        (order_id, customer_id, status, units, unit_price, ordered_on, expedited, notes,
         __tabular_row_v1)
      VALUES
        ('ord-4001', 'cust-001', 'Picking', 12, 49.50, DATE '2026-08-01', true,
          'Priority warehouse transfer', 'a'),
        ('ord-4002', 'cust-002', 'Shipped', 8, 72.25, DATE '2026-08-02', false,
          'Standard ground', 'b'),
        ('ord-4003', 'cust-003', 'Held', 20, 15.00, DATE '2026-08-03', false,
          'Awaiting account review', 'c')
      ON CONFLICT (order_id) DO NOTHING
    `,
    columns: [
      column('order_id', 'text', 'NO', 'Order ID', 'text', 'plain-text'),
      column('customer_id', 'text', 'NO', 'Customer', 'relation', 'related-record', {
        pickerTemplate: '{{company}} — {{customer_id}}'
      }, { outputTemplate: '{{company}}' }),
      column('status', 'text', 'NO', 'Status', 'select', 'badge', options([
        'New', 'Picking', 'Shipped', 'Held'
      ])),
      column('units', 'bigint', 'NO', 'Units', 'number', 'number'),
      column('unit_price', 'numeric', 'NO', 'Unit price', 'price', 'currency'),
      column('ordered_on', 'date', 'NO', 'Ordered on', 'date', 'date'),
      column('expedited', 'boolean', 'NO', 'Expedited', 'switch', 'yes-no'),
      column('notes', 'text', 'YES', 'Notes', 'text', 'plain-text'),
      column('total', 'numeric', 'YES', 'Total', 'computed', 'currency'),
      column(
        '__tabular_row_v1',
        'text',
        'YES',
        'Shared row order',
        'text',
        'plain-text',
        undefined,
        undefined,
        true,
        'shared-rank'
      )
    ]
  },
  {
    schema: 'operations',
    table: 'fulfillment_queue',
    displayName: 'Fulfillment queue',
    createSql: `
      CREATE TABLE operations.fulfillment_queue (
        queue_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id text NOT NULL REFERENCES operations.customer_orders(order_id),
        priority text NOT NULL CHECK (priority IN ('Normal', 'High', 'Urgent')),
        assigned_team text NOT NULL,
        target_ship_date date NOT NULL,
        completed boolean NOT NULL DEFAULT false,
        UNIQUE (order_id)
      )
    `,
    insertSql: `
      INSERT INTO operations.fulfillment_queue
        (order_id, priority, assigned_team, target_ship_date, completed)
      VALUES
        ('ord-4001', 'Urgent', 'Warehouse A', DATE '2026-08-04', false),
        ('ord-4002', 'Normal', 'Warehouse B', DATE '2026-08-03', true),
        ('ord-4003', 'High', 'Review desk', DATE '2026-08-06', false)
      ON CONFLICT (order_id) DO NOTHING
    `,
    columns: [
      column('queue_id', 'bigint', 'NO', 'Queue ID', 'number', 'number'),
      column('order_id', 'text', 'NO', 'Order', 'relation', 'related-record', {
        pickerTemplate: '{{order_id}} — {{status}}'
      }, { outputTemplate: '{{order_id}}' }),
      column('priority', 'text', 'NO', 'Priority', 'select', 'badge', options([
        'Normal', 'High', 'Urgent'
      ])),
      column('assigned_team', 'text', 'NO', 'Assigned team', 'text', 'plain-text'),
      column('target_ship_date', 'date', 'NO', 'Target ship date', 'date', 'date'),
      column('completed', 'boolean', 'NO', 'Completed', 'checkbox', 'yes-no')
    ]
  }
];

export type DemoSeedResult = {
  schemas: readonly DemoSchema[];
  files: string[];
  insertedRows: number;
  metadataRecords: number;
  memberRole?: string;
};

/**
 * Installs idempotent Operations and Finance review data plus canonical Tabular
 * catalog/file/column metadata. It never imports test or prior evidence modules.
 */
export async function seedLocalDemo(
  database: DatabaseExecutor,
  memberRole?: string,
  connectionId = 'local'
): Promise<DemoSeedResult> {
  validateConnectionId(connectionId);
  await database.execute('SELECT pg_advisory_xact_lock(?::bigint)', [DEMO_SEED_LOCK]);
  if (memberRole) await assertDemoMemberRole(database, memberRole);
  for (const schema of DEMO_SCHEMAS) await ensureOwnedSchema(database, schema, memberRole);
  for (const table of DEMO_TABLES) await ensureOwnedTable(database, table, memberRole);

  // Inserts never overwrite a reviewer's edits when the seed is rerun.
  let insertedRows = 0;
  for (const table of DEMO_TABLES) {
    const inserted = await database.execute(table.insertSql);
    insertedRows += inserted.affectedRows;
  }
  if (memberRole) await grantDemoAccess(database, memberRole);

  // Reconcile live OIDs before binding friendly metadata to stable identities.
  const catalog = await reconcileCatalog(database, connectionId);
  const metadataRecords = await installMetadata(database, catalog);
  return {
    schemas: DEMO_SCHEMAS,
    files: DEMO_TABLES.map((table) => `${table.schema}.${table.table}`),
    insertedRows,
    metadataRecords,
    ...(memberRole ? { memberRole } : {})
  };
}

/** Creates or validates one business-role-owned schema. */
async function ensureOwnedSchema(
  database: DatabaseExecutor,
  schema: DemoSchema,
  memberRole?: string
) {
  const existing = await database.execute<{ owner: string; current_user: string }>(`
    SELECT pg_get_userbyid(nspowner)::text AS owner,
           current_user::text AS current_user
      FROM pg_namespace
     WHERE nspname = ?
  `, [schema]);
  const expectedOwner = memberRole || existing.rows[0]?.current_user;
  if (!existing.rows.length) {
    const authorization = memberRole
      ? ` AUTHORIZATION ${quoteIdentifier(memberRole, 'TABULAR_DEMO_MEMBER_ROLE')}`
      : '';
    await database.execute(`CREATE SCHEMA ${quoteIdentifier(schema)}${authorization}`);
    return;
  }
  if (!expectedOwner || existing.rows[0]!.owner !== expectedOwner) {
    throw new Error(`Refusing to adopt a foreign-owned ${schema} demo schema`);
  }
}

/** Creates or validates one exact representative table contract. */
async function ensureOwnedTable(
  database: DatabaseExecutor,
  table: DemoTable,
  memberRole?: string
) {
  const existing = await database.execute<{
    kind: string;
    owner: string;
    current_user: string;
  }>(`
    SELECT relation.relkind::text AS kind,
           pg_get_userbyid(relation.relowner)::text AS owner,
           current_user::text AS current_user
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = ? AND relation.relname = ?
  `, [table.schema, table.table]);
  if (!existing.rows.length) {
    await database.execute(table.createSql);
    if (memberRole) {
      await database.execute(
        `ALTER TABLE ${qualified(table.schema, table.table)} `
        + `OWNER TO ${quoteIdentifier(memberRole, 'TABULAR_DEMO_MEMBER_ROLE')}`
      );
    }
    return;
  }
  const object = existing.rows[0]!;
  const expectedOwner = memberRole || object.current_user;
  if (object.kind !== 'r' || object.owner !== expectedOwner) {
    throw new Error(`Refusing to adopt an invalid or foreign-owned ${table.schema}.${table.table}`);
  }
  const columns = await database.execute<{
    column_name: string;
    data_type: string;
    is_nullable: 'YES' | 'NO';
  }>(`
    SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ?
     ORDER BY ordinal_position
  `, [table.schema, table.table]);
  const actual = columns.rows.map((item) => [
    item.column_name,
    item.data_type,
    item.is_nullable
  ]);
  const expected = table.columns.map((item) => [item.name, item.dataType, item.nullable]);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Refusing to adopt ${table.schema}.${table.table} with changed columns`);
  }
}

/** Installs friendly file and field metadata using reconciled stable identities. */
async function installMetadata(
  database: DatabaseExecutor,
  catalog: StableCatalogSnapshot
) {
  let inserted = 0;
  for (const table of DEMO_TABLES) {
    const file = stableFile(catalog, table.schema, table.table);
    const fileMetadata = await database.execute(`
      INSERT INTO tabular.file_metadata (object_id, display_name)
      VALUES (?, ?)
      ON CONFLICT (object_id) DO NOTHING
    `, [file, table.displayName]);
    inserted += fileMetadata.affectedRows;
    for (const columnMetadata of table.columns) {
      const catalogColumn = stableColumn(catalog, file, columnMetadata.name);
      const metadata = await database.execute(`
        INSERT INTO tabular.column_metadata (
          column_id, object_id, catalog_column_id, storage_kind,
          display_name, field_kind, format_kind, field_config, format_config,
          hidden, hidden_purpose
        ) VALUES (?, ?, ?, 'postgresql', ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
        ON CONFLICT (column_id) DO NOTHING
      `, [
        catalogColumn,
        file,
        catalogColumn,
        columnMetadata.displayName,
        columnMetadata.field,
        columnMetadata.format,
        JSON.stringify(columnMetadata.fieldConfig || {}),
        JSON.stringify(columnMetadata.formatConfig || {}),
        columnMetadata.hidden || false,
        columnMetadata.hiddenPurpose || null
      ]);
      inserted += metadata.affectedRows;
    }
  }
  return inserted;
}

/** Proves the configured member is a safe NOLOGIN role the migrator may install. */
async function assertDemoMemberRole(database: DatabaseExecutor, memberRole: string) {
  validateIdentifier(memberRole, 'TABULAR_DEMO_MEMBER_ROLE');
  const role = await database.execute<{
    rolcanlogin: boolean;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    can_set_role: boolean;
  }>(`
    SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
           rolreplication, rolbypassrls,
           pg_has_role(current_user, oid, 'SET') AS can_set_role
      FROM pg_roles
     WHERE rolname = ?
  `, [memberRole]);
  const current = role.rows[0];
  if (!current) throw new Error('TABULAR_DEMO_MEMBER_ROLE does not exist');
  if (
    current.rolcanlogin
    || current.rolsuper
    || current.rolcreatedb
    || current.rolcreaterole
    || current.rolreplication
    || current.rolbypassrls
  ) {
    throw new Error('TABULAR_DEMO_MEMBER_ROLE must be a safe NOLOGIN authorization role');
  }
  if (!current.can_set_role) {
    throw new Error('The migrator must have SET membership in TABULAR_DEMO_MEMBER_ROLE');
  }
}

/** Grants the safe member explicit access to both representative peer schemas. */
async function grantDemoAccess(database: DatabaseExecutor, memberRole: string) {
  const identifier = quoteIdentifier(memberRole, 'TABULAR_DEMO_MEMBER_ROLE');
  await database.execute(`GRANT USAGE, CREATE ON SCHEMA operations, finance TO ${identifier}`);
  await database.execute(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA operations, finance `
    + `TO ${identifier}`
  );
  await database.execute(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA operations, finance TO ${identifier}`
  );
}

/** Finds the stable file identity for one exact live schema and relation. */
function stableFile(catalog: StableCatalogSnapshot, schemaName: string, tableName: string) {
  const schema = [...catalog.schemas.values()].find((item) => item.name === schemaName);
  const file = [...catalog.objects.values()].find((item) =>
    item.schemaId === schema?.stableId && item.name === tableName
  );
  if (!file) throw new Error(`Seeded file ${schemaName}.${tableName} was not reconciled`);
  return file.stableId;
}

/** Finds the stable catalog column identity for one reconciled file. */
function stableColumn(catalog: StableCatalogSnapshot, fileId: string, columnName: string) {
  const column = [...catalog.columns.values()].find((item) =>
    item.objectId === fileId && item.name === columnName
  );
  if (!column) throw new Error(`Seeded column ${columnName} was not reconciled`);
  return column.stableId;
}

/** Produces one readable metadata contract entry. */
function column(
  name: string,
  dataType: string,
  nullable: 'YES' | 'NO',
  displayName: string,
  field: string,
  format: string,
  fieldConfig?: Record<string, unknown>,
  formatConfig?: Record<string, unknown>,
  hidden?: boolean,
  hiddenPurpose?: 'shared-rank'
) {
  return {
    name,
    dataType,
    nullable,
    displayName,
    field,
    format,
    ...(fieldConfig ? { fieldConfig } : {}),
    ...(formatConfig ? { formatConfig } : {}),
    ...(hidden ? { hidden: true } : {}),
    ...(hiddenPurpose ? { hiddenPurpose } : {})
  };
}

/** Builds the reviewed select-option metadata shape. */
function options(values: string[]) {
  return { options: values.map((value) => ({ value, label: value })) };
}

/** Quotes one two-part seed relation identifier. */
function qualified(schema: string, table: string) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

/** Keeps catalog records scoped to one safe local connection identifier. */
function validateConnectionId(value: string) {
  if (!/^[a-z][a-z0-9_-]{0,62}$/.test(value)) {
    throw new Error('Demo seed connection ID must be a safe non-secret slug');
  }
}
