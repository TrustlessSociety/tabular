//node
import fs from 'node:fs';
import path from 'node:path';

//modules
import pg from 'pg';

//client
import {
  LOCAL_REVIEW,
  assertDisposableContainer,
  databaseUrl,
  docker,
  inspectContainer,
  localReviewEnvironment,
  localReviewOrigin,
  pause,
  requireConfirmation,
  runCommand,
  writeEnvironmentFile
} from './common.js';

const { Client } = pg;
const projectRoot = process.cwd();
let createdContainer = false;

requireConfirmation('--confirm-task00014-disposable');
assertProjectRoot();
docker(['version']);

// An earlier run may be reset only after it proves the exact disposable contract.
const existing = inspectContainer();
if (existing) {
  assertDisposableContainer(existing);
  docker(['rm', '--force', '--volumes', LOCAL_REVIEW.container]);
}

try {
  startPostgreSql18();
  createdContainer = true;
  await waitForPostgreSql18();
  await provisionAuthorities();

  // Build once, then use compiled Node entrypoints for every supported process.
  await runVisible('npm', ['run', 'build']);
  await runVisible(
    process.execPath,
    [path.join(projectRoot, 'dist/entrypoints/migrate.js')],
    localReviewEnvironment()
  );
  await grantRuntimeAuthority();
  await runVisible(
    process.execPath,
    [
      path.join(projectRoot, 'dist/entrypoints/seed-demo.js'),
      '--confirm-local-demo'
    ],
    localReviewEnvironment()
  );
  await verifySeededTarget();
  await writeEnvironmentFile();

  process.stdout.write(`${JSON.stringify({
    result: 'ready-to-start',
    target: 'explicitly-disposable-postgresql-18',
    container: LOCAL_REVIEW.container,
    database: `${LOCAL_REVIEW.host}:${LOCAL_REVIEW.databasePort}/${LOCAL_REVIEW.database}`,
    origin: localReviewOrigin(),
    username: LOCAL_REVIEW.roles.reviewer,
    password: LOCAL_REVIEW.passwords.reviewer,
    environmentFile: '.build/local-review/runtime.env',
    next: 'npm run local-review:start'
  }, null, 2)}\n`);
} catch (error) {
  // A failed setup never leaves a partially provisioned disposable database behind.
  if (createdContainer) {
    const container = inspectContainer();
    if (container) {
      assertDisposableContainer(container);
      docker(['rm', '--force', '--volumes', LOCAL_REVIEW.container]);
    }
  }
  throw error;
}

/** Confirms the command is running from the expected Tabular checkout. */
function assertProjectRoot() {
  const packageFile = path.join(projectRoot, 'package.json');
  const packageName = String(
    JSON.parse(requireFile(packageFile)).name || ''
  );
  if (packageName !== '@trustless/tabular') {
    throw new Error('Local review setup must run from the @trustless/tabular project root');
  }
}

/** Starts PostgreSQL with loopback publishing and an ephemeral tmpfs data directory. */
function startPostgreSql18() {
  docker([
    'run',
    '--detach',
    '--name', LOCAL_REVIEW.container,
    '--label', `${LOCAL_REVIEW.containerLabel}=${LOCAL_REVIEW.guard}`,
    '--publish', `${LOCAL_REVIEW.host}:${LOCAL_REVIEW.databasePort}:5432`,
    '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=1073741824',
    '--env', `POSTGRES_PASSWORD=${LOCAL_REVIEW.passwords.administrator}`,
    '--env', 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',
    LOCAL_REVIEW.image
  ]);
  assertDisposableContainer(inspectContainer());
}

/** Waits at most 30 seconds for the exact PostgreSQL 18 server to accept connections. */
async function waitForPostgreSql18() {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new Client({
      connectionString: databaseUrl('administrator'),
      application_name: 'tabular-local-review-setup',
      connectionTimeoutMillis: 1_000
    });
    try {
      await client.connect();
      const result = await client.query<{ version_number: string }>(
        "SELECT current_setting('server_version_num') AS version_number"
      );
      const version = Number(result.rows[0]?.version_number);
      if (version < 180000 || version >= 190000) {
        throw new Error(`PostgreSQL 18 is required; server reported ${version}`);
      }
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await pause(250);
    }
  }
  throw new Error(
    `PostgreSQL 18 did not become ready within 30 seconds: ${errorMessage(lastError)}`
  );
}

/** Creates distinct service authorities plus the safe human/member role relationship. */
async function provisionAuthorities() {
  const client = new Client({
    connectionString: databaseUrl('administrator'),
    application_name: 'tabular-local-review-provision'
  });
  await client.connect();
  try {
    await client.query(roleStatement('member'));
    await client.query(roleStatement('migrator'));
    await client.query(roleStatement('web'));
    await client.query(roleStatement('worker'));
    await client.query(roleStatement('reviewer'));

    // Web and worker may assume the safe member role only through explicit SET ROLE.
    await client.query(
      `GRANT ${identifier(LOCAL_REVIEW.roles.member)} `
      + `TO ${identifier(LOCAL_REVIEW.roles.web)} WITH INHERIT FALSE, SET TRUE`
    );
    await client.query(
      `GRANT ${identifier(LOCAL_REVIEW.roles.member)} `
      + `TO ${identifier(LOCAL_REVIEW.roles.worker)} WITH INHERIT FALSE, SET TRUE`
    );

    // The DDL authority can install member-owned schemas; the reviewer has ordinary direct grants.
    await client.query(
      `GRANT ${identifier(LOCAL_REVIEW.roles.member)} `
      + `TO ${identifier(LOCAL_REVIEW.roles.migrator)} WITH INHERIT TRUE, SET TRUE`
    );
    await client.query(
      `GRANT ${identifier(LOCAL_REVIEW.roles.member)} `
      + `TO ${identifier(LOCAL_REVIEW.roles.reviewer)} WITH INHERIT TRUE, SET TRUE`
    );
    await client.query(
      `CREATE DATABASE ${identifier(LOCAL_REVIEW.database)} `
      + `OWNER ${identifier(LOCAL_REVIEW.roles.migrator)}`
    );
    await client.query(`REVOKE CONNECT ON DATABASE ${identifier(LOCAL_REVIEW.database)} FROM PUBLIC`);
    await client.query(
      `GRANT CONNECT ON DATABASE ${identifier(LOCAL_REVIEW.database)} TO `
      + [
        LOCAL_REVIEW.roles.migrator,
        LOCAL_REVIEW.roles.web,
        LOCAL_REVIEW.roles.worker,
        LOCAL_REVIEW.roles.member,
        LOCAL_REVIEW.roles.reviewer
      ].map(identifier).join(', ')
    );
  } finally {
    await client.end();
  }
}

/** Grants only the migrated control-schema privileges needed by web and worker. */
async function grantRuntimeAuthority() {
  const target = new Client({
    connectionString: databaseUrl('migrator'),
    application_name: 'tabular-local-review-grants'
  });
  await target.connect();
  try {
    await target.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    const runtimeRoles = [LOCAL_REVIEW.roles.web, LOCAL_REVIEW.roles.worker]
      .map(identifier).join(', ');
    await target.query(`GRANT USAGE ON SCHEMA tabular TO ${runtimeRoles}`);
    await target.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular TO ${runtimeRoles}`
    );
    await target.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular TO ${runtimeRoles}`
    );
    await target.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tabular TO ${runtimeRoles}`);
  } finally {
    await target.end();
  }
}

/** Proves the representative schemas, metadata, roles, and rows exist before handoff. */
async function verifySeededTarget() {
  const client = new Client({
    connectionString: databaseUrl('migrator'),
    application_name: 'tabular-local-review-verify'
  });
  await client.connect();
  try {
    const result = await client.query<{
      server_version_num: string;
      schemas: number;
      files: number;
      rows: number;
      reviewer_login: boolean;
      member_safe: boolean;
      member_connect: boolean;
      web_can_set_member: boolean;
    }>(`
      SELECT current_setting('server_version_num') AS server_version_num,
             (SELECT count(*)::integer FROM pg_namespace
               WHERE nspname IN ('operations', 'finance')) AS schemas,
             (SELECT count(*)::integer FROM tabular.file_metadata) AS files,
             ((SELECT count(*) FROM operations.customer_orders)
               + (SELECT count(*) FROM operations.fulfillment_queue)
               + (SELECT count(*) FROM finance.customers)
               + (SELECT count(*) FROM finance.invoices))::integer AS rows,
             (SELECT rolcanlogin FROM pg_roles
               WHERE rolname = $1) AS reviewer_login,
             (SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
                      AND NOT rolcanlogin AND NOT rolreplication AND NOT rolbypassrls
                FROM pg_roles WHERE rolname = $2) AS member_safe,
             has_database_privilege($2, current_database(), 'CONNECT') AS member_connect,
             pg_has_role($3, $2, 'SET') AS web_can_set_member
    `, [
      LOCAL_REVIEW.roles.reviewer,
      LOCAL_REVIEW.roles.member,
      LOCAL_REVIEW.roles.web
    ]);
    const row = result.rows[0];
    if (
      !row
      || Number(row.server_version_num) < 180000
      || Number(row.server_version_num) >= 190000
      || row.schemas !== 2
      || row.files < 4
      || row.rows < 10
      || !row.reviewer_login
      || !row.member_safe
      || !row.member_connect
      || !row.web_can_set_member
    ) {
      throw new Error('Disposable PostgreSQL target failed its seeded authority/data contract');
    }
  } finally {
    await client.end();
  }
}

/** Builds a safe PostgreSQL role statement from fixed identifiers and local-only passwords. */
function roleStatement(role: keyof typeof LOCAL_REVIEW.roles) {
  const name = LOCAL_REVIEW.roles[role];
  if (role === 'member') {
    return `CREATE ROLE ${identifier(name)} NOLOGIN NOSUPERUSER NOCREATEDB `
      + 'NOCREATEROLE NOREPLICATION NOBYPASSRLS';
  }
  if (role === 'administrator') throw new Error('The container administrator already exists');
  const password = LOCAL_REVIEW.passwords[role];
  return `CREATE ROLE ${identifier(name)} LOGIN PASSWORD ${literal(password)} `
    + 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
}

/** Quotes one fixed PostgreSQL identifier. */
function identifier(value: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error('Invalid local-review identifier');
  return `"${value}"`;
}

/** Quotes one fixed PostgreSQL string literal. */
function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Runs a foreground setup command and forwards its already-redacted output. */
async function runVisible(executable: string, args: string[], env = process.env) {
  const result = await runCommand(executable, args, env);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

/** Reads one required text file without adding another async setup boundary. */
function requireFile(file: string) {
  return fs.readFileSync(file, 'utf8');
}

/** Converts an unknown setup failure into one bounded diagnostic. */
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 400) : 'unknown PostgreSQL startup error';
}
