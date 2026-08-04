import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import pg from 'pg';
import { createApplication, startWeb } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { reconcileCatalog } from '../../../plugins/catalog/helpers/reconciliation.js';
import type { StableCatalogSnapshot } from '../../../plugins/catalog/helpers/contracts.js';
import { runMigrations } from '../../../plugins/database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../../plugins/database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../../plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../plugins/database/migrations/index.js';
import { TestIdentityProvider } from '../../../plugins/identity/tests/provider-double.js';
import { operationHandler } from '../../../plugins/operations/helpers/handlers.js';
import {
  OperationExecutionError,
  OperationWorker
} from '../../../plugins/operations/helpers/worker.js';

const { Pool } = pg;
const databaseUrl = process.env.TABULAR_TASK00014_DATABASE_URL;
if (!databaseUrl) throw new Error('TABULAR_TASK00014_DATABASE_URL is required');

const outputRoot = path.resolve('output/release/task-00014');
const sourceProjectRoot = process.cwd();
const browserRuntimeRoot = path.join(outputRoot, 'browser-runtime');
const upstreamOrigin = 'http://127.0.0.1:4140';
const browserOrigin = 'http://127.0.0.1:4141';
const password = `fixture_${randomBytes(12).toString('hex')}`;
const admin = new Pool({ connectionString: databaseUrl, max: 8, allowExitOnIdle: true });
const webUrl = roleUrl(databaseUrl, 'tabular_task14_web', password);
const migratorUrl = roleUrl(databaseUrl, 'tabular_task14_migrator', password);
const workerUrl = roleUrl(databaseUrl, 'tabular_task14_worker', password);
const migrationPool = new ManagedPostgresPool({
  name: 'task00014-browser-migrations',
  connectionString: migratorUrl,
  maximum: 2,
  applicationName: 'tabular-task00014-browser-migrations'
});

await prepareBrowserRuntime(sourceProjectRoot, browserRuntimeRoot);
await resetFixture();
await admin.query(`
  CREATE ROLE tabular_task14_web LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task14_migrator LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task14_worker LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task14_owner NOLOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task14_editor NOLOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task14_reader NOLOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT CONNECT, CREATE ON DATABASE tabular_task00014 TO tabular_task14_migrator;
  GRANT CONNECT ON DATABASE tabular_task00014 TO tabular_task14_web, tabular_task14_worker;
  GRANT tabular_task14_owner TO tabular_task14_web, tabular_task14_migrator,
    tabular_task14_worker WITH INHERIT FALSE, SET TRUE;
  GRANT tabular_task14_editor, tabular_task14_reader TO tabular_task14_web
    WITH INHERIT FALSE, SET TRUE;
`);
await runMigrations(transaction(migrationPool), await loadMigrations());
await admin.query(`
  GRANT USAGE ON SCHEMA tabular
    TO tabular_task14_web, tabular_task14_worker, tabular_task14_migrator,
       tabular_task14_owner, tabular_task14_editor, tabular_task14_reader;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular
    TO tabular_task14_web, tabular_task14_worker, tabular_task14_migrator;
  GRANT SELECT ON ALL TABLES IN SCHEMA tabular
    TO tabular_task14_owner, tabular_task14_editor, tabular_task14_reader;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular
    TO tabular_task14_web, tabular_task14_worker, tabular_task14_migrator;

  CREATE SCHEMA operations AUTHORIZATION tabular_task14_owner;
  CREATE SCHEMA finance AUTHORIZATION tabular_task14_owner;
  CREATE TABLE finance.customers (
    tenant_id text NOT NULL,
    customer_code text NOT NULL,
    label text NOT NULL,
    PRIMARY KEY (tenant_id, customer_code)
  );
  CREATE TABLE finance.keyless_contacts (
    tenant_id text NOT NULL,
    customer_code text NOT NULL,
    label text NOT NULL
  );
  CREATE TABLE finance.invoices (
    invoice_id text PRIMARY KEY,
    customer text NOT NULL,
    amount numeric(12,2) NOT NULL
  );
  CREATE TABLE operations.orders (
    tenant_id text NOT NULL,
    order_id text NOT NULL,
    customer_tenant text NOT NULL,
    relation_note text NOT NULL DEFAULT 'browser acceptance',
    customer_code text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved')),
    quantity bigint NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
    unit_price numeric(38,18) NOT NULL DEFAULT 0,
    placed_on date NOT NULL DEFAULT DATE '2026-08-01',
    active boolean NOT NULL DEFAULT true,
    __tabular_row_v1 text COLLATE "C",
    total numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
    PRIMARY KEY (tenant_id, order_id)
  );
  ALTER TABLE finance.customers OWNER TO tabular_task14_owner;
  ALTER TABLE finance.keyless_contacts OWNER TO tabular_task14_owner;
  ALTER TABLE finance.invoices OWNER TO tabular_task14_owner;
  ALTER TABLE operations.orders OWNER TO tabular_task14_owner;
  INSERT INTO finance.customers VALUES
    ('acme', 'cust-001', 'Ada Industries'),
    ('acme', 'cust-002', 'Turing Trading'),
    ('acme', 'cust-003', 'Lovelace Labs');
  INSERT INTO finance.keyless_contacts VALUES ('acme', 'contact-001', 'No stable key');
  INSERT INTO finance.invoices VALUES
    ('inv-001', 'Ada Industries', 1250.00),
    ('inv-002', 'Turing Trading', 725.00);
  INSERT INTO operations.orders (
    tenant_id, order_id, customer_tenant, customer_code, status,
    quantity, unit_price, placed_on, active, __tabular_row_v1
  ) VALUES
    ('acme', 'ord-001', 'acme', 'cust-001', 'draft', 2, 12.500000000000000000, '2026-08-01', true, 'a'),
    ('acme', 'ord-002', 'acme', 'cust-002', 'approved', 3, 7.250000000000000000, '2026-08-02', false, 'b'),
    ('acme', 'ord-003', 'acme', 'cust-003', 'review', 4, 1.000000000000000000, '2026-08-03', true, 'c');

  GRANT USAGE ON SCHEMA operations, finance TO tabular_task14_editor, tabular_task14_reader;
  GRANT SELECT, INSERT, UPDATE, DELETE ON operations.orders TO tabular_task14_editor;
  GRANT SELECT ON finance.customers, finance.keyless_contacts, finance.invoices
    TO tabular_task14_editor;
  GRANT SELECT ON operations.orders, finance.customers, finance.keyless_contacts,
    finance.invoices TO tabular_task14_reader;
`);

const environment = {
  NODE_ENV: 'test',
  TABULAR_PUBLIC_ORIGIN: browserOrigin,
  TABULAR_DATABASE_CONNECTION_ID: 'task00014-browser',
  TABULAR_WEB_DATABASE_URL: webUrl,
  TABULAR_MIGRATOR_DATABASE_URL: migratorUrl,
  TABULAR_WORKER_DATABASE_URL: workerUrl,
  TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '7200',
  TABULAR_SESSION_MAX_AGE_SECONDS: '14400',
  TABULAR_DATABASE_POOL_MAXIMUM: '12',
  TABULAR_SSE_HEARTBEAT_MS: '250',
  TABULAR_SSE_POLL_MS: '25',
  TABULAR_SSE_REPLAY_LIMIT: '200',
  TABULAR_SSE_CLIENT_QUEUE_LIMIT: '64',
  TABULAR_WORKER_LEASE_SECONDS: '3',
  TABULAR_WORKER_CONCURRENCY: '2',
  TABULAR_WORKER_SHUTDOWN_TIMEOUT_MS: '2000'
};
const web = await startWeb({
  env: environment,
  projectRoot: browserRuntimeRoot,
  runtimeRoot: sourceProjectRoot,
  host: '127.0.0.1',
  port: 4140
});
const migrator = await createApplication({
  processKind: 'migrator',
  env: environment,
  projectRoot: process.cwd(),
  runtimeRoot: process.cwd()
});
const worker = await createApplication({
  processKind: 'worker',
  env: environment,
  projectRoot: process.cwd(),
  runtimeRoot: process.cwd()
});

const catalog = await web.database.transaction('web', {}, (database) =>
  reconcileCatalog(database, 'task00014-browser')
);
const ordersFileId = stableFile(catalog, 'operations', 'orders');
const customersFileId = stableFile(catalog, 'finance', 'customers');
await installMetadata(catalog);

const provider = new TestIdentityProvider();
const ownerSubject = await provider.verify({
  assertion: 'verified-test-assertion',
  subject: 'task00014-owner',
  displayName: 'Release Owner'
});
const editorSubject = await provider.verify({
  assertion: 'verified-test-assertion',
  subject: 'task00014-editor',
  displayName: 'Release Collaborator'
});
const readerSubject = await provider.verify({
  assertion: 'verified-test-assertion',
  subject: 'task00014-reader',
  displayName: 'Release Reader'
});
await web.identity.provisionIdentityRole(ownerSubject, 'tabular_task14_owner');
await web.identity.provisionIdentityRole(editorSubject, 'tabular_task14_editor');
await web.identity.provisionIdentityRole(readerSubject, 'tabular_task14_reader');
await admin.query(`
  UPDATE tabular.allowed_roles SET can_manage_operations_retention = true
   WHERE role_name = 'tabular_task14_owner'
`);
const ownerSession = await web.identity.establishBrowserSession(ownerSubject);
const editorSession = await web.identity.establishBrowserSession(editorSubject);
const readerSession = await web.identity.establishBrowserSession(readerSubject);
const ownerPrincipal = await web.identity.requireBrowserMutation({
  cookieToken: ownerSession.cookieToken,
  csrfToken: ownerSession.csrfToken,
  origin: browserOrigin
});

migrator.operations.handlers.register(operationHandler(
  'ddl.apply',
  'migrator',
  async (context) => {
    if (!await context.markIrreversible()) cancelled();
    const applied = await migrator.files.applyConfirmed(context.job.payload.requestId);
    return {
      requestId: applied.requestId,
      actionType: applied.actionType,
      state: applied.state,
      ...(applied.targetFileId ? { targetObjectId: applied.targetFileId } : {})
    };
  }
));
worker.operations.handlers
  .register(operationHandler('import.commit', 'worker', async (context) => {
    if (!await context.heartbeat(10)) cancelled();
    if (!await context.markIrreversible()) cancelled();
    const result = await worker.importExport.executeConfirmedImport(
      context.job.payload.importId,
      { terminalOnFailure: false }
    );
    return {
      importId: result.importId,
      state: result.state,
      fileId: result.fileId,
      rowsCommitted: result.rowsCommitted,
      columnsCommitted: result.columnsCommitted,
      warnings: result.warnings
    };
  }))
  .register(operationHandler('maintenance.import-staging', 'worker', async (context) => {
    if (context.job.payload.limit === 7 && context.job.attempts === 1) {
      throw new OperationExecutionError('operation_failed', true);
    }
    if (!await context.markIrreversible()) cancelled();
    const result = await worker.importExport.cleanupExpiredImports(context.job.payload.limit);
    return { operationsDeleted: result.cleaned };
  }))
  .register(operationHandler('operations.retention', 'worker', async (context) => {
    if (!await context.markIrreversible()) cancelled();
    try {
      return await worker.operations.applyRetentionJob('worker', context.job);
    } catch (error) {
      if (error instanceof ApplicationError
        && error.errorCode === 'operations_retention_stale') {
        throw new OperationExecutionError('retention_stale', false);
      }
      throw error;
    }
  }));
const ddlWorker = new OperationWorker(
  migrator.operations,
  'migrator',
  `migrator:task00014:${process.pid}`
).start();
const operationWorker = new OperationWorker(
  worker.operations,
  'worker',
  `worker:task00014:${process.pid}`
).start();

await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(outputRoot, 'browser-import.csv'), [
  'code,name,amount',
  '001,Alpha,10.50',
  '002,Beta,2',
  '003,Gamma,20'
].join('\r\n'));

const sseConnections = new Set<{
  request: http.ClientRequest;
  response: http.ServerResponse;
}>();
const requestedCursors: number[] = [];
let blockSseUntil = 0;
let recoveryJobId: string | undefined;
const proxy = http.createServer((request, response) => {
  void routeProxy(request, response).catch((error) => {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Task 00014 fixture failed'
    }));
  });
});
await new Promise<void>((resolve, reject) => {
  proxy.once('error', reject);
  proxy.listen(4141, '127.0.0.1', resolve);
});
console.log(JSON.stringify({
  type: 'TASK00014_FIXTURE_READY',
  upstreamOrigin,
  browserOrigin,
  ownerUrl: `${browserOrigin}/__acceptance?user=owner`,
  editorUrl: `${browserOrigin}/__acceptance?user=editor`,
  readerUrl: `${browserOrigin}/__acceptance?user=reader`,
  ordersFileId,
  customersFileId
}));

await new Promise<void>((resolve) => {
  process.once('SIGTERM', resolve);
  process.once('SIGINT', resolve);
});
await ddlWorker.stop();
await operationWorker.stop();
await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
await web.close();
await migrator.runtime.resources.close(10_000);
await worker.runtime.resources.close(10_000);
await migrationPool.close(10_000);
await admin.end();
await fs.rm(browserRuntimeRoot, { recursive: true, force: true });

async function routeProxy(
  request: http.IncomingMessage,
  response: http.ServerResponse
) {
  const url = new URL(request.url || '/', browserOrigin);
  if (url.pathname === '/__acceptance') {
    const user = url.searchParams.get('user');
    const session = user === 'editor'
      ? editorSession
      : user === 'reader'
        ? readerSession
        : ownerSession;
    const target = url.searchParams.get('target') || '/pages/browse.html';
    response.statusCode = 302;
    response.setHeader(
      'Set-Cookie',
      `tabular_session=${session.cookieToken}; Path=/; HttpOnly; SameSite=Strict`
    );
    response.setHeader('Location', target.startsWith('/') ? target : '/pages/browse.html');
    response.end();
    return;
  }
  if (url.pathname === '/__control') {
    const action = url.searchParams.get('action');
    if (action === 'interrupt-sse') {
      blockSseUntil = Date.now() + 4_000;
      for (const connection of sseConnections) {
        connection.request.destroy();
        connection.response.destroy();
      }
      sseConnections.clear();
      return json(response, { ok: true, blockSseUntil });
    }
    if (action === 'revoke-editor') {
      await admin.query(`
        REVOKE SELECT, INSERT, UPDATE, DELETE ON operations.orders
          FROM tabular_task14_editor
      `);
      return json(response, { ok: true, editor: 'revoked' });
    }
    if (action === 'restore-editor') {
      await admin.query(`
        GRANT SELECT, INSERT, UPDATE, DELETE ON operations.orders
          TO tabular_task14_editor
      `);
      return json(response, { ok: true, editor: 'restored' });
    }
    if (action === 'enqueue-recovery') {
      const enqueued = await web.operations.enqueue(ownerPrincipal, {
        kind: 'maintenance.import-staging',
        authority: 'worker',
        idempotencyKey: `task00014-recovery-${Date.now()}`,
        payload: { limit: 7 },
        maxAttempts: 1
      });
      recoveryJobId = enqueued.job.id;
      return json(response, { ok: true, jobId: recoveryJobId });
    }
    if (action === 'state') {
      const jobs = await admin.query(`
        SELECT id, kind, state, attempts, max_attempts, progress
          FROM tabular.operation_jobs ORDER BY created_at, id
      `);
      const cursor = await admin.query(`
        SELECT COALESCE(MAX(sequence), 0)::integer AS cursor
          FROM tabular.outbox_events
         WHERE connection_id = 'task00014-browser'
      `);
      return json(response, {
        ok: true,
        jobs: jobs.rows,
        recoveryJobId,
        cursor: cursor.rows[0]?.cursor || 0,
        requestedCursors: requestedCursors.slice(-30)
      });
    }
    return json(response, { ok: false, error: 'unknown control action' }, 400);
  }

  const isSse = url.pathname === '/events';
  if (isSse) {
    const cursor = Number(url.searchParams.get('cursor'));
    if (Number.isSafeInteger(cursor) && cursor >= 0) requestedCursors.push(cursor);
    if (Date.now() < blockSseUntil) {
      response.statusCode = 503;
      response.setHeader('Cache-Control', 'no-store');
      response.end('Fixture-controlled SSE interruption');
      return;
    }
  }
  const upstream = http.request({
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: 4140,
    method: request.method,
    path: request.url,
    headers: {
      ...request.headers,
      host: '127.0.0.1:4140',
      'accept-encoding': 'identity'
    }
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, {
      ...upstreamResponse.headers,
      'cache-control': 'no-store'
    });
    upstreamResponse.pipe(response);
    upstreamResponse.once('close', () => {
      for (const connection of sseConnections) {
        if (connection.request === upstream) sseConnections.delete(connection);
      }
    });
  });
  if (isSse) sseConnections.add({ request: upstream, response });
  upstream.on('error', (error) => {
    if (!response.headersSent) response.statusCode = 502;
    response.end(`Fixture proxy failed: ${error.message}`);
  });
  request.pipe(upstream);
}

async function installMetadata(snapshot: StableCatalogSnapshot) {
  const files = [
    ['operations', 'orders', 'Customer orders'],
    ['finance', 'customers', 'Customers'],
    ['finance', 'keyless_contacts', 'Keyless contacts'],
    ['finance', 'invoices', 'Invoices']
  ] as const;
  for (const [schema, table, displayName] of files) {
    await admin.query(`
      INSERT INTO tabular.file_metadata (object_id, display_name)
      VALUES ($1, $2)
      ON CONFLICT (object_id) DO UPDATE SET display_name = EXCLUDED.display_name
    `, [stableFile(snapshot, schema, table), displayName]);
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
    ['status', 'Status', 'select', 'badge', {
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'review', label: 'Review' },
        { value: 'approved', label: 'Approved' }
      ]
    }, {}],
    ['quantity', 'Quantity', 'number', 'number', {}, {}],
    ['unit_price', 'Unit price', 'price', 'currency', {}, {}],
    ['placed_on', 'Placed on', 'date', 'date', {}, {}],
    ['active', 'Active', 'switch', 'yes-no', {}, {}],
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
      column,
      orders,
      display,
      field,
      format,
      JSON.stringify(fieldConfig),
      JSON.stringify(formatConfig)
    ]);
  }
  const rankColumn = stableColumn(snapshot, orders, '__tabular_row_v1');
  await admin.query(`
    INSERT INTO tabular.column_metadata (
      column_id, object_id, catalog_column_id, storage_kind,
      display_name, field_kind, format_kind, hidden, hidden_purpose
    ) VALUES ($1, $2, $1, 'postgresql',
      'Shared row order', 'text', 'plain-text', true, 'shared-rank')
  `, [rankColumn, orders]);
}

function stableFile(
  snapshot: StableCatalogSnapshot,
  schemaName: string,
  tableName: string
) {
  const schema = [...snapshot.schemas.values()].find((item) => item.name === schemaName);
  const file = [...snapshot.objects.values()].find((item) =>
    item.schemaId === schema?.stableId && item.name === tableName
  );
  if (!file) throw new Error(`Missing ${schemaName}.${tableName}`);
  return file.stableId;
}

function stableColumn(
  snapshot: StableCatalogSnapshot,
  fileId: string,
  columnName: string
) {
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

function transaction(pool: ManagedPostgresPool) {
  return <Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
    withPostgreSqlTransaction(pool, {
      settings: {
        statement_timeout: '15000',
        lock_timeout: '15000',
        idle_in_transaction_session_timeout: '15000'
      }
    }, callback);
}

function json(response: http.ServerResponse, body: unknown, status = 200) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function resetFixture() {
  await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS operations CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS finance CASCADE');
  for (const role of [
    'tabular_task14_web',
    'tabular_task14_migrator',
    'tabular_task14_worker',
    'tabular_task14_owner',
    'tabular_task14_editor',
    'tabular_task14_reader'
  ]) {
    await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  }
}

async function prepareBrowserRuntime(sourceRoot: string, targetRoot: string) {
  const sourceManifestPath = path.join(sourceRoot, '.build/artifact-manifest.json');
  const manifest = JSON.parse(await fs.readFile(sourceManifestPath, 'utf8')) as {
    artifacts: Array<{ source?: string; destination: string }>;
  };
  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(targetRoot, { recursive: true });
  await fs.copyFile(
    path.join(sourceRoot, 'package.json'),
    path.join(targetRoot, 'package.json')
  );
  for (const artifact of manifest.artifacts) {
    if (artifact.source && path.isAbsolute(artifact.source)) {
      const relative = path.relative(sourceRoot, artifact.source);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Artifact source escapes the fixture project: ${artifact.source}`);
      }
      artifact.source = relative.split(path.sep).join('/');
    }
    const source = path.resolve(sourceRoot, artifact.destination);
    const destination = path.resolve(targetRoot, artifact.destination);
    const relativeDestination = path.relative(targetRoot, destination);
    if (relativeDestination.startsWith('..') || path.isAbsolute(relativeDestination)) {
      throw new Error(`Artifact destination escapes the fixture project: ${artifact.destination}`);
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  const targetManifestPath = path.join(targetRoot, '.build/artifact-manifest.json');
  await fs.mkdir(path.dirname(targetManifestPath), { recursive: true });
  await fs.writeFile(targetManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function cancelled(): never {
  throw new OperationExecutionError('operation_failed', true);
}
