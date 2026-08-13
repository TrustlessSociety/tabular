import { fork, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import pg from 'pg';
import { createApplication, startWeb } from '../../../bootstrap/application.js';
import { reconcileCatalog } from '../../../plugins/catalog/helpers/reconciliation.js';
import { runMigrations } from '../../../plugins/database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../../plugins/database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../../plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../plugins/database/migrations/index.js';
import { TestIdentityProvider } from '../../../plugins/identity/tests/provider-double.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TASK00012_DATABASE_URL
  || 'postgresql://postgres:task12@127.0.0.1:55412/tabular_task00012';
const outputRoot = path.resolve('output/playwright/task-00012');
const sessionPath = path.join(outputRoot, 'fixture-session.json');
const upstreamOrigin = 'http://127.0.0.1:4121';
const browserOrigin = 'http://127.0.0.1:4122';
const password = `fixture_${randomBytes(12).toString('hex')}`;
const admin = new Pool({ connectionString, max: 8, allowExitOnIdle: true });
const webUrl = roleUrl(connectionString, 'tabular_task12_browser_web', password);
const workerUrl = roleUrl(connectionString, 'tabular_task12_browser_worker', password);
const migratorUrl = roleUrl(connectionString, 'tabular_task12_browser_migrator', password);
const migrationPool = new ManagedPostgresPool({
  name: 'task00012-browser-migrator',
  connectionString: migratorUrl,
  maximum: 2,
  applicationName: 'tabular-task00012-browser-migrator'
});

await reset();
await admin.query(`
  CREATE ROLE tabular_task12_browser_web LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task12_browser_worker LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task12_browser_migrator LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task12_browser_operator NOLOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tabular_task12_browser_member NOLOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT CONNECT, CREATE ON DATABASE tabular_task00012 TO tabular_task12_browser_migrator;
  GRANT CONNECT ON DATABASE tabular_task00012
    TO tabular_task12_browser_web, tabular_task12_browser_worker;
  GRANT tabular_task12_browser_operator, tabular_task12_browser_member
    TO tabular_task12_browser_web, tabular_task12_browser_worker
    WITH INHERIT FALSE, SET TRUE;
`);
await runMigrations(transaction(migrationPool), await loadMigrations());
await admin.query(`
  GRANT USAGE ON SCHEMA tabular
    TO tabular_task12_browser_web, tabular_task12_browser_worker,
       tabular_task12_browser_migrator, tabular_task12_browser_operator,
       tabular_task12_browser_member;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular
    TO tabular_task12_browser_web, tabular_task12_browser_worker,
       tabular_task12_browser_migrator;
  GRANT SELECT ON ALL TABLES IN SCHEMA tabular
    TO tabular_task12_browser_operator, tabular_task12_browser_member;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular
    TO tabular_task12_browser_web, tabular_task12_browser_worker,
       tabular_task12_browser_migrator;
  CREATE SCHEMA workspace AUTHORIZATION tabular_task12_browser_operator;
  CREATE TABLE workspace.result_file (id bigint PRIMARY KEY, label text NOT NULL);
  ALTER TABLE workspace.result_file OWNER TO tabular_task12_browser_operator;
  INSERT INTO workspace.result_file VALUES (1, 'Task 00012 authorized result');
  CREATE TABLE workspace.task12_operation_effects (
    effect_key text PRIMARY KEY,
    job_id text NOT NULL UNIQUE,
    committed_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  ALTER TABLE workspace.task12_operation_effects OWNER TO tabular_task12_browser_operator;
  GRANT USAGE ON SCHEMA workspace TO tabular_task12_browser_operator;
  GRANT SELECT ON workspace.result_file TO tabular_task12_browser_operator;
  GRANT USAGE ON SCHEMA workspace TO tabular_task12_browser_worker;
  GRANT INSERT, SELECT ON workspace.task12_operation_effects TO tabular_task12_browser_worker;
`);
const catalog = await transaction(migrationPool)((database) =>
  reconcileCatalog(database, 'task00012-browser'));
const workspace = [...catalog.schemas.values()].find((schema) => schema.name === 'workspace');
const resultFile = [...catalog.objects.values()].find((object) =>
  object.schemaId === workspace?.stableId && object.name === 'result_file');
if (!workspace || !resultFile) throw new Error('Task 00012 result fixture was not cataloged');

const environment = {
  NODE_ENV: 'test',
  TABULAR_PUBLIC_ORIGIN: browserOrigin,
  TABULAR_DATABASE_CONNECTION_ID: 'task00012-browser',
  TABULAR_WEB_DATABASE_URL: webUrl,
  TABULAR_WORKER_DATABASE_URL: workerUrl,
  TABULAR_MIGRATOR_DATABASE_URL: migratorUrl,
  TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '1800',
  TABULAR_SESSION_MAX_AGE_SECONDS: '7200',
  TABULAR_DATABASE_POOL_MAXIMUM: '8',
  TABULAR_WORKER_LEASE_SECONDS: '3',
  TABULAR_WORKER_CONCURRENCY: '2',
  TABULAR_WORKER_SHUTDOWN_TIMEOUT_MS: '1000'
};
const web = await startWeb({
  env: environment,
  projectRoot: process.cwd(),
  runtimeRoot: process.cwd(),
  host: '127.0.0.1',
  port: 4121
});
const provider = new TestIdentityProvider();
const operatorSubject = await provider.verify({
  assertion: 'verified-test-assertion',
  subject: 'task00012-browser-operator',
  displayName: 'Activity Operator'
});
const memberSubject = await provider.verify({
  assertion: 'verified-test-assertion',
  subject: 'task00012-browser-member',
  displayName: 'Activity Member'
});
await web.identity.provisionIdentityRole(operatorSubject, 'tabular_task12_browser_operator');
await web.identity.provisionIdentityRole(memberSubject, 'tabular_task12_browser_member');
await admin.query(`
  UPDATE tabular.allowed_roles SET can_manage_operations_retention = true
   WHERE role_name = 'tabular_task12_browser_operator'
`);
const operatorSession = await web.identity.establishBrowserSession(operatorSubject);
const memberSession = await web.identity.establishBrowserSession(memberSubject);
const operator = await web.identity.requireBrowserMutation({
  cookieToken: operatorSession.cookieToken,
  csrfToken: operatorSession.csrfToken,
  origin: browserOrigin
});
const member = await web.identity.requireBrowserMutation({
  cookieToken: memberSession.cookieToken,
  csrfToken: memberSession.csrfToken,
  origin: browserOrigin
});

const child = fork(path.join(outputRoot, 'worker-fixture.ts'), [], {
  cwd: process.cwd(),
  execArgv: ['--import', 'tsx'],
  env: { ...process.env, ...environment, TABULAR_TASK00012_RESULT_FILE_ID: resultFile.stableId },
  stdio: ['inherit', 'inherit', 'inherit', 'ipc']
});
child.on('error', (error) => {
  if ((error as NodeJS.ErrnoException).code !== 'EPIPE') console.error('TASK00012_CHILD_ERROR', error);
});
const gated = new Set<string>();
let workerReady = false;
let workerStarted = false;
child.on('message', (message: unknown) => {
  if (!message || typeof message !== 'object') return;
  const record = message as Record<string, unknown>;
  if (record.type === 'ready') workerReady = true;
  if (record.type === 'started') workerStarted = true;
  if (record.type === 'gated' && typeof record.jobId === 'string') gated.add(record.jobId);
});
await waitFor(() => workerReady, 'worker fixture ready');

const jobs = new Map<string, string>();
const sseConnections = new Set<{
  upstream: http.ClientRequest;
  response: http.ServerResponse;
}>();
const sseCursors: number[] = [];
let blockSseUntil = 0;
await fs.writeFile(sessionPath, JSON.stringify({
  browserOrigin,
  upstreamOrigin,
  operatorCookie: operatorSession.cookieToken,
  memberCookie: memberSession.cookieToken,
  resultFileId: resultFile.stableId
}, null, 2), { mode: 0o600 });

const proxy = http.createServer((request, response) => {
  void routeProxy(request, response).catch((error) => {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'fixture failed' }));
  });
});
await new Promise<void>((resolve, reject) => {
  proxy.once('error', reject);
  proxy.listen(4122, '127.0.0.1', resolve);
});
console.log('TASK00012_FIXTURE_READY');

await new Promise<void>((resolve) => {
  process.once('SIGTERM', resolve);
  process.once('SIGINT', resolve);
});
if (child.connected) child.send({ type: 'stop' });
await waitForExit(child);
await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
await web.close();
await migrationPool.close(10_000);
await admin.end();
await fs.rm(sessionPath, { force: true });

async function routeProxy(request: http.IncomingMessage, response: http.ServerResponse) {
  const url = new URL(request.url || '/', browserOrigin);
  if (url.pathname === '/__acceptance') {
    const selected = url.searchParams.get('user') === 'member' ? memberSession : operatorSession;
    const target = url.searchParams.get('target') || '/pages/system-activity.html';
    response.statusCode = 302;
    response.setHeader('Set-Cookie', `tabular_session=${selected.cookieToken}; Path=/; HttpOnly; SameSite=Strict`);
    response.setHeader('Location', target.startsWith('/') ? target : '/pages/system-activity.html');
    response.end();
    return;
  }
  if (url.pathname === '/__control') {
    const action = url.searchParams.get('action');
    if (action === 'start-worker') {
      child.send({ type: 'start' });
      await waitFor(() => workerStarted, 'worker start');
      return json(response, { ok: true, workerStarted });
    }
    if (action === 'enqueue') {
      const scenario = url.searchParams.get('scenario') || '';
      const result = await enqueueScenario(scenario);
      return json(response, result);
    }
    if (action === 'release') {
      const jobId = url.searchParams.get('jobId') || '';
      if (!gated.has(jobId)) return json(response, { ok: false, gated: [...gated] }, 409);
      gated.delete(jobId);
      child.send({ type: 'release', jobId });
      return json(response, { ok: true, jobId });
    }
    if (action === 'interrupt-sse') {
      blockSseUntil = Date.now() + 10_000;
      for (const connection of sseConnections) {
        connection.upstream.destroy();
        connection.response.destroy();
      }
      sseConnections.clear();
      return json(response, { ok: true, blockedUntil: blockSseUntil });
    }
    if (action === 'state') return json(response, await fixtureState());
    if (action === 'debug-read-events') {
      try {
        return json(response, await web.operations.readEvents(operatorSession.principal, 0, 100));
      } catch (error) {
        return json(response, {
          name: error instanceof Error ? error.name : 'unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }, 500);
      }
    }
    return json(response, { ok: false, error: 'unknown control action' }, 400);
  }
  const operationSse = url.pathname === '/events' && url.searchParams.get('scope') === 'operations';
  if (operationSse) {
    const cursor = Number(url.searchParams.get('cursor'));
    if (Number.isSafeInteger(cursor) && cursor >= 0) sseCursors.push(cursor);
    if (Date.now() < blockSseUntil) {
      response.statusCode = 503;
      response.setHeader('Cache-Control', 'no-store');
      response.end('Fixture-controlled SSE interruption');
      return;
    }
  }
  const upstream = http.request({
    protocol: 'http:', hostname: '127.0.0.1', port: 4121,
    method: request.method, path: request.url,
    headers: { ...request.headers, host: '127.0.0.1:4121', 'accept-encoding': 'identity' }
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, {
      ...upstreamResponse.headers, 'cache-control': 'no-store'
    });
    upstreamResponse.pipe(response);
    upstreamResponse.once('close', () => {
      for (const connection of sseConnections) {
        if (connection.upstream === upstream) sseConnections.delete(connection);
      }
    });
  });
  if (operationSse) sseConnections.add({ upstream, response });
  upstream.on('error', (error) => {
    response.statusCode = 502;
    response.end(`Fixture proxy failed: ${error.message}`);
  });
  request.pipe(upstream);
}

async function enqueueScenario(scenario: string) {
  const idempotencyKey = `task00012-browser-${scenario}`;
  const scenarioNumber: Record<string, number> = {
    retry: 102, cancel: 103, private: 103, replay: 104, acknowledge: 106
  };
  if (scenario === 'lifecycle') {
    const result = await web.operations.enqueue(operator, {
      kind: 'import.commit', authority: 'worker', idempotencyKey,
      fileId: resultFile!.stableId,
      payload: { importId: `imp_${'l'.repeat(32)}` }, maxAttempts: 2
    });
    jobs.set(scenario, result.job.id);
    return { ok: true, scenario, jobId: result.job.id, replayed: result.replayed };
  }
  const limit = scenarioNumber[scenario];
  if (!limit) throw new Error(`unknown scenario: ${scenario}`);
  const principal = scenario === 'private' ? member : operator;
  const result = await web.operations.enqueue(principal, {
    kind: 'maintenance.import-staging', authority: 'worker', idempotencyKey,
    payload: { limit }, maxAttempts: 1
  });
  jobs.set(scenario, result.job.id);
  return { ok: true, scenario, jobId: result.job.id, replayed: result.replayed };
}

async function fixtureState() {
  const rows = await admin.query(`
    SELECT id, state, progress, attempts, max_attempts, acknowledged_at IS NOT NULL AS acknowledged
      FROM tabular.operation_jobs ORDER BY created_at, id
  `);
  const cursor = await admin.query(`
    SELECT COALESCE(MAX(sequence), 0)::integer AS cursor FROM tabular.outbox_events
     WHERE connection_id = 'task00012-browser'
  `);
  const effects = await admin.query(`
    SELECT effect_key, job_id, COUNT(*)::integer AS committed_rows
      FROM workspace.task12_operation_effects
     GROUP BY effect_key, job_id ORDER BY effect_key
  `);
  return {
    ok: true, workerReady, workerStarted, gated: [...gated],
    jobs: Object.fromEntries(jobs), rows: rows.rows,
    cursor: cursor.rows[0].cursor, sseCursors: sseCursors.slice(-20),
    effects: effects.rows
  };
}

function json(response: http.ServerResponse, body: unknown, status = 200) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function transaction(pool: ManagedPostgresPool) {
  return <Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
    withPostgreSqlTransaction(pool, {
      settings: { statement_timeout: '15000', lock_timeout: '15000', idle_in_transaction_session_timeout: '15000' }
    }, callback);
}

function roleUrl(value: string, role: string, passwordValue: string) {
  const url = new URL(value);
  url.username = role;
  url.password = passwordValue;
  return url.toString();
}

async function reset() {
  await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS workspace CASCADE');
  for (const role of [
    'tabular_task12_browser_web', 'tabular_task12_browser_worker',
    'tabular_task12_browser_migrator', 'tabular_task12_browser_operator',
    'tabular_task12_browser_member'
  ]) {
    await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  }
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 10_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function waitForExit(process: ChildProcess) {
  if (process.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      process.kill('SIGTERM');
      resolve();
    }, 5_000);
    process.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
