//node
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import pg from 'pg';

//client
import type { Migration } from '../migrations/index.js';
import { startWeb } from '../../../bootstrap/application.js';
import { findPostgreSqlObject } from '../helpers/repositories.js';
import { runMigrations } from '../helpers/migrator.js';
import { ManagedPostgresPool } from '../helpers/pool.js';
import { withPostgreSqlTransaction } from '../helpers/transactions.js';
import { loadMigrations } from '../migrations/index.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TEST_POSTGRES_URL;

/**
 * Assert the disposable target.
 */
function assertDisposableTarget(value: string | undefined): asserts value is string {
  assert.equal(
    process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
    'task00002-disposable',
    'TABULAR_TEST_POSTGRES_DISPOSABLE must explicitly authorize destructive test cleanup'
  );
  assert.ok(value, 'TABULAR_TEST_POSTGRES_URL is required');
  const target = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/tabular_task00002');
  assert.ok(target.port, 'Disposable PostgreSQL target must use an explicit loopback port');
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
}

/**
 * Return the error from result.
 */
function errorFrom(error: unknown, label: string) {
  return error instanceof Error ? error : new Error(label);
}

/**
 * Return the migration result.
 */
function migration(version: string, name: string, sql: string): Migration {
  return {
    version,
    name,
    sql,
    checksum: createHash('sha256').update(sql).digest('hex')
  };
}

/**
 * Return the transaction result.
 */
function transaction(pool: ManagedPostgresPool) {
  return <Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
    withPostgreSqlTransaction(pool, {
      settings: {
        statement_timeout: '5000',
        lock_timeout: '5000',
        idle_in_transaction_session_timeout: '5000'
      }
    }, callback);
}

/**
 * Return the barrier result.
 */
function barrier(parties: number) {
  let arrivals = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return async () => {
    arrivals += 1;
    if (arrivals === parties) release();
    await gate;
  };
}

test('PostgreSQL 18-labeled data-foundation integration', { timeout: 45_000 }, async () => {
  assertDisposableTarget(connectionString);
  const admin = new Pool({ connectionString, max: 2, allowExitOnIdle: true });
  const primary = new ManagedPostgresPool({
    name: 'task00002-primary',
    connectionString,
    maximum: 1,
    applicationName: 'tabular-task00002-primary'
  });
  const concurrent = new ManagedPostgresPool({
    name: 'task00002-concurrent',
    connectionString,
    maximum: 2,
    applicationName: 'tabular-task00002-concurrent'
  });
  let caller: ManagedPostgresPool | undefined;
  let primaryFailure: unknown;
  const cleanupFailures: Error[] = [];
  try {
    const version = await admin.query(`
      SELECT current_setting('server_version_num')::integer AS number,
             version() AS label
    `);
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);

    await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
    await admin.query('DROP ROLE IF EXISTS tabular_task_member');
    await admin.query('DROP ROLE IF EXISTS tabular_task_other');
    await admin.query('DROP ROLE IF EXISTS tabular_task_caller');
    await admin.query('CREATE ROLE tabular_task_member NOLOGIN');
    await admin.query('CREATE ROLE tabular_task_other NOLOGIN');
    await admin.query("CREATE ROLE tabular_task_caller LOGIN PASSWORD 'caller-task-00002'");

    const migrations = await loadMigrations();
    await admin.query('CREATE SCHEMA tabular AUTHORIZATION tabular_task_other');
    await assert.rejects(
      runMigrations(transaction(primary), migrations),
      /Refusing to adopt a tabular schema/
    );
    assert.equal(
      (await admin.query("SELECT to_regclass('tabular.schema_migrations') IS NULL AS absent"))
        .rows[0].absent,
      true
    );
    await admin.query('DROP SCHEMA tabular CASCADE');
    await admin.query(`
      CREATE SCHEMA tabular;
      CREATE TABLE tabular.schema_migrations (version text PRIMARY KEY);
    `);
    await assert.rejects(
      runMigrations(transaction(primary), migrations),
      /unexpected column set/
    );
    await admin.query('DROP SCHEMA tabular CASCADE');
    await admin.query(`
      CREATE SCHEMA tabular;
      CREATE TABLE tabular.schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL UNIQUE,
        checksum text NOT NULL CHECK (length(checksum) > 0),
        applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
        applied_by name NOT NULL DEFAULT current_user,
        server_version_num integer NOT NULL DEFAULT current_setting('server_version_num')::integer,
        CHECK (version = '0001')
      );
    `);
    await assert.rejects(
      runMigrations(transaction(primary), migrations),
      /constraint/
    );
    await admin.query('DROP SCHEMA tabular CASCADE');
    await admin.query(`
      CREATE SCHEMA tabular;
      CREATE TABLE tabular.schema_migrations (
        version text DEFAULT '0001' PRIMARY KEY,
        name text NOT NULL UNIQUE,
        checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
        applied_by name NOT NULL DEFAULT current_user,
        server_version_num integer NOT NULL DEFAULT current_setting('server_version_num')::integer
      );
    `);
    await assert.rejects(
      runMigrations(transaction(primary), migrations),
      /default for version/
    );
    await admin.query('DROP SCHEMA tabular CASCADE');
    await assert.rejects(
      startWeb({
        env: {
          NODE_ENV: 'test',
          TABULAR_DATABASE_CONNECTION_ID: 'task00002',
          TABULAR_WEB_DATABASE_URL: connectionString
        },
        projectRoot: process.cwd(),
        runtimeRoot: process.cwd(),
        host: '127.0.0.1',
        port: 0
      }),
      /tabular schema/
    );
    const concurrentRuns = await Promise.all([
      runMigrations(transaction(primary), migrations),
      runMigrations(transaction(concurrent), migrations)
    ]);
    assert.equal(concurrentRuns.flatMap((result) => result.applied).length, 11);
    assert.deepEqual(await runMigrations(transaction(primary), migrations), {
      applied: [],
      total: 11
    });
    const ledger = await admin.query('SELECT version, name, checksum FROM tabular.schema_migrations');
    assert.deepEqual(ledger.rows.map((row) => row.version), [
      '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'
    ]);
    assert.equal(ledger.rows[0].checksum, migrations[0].checksum);

    const broken = migration('0012', 'broken-ddl', `
      CREATE TABLE tabular.should_rollback (id bigint PRIMARY KEY);
      SELECT tabular.function_that_does_not_exist();
    `);
    await assert.rejects(
      runMigrations(transaction(primary), [...migrations, broken]),
      /function_that_does_not_exist/
    );
    const rollback = await admin.query(`
      SELECT to_regclass('tabular.should_rollback') IS NULL AS relation_absent,
             NOT EXISTS (
               SELECT 1 FROM tabular.schema_migrations WHERE version = '0012'
             ) AS version_absent
    `);
    assert.deepEqual(rollback.rows[0], { relation_absent: true, version_absent: true });

    const corrected = migration(
      '0012',
      'corrected-ddl',
      'CREATE TABLE tabular.corrected_migration (id bigint PRIMARY KEY)'
    );
    assert.deepEqual(
      await runMigrations(transaction(primary), [...migrations, corrected]),
      { applied: ['0012'], total: 12 }
    );
    await admin.query("UPDATE tabular.schema_migrations SET checksum = repeat('a', 64) WHERE version = '0012'");
    await assert.rejects(
      runMigrations(transaction(primary), [...migrations, corrected]),
      /differs from its applied record/
    );
    await admin.query('UPDATE tabular.schema_migrations SET checksum = $1 WHERE version = $2', [
      corrected.checksum,
      '0012'
    ]);
    await admin.query(`
      INSERT INTO tabular.schema_migrations (version, name, checksum)
      VALUES ('9999', 'future', repeat('b', 64))
    `);
    await assert.rejects(
      runMigrations(transaction(primary), [...migrations, corrected]),
      /ahead of this application/
    );
    await admin.query("DELETE FROM tabular.schema_migrations WHERE version = '9999'");

    const callerUrl = new URL(connectionString);
    callerUrl.username = 'tabular_task_caller';
    callerUrl.password = 'caller-task-00002';
    caller = new ManagedPostgresPool({
      name: 'task00002-caller',
      connectionString: callerUrl.toString(),
      maximum: 1,
      applicationName: 'tabular-task00002-caller'
    });
    await assert.rejects(
      withPostgreSqlTransaction(caller, {}, (database) =>
        database.execute('CREATE TABLE tabular.caller_must_not_create (id integer)')
      ),
      (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error
        && error.code === '42501')
    );

    await admin.query(`
      CREATE TABLE tabular.role_records (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        owner_role name NOT NULL,
        title text NOT NULL,
        version integer NOT NULL DEFAULT 1
      );
      ALTER TABLE tabular.role_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tabular.role_records FORCE ROW LEVEL SECURITY;
      CREATE POLICY task_owner ON tabular.role_records
        USING (owner_role = current_user)
        WITH CHECK (owner_role = current_user);
      GRANT USAGE ON SCHEMA tabular TO tabular_task_member, tabular_task_other;
      GRANT SELECT, UPDATE ON tabular.role_records TO tabular_task_member, tabular_task_other;
      INSERT INTO tabular.role_records (owner_role, title)
      VALUES ('tabular_task_member', 'Member'), ('tabular_task_other', 'Other');
    `);
    const roles = new Set(['tabular_task_member', 'tabular_task_other']);
    const memberRows = await withPostgreSqlTransaction(primary, {
      role: 'tabular_task_member',
      allowedRoles: roles
    }, (database) => database.execute<{ owner_role: string, }>(`
      SELECT owner_role FROM tabular.role_records ORDER BY id
    `));
    assert.deepEqual(memberRows.rows.map((row) => row.owner_role), ['tabular_task_member']);
    await assert.rejects(
      withPostgreSqlTransaction(primary, {
        role: 'postgres',
        allowedRoles: roles
      }, async () => undefined),
      /not allowlisted/
    );
    await assert.rejects(
      withPostgreSqlTransaction(primary, {}, async () => {
        throw new Error('forced callback failure');
      }),
      /forced callback failure/
    );
    await assert.rejects(
      withPostgreSqlTransaction(primary, {
        settings: { statement_timeout: '40' }
      }, (database) => database.execute('SELECT pg_sleep(0.2)')),
      (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error
        && error.code === '57014')
    );
    const cleanState = await withPostgreSqlTransaction(primary, {}, (database) =>
      database.execute<{
        current_user: string,
        session_user: string,
        statement_timeout: string,
        application_name: string,
      }>(`
        SELECT current_user, session_user,
               current_setting('statement_timeout') AS statement_timeout,
               current_setting('application_name') AS application_name
      `)
    );
    assert.equal(cleanState.rows[0].current_user, cleanState.rows[0].session_user);
    assert.equal(cleanState.rows[0].statement_timeout, '0');
    assert.equal(cleanState.rows[0].application_name, 'tabular-task00002-primary');

    const backendBefore = await withPostgreSqlTransaction(primary, {}, async (database) =>
      (await database.execute<{ pid: number, }>('SELECT pg_backend_pid() AS pid')).rows[0].pid
    );
    await assert.rejects(
      withPostgreSqlTransaction(primary, {}, async (database) => {
        await database.execute('SELECT pg_terminate_backend(pg_backend_pid())');
      })
    );
    const backendAfter = await withPostgreSqlTransaction(primary, {}, async (database) =>
      (await database.execute<{ pid: number, }>('SELECT pg_backend_pid() AS pid')).rows[0].pid
    );
    assert.notEqual(backendBefore, backendAfter);

    const synchronize = barrier(2);
    /**
     * Return the rename result.
     */
    const rename = async (title: string) => withPostgreSqlTransaction(
      concurrent,
      {},
      async (database) => {
        const current = await database.execute<{ id: string, version: number, }>(`
          SELECT id, version FROM tabular.role_records
          WHERE owner_role = 'tabular_task_member'
        `);
        await synchronize();
        const changed = await database.execute(`
          UPDATE tabular.role_records
          SET title = ?, version = version + 1
          WHERE id = ? AND version = ?
          RETURNING version
        `, [title, current.rows[0].id, current.rows[0].version]);
        return changed.affectedRows === 1 ? 'committed' : 'conflict';
      }
    );
    assert.deepEqual((await Promise.all([rename('First'), rename('Second')])).sort(), [
      'committed',
      'conflict'
    ]);

    await admin.query('CREATE TABLE tabular.external_source (id integer)');
    const identity = await withPostgreSqlTransaction(primary, {}, async (database) => {
      const object = await findPostgreSqlObject(database, 'task00002', {
        schema: 'tabular',
        name: 'external_source'
      });
      assert.ok(object);
      return object;
    });
    await admin.query('ALTER TABLE tabular.external_source RENAME TO renamed_source');
    const renamed = await withPostgreSqlTransaction(primary, {}, async (database) => {
      return findPostgreSqlObject(
        database,
        'task00002',
        { schema: 'tabular', name: 'renamed_source' }
      );
    });
    assert.equal(renamed?.oid, identity.oid);
    assert.deepEqual(renamed?.connectionScope, identity.connectionScope);
    await admin.query('DROP TABLE tabular.renamed_source');
    await admin.query('CREATE TABLE tabular.external_source (id integer)');
    const recreated = await withPostgreSqlTransaction(primary, {}, async (database) => {
      return findPostgreSqlObject(
        database,
        'task00002',
        { schema: 'tabular', name: 'external_source' }
      );
    });
    assert.notEqual(recreated?.oid, identity.oid);
    assert.notDeepEqual(
      { ...identity, connectionScope: { ...identity.connectionScope, connectionId: 'other' } },
      identity
    );
    await admin.query("DELETE FROM tabular.schema_migrations WHERE version = '0012'");
    await admin.query('DROP TABLE tabular.corrected_migration');

    const web = await startWeb({
      env: {
        NODE_ENV: 'test',
        TABULAR_DATABASE_CONNECTION_ID: 'task00002',
        TABULAR_WEB_DATABASE_URL: connectionString
      },
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd(),
      host: '127.0.0.1',
      port: 0
    });
    try {
      const readiness = await fetch(`${web.origin}/readyz`);
      assert.equal(readiness.status, 200);
      const body = await readiness.json() as {
        status: string,
        resources: { checks: { name: string, ready: boolean, }[], },
      };
      assert.equal(body.status, 'ready');
      assert.ok(body.resources.checks.some((check) =>
        check.name === 'postgres-web-pool' && check.ready
      ));
    } finally {
      await web.close();
    }

    assert.equal(primary.checkedOutCount, 0);
    assert.equal(concurrent.checkedOutCount, 0);
  } catch (error) {
    primaryFailure = error;
  } finally {
    /**
     * Return the cleanup result.
     */
    const cleanup = async (label: string, action: () => Promise<unknown> | undefined) => {
      try {
        await action();
      } catch (error) {
        cleanupFailures.push(new Error(label, { cause: error }));
      }
    };
    await cleanup('caller pool cleanup failed', () => caller?.close(2_000));
    await cleanup('primary pool cleanup failed', () => primary.close(2_000));
    await cleanup('concurrent pool cleanup failed', () => concurrent.close(2_000));
    await cleanup(
      'schema cleanup failed',
      () => admin.query('DROP SCHEMA IF EXISTS tabular CASCADE')
    );
    await cleanup(
      'member role cleanup failed',
      () => admin.query('DROP ROLE IF EXISTS tabular_task_member')
    );
    await cleanup(
      'other role cleanup failed',
      () => admin.query('DROP ROLE IF EXISTS tabular_task_other')
    );
    await cleanup(
      'caller role cleanup failed',
      () => admin.query('DROP ROLE IF EXISTS tabular_task_caller')
    );
    await cleanup('admin pool cleanup failed', () => admin.end());
  }
  if (primaryFailure && cleanupFailures.length === 0) throw primaryFailure;
  if (primaryFailure || cleanupFailures.length) {
    throw new AggregateError(
      [
        ...(primaryFailure ? [errorFrom(primaryFailure, 'PostgreSQL integration failed')] : []),
        ...cleanupFailures
      ],
      'PostgreSQL integration or cleanup failed',
      { cause: primaryFailure }
    );
  }
});
