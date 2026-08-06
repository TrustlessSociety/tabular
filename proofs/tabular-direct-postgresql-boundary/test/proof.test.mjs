import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  applyMigration,
  claimJob,
  engineFor,
  enqueueIdempotent,
  failJob,
  readRecordsForRole,
  withRoleTransaction
} from '../src/boundary.mjs';

const { Pool } = pg;
const connectionString = process.env.PROOF_DATABASE_URL;

async function setup(pool) {
  await pool.query('DROP SCHEMA IF EXISTS proof CASCADE');
  await pool.query('DROP ROLE IF EXISTS tabular_member');
  await pool.query('DROP ROLE IF EXISTS tabular_other');
  await pool.query('CREATE ROLE tabular_member NOLOGIN');
  await pool.query('CREATE ROLE tabular_other NOLOGIN');
  await pool.query('CREATE SCHEMA proof');
  await pool.query(`
    CREATE TABLE proof.records (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      owner_role name NOT NULL,
      title text NOT NULL,
      version integer NOT NULL DEFAULT 1
    );
    ALTER TABLE proof.records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY record_owner ON proof.records
      USING (owner_role = current_user)
      WITH CHECK (owner_role = current_user);
    GRANT USAGE ON SCHEMA proof TO tabular_member, tabular_other;
    GRANT SELECT, UPDATE ON proof.records TO tabular_member, tabular_other;
    INSERT INTO proof.records (owner_role, title)
    VALUES ('tabular_member', 'Member row'), ('tabular_other', 'Other row');

    CREATE TABLE proof.jobs (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      idempotency_key text UNIQUE NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'done', 'dead')),
      attempts integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 3,
      available_at timestamptz NOT NULL DEFAULT now(),
      lease_expires_at timestamptz,
      worker text,
      last_error text
    );
  `);
}

function makeBarrier(parties) {
  let arrivals = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  return async () => {
    arrivals += 1;
    if (arrivals === parties) release();
    await gate;
  };
}

async function versionedRename(pool, title, barrier) {
  const client = await pool.connect();
  const engine = engineFor(client);
  try {
    const current = await engine.connection.raw({
      query: "SELECT id, version FROM proof.records WHERE owner_role = 'tabular_member'"
    });
    await barrier();
    const result = await engine.connection.raw({
      query: `
        UPDATE proof.records
        SET title = ?, version = version + 1
        WHERE id = ? AND version = ?
        RETURNING version
      `,
      values: [title, current.rows[0].id, current.rows[0].version]
    });
    return result.rowCount === 1 ? 'committed' : 'conflict';
  } finally {
    client.release();
  }
}

test('P-002 PostgreSQL 18 production-boundary signals', { timeout: 30_000 }, async () => {
  assert.ok(connectionString, 'PROOF_DATABASE_URL is required');
  const pool = new Pool({ connectionString, max: 8 });
  const signals = {};

  try {
    await setup(pool);
    const version = await pool.query(`
      SELECT current_setting('server_version_num')::integer AS number,
             version() AS label
    `);
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);
    signals.postgresql18 = version.rows[0].label;

    const memberRows = await readRecordsForRole(pool, 'tabular_member');
    const otherRows = await readRecordsForRole(pool, 'tabular_other');
    assert.deepEqual(memberRows.map(row => row.owner_role), ['tabular_member']);
    assert.deepEqual(otherRows.map(row => row.owner_role), ['tabular_other']);
    const denied = await withRoleTransaction(pool, 'tabular_member', connection =>
      connection.raw({
        query: "UPDATE proof.records SET title = 'Denied' WHERE owner_role = 'tabular_other'"
      })
    );
    assert.equal(denied.rowCount, 0);
    signals.rlsIsolation = true;

    await assert.rejects(
      withRoleTransaction(pool, 'tabular_member', async () => {
        throw new Error('forced role transaction failure');
      }),
      /forced role transaction failure/
    );
    await assert.rejects(
      withRoleTransaction(
        pool,
        'tabular_member',
        connection => connection.raw({ query: 'SELECT pg_sleep(0.2)' }),
        { statementTimeout: '40ms' }
      ),
      error => error.code === '57014'
    );
    const recovered = await withRoleTransaction(
      pool,
      'tabular_member',
      connection => connection.raw({ query: 'SELECT current_user, current_setting(\'statement_timeout\') AS timeout' })
    );
    assert.equal(recovered.rows[0].current_user, 'tabular_member');
    assert.equal(recovered.rows[0].timeout, '5s');
    const poolState = await pool.query(`
      SELECT current_user, session_user, current_setting('statement_timeout') AS timeout
    `);
    assert.equal(poolState.rows[0].current_user, poolState.rows[0].session_user);
    assert.equal(poolState.rows[0].timeout, '0');
    signals.transactionCleanup = true;

    const migration = [
      'CREATE TABLE proof.migration_target (id bigint PRIMARY KEY)'
    ];
    const concurrentMigrations = await Promise.all([
      applyMigration(pool, '001', migration),
      applyMigration(pool, '001', migration)
    ]);
    assert.equal(concurrentMigrations.filter(result => result.applied).length, 1);
    await assert.rejects(
      applyMigration(pool, '002', [
        'ALTER TABLE proof.migration_target ADD COLUMN should_rollback text',
        'SELECT proof.function_that_does_not_exist()'
      ]),
      /function_that_does_not_exist/
    );
    const migrationState = await pool.query(`
      SELECT
        (SELECT count(*)::integer FROM proof.schema_migrations) AS versions,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'proof'
            AND table_name = 'migration_target'
            AND column_name = 'should_rollback'
        ) AS leaked_column
    `);
    assert.deepEqual(migrationState.rows[0], { versions: 1, leaked_column: false });
    signals.migrationLockAndRollback = true;

    const barrier = makeBarrier(2);
    const race = await Promise.all([
      versionedRename(pool, 'First contender', barrier),
      versionedRename(pool, 'Second contender', barrier)
    ]);
    assert.deepEqual(race.sort(), ['committed', 'conflict']);
    signals.expectedVersionRace = true;

    await pool.query('CREATE TABLE proof.external_source (id integer)');
    const firstIdentity = await pool.query("SELECT 'proof.external_source'::regclass::oid AS oid");
    await pool.query('ALTER TABLE proof.external_source RENAME TO renamed_source');
    const renamedIdentity = await pool.query("SELECT 'proof.renamed_source'::regclass::oid AS oid");
    assert.equal(firstIdentity.rows[0].oid, renamedIdentity.rows[0].oid);
    await pool.query('DROP TABLE proof.renamed_source');
    await pool.query('CREATE TABLE proof.external_source (id integer)');
    const recreatedIdentity = await pool.query("SELECT 'proof.external_source'::regclass::oid AS oid");
    assert.notEqual(firstIdentity.rows[0].oid, recreatedIdentity.rows[0].oid);
    signals.externalObjectIdentity = true;

    await pool.query(`
      INSERT INTO proof.jobs (idempotency_key)
      VALUES ('parallel-a'), ('parallel-b')
    `);
    const parallel = await Promise.all([
      claimJob(pool, 'worker-a'),
      claimJob(pool, 'worker-b')
    ]);
    assert.equal(new Set(parallel.map(job => job.id)).size, 2);

    await pool.query('TRUNCATE proof.jobs RESTART IDENTITY');
    await pool.query(`
      INSERT INTO proof.jobs (idempotency_key, max_attempts)
      VALUES ('retry-dead', 2)
    `);
    const firstAttempt = await claimJob(pool, 'worker-retry');
    const retried = await failJob(pool, firstAttempt.id, 'first failure');
    assert.equal(retried.status, 'pending');
    const secondAttempt = await claimJob(pool, 'worker-retry');
    const dead = await failJob(pool, secondAttempt.id, 'second failure');
    assert.equal(dead.status, 'dead');

    await pool.query(`
      INSERT INTO proof.jobs (
        idempotency_key, status, attempts, worker, lease_expires_at
      ) VALUES ('stale-lease', 'running', 1, 'lost-worker', now() - interval '1 minute')
    `);
    const reclaimed = await claimJob(pool, 'worker-reclaim');
    assert.equal(reclaimed.idempotency_key, 'stale-lease');
    assert.equal(reclaimed.worker, 'worker-reclaim');

    const idempotentIds = await Promise.all([
      enqueueIdempotent(pool, 'same-command', { source: 'web' }),
      enqueueIdempotent(pool, 'same-command', { source: 'mcp' })
    ]);
    assert.equal(idempotentIds[0], idempotentIds[1]);
    signals.durableJobClaims = true;

    const webAdapter = role => readRecordsForRole(pool, role);
    const mcpAdapter = role => readRecordsForRole(pool, role);
    const [webResult, mcpResult] = await Promise.all([
      webAdapter('tabular_member'),
      mcpAdapter('tabular_member')
    ]);
    assert.deepEqual(webResult, mcpResult);
    assert.notEqual(webAdapter, mcpAdapter);
    signals.transportParity = true;

    const results = {
      proof: 'P-002',
      passedAt: new Date().toISOString(),
      node: process.version,
      dependencies: {
        inquire: '0.10.8',
        inquirePg: '0.10.8',
        pg: '8.16.3'
      },
      signals
    };
    await writeFile(new URL('../results.json', import.meta.url), `${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await pool.end();
  }
});
