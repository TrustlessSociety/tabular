import fs from 'node:fs/promises';
import pg from 'pg';
import { createApplication, startWeb } from '../../../bootstrap/application.js';
import { reconcileCatalog } from '../../../plugins/catalog/helpers/reconciliation.js';
import type { StableCatalogSnapshot } from '../../../plugins/catalog/helpers/contracts.js';
import { runMigrations } from '../../../plugins/database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../../plugins/database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../../plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../plugins/database/migrations/index.js';
import { TestIdentityProvider } from '../../../plugins/identity/tests/provider-double.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TASK00008_DATABASE_URL;
if (!connectionString) throw new Error('TABULAR_TASK00008_DATABASE_URL is required');
const sessionPath = process.env.TABULAR_TASK00008_SESSION_PATH
  || '/tmp/tabular-task00008-sessions.json';
const origin = 'http://127.0.0.1:3068';
const password = 'task00008-fixture';
const admin = new Pool({ connectionString, max: 4, allowExitOnIdle: true });
const webUrl = roleUrl(connectionString, 'tabular_grid_web', password);
const migratorUrl = roleUrl(connectionString, 'tabular_grid_migrator', password);
const migrationPool = new ManagedPostgresPool({
  name: 'task00008-browser-migrations',
  connectionString: migratorUrl,
  maximum: 2,
  applicationName: 'tabular-task00008-browser-migrations'
});

await resetFixture();
await admin.query(`
  CREATE ROLE tabular_grid_web LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_grid_migrator LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_grid_owner NOLOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_grid_reader NOLOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT CONNECT, CREATE ON DATABASE tabular_task00008 TO tabular_grid_migrator;
  GRANT tabular_grid_owner TO tabular_grid_web, tabular_grid_migrator
    WITH INHERIT FALSE, SET TRUE;
  GRANT tabular_grid_reader TO tabular_grid_web
    WITH INHERIT FALSE, SET TRUE;
`);
const migrations = await loadMigrations();
await runMigrations(<Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
  withPostgreSqlTransaction(migrationPool, {
    settings: {
      statement_timeout: '10000',
      lock_timeout: '10000',
      idle_in_transaction_session_timeout: '10000'
    }
  }, callback), migrations);
await admin.query(`
  GRANT USAGE ON SCHEMA tabular TO tabular_grid_web;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular TO tabular_grid_web;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular TO tabular_grid_web;
  CREATE SCHEMA crm AUTHORIZATION tabular_grid_owner;
  CREATE SCHEMA operations AUTHORIZATION tabular_grid_owner;
  CREATE TABLE crm.customers (
    tenant_id text NOT NULL,
    customer_code text NOT NULL,
    label text NOT NULL,
    owner_role name NOT NULL DEFAULT current_user,
    PRIMARY KEY (tenant_id, customer_code)
  );
  CREATE TABLE crm.keyless (
    tenant_id text NOT NULL,
    customer_code text NOT NULL,
    label text NOT NULL
  );
  CREATE TABLE operations.orders (
    tenant_id text NOT NULL,
    order_id text NOT NULL,
    customer_tenant text NOT NULL,
    relation_note text NOT NULL DEFAULT 'kept between relation keys',
    customer_code text NOT NULL,
    owner_role name NOT NULL DEFAULT current_user,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved')),
    quantity bigint NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
    unit_price numeric(38,18) NOT NULL DEFAULT 0,
    placed_on date NOT NULL DEFAULT DATE '2026-08-01',
    contact_email text NOT NULL DEFAULT 'orders@example.test',
    website text NOT NULL DEFAULT 'https://example.test',
    phone text NOT NULL DEFAULT '+63 917 555 0100',
    active boolean NOT NULL DEFAULT true,
    starts_at timestamp with time zone NOT NULL DEFAULT TIMESTAMPTZ '2026-08-01T10:32:00Z',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    total numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
    PRIMARY KEY (tenant_id, order_id)
  );
  ALTER TABLE crm.customers OWNER TO tabular_grid_owner;
  ALTER TABLE crm.keyless OWNER TO tabular_grid_owner;
  ALTER TABLE operations.orders OWNER TO tabular_grid_owner;
  ALTER TABLE crm.customers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE crm.customers FORCE ROW LEVEL SECURITY;
  CREATE POLICY customers_owner ON crm.customers
    USING (owner_role = current_user) WITH CHECK (owner_role = current_user);
  ALTER TABLE operations.orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE operations.orders FORCE ROW LEVEL SECURITY;
  CREATE POLICY orders_owner ON operations.orders
    USING (owner_role = current_user) WITH CHECK (owner_role = current_user);
  INSERT INTO crm.customers (tenant_id, customer_code, label, owner_role) VALUES
    ('acme', 'cust-001', 'Ada Industries', 'tabular_grid_owner'),
    ('acme', 'cust-002', 'Turing Trading', 'tabular_grid_owner'),
    ('private', 'cust-999', 'Restricted Industries', 'tabular_grid_reader');
  INSERT INTO crm.customers (tenant_id, customer_code, label, owner_role)
  SELECT 'acme', 'cust-' || lpad(number::text, 3, '0'),
         'Customer ' || lpad(number::text, 3, '0'), 'tabular_grid_owner'
    FROM generate_series(3, 60) AS number;
  INSERT INTO crm.keyless (tenant_id, customer_code, label) VALUES
    ('acme', 'keyless-001', 'No eligible key');
  INSERT INTO operations.orders (
    tenant_id, order_id, customer_tenant, customer_code, owner_role,
    status, quantity, unit_price, contact_email, website, phone, active, starts_at, metadata
  ) VALUES
    ('acme', 'ord-001', 'acme', 'cust-001', 'tabular_grid_owner',
     'draft', 2, 12.500000000000000000, 'ada@northstar.co', 'northstar.co/orders',
     '+63 (917) 555-0101', true, '2026-08-01T10:32:00Z', '{"source":"browser"}'),
    ('acme', 'ord-002', 'acme', 'cust-002', 'tabular_grid_owner',
     'approved', 3, 7.250000000000000000, 'grace@turing.test', 'https://turing.test',
     '+63 (917) 555-0102', false, '2026-08-02T11:45:00Z', '{"source":"browser"}'),
    ('acme', 'ord-003', 'acme', 'cust-060', 'tabular_grid_owner',
     'review', 4, 1.000000000000000000, 'ops@example.test', 'example.test/ops',
     '+63 (917) 555-0103', true, '2026-08-03T09:15:00Z', '{"source":"browser"}');
  GRANT USAGE ON SCHEMA crm, operations TO tabular_grid_reader;
  GRANT SELECT ON crm.customers, crm.keyless, operations.orders TO tabular_grid_reader;
`);

const env = (kind: 'web' | 'migrator') => ({
  NODE_ENV: 'test',
  TABULAR_PUBLIC_ORIGIN: origin,
  TABULAR_DATABASE_CONNECTION_ID: 'task00008-browser',
  TABULAR_WEB_DATABASE_URL: webUrl,
  TABULAR_MIGRATOR_DATABASE_URL: migratorUrl,
  TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '1800',
  TABULAR_SESSION_MAX_AGE_SECONDS: '7200',
  TABULAR_DATABASE_POOL_MAXIMUM: '8',
  TABULAR_PROCESS_KIND: kind
});
const web = await startWeb({
  env: env('web'),
  projectRoot: process.cwd(),
  runtimeRoot: process.cwd(),
  host: '127.0.0.1',
  port: 3068
});
const migrator = await createApplication({
  processKind: 'migrator',
  env: env('migrator'),
  projectRoot: process.cwd(),
  runtimeRoot: process.cwd()
});
const stable = await web.database.transaction('web', {}, (database) =>
  reconcileCatalog(database, 'task00008-browser')
);
await installMetadata(stable);

const provider = new TestIdentityProvider();
const ownerSubject = await provider.verify({
  assertion: 'verified-test-assertion',
  subject: 'task00008-browser-owner',
  displayName: 'Grid Owner'
});
const readerSubject = await provider.verify({
  assertion: 'verified-test-assertion',
  subject: 'task00008-browser-reader',
  displayName: 'Grid Reader'
});
await web.identity.provisionIdentityRole(ownerSubject, 'tabular_grid_owner');
await web.identity.provisionIdentityRole(readerSubject, 'tabular_grid_reader');
const ownerSession = await web.identity.establishBrowserSession(ownerSubject);
const readerSession = await web.identity.establishBrowserSession(readerSubject);
const fixtureSmoke = await web.grid.load(
  ownerSession.principal,
  stableFile(stable, 'operations', 'orders')
);
if (!fixtureSmoke || fixtureSmoke.rows.length !== 3) {
  throw new Error('Task 00008 browser fixture did not expose its three owner-visible rows');
}
await fs.writeFile(sessionPath, JSON.stringify({
  origin,
  ownerCookie: ownerSession.cookieToken,
  readerCookie: readerSession.cookieToken,
  ordersFileId: stableFile(stable, 'operations', 'orders'),
  customersFileId: stableFile(stable, 'crm', 'customers'),
  keylessFileId: stableFile(stable, 'crm', 'keyless')
}), { mode: 0o600 });

let applying = false;
const poller = setInterval(() => {
  if (applying) return;
  applying = true;
  void (async () => {
    const confirmed = await admin.query(`
      SELECT id FROM tabular.file_ddl_requests
       WHERE state = 'confirmed' ORDER BY created_at, id
    `);
    for (const row of confirmed.rows) {
      try {
        await migrator.files.applyConfirmed(String(row.id));
      } catch (error) {
        console.error('TASK00008_MIGRATOR_FAILURE', error);
      }
    }
  })().finally(() => { applying = false; });
}, 100);

console.log('TASK00008_FIXTURE_READY');
await new Promise<void>((resolve) => {
  process.once('SIGTERM', resolve);
  process.once('SIGINT', resolve);
});
clearInterval(poller);
await web.close();
migrator.runtime.lifecycle.beginDrain();
await migrator.runtime.resources.close(10_000);
migrator.runtime.lifecycle.markStopped();
await migrationPool.close(10_000);
await admin.end();

async function installMetadata(snapshot: StableCatalogSnapshot) {
  const files = [
    ['operations', 'orders', 'Orders'],
    ['crm', 'customers', 'Customers'],
    ['crm', 'keyless', 'Keyless contacts']
  ] as const;
  for (const [schema, table, display] of files) {
    await admin.query(`
      INSERT INTO tabular.file_metadata (object_id, display_name)
      VALUES ($1, $2) ON CONFLICT (object_id) DO UPDATE SET display_name = EXCLUDED.display_name
    `, [stableFile(snapshot, schema, table), display]);
  }
  const orders = stableFile(snapshot, 'operations', 'orders');
  const metadata = [
    ['tenant_id', 'Tenant', 'text', 'plain-text', {}, {}],
    ['order_id', 'Order ID', 'text', 'plain-text', {}, {}],
    ['customer_tenant', 'Customer tenant', 'relation', 'related-record', {
      pickerTemplate: '{{label}} — {{key}}'
    }, { outputTemplate: '{{label}}' }],
    ['relation_note', 'Relation note', 'text', 'plain-text', {}, {}],
    ['customer_code', 'Customer', 'relation', 'related-record', {
      pickerTemplate: '{{label}} — {{key}}'
    }, { outputTemplate: '{{label}}' }],
    ['owner_role', 'Owner role', 'text', 'plain-text', {}, {}],
    ['status', 'Status', 'select', 'badge', {
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'review', label: 'Review' },
        { value: 'approved', label: 'Approved' },
        { value: 'restricted', label: 'Restricted', restricted: 'Policy restricted' }
      ]
    }, {}],
    ['quantity', 'Quantity', 'number', 'number', {}, {}],
    ['unit_price', 'Unit price', 'price', 'currency', {}, {}],
    ['placed_on', 'Placed on', 'date', 'date', {}, {}],
    ['contact_email', 'Contact email', 'email', 'email-link', {}, {}],
    ['website', 'Website', 'url', 'link', {}, {}],
    ['phone', 'Phone', 'phone', 'phone-link', {}, {}],
    ['active', 'Active', 'switch', 'yes-no', {}, {}],
    ['starts_at', 'Starts at', 'date-time', 'date-time', {}, {}],
    ['metadata', 'Metadata', 'code-source', 'code-highlighting', {}, {}],
    ['total', 'Total', 'computed', 'currency', {}, {}]
  ] as const;
  for (const [physical, display, field, format, fieldConfig, formatConfig] of metadata) {
    const column = stableColumn(snapshot, orders, physical);
    await admin.query(`
      INSERT INTO tabular.column_metadata (
        column_id, object_id, catalog_column_id, storage_kind,
        display_name, field_kind, format_kind, field_config, format_config
      ) VALUES ($1, $2, $1, 'postgresql', $3, $4, $5, $6::jsonb, $7::jsonb)
    `, [
      column, orders, display, field, format,
      JSON.stringify(fieldConfig), JSON.stringify(formatConfig)
    ]);
  }
}

function stableFile(snapshot: StableCatalogSnapshot, schemaName: string, tableName: string) {
  const schema = [...snapshot.schemas.values()].find((item) => item.name === schemaName);
  const file = [...snapshot.objects.values()].find((item) =>
    item.schemaId === schema?.stableId && item.name === tableName
  );
  if (!file) throw new Error(`Missing ${schemaName}.${tableName}`);
  return file.stableId;
}

function stableColumn(snapshot: StableCatalogSnapshot, fileId: string, columnName: string) {
  const column = [...snapshot.columns.values()].find((item) =>
    item.objectId === fileId && item.name === columnName
  );
  if (!column) throw new Error(`Missing ${fileId}.${columnName}`);
  return column.stableId;
}

function roleUrl(value: string, role: string, rolePassword: string) {
  const target = new URL(value);
  target.username = role;
  target.password = rolePassword;
  return target.toString();
}

async function resetFixture() {
  await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS operations CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS crm CASCADE');
  for (const role of [
    'tabular_grid_web', 'tabular_grid_migrator', 'tabular_grid_owner', 'tabular_grid_reader'
  ]) {
    await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  }
}
