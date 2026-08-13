import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import pg from 'pg';
import { createApplication, startWeb } from '../../../bootstrap/application.js';
import { runMigrations } from '../../../plugins/database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../../plugins/database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../../plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../plugins/database/migrations/index.js';
import { TestIdentityProvider } from '../../../plugins/identity/tests/provider-double.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TASK00011_DATABASE_URL;
if (!connectionString) throw new Error('TABULAR_TASK00011_DATABASE_URL is required');
const outputRoot = path.resolve('output/playwright/task-00011');
const sessionPath = path.join(outputRoot, 'fixture-session.json');
const upstreamOrigin = 'http://127.0.0.1:4111';
const browserOrigin = 'http://127.0.0.1:4112';
const password = `fixture_${randomBytes(12).toString('hex')}`;
const admin = new Pool({ connectionString, max: 6, allowExitOnIdle: true });
const webUrl = roleUrl(connectionString, 'tabular_task11_browser_web', password);
const migratorUrl = roleUrl(connectionString, 'tabular_task11_browser_migrator', password);
const workerUrl = roleUrl(connectionString, 'tabular_task11_browser_worker', password);
const migrationPool = new ManagedPostgresPool({
  name: 'task00011-browser-migrator',
  connectionString: migratorUrl,
  maximum: 2,
  applicationName: 'tabular-task00011-browser-migrator'
});

await reset();
await admin.query(`
  CREATE ROLE tabular_task11_browser_web LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task11_browser_migrator LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task11_browser_worker LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task11_browser_owner NOLOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task11_browser_reader NOLOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT CONNECT, CREATE ON DATABASE tabular_task00011 TO tabular_task11_browser_migrator;
  GRANT CONNECT ON DATABASE tabular_task00011
    TO tabular_task11_browser_web, tabular_task11_browser_worker;
  GRANT tabular_task11_browser_owner
    TO tabular_task11_browser_web, tabular_task11_browser_worker
    WITH INHERIT FALSE, SET TRUE;
  GRANT tabular_task11_browser_reader TO tabular_task11_browser_web
    WITH INHERIT FALSE, SET TRUE;
`);
await runMigrations(<Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
  withPostgreSqlTransaction(migrationPool, {
    settings: {
      statement_timeout: '15000',
      lock_timeout: '15000',
      idle_in_transaction_session_timeout: '15000'
    }
  }, callback), await loadMigrations());
await admin.query(`
  GRANT USAGE ON SCHEMA tabular
    TO tabular_task11_browser_web, tabular_task11_browser_worker;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular
    TO tabular_task11_browser_web, tabular_task11_browser_worker;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular
    TO tabular_task11_browser_web, tabular_task11_browser_worker;
  CREATE SCHEMA operations AUTHORIZATION tabular_task11_browser_owner;
  CREATE TABLE operations.q3_orders (occupied text);
  ALTER TABLE operations.q3_orders OWNER TO tabular_task11_browser_owner;
  GRANT USAGE ON SCHEMA operations TO tabular_task11_browser_reader;
  GRANT SELECT ON operations.q3_orders TO tabular_task11_browser_reader;
`);

const environment = {
  NODE_ENV: 'test',
  TABULAR_PUBLIC_ORIGIN: browserOrigin,
  TABULAR_DATABASE_CONNECTION_ID: 'task00011-browser',
  TABULAR_WEB_DATABASE_URL: webUrl,
  TABULAR_MIGRATOR_DATABASE_URL: migratorUrl,
  TABULAR_WORKER_DATABASE_URL: workerUrl,
  TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '1800',
  TABULAR_SESSION_MAX_AGE_SECONDS: '7200',
  TABULAR_DATABASE_POOL_MAXIMUM: '8'
};
const web = await startWeb({
  env: environment,
  projectRoot: process.cwd(),
  runtimeRoot: process.cwd(),
  host: '127.0.0.1',
  port: 4111
});
const worker = await createApplication({
  processKind: 'worker',
  env: environment,
  projectRoot: process.cwd(),
  runtimeRoot: process.cwd()
});
const provider = new TestIdentityProvider();
const subject = await provider.verify({
  assertion: 'verified-test-assertion',
  subject: 'task00011-browser-owner',
  displayName: 'Import Owner'
});
await web.identity.provisionIdentityRole(subject, 'tabular_task11_browser_owner');
const session = await web.identity.establishBrowserSession(subject);
const readerSubject = await provider.verify({
  assertion: 'verified-test-assertion',
  subject: 'task00011-browser-reader',
  displayName: 'Import Reader'
});
await web.identity.provisionIdentityRole(readerSubject, 'tabular_task11_browser_reader');
const readerSession = await web.identity.establishBrowserSession(readerSubject);
await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(sessionPath, JSON.stringify({
  browserOrigin,
  upstreamOrigin,
  ownerCookie: session.cookieToken,
  readerCookie: readerSession.cookieToken
}, null, 2), { mode: 0o600 });
await writeSamples();

const proxy = http.createServer((request, response) => {
  const url = new URL(request.url || '/', browserOrigin);
  if (url.pathname === '/__acceptance') {
    const target = url.searchParams.get('target') || '/pages/import.html?folder=operations';
    response.statusCode = 302;
    response.setHeader(
      'Set-Cookie',
      `tabular_session=${session.cookieToken}; Path=/; HttpOnly; SameSite=Strict`
    );
    response.setHeader('Location', target.startsWith('/') ? target : '/');
    response.end();
    return;
  }
  if (url.pathname === '/__acceptance-denied') {
    response.statusCode = 302;
    response.setHeader(
      'Set-Cookie',
      `tabular_session=${readerSession.cookieToken}; Path=/; HttpOnly; SameSite=Strict`
    );
    response.setHeader('Location', '/pages/import.html?folder=operations');
    response.end();
    return;
  }
  const upstream = http.request({
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: 4111,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: '127.0.0.1:4111', 'accept-encoding': 'identity' }
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, {
      ...upstreamResponse.headers,
      'cache-control': 'no-store'
    });
    upstreamResponse.pipe(response);
  });
  upstream.on('error', (error) => {
    response.statusCode = 502;
    response.end(`Fixture proxy failed: ${error.message}`);
  });
  request.pipe(upstream);
});
await new Promise<void>((resolve, reject) => {
  proxy.once('error', reject);
  proxy.listen(4112, '127.0.0.1', resolve);
});

let workerBusy = false;
const injectedFailures = new Set<string>();
const workerPoller = setInterval(() => {
  if (workerBusy) return;
  workerBusy = true;
  void (async () => {
    const confirmed = await admin.query(`
      SELECT id, source_name FROM tabular.import_operations
       WHERE state = 'confirmed'
         AND source_name <> 'Cancel-import.csv'
       ORDER BY confirmed_at, id
    `);
    for (const row of confirmed.rows) {
      try {
        const inject = String(row.source_name) === 'Retry-import.csv'
          && !injectedFailures.has(String(row.id));
        if (inject) injectedFailures.add(String(row.id));
        await worker.importExport.executeConfirmedImport(
          String(row.id),
          inject ? { failpoint: 'after-row-insert' } : {}
        );
      } catch (error) {
        console.error('TASK00011_WORKER_FAILURE', error instanceof Error ? error.name : 'unknown');
      }
    }
  })().finally(() => { workerBusy = false; });
}, 1_500);

console.log('TASK00011_FIXTURE_READY');
await new Promise<void>((resolve) => {
  process.once('SIGTERM', resolve);
  process.once('SIGINT', resolve);
});
clearInterval(workerPoller);
await writeExportEvidence();
await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
await web.close();
await worker.runtime.resources.close(10_000);
await migrationPool.close(10_000);
await admin.end();

async function writeSamples() {
  await fs.writeFile(path.join(outputRoot, 'Q3-orders.csv'), [
    'code,name,amount,risky',
    '001,Alpha,10.50,safe',
    '002,Beta,2,"=SUM(A1)"',
    '003,Gamma,20,plain'
  ].join('\r\n'));
  await fs.writeFile(path.join(outputRoot, 'Retry-import.csv'), [
    'code,name',
    'R-001,Recoverable'
  ].join('\r\n'));
  await fs.writeFile(path.join(outputRoot, 'Cancel-import.csv'), [
    'code,name',
    'C-001,Cancellable'
  ].join('\r\n'));
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Archive').addRows([['code', 'value'], ['old', 'ignored']]);
  workbook.addWorksheet('Current').addRows([
    ['code', 'calculated', 'active'],
    ['X-001', { formula: 'DO_NOT_IMPORT(A2)', result: 'cached value' }, true],
    ['X-002', { formula: 'DO_NOT_IMPORT(A3)', result: 42 }, false]
  ]);
  await workbook.xlsx.writeFile(path.join(outputRoot, 'Current-values.xlsx'));
}

async function writeExportEvidence() {
  const committed = await admin.query<{ result_summary: Record<string, unknown> }>(`
    SELECT result_summary
      FROM tabular.import_operations
     WHERE state = 'committed' AND source_kind = 'csv'
     ORDER BY committed_at DESC NULLS LAST, id DESC
     LIMIT 1
  `);
  const fileId = committed.rows[0]?.result_summary.fileId;
  if (typeof fileId !== 'string') return;
  const principal = await web.identity.requireBrowserMutation({
    cookieToken: session.cookieToken,
    csrfToken: session.csrfToken,
    origin: browserOrigin
  });
  const description = await web.files.describe(principal, fileId);
  const byName = new Map(description.columns.map((column) => [column.displayName, column.id]));
  const columnOrder = ['code', 'name', 'amount', 'risky'].map((name) => byName.get(name));
  if (columnOrder.some((id) => !id)) return;
  const view = await web.savedViews.create(principal, {
    fileId,
    name: 'Task 00011 export evidence',
    access: 'private',
    definition: {
      schemaVersion: 1,
      columnOrder: columnOrder as string[],
      hiddenColumnIds: [],
      sorts: [{ columnId: byName.get('amount')!, direction: 'desc' }],
      filters: [{ columnId: byName.get('name')!, operation: 'like', value: 'a' }],
      presentation: {},
      includes: {
        filtersAndSorting: true,
        columnLayout: true,
        cellPresentation: true
      }
    }
  }, 'cmd_task00011_export_evidence');
  const exported = await web.importExport.exportCsv(principal, {
    fileId,
    viewId: view.id,
    expectedViewVersion: view.version
  });
  await fs.writeFile(path.join(outputRoot, 'filtered-sorted-saved-view.csv'), exported.bytes);
  await fs.writeFile(path.join(outputRoot, 'export-result.json'), JSON.stringify({
    filename: exported.filename,
    rowCount: exported.rowCount,
    columnCount: exported.columnCount,
    sanitizedCells: exported.sanitizedCells,
    viewId: view.id,
    viewVersion: view.version
  }, null, 2));
}

function roleUrl(value: string, role: string, passwordValue: string) {
  const url = new URL(value);
  url.username = role;
  url.password = passwordValue;
  return url.toString();
}

async function reset() {
  await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS operations CASCADE');
  for (const role of [
    'tabular_task11_browser_web',
    'tabular_task11_browser_migrator',
    'tabular_task11_browser_worker',
    'tabular_task11_browser_owner',
    'tabular_task11_browser_reader'
  ]) {
    await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  }
}
