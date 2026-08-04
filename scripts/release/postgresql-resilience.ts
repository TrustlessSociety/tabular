import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

assert.equal(
  process.env.TABULAR_RELEASE_POSTGRES_DISPOSABLE,
  'task00014-disposable',
  'TABULAR_RELEASE_POSTGRES_DISPOSABLE must authorize the resilience drill'
);
const configuredAdminUrl = process.env.TABULAR_RELEASE_POSTGRES_ADMIN_URL;
assert.ok(configuredAdminUrl, 'TABULAR_RELEASE_POSTGRES_ADMIN_URL is required');
const adminUrl: string = configuredAdminUrl;
const parsedAdminUrl = new URL(adminUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsedAdminUrl.hostname));
assert.equal(parsedAdminUrl.port, '55414');
assert.ok(['/postgres', '/template1'].includes(parsedAdminUrl.pathname));

const projectRoot = process.cwd();
const packageRoot = path.resolve(
  process.env.TABULAR_RELEASE_PACKAGE_ROOT || '.build/release-package'
);
const outputRoot = path.join(projectRoot, 'output/release/task-00014');
const primaryContainer = 'tabular-task00014-pg18';
const restoreContainer = 'tabular-task00014-pg18-restore';
const copyContainer = 'tabular-task00014-backup-copy';
const backupVolume = 'tabular-task00014-backup';
const restoreVolume = 'tabular-task00014-restore-data';
const restorePort = '55415';
const password = 'task14-local-only';
const database = 'tabular_task00014_recovery';
const roles = {
  migrator: 'tabular_task14_recovery_migrator',
  web: 'tabular_task14_recovery_web',
  worker: 'tabular_task14_recovery_worker',
  member: 'tabular_task14_recovery_member'
};
const ids = {
  identity: `id_${'r'.repeat(32)}`,
  job: `job_${'r'.repeat(32)}`,
  session: `sess_${'r'.repeat(32)}`,
  history: `hist_${'r'.repeat(32)}`
};
const key = '8'.repeat(64);
const digest = '9'.repeat(64);
const children = new Set<ChildProcess>();
let admin: pg.Client | undefined;
let target: pg.Client | undefined;
let crashClient: pg.Client | undefined;
let reconnectPool: pg.Pool | undefined;
let restore: pg.Client | undefined;

await fs.mkdir(outputRoot, { recursive: true });
verifyPrimaryContainer();
try {
  admin = new pg.Client({ connectionString: adminUrl, application_name: 'tabular-release-resilience' });
  admin.on('error', () => undefined);
  await admin.connect();
  await resetTarget(admin);
  await provision(admin);

  const targetAdminUrl = databaseUrl(adminUrl, database);
  target = new pg.Client({ connectionString: targetAdminUrl, application_name: 'tabular-release-fixture' });
  target.on('error', () => undefined);
  await target.connect();
  await installFixture(target);
  const beforeCrash = await snapshot(target);
  assert.equal(beforeCrash.rows.count, 2);
  assert.equal(beforeCrash.operations.queued, 1);
  assert.equal(beforeCrash.outbox.highWater, 1);
  assert.equal(beforeCrash.migrations.count, 10);

  const webUrl = roleUrl(adminUrl, database, roles.web, password);
  await proveRls(webUrl, 2, 'Committed before crash');
  reconnectPool = new pg.Pool({
    connectionString: webUrl,
    max: 2,
    allowExitOnIdle: true,
    application_name: 'tabular-release-crash-pool'
  });
  reconnectPool.on('error', () => undefined);
  assert.equal((await reconnectPool.query<{ value: number }>('SELECT 1::integer AS value')).rows[0]!.value, 1);

  crashClient = new pg.Client({ connectionString: webUrl, application_name: 'tabular-release-uncommitted' });
  crashClient.on('error', () => undefined);
  await crashClient.connect();
  await crashClient.query('BEGIN');
  await crashClient.query(`SET LOCAL ROLE ${quoteIdentifier(roles.member)}`);
  await crashClient.query(
    'INSERT INTO release_probe.records (id, label, owner_role) VALUES (99, $1, current_user)',
    ['Must roll back']
  );

  docker(['kill', primaryContainer]);
  docker(['start', primaryContainer]);
  await waitForPostgres(adminUrl);
  await admin.end().catch(() => undefined);
  admin = new pg.Client({ connectionString: adminUrl, application_name: 'tabular-release-resilience' });
  admin.on('error', () => undefined);
  await admin.connect();
  await crashClient.end().catch(() => undefined);
  crashClient = undefined;
  await waitForPool(reconnectPool);

  await target.end().catch(() => undefined);
  target = new pg.Client({ connectionString: targetAdminUrl, application_name: 'tabular-release-post-crash' });
  target.on('error', () => undefined);
  await target.connect();
  const afterCrash = await snapshot(target);
  assert.deepEqual(afterCrash.oids, beforeCrash.oids);
  assert.equal(afterCrash.rows.count, 2);
  assert.equal(afterCrash.rows.uncommitted, 0);
  assert.equal(afterCrash.rows.firstLabel, 'Committed before crash');
  assert.deepEqual(afterCrash.operations, beforeCrash.operations);
  assert.deepEqual(afterCrash.outbox, beforeCrash.outbox);
  assert.deepEqual(afterCrash.migrations, beforeCrash.migrations);

  const crashEvidence = {
    task: '00014',
    result: 'passed',
    generatedAt: new Date().toISOString(),
    postgresql: afterCrash.postgresql,
    target: 'exact-disposable-local-postgresql-18',
    crash: 'docker-kill-primary-process',
    committedRowsPreserved: true,
    uncommittedTransactionRolledBack: true,
    pooledClientReconnected: true,
    migrationHistoryPreserved: true,
    operationQueuePreserved: true,
    outboxCursorPreserved: true,
    oidsPreserved: true,
    before: beforeCrash,
    after: afterCrash
  };
  await writeEvidence('postgresql-crash-recovery.json', crashEvidence);

  await target.query('CHECKPOINT');
  const backupDirectory = `task00014-base-${Date.now()}`;
  docker(['exec', primaryContainer, 'mkdir', `/backup/${backupDirectory}`]);
  docker(['exec', primaryContainer, 'chown', 'postgres:postgres', `/backup/${backupDirectory}`]);
  docker([
    'exec', '-u', 'postgres', '-e', `PGPASSWORD=${password}`, primaryContainer,
    'pg_basebackup', '-h', '127.0.0.1', '-U', 'postgres',
    '-D', `/backup/${backupDirectory}`, '--format=plain', '--wal-method=stream',
    '--checkpoint=fast', '--no-password'
  ]);
  const backupBytes = Number(docker([
    'exec', primaryContainer, 'du', '-sb', `/backup/${backupDirectory}`
  ]).split(/\s+/)[0]);
  assert.ok(backupBytes > 0);

  removeContainerIfPresent(copyContainer);
  removeContainerIfPresent(restoreContainer);
  removeVolumeIfPresent(restoreVolume);
  docker(['volume', 'create', restoreVolume]);
  docker([
    'run', '--name', copyContainer, '--rm', '--entrypoint', 'sh',
    '-v', `${backupVolume}:/source:ro`, '-v', `${restoreVolume}:/target`,
    'postgres:18', '-c', `cp -a /source/${backupDirectory}/. /target/`
  ]);
  docker([
    'run', '-d', '--name', restoreContainer,
    '-e', 'PGDATA=/var/lib/postgresql/data',
    '-p', `127.0.0.1:${restorePort}:5432`,
    '-v', `${restoreVolume}:/var/lib/postgresql/data`,
    'postgres:18'
  ]);
  const restoreAdminUrl = new URL(adminUrl);
  restoreAdminUrl.port = restorePort;
  try {
    await waitForPostgres(restoreAdminUrl.toString());
  } catch (error) {
    const logs = docker(['logs', restoreContainer]).slice(-1000);
    throw new Error(`Restored PostgreSQL did not start: ${logs}`, { cause: error });
  }
  restore = new pg.Client({
    connectionString: databaseUrl(restoreAdminUrl.toString(), database),
    application_name: 'tabular-release-restored-verification'
  });
  await restore.connect();
  const restored = await snapshot(restore);
  assert.deepEqual(restored.oids, afterCrash.oids);
  assert.deepEqual(restored.rows, afterCrash.rows);
  assert.deepEqual(restored.operations, afterCrash.operations);
  assert.deepEqual(restored.outbox, afterCrash.outbox);
  assert.deepEqual(restored.migrations, afterCrash.migrations);
  assert.equal(restored.inRecovery, false);

  const restoredWebUrl = roleUrl(restoreAdminUrl.toString(), database, roles.web, password);
  await proveRls(restoredWebUrl, 2, 'Edited after restore');
  const readiness = await provePackagedReadiness(restoredWebUrl);
  const afterRestoreEdit = await snapshot(restore);
  assert.equal(afterRestoreEdit.rows.firstLabel, 'Edited after restore');
  assert.deepEqual(afterRestoreEdit.oids, afterCrash.oids);
  assert.deepEqual(afterRestoreEdit.operations, afterCrash.operations);
  assert.deepEqual(afterRestoreEdit.outbox, afterCrash.outbox);

  await writeEvidence('physical-backup-restore.json', {
    task: '00014',
    result: 'passed',
    generatedAt: new Date().toISOString(),
    postgresql: restored.postgresql,
    backup: {
      mechanism: 'pg_basebackup',
      format: 'plain',
      walMethod: 'stream',
      checkpoint: 'fast',
      bytes: backupBytes,
      sourceVolume: backupVolume
    },
    restore: {
      target: 'isolated-postgresql-18-container',
      recoveryComplete: true,
      exactDatabaseRoleSchemaRelationOids: true,
      migrationHistory: 'exact',
      rlsDirectLoginDenied: true,
      authorizedRoleReadEdit: true,
      operationQueue: 'exact',
      outboxCursor: 'exact',
      readiness
    },
    source: afterCrash,
    restored: afterRestoreEdit
  });

  process.stdout.write(`${JSON.stringify({
    result: 'passed',
    crashRecovery: 'output/release/task-00014/postgresql-crash-recovery.json',
    physicalRestore: 'output/release/task-00014/physical-backup-restore.json',
    backupBytes
  }, null, 2)}\n`);
} finally {
  for (const child of children) child.kill('SIGKILL');
  await crashClient?.end().catch(() => undefined);
  await reconnectPool?.end().catch(() => undefined);
  await restore?.end().catch(() => undefined);
  await target?.end().catch(() => undefined);
  removeContainerIfPresent(copyContainer);
  removeContainerIfPresent(restoreContainer);
  removeVolumeIfPresent(restoreVolume);
  if (admin) {
    await resetTarget(admin).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

function verifyPrimaryContainer() {
  const record = JSON.parse(docker(['inspect', primaryContainer]))[0] as {
    Name: string;
    Config: { Image: string };
    State: { Running: boolean };
    Mounts: Array<{ Name?: string; Destination: string }>;
  };
  assert.equal(record.Name, `/${primaryContainer}`);
  assert.equal(record.Config.Image, 'postgres:18');
  assert.equal(record.State.Running, true);
  assert.ok(record.Mounts.some((mount) =>
    mount.Name === backupVolume && mount.Destination === '/backup'));
}

async function provision(client: pg.Client) {
  await client.query(`CREATE ROLE ${quoteIdentifier(roles.migrator)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await client.query(`CREATE ROLE ${quoteIdentifier(roles.web)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await client.query(`CREATE ROLE ${quoteIdentifier(roles.worker)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await client.query(`CREATE ROLE ${quoteIdentifier(roles.member)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await client.query(`GRANT ${quoteIdentifier(roles.member)} TO ${quoteIdentifier(roles.migrator)} WITH INHERIT TRUE, SET TRUE`);
  await client.query(`CREATE DATABASE ${quoteIdentifier(database)} OWNER ${quoteIdentifier(roles.migrator)}`);
  await client.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(database)} TO ${quoteIdentifier(roles.web)}, ${quoteIdentifier(roles.worker)}`);
  const common = {
    TABULAR_DATABASE_CONNECTION_ID: 'task00014_recovery',
    TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
    LOG_LEVEL: 'info'
  };
  await runPackage('dist/entrypoints/migrate.js', {
    ...common,
    NODE_ENV: 'production',
    TABULAR_INSTANCE_ID: 'resilience-migrator',
    TABULAR_MIGRATOR_DATABASE_URL: roleUrl(adminUrl, database, roles.migrator, password)
  });
  const targetClient = new pg.Client({ connectionString: databaseUrl(adminUrl, database) });
  await targetClient.connect();
  try {
    await targetClient.query(`GRANT USAGE ON SCHEMA tabular TO ${quoteIdentifier(roles.web)}, ${quoteIdentifier(roles.worker)}`);
    await targetClient.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular TO ${quoteIdentifier(roles.web)}, ${quoteIdentifier(roles.worker)}`);
    await targetClient.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular TO ${quoteIdentifier(roles.web)}, ${quoteIdentifier(roles.worker)}`);
    await targetClient.query(`GRANT ${quoteIdentifier(roles.member)} TO ${quoteIdentifier(roles.web)} WITH INHERIT FALSE, SET TRUE`);
  } finally {
    await targetClient.end();
  }
  await runPackage('dist/entrypoints/seed-demo.js', {
    ...common,
    NODE_ENV: 'test',
    TABULAR_INSTANCE_ID: 'resilience-seed',
    TABULAR_MIGRATOR_DATABASE_URL: roleUrl(adminUrl, database, roles.migrator, password),
    TABULAR_DEMO_MEMBER_ROLE: roles.member
  }, ['--confirm-local-demo']);
}

async function installFixture(client: pg.Client) {
  await client.query(`
    CREATE SCHEMA release_probe AUTHORIZATION ${quoteIdentifier(roles.member)};
    CREATE TABLE release_probe.records (
      id integer PRIMARY KEY,
      label text NOT NULL,
      owner_role name NOT NULL
    );
    ALTER TABLE release_probe.records OWNER TO ${quoteIdentifier(roles.member)};
    ALTER TABLE release_probe.records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE release_probe.records FORCE ROW LEVEL SECURITY;
    CREATE POLICY member_rows ON release_probe.records
      USING (owner_role = current_user)
      WITH CHECK (owner_role = current_user);
    INSERT INTO release_probe.records (id, label, owner_role)
    VALUES (1, 'Initial row', '${roles.member}'), (2, 'Second row', '${roles.member}');
  `);
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO tabular.identities (id, provider, issuer, provider_subject, display_name)
      VALUES ($1, 'release', 'https://release.invalid', 'resilience', 'Release resilience')
    `, [ids.identity]);
    await client.query(`
      INSERT INTO tabular.operation_idempotency (
        connection_id, actor_identity_id, idempotency_key, kind, schema_version,
        request_digest, original_job_id, active_job_id
      ) VALUES ('task00014_recovery', $1, $2, 'maintenance.import-staging', 1, $3, $4, $4)
    `, [ids.identity, key, digest, ids.job]);
    await client.query(`
      INSERT INTO tabular.operation_jobs (
        id, connection_id, actor_identity_id, session_id, history_scope_id,
        kind, authority_scope, idempotency_key, request_digest, payload,
        max_attempts, retained_until
      ) VALUES (
        $4, 'task00014_recovery', $1, $5, $6,
        'maintenance.import-staging', 'worker', $2, $3, '{"limit":10}'::jsonb,
        3, clock_timestamp() + interval '30 days'
      )
    `, [ids.identity, key, digest, ids.job, ids.session, ids.history]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function snapshot(client: pg.Client) {
  const postgresql = await client.query<{ version: string }>('SELECT version() AS version');
  const databaseOid = await client.query<{ oid: number }>(
    'SELECT oid::integer AS oid FROM pg_database WHERE datname = current_database()'
  );
  const roleOids = await client.query<{ rolname: string; oid: number }>(`
    SELECT rolname, oid::integer AS oid FROM pg_roles
     WHERE rolname = ANY($1::name[]) ORDER BY rolname
  `, [Object.values(roles)]);
  const schemaOids = await client.query<{ name: string; oid: number }>(`
    SELECT nspname AS name, oid::integer AS oid FROM pg_namespace
     WHERE nspname = ANY($1::name[]) ORDER BY nspname
  `, [['tabular', 'operations', 'finance', 'release_probe']]);
  const relationOids = await client.query<{ name: string; oid: number }>(`
    SELECT namespace.nspname || '.' || relation.relname AS name,
           relation.oid::integer AS oid
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname || '.' || relation.relname = ANY($1::text[])
     ORDER BY name
  `, [[
    'tabular.operation_jobs',
    'tabular.outbox_events',
    'operations.customer_orders',
    'operations.fulfillment_queue',
    'finance.customers',
    'finance.invoices',
    'release_probe.records'
  ]]);
  const migrations = await client.query<{ count: number; checksum: string }>(`
    SELECT count(*)::integer AS count,
           encode(sha256(convert_to(string_agg(version || ':' || checksum, ',' ORDER BY version), 'UTF8')), 'hex') AS checksum
      FROM tabular.schema_migrations
  `);
  const rows = await client.query<{ count: number; uncommitted: number; first_label: string }>(`
    SELECT count(*)::integer AS count,
           count(*) FILTER (WHERE id = 99)::integer AS uncommitted,
           max(label) FILTER (WHERE id = 1) AS first_label
      FROM release_probe.records
  `);
  const operations = await client.query<{ queued: number; total: number }>(`
    SELECT count(*) FILTER (WHERE state = 'queued')::integer AS queued,
           count(*)::integer AS total
      FROM tabular.operation_jobs
  `);
  const outbox = await client.query<{ events: number; high_water: number }>(`
    SELECT count(*)::integer AS events,
           COALESCE(max(sequence), 0)::integer AS high_water
      FROM tabular.outbox_events
     WHERE connection_id = 'task00014_recovery'
  `);
  const recovery = await client.query<{ value: boolean }>('SELECT pg_is_in_recovery() AS value');
  return {
    postgresql: postgresql.rows[0]!.version,
    inRecovery: recovery.rows[0]!.value,
    oids: {
      database: databaseOid.rows[0]!.oid,
      roles: Object.fromEntries(roleOids.rows.map((row) => [row.rolname, row.oid])),
      schemas: Object.fromEntries(schemaOids.rows.map((row) => [row.name, row.oid])),
      relations: Object.fromEntries(relationOids.rows.map((row) => [row.name, row.oid]))
    },
    migrations: migrations.rows[0]!,
    rows: {
      count: rows.rows[0]!.count,
      uncommitted: rows.rows[0]!.uncommitted,
      firstLabel: rows.rows[0]!.first_label
    },
    operations: operations.rows[0]!,
    outbox: {
      events: outbox.rows[0]!.events,
      highWater: outbox.rows[0]!.high_water
    }
  };
}

async function proveRls(connectionString: string, expectedRows: number, newLabel: string) {
  const client = new pg.Client({ connectionString, application_name: 'tabular-release-rls-proof' });
  await client.connect();
  try {
    await assert.rejects(
      client.query('SELECT count(*) FROM release_probe.records'),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === '42501'
    );
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE ${quoteIdentifier(roles.member)}`);
      const visible = await client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM release_probe.records'
      );
      assert.equal(visible.rows[0]!.count, expectedRows);
      await client.query('UPDATE release_probe.records SET label = $1 WHERE id = 1', [newLabel]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function provePackagedReadiness(webUrl: string) {
  const child = spawn('node', ['dist/entrypoints/web.js', '--port', '0'], {
    cwd: packageRoot,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      TABULAR_INSTANCE_ID: 'restored-web',
      TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
      TABULAR_DATABASE_CONNECTION_ID: 'task00014_recovery',
      TABULAR_WEB_DATABASE_URL: webUrl
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.add(child);
  const listening = await waitForJson(child, 'web_listening');
  const response = await fetch(`${String(listening.origin)}/readyz`);
  assert.equal(response.status, 200);
  const body = await response.json() as {
    status?: string;
    resources?: { checks?: Array<{ name: string; ready: boolean }> };
  };
  assert.equal(body.status, 'ready');
  assert.ok(body.resources?.checks?.some((check) =>
    check.name === 'postgres-web-pool' && check.ready));
  const exit = waitForExit(child);
  child.kill('SIGTERM');
  assert.equal(await exit, 0);
  children.delete(child);
  return 'packaged-web-ready-and-graceful-shutdown';
}

async function runPackage(entrypoint: string, values: NodeJS.ProcessEnv, args: string[] = []) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('node', [entrypoint, ...args], {
      cwd: packageRoot,
      env: { PATH: process.env.PATH, ...values },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${entrypoint} exited with ${code}; ${stderr.slice(0, 300)}`));
    });
  });
}

async function waitForPostgres(connectionString: string) {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await delay(250);
    }
  }
  throw lastError || new Error('PostgreSQL did not become ready');
}

async function waitForPool(pool: pg.Pool) {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      assert.equal((await pool.query<{ value: number }>('SELECT 1::integer AS value')).rows[0]!.value, 1);
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError || new Error('Pool did not reconnect');
}

function waitForJson(child: ChildProcess, event: string, timeoutMs = 10_000) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let buffer = '';
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}; ${stderr.slice(0, 300)}`)), timeoutMs);
    child.stderr!.on('data', (chunk) => { stderr += String(chunk); });
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          if (record.event !== event) continue;
          clearTimeout(timeout);
          child.stdout!.off('data', onData);
          resolve(record);
        } catch {
          // Only structured logs participate in the readiness proof.
        }
      }
    };
    child.stdout!.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Web process exited with ${code}; ${stderr.slice(0, 300)}`));
    });
  });
}

function waitForExit(child: ChildProcess) {
  return new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
}

async function resetTarget(client: pg.Client) {
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
  for (const role of [roles.web, roles.worker, roles.member, roles.migrator]) {
    await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
  }
}

function roleUrl(source: string, databaseName: string, role: string, rolePassword: string) {
  const value = new URL(source);
  value.pathname = `/${databaseName}`;
  value.username = role;
  value.password = rolePassword;
  return value.toString();
}

function databaseUrl(source: string, databaseName: string) {
  const value = new URL(source);
  value.pathname = `/${databaseName}`;
  return value.toString();
}

function quoteIdentifier(value: string) {
  assert.match(value, /^[a-z][a-z0-9_]{0,62}$/);
  return `"${value}"`;
}

function docker(args: string[]) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`docker ${args[0]} failed: ${(result.stderr || '').trim().slice(0, 400)}`);
  }
  return result.stdout.trim();
}

function removeContainerIfPresent(name: string) {
  const inspected = spawnSync('docker', ['container', 'inspect', name], { encoding: 'utf8' });
  if (inspected.status === 0) docker(['rm', '-f', name]);
}

function removeVolumeIfPresent(name: string) {
  const inspected = spawnSync('docker', ['volume', 'inspect', name], { encoding: 'utf8' });
  if (inspected.status === 0) docker(['volume', 'rm', '-f', name]);
}

async function writeEvidence(name: string, value: unknown) {
  await fs.writeFile(
    path.join(outputRoot, name),
    `${JSON.stringify(value, null, 2)}\n`,
    { mode: 0o600 }
  );
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
