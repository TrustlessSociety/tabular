import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

assert.equal(
  process.env.TABULAR_RELEASE_POSTGRES_DISPOSABLE,
  'task00014-disposable',
  'TABULAR_RELEASE_POSTGRES_DISPOSABLE must authorize lifecycle cleanup'
);
const adminUrl = process.env.TABULAR_RELEASE_POSTGRES_ADMIN_URL;
if (!adminUrl) throw new Error('TABULAR_RELEASE_POSTGRES_ADMIN_URL is required');
const adminConnectionString: string = adminUrl;
const parsed = new URL(adminUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname));
assert.ok(parsed.port);
assert.ok(['/postgres', '/template1'].includes(parsed.pathname));

const packageRoot = path.resolve(
  process.env.TABULAR_RELEASE_PACKAGE_ROOT || '.build/release-package'
);
const tsxCli = path.join(packageRoot, 'node_modules/tsx/dist/cli.mjs');
const runtime = (name: string, ...args: string[]) => [
  tsxCli,
  `scripts/runtime/${name}.ts`,
  ...args
];
const database = 'tabular_task00014';
const password = 'task14-local-only';
const roles = {
  migrator: 'tabular_task14_migrator',
  web: 'tabular_task14_web',
  worker: 'tabular_task14_worker',
  member: 'tabular_task14_member'
};
const url = (role: string) => {
  const value = new URL(adminUrl);
  value.pathname = `/${database}`;
  value.username = role;
  value.password = password;
  return value.toString();
};
const urls = {
  migrator: url(roles.migrator),
  web: url(roles.web),
  worker: url(roles.worker)
};
const admin = new pg.Client({ connectionString: adminUrl, application_name: 'tabular-release-lifecycle' });
const children = new Set<ChildProcess>();
await admin.connect();
try {
  const version = await admin.query<{ value: string }>(
    "SELECT current_setting('server_version_num') AS value"
  );
  assert.ok(Number(version.rows[0]!.value) >= 180000);
  await resetTarget(admin);
  await admin.query(`CREATE ROLE ${roles.migrator} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await admin.query(`CREATE ROLE ${roles.web} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await admin.query(`CREATE ROLE ${roles.worker} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await admin.query(`CREATE ROLE ${roles.member} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await admin.query(`GRANT ${roles.member} TO ${roles.migrator} WITH INHERIT TRUE, SET TRUE`);
  await admin.query(`CREATE DATABASE ${database} OWNER ${roles.migrator}`);
  await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${roles.web}, ${roles.worker}`);

  const productionBase = {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
    TABULAR_DATABASE_CONNECTION_ID: 'task00014',
    TABULAR_SHUTDOWN_TIMEOUT_MS: '3000',
    TABULAR_WORKER_SHUTDOWN_TIMEOUT_MS: '3000'
  };
  const preflight = await run(process.execPath, runtime('preflight'), {
    ...productionBase,
    TABULAR_INSTANCE_ID: 'preflight',
    TABULAR_WEB_DATABASE_URL: urls.web,
    TABULAR_MIGRATOR_DATABASE_URL: urls.migrator,
    TABULAR_WORKER_DATABASE_URL: urls.worker
  });
  assert.match(preflight.stdout, /"event":"deployment_preflight_passed"/);

  const migration = await run(process.execPath, runtime('migrate'), {
    ...productionBase,
    TABULAR_INSTANCE_ID: 'migrator-a',
    TABULAR_MIGRATOR_DATABASE_URL: urls.migrator
  });
  assert.match(migration.stdout, /"event":"migrations_completed"/);
  await grantRuntimeAuthority();
  const doctor = await run(process.execPath, runtime('doctor', '--scope', 'web'), {
    ...productionBase,
    TABULAR_INSTANCE_ID: 'doctor-web',
    TABULAR_WEB_DATABASE_URL: urls.web
  });
  assert.match(doctor.stdout, /"event":"doctor_passed"/);

  const seedEnvironment = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    TABULAR_INSTANCE_ID: 'seed-a',
    TABULAR_DATABASE_CONNECTION_ID: 'task00014',
    TABULAR_MIGRATOR_DATABASE_URL: urls.migrator,
    TABULAR_DEMO_MEMBER_ROLE: roles.member
  };
  const firstSeed = await run(
    process.execPath,
    runtime('seed-demo', '--confirm-local-demo'),
    seedEnvironment
  );
  assert.match(firstSeed.stdout, /"event":"demo_seed_completed"/);
  const targetAdmin = new pg.Client({ connectionString: databaseUrl(adminUrl, database) });
  await targetAdmin.connect();
  try {
    await targetAdmin.query(`
      UPDATE operations.customer_orders
         SET notes = 'Preserved local edit'
       WHERE order_id = 'ord-4001'
    `);
    const secondSeed = await run(
      process.execPath,
      runtime('seed-demo', '--confirm-local-demo'),
      seedEnvironment
    );
    assert.match(secondSeed.stdout, /"insertedRows":0/);
    const preserved = await targetAdmin.query<{ notes: string }>(
      "SELECT notes FROM operations.customer_orders WHERE order_id = 'ord-4001'"
    );
    assert.equal(preserved.rows[0]!.notes, 'Preserved local edit');
    const privilege = await targetAdmin.query<{ allowed: boolean }>(
      "SELECT has_table_privilege($1, 'operations.customer_orders', 'SELECT') AS allowed",
      [roles.member]
    );
    assert.equal(privilege.rows[0]!.allowed, true);
    await targetAdmin.query(`ALTER SCHEMA operations OWNER TO ${roles.web}`);
    const foreignSeed = await run(
      process.execPath,
      runtime('seed-demo', '--confirm-local-demo'),
      seedEnvironment,
      { expectedExit: 1 }
    );
    assert.match(foreignSeed.stderr, /Refusing to adopt a foreign-owned operations demo schema/);
    await targetAdmin.query('DROP SCHEMA operations, finance CASCADE');
  } finally {
    await targetAdmin.end();
  }
  await run(process.execPath, runtime('seed-demo', '--confirm-local-demo'), seedEnvironment);
  const refusedProductionSeed = await run(
    process.execPath,
    runtime('seed-demo', '--confirm-local-demo'),
    {
      ...productionBase,
      TABULAR_INSTANCE_ID: 'seed-prod',
      TABULAR_MIGRATOR_DATABASE_URL: urls.migrator
    },
    { expectedExit: 1 }
  );
  assert.match(refusedProductionSeed.stderr, /local demo seed is disabled in production/i);

  for (const iteration of ['a', 'b']) {
    const web = start(process.execPath, runtime('web', '--port', '0'), {
      ...productionBase,
      TABULAR_INSTANCE_ID: `web-${iteration}`,
      TABULAR_WEB_DATABASE_URL: urls.web
    });
    const worker = start(process.execPath, runtime('worker'), {
      ...productionBase,
      TABULAR_INSTANCE_ID: `worker-${iteration}`,
      TABULAR_WORKER_DATABASE_URL: urls.worker
    });
    const listening = await waitForJson(web, 'web_listening');
    await waitForJson(worker, 'worker_ready');
    const origin = String(listening.origin);
    assert.equal((await fetch(`${origin}/healthz`)).status, 200);
    assert.equal((await fetch(`${origin}/readyz`)).status, 200);
    const webExit = waitForExit(web);
    const workerExit = waitForExit(worker);
    web.kill('SIGTERM');
    worker.kill('SIGTERM');
    assert.equal(await webExit, 0);
    assert.equal(await workerExit, 0);
    children.delete(web);
    children.delete(worker);
  }

  const leakAdmin = new pg.Client({ connectionString: databaseUrl(adminUrl, database) });
  await leakAdmin.connect();
  try {
    const leaked = await leakAdmin.query<{ total: number }>(`
      SELECT count(*)::integer AS total
      FROM pg_stat_activity
      WHERE datname = $1 AND application_name LIKE 'tabular-%'
    `, [database]);
    assert.equal(leaked.rows[0]!.total, 0);
  } finally {
    await leakAdmin.end();
  }
  process.stdout.write(`${JSON.stringify({
    result: 'passed',
    postgresql: version.rows[0]!.value,
    productionPackage: packageRoot,
    runtime: 'source-typescript',
    preflight: 'three-authority-same-target-distinct-user',
    migrate: 'current',
    doctor: 'postgresql-migrations-operations-outbox',
    seed: 'operations-finance-metadata-idempotent-edit-preserving-owner-and-production-refusal',
    lifecycle: 'web-worker-ready-sigterm-restart-pools-closed'
  }, null, 2)}\n`);

  async function grantRuntimeAuthority() {
    const target = new pg.Client({ connectionString: databaseUrl(adminConnectionString, database) });
    await target.connect();
    try {
      await target.query(`GRANT USAGE ON SCHEMA tabular TO ${roles.web}, ${roles.worker}`);
      await target.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular TO ${roles.web}, ${roles.worker}`);
      await target.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular TO ${roles.web}, ${roles.worker}`);
      await target.query(`GRANT ${roles.member} TO ${roles.web}`);
    } finally {
      await target.end();
    }
  }
} finally {
  for (const child of children) child.kill('SIGKILL');
  await resetTarget(admin);
  await admin.end();
}

async function resetTarget(admin: InstanceType<typeof pg.Client>) {
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  for (const role of [roles.web, roles.worker, roles.member, roles.migrator]) {
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  }
}

function databaseUrl(source: string, name: string) {
  const value = new URL(source);
  value.pathname = `/${name}`;
  return value.toString();
}

function environment(values: NodeJS.ProcessEnv) {
  return { PATH: process.env.PATH, ...values } as NodeJS.ProcessEnv;
}

function run(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { expectedExit?: number } = {}
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: packageRoot,
      env: environment(env),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr!.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code) => {
      const expected = options.expectedExit ?? 0;
      if (code === expected) resolve({ stdout, stderr });
      else reject(new Error(`${executable} ${args[0]} exited with ${code}; output was redacted`));
    });
  });
}

function start(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(executable, args, {
    cwd: packageRoot,
    env: environment(env),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.add(child);
  return child;
}

function waitForJson(child: ChildProcess, event: string, timeoutMs = 10_000) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
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
          // Ignore dependency diagnostics; release evidence retains structured events only.
        }
      }
    };
    child.stdout!.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Process exited with ${code} before ${event}`));
    });
  });
}

function waitForExit(child: ChildProcess, timeoutMs = 10_000) {
  return new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for process exit')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}
