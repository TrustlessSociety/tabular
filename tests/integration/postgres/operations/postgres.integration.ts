//node
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import pg from 'pg';

//client
import { createApplication } from '../../../../src/bootstrap/application.js';
import { ApplicationError } from '../../../../src/bootstrap/errors.js';
import { reconcileCatalog } from '../../../../src/plugins/catalog/helpers/reconciliation.js';
import { runMigrations } from '../../../../src/plugins/database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../../../src/plugins/database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../../../src/plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../../src/plugins/database/migrations/index.js';
import { TestIdentityProvider } from '../../../plugins/identity/provider-double.js';
import { operationHandler } from '../../../../src/plugins/operations/helpers/handlers.js';
import { OperationsRepository } from '../../../../src/plugins/operations/helpers/repository.js';
import { OperationExecutionError, OperationWorker } from '../../../../src/plugins/operations/helpers/worker.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TEST_POSTGRES_URL;
const identityId = `id_${'i'.repeat(32)}`;
const sessionId = `sess_${'s'.repeat(32)}`;
const historyScopeId = `hist_${'h'.repeat(32)}`;

/**
 * Assert the disposable target.
 */
function assertDisposableTarget(value: string | undefined): asserts value is string {
  assert.equal(
    process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
    'task00012-disposable',
    'TABULAR_TEST_POSTGRES_DISPOSABLE must explicitly authorize destructive test cleanup'
  );
  assert.ok(value, 'TABULAR_TEST_POSTGRES_URL is required');
  const target = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/tabular_task00012');
  assert.ok(target.port);
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
}

test('PostgreSQL 18 durable workers claim, fence, retry, link results, and isolate authority', {
  timeout: 120_000
}, async () => {
  assertDisposableTarget(connectionString);
  const password = `p_${randomBytes(12).toString('hex')}`;
  const admin = new Pool({ connectionString, max: 6, allowExitOnIdle: true });
  const workerUrl = roleUrl(connectionString, 'tabular_task12_worker', password);
  const migratorUrl = roleUrl(connectionString, 'tabular_task12_migrator', password);
  const webUrl = roleUrl(connectionString, 'tabular_task12_web', password);
  const migrationPool = new ManagedPostgresPool({
    name: 'task00012-migrator', connectionString: migratorUrl, maximum: 2,
    applicationName: 'tabular-task00012-migrator'
  });
  const workerPool = new ManagedPostgresPool({
    name: 'task00012-worker-direct', connectionString: workerUrl, maximum: 4,
    applicationName: 'tabular-task00012-worker-direct'
  });
  const migratorPool = new ManagedPostgresPool({
    name: 'task00012-migrator-direct', connectionString: migratorUrl, maximum: 2,
    applicationName: 'tabular-task00012-migrator-direct'
  });
  let application: Awaited<ReturnType<typeof createApplication>> | undefined;
  let applicationTwo: Awaited<ReturnType<typeof createApplication>> | undefined;
  let migratorApplication: Awaited<ReturnType<typeof createApplication>> | undefined;
  let web: Awaited<ReturnType<typeof createApplication>> | undefined;
  let releaseGraceful: (() => void) | undefined;
  try {
    const version = await admin.query(
      `SELECT current_setting('server_version_num')::integer AS number`
    );
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);
    await reset(admin);
    await admin.query(`
      CREATE ROLE tabular_task12_web LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task12_worker LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task12_migrator LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task12_operator NOLOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task12_member NOLOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT CONNECT, CREATE ON DATABASE tabular_task00012 TO tabular_task12_migrator;
      GRANT CONNECT ON DATABASE tabular_task00012 TO tabular_task12_web, tabular_task12_worker;
      GRANT tabular_task12_operator, tabular_task12_member
        TO tabular_task12_web, tabular_task12_worker
        WITH INHERIT FALSE, SET TRUE;
    `);
    assert.deepEqual(
      await runMigrations(transaction(migrationPool), await loadMigrations()),
      {
      applied: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012'],
      total: 12
      }
    );
    await admin.query(`
      GRANT USAGE ON SCHEMA tabular TO tabular_task12_web,
        tabular_task12_worker, tabular_task12_migrator;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular
        TO tabular_task12_web, tabular_task12_worker, tabular_task12_migrator;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular
        TO tabular_task12_web, tabular_task12_worker, tabular_task12_migrator;
      CREATE SCHEMA workspace;
      CREATE TABLE workspace.result_file (id bigint PRIMARY KEY);
      GRANT USAGE ON SCHEMA workspace TO tabular_task12_operator;
      GRANT SELECT ON workspace.result_file TO tabular_task12_operator;
      INSERT INTO tabular.identities (id, provider, issuer, provider_subject)
      VALUES ('${identityId}', 'test', 'https://issuer.invalid', 'task12-user');
    `);
    const snapshot = await transaction(migrationPool)((database) =>
      reconcileCatalog(database, 'task00012'));
    const workspaceSchema = [...snapshot.schemas.values()].find((schema) =>
      schema.name === 'workspace');
    assert.ok(workspaceSchema);
    const resultFile = [...snapshot.objects.values()].find((object) =>
      object.schemaId === workspaceSchema.stableId
      && object.name === 'result_file');
    assert.ok(resultFile);

    const env = {
      NODE_ENV: 'test',
      TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
      TABULAR_DATABASE_CONNECTION_ID: 'task00012',
      TABULAR_WEB_DATABASE_URL: webUrl,
      TABULAR_WORKER_DATABASE_URL: workerUrl,
      TABULAR_MIGRATOR_DATABASE_URL: migratorUrl,
      TABULAR_WORKER_LEASE_SECONDS: '2',
      TABULAR_WORKER_CONCURRENCY: '2',
      TABULAR_WORKER_SHUTDOWN_TIMEOUT_MS: '150'
    };
    application = await createApplication({
      processKind: 'worker', env, projectRoot: process.cwd(), runtimeRoot: process.cwd()
    });
    applicationTwo = await createApplication({
      processKind: 'worker', env, projectRoot: process.cwd(), runtimeRoot: process.cwd()
    });
    web = await createApplication({
      processKind: 'web', env, projectRoot: process.cwd(), runtimeRoot: process.cwd()
    });
    migratorApplication = await createApplication({
      processKind: 'migrator', env, projectRoot: process.cwd(), runtimeRoot: process.cwd()
    });
    assert.throws(() => application!.database.openPool('migrator'), /cannot open/);
    const provider = new TestIdentityProvider();
    const operatorSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task12-operator',
      displayName: 'Operations operator'
    });
    const memberSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task12-member',
      displayName: 'Operations member'
    });
    await web.identity.provisionIdentityRole(operatorSubject, 'tabular_task12_operator');
    await web.identity.provisionIdentityRole(memberSubject, 'tabular_task12_member');
    const operatorSession = await web.identity.establishBrowserSession(operatorSubject);
    const memberSession = await web.identity.establishBrowserSession(memberSubject);
    const operator = await web.identity.requireBrowserMutation({
      cookieToken: operatorSession.cookieToken,
      csrfToken: operatorSession.csrfToken,
      origin: 'https://tabular.test'
    });
    const member = await web.identity.requireBrowserMutation({
      cookieToken: memberSession.cookieToken,
      csrfToken: memberSession.csrfToken,
      origin: 'https://tabular.test'
    });
    const mappedControlAccess = await admin.query(`
      SELECT has_schema_privilege('tabular_task12_operator', 'tabular', 'USAGE') AS operator,
             has_schema_privilege('tabular_task12_member', 'tabular', 'USAGE') AS member
    `);
    assert.deepEqual(mappedControlAccess.rows[0], { operator: false, member: false });
    await admin.query(`
      UPDATE tabular.allowed_roles
         SET can_manage_operations_retention = true
       WHERE role_name = 'tabular_task12_operator'
    `);
    const gracefulGate = new Promise<void>((resolve) => { releaseGraceful = resolve; });
    let releaseContention: (() => void) | undefined;
    const contentionGate = new Promise<void>((resolve) => { releaseContention = resolve; });
    application.operations.handlers
      .register(operationHandler('import.commit', 'worker', async (context) => {
        assert.equal(await context.markIrreversible(), true);
        return {
          importId: context.job.payload.importId,
          state: 'committed',
          fileId: resultFile.stableId,
          rowsCommitted: 1,
          columnsCommitted: 1,
          warnings: 0
        };
      }))
      .register(operationHandler('maintenance.import-staging', 'worker', async (context) => {
        if (context.job.payload.limit === 13) {
          throw new OperationExecutionError('operation_failed', true);
        }
        if (context.job.payload.limit === 14) {
          throw new OperationExecutionError('operation_failed', false);
        }
        if (context.job.payload.limit === 15) {
          await gracefulGate;
        }
        if ([16, 17].includes(context.job.payload.limit)) {
          await new Promise<void>((_resolve, reject) => {
            if (context.signal.aborted) {
              reject(new OperationExecutionError('operation_failed', true));
              return;
            }
            context.signal.addEventListener('abort', () => reject(
              new OperationExecutionError('operation_failed', true)
            ), { once: true });
          });
        }
        if (context.job.payload.limit === 18) await contentionGate;
        if (context.job.payload.limit === 20) {
          await new Promise<void>((_resolve, reject) => {
            if (context.signal.aborted) {
              reject(new OperationExecutionError('operation_failed', true));
              return;
            }
            context.signal.addEventListener('abort', () => reject(
              new OperationExecutionError('operation_failed', true)
            ), { once: true });
          });
        }
        return { operationsDeleted: 0 };
      }))
      .register(operationHandler('operations.retention', 'worker', async (context) => {
        if (!await context.markIrreversible()) {
          throw new OperationExecutionError('operation_failed', false);
        }
        const result = await application!.operations.applyRetentionJob('worker', context.job);
        return { ...result, retentionDays: context.job.payload.retentionDays };
      }));
    applicationTwo.operations.handlers.register(operationHandler(
      'maintenance.import-staging',
      'worker',
      async (context) => {
        if (context.job.payload.limit === 18) await contentionGate;
        return { operationsDeleted: 0 };
      }
    ));
    const runner = new OperationWorker(application.operations, 'worker', 'worker:task12');

    const ownedLinked = await web.operations.enqueue(operator, {
      kind: 'import.commit', authority: 'worker', fileId: resultFile.stableId,
      idempotencyKey: 'operator-owned-linked-result',
      payload: { importId: `imp_${'o'.repeat(32)}` }, maxAttempts: 2
    });
    assert.equal(await runner.runOnce(ownedLinked.job.id), true);
    assert.equal(
      (await web.operations.get(operatorSession.principal, ownedLinked.job.id))?.resultLink?.href,
      '/pages/table.html?folder=workspace&table=result_file'
    );

    const linkedJob = await enqueue(migrationPool, {
      seed: 'a', kind: 'import.commit', authority: 'worker',
      payload: { importId: `imp_${'m'.repeat(32)}` }
    });
    const cursorBeforeReplay = await transaction(migrationPool)((database) =>
      new OperationsRepository(database).currentCursor('task00012'));
    const replay = await transaction(migrationPool)((database) =>
      new OperationsRepository(database).enqueue(jobInput({
        seed: 'z', idempotencySeed: 'a', kind: 'import.commit', authority: 'worker',
        payload: { importId: `imp_${'m'.repeat(32)}` }
      })));
    assert.equal(replay.replayed, true);
    assert.equal(await transaction(migrationPool)((database) =>
      new OperationsRepository(database).currentCursor('task00012')), cursorBeforeReplay);
    assert.equal(await runner.runOnce(linkedJob), true);
    assert.deepEqual((await admin.query(`
      SELECT state, attempts, file_id, irreversible_at IS NOT NULL AS irreversible
        FROM tabular.operation_jobs WHERE id = $1
    `, [linkedJob])).rows[0], {
      state: 'succeeded', attempts: 1, file_id: resultFile.stableId, irreversible: true
    });

    const operatorQueued = await web.operations.enqueue(operator, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'operator-queued', payload: { limit: 10 }, maxAttempts: 2
    });
    const memberQueued = await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-queued', payload: { limit: 10 }, maxAttempts: 2
    });
    assert.deepEqual(
      (await web.operations.list(operatorSession.principal)).items.map((item) => item.id),
      [operatorQueued.job.id, ownedLinked.job.id]
    );
    assert.deepEqual(
      (await web.operations.list(memberSession.principal)).items.map((item) => item.id),
      [memberQueued.job.id]
    );
    assert.equal(await web.operations.get(operatorSession.principal, memberQueued.job.id), undefined);
    assert.equal(await web.operations.cancel(operator, memberQueued.job.id), undefined);
    const operatorEvents = await web.operations.readEvents(operatorSession.principal, 0, 100);
    assert.ok(operatorEvents.events.some((event) => event.jobId === operatorQueued.job.id));
    assert.equal(operatorEvents.events.some((event) => event.jobId === memberQueued.job.id), false);
    assert.equal((await web.operations.cancel(operator, operatorQueued.job.id))?.state, 'cancelled');
    assert.equal((await web.operations.cancel(member, memberQueued.job.id))?.state, 'cancelled');

    const cooperative = await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-cooperative-cancel', payload: { limit: 16 }, maxAttempts: 2
    });
    const cooperativeRun = runner.runOnce(cooperative.job.id);
    await waitForState(admin, cooperative.job.id, 'running');
    assert.equal((await web.operations.cancel(member, cooperative.job.id))?.state, 'running');
    assert.equal(await cooperativeRun, true);
    assert.equal((await admin.query(
      `SELECT state FROM tabular.operation_jobs WHERE id = $1`, [cooperative.job.id]
    )).rows[0].state, 'cancelled');

    const irreversible = await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-irreversible', payload: { limit: 10 }, maxAttempts: 2
    });
    const irreversibleClaim = await transaction(workerPool)((database) =>
      new OperationsRepository(database).claim({
        authority: 'worker', leaseOwner: 'worker:irreversible',
        leaseToken: '6'.repeat(43), leaseTokenDigest: '6'.repeat(64),
        leaseSeconds: 30, jobId: irreversible.job.id
      }));
    assert.ok(irreversibleClaim);
    assert.equal(await application.operations.markIrreversible(
      'worker', irreversible.job.id, 'worker:irreversible', '6'.repeat(43)
    ), true);
    await assert.rejects(
      web.operations.cancel(member, irreversible.job.id),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'operation_conflict'
    );
    assert.ok(await application.operations.finish(
      'worker', irreversible.job.id, 'worker:irreversible', '6'.repeat(43),
      {
        state: 'succeeded', progress: 100,
        result: { operationsDeleted: 0 },
        diagnostics: { reason: 'completed', attempt: 1, workerAuthority: 'worker' }
      }
    ));

    const contendedJob = await enqueue(migrationPool, {
      seed: 'b', kind: 'maintenance.import-staging', authority: 'worker', payload: { limit: 10 }
    });
    const contenders = await Promise.all([
      transaction(workerPool)((database) => new OperationsRepository(database).claim({
        authority: 'worker', leaseOwner: 'worker:one', leaseToken: '1'.repeat(43),
        leaseTokenDigest: '1'.repeat(64), leaseSeconds: 30, jobId: contendedJob
      })),
      transaction(workerPool)((database) => new OperationsRepository(database).claim({
        authority: 'worker', leaseOwner: 'worker:two', leaseToken: '2'.repeat(43),
        leaseTokenDigest: '2'.repeat(64), leaseSeconds: 30, jobId: contendedJob
      }))
    ]);
    assert.equal(contenders.filter(Boolean).length, 1);
    await admin.query(`
      UPDATE tabular.operation_jobs SET lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1
    `, [contendedJob]);
    const reclaimed = await transaction(workerPool)((database) =>
      new OperationsRepository(database).claim({
        authority: 'worker', leaseOwner: 'worker:reclaimer', leaseToken: '3'.repeat(43),
        leaseTokenDigest: '3'.repeat(64), leaseSeconds: 30, jobId: contendedJob
      }));
    assert.equal(Number(reclaimed?.attempts), 2);
    assert.equal((await admin.query(`
      SELECT outcome FROM tabular.operation_attempts
       WHERE job_id = $1 AND attempt_number = 1
    `, [contendedJob])).rows[0].outcome, 'lease-expired');
    assert.equal(await transaction(workerPool)((database) =>
      new OperationsRepository(database).heartbeat({
        jobId: contendedJob, leaseOwner: 'worker:one', leaseToken: '1'.repeat(43),
        leaseSeconds: 30, progress: 50
      })), false);

    const runtimeContendedJob = (await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-runtime-two-instance-contention',
      payload: { limit: 18 }, maxAttempts: 2
    })).job.id;
    const instanceOneRunner = new OperationWorker(
      application.operations,
      'worker',
      'worker:runtime-instance-one'
    );
    const instanceTwoRunner = new OperationWorker(
      applicationTwo.operations,
      'worker',
      'worker:runtime-instance-two'
    );
    const contendedRuns = [
      instanceOneRunner.runOnce(runtimeContendedJob),
      instanceTwoRunner.runOnce(runtimeContendedJob)
    ];
    await waitForState(admin, runtimeContendedJob, 'running');
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count
        FROM tabular.operation_attempts
       WHERE job_id = $1 AND finished_at IS NULL
    `, [runtimeContendedJob])).rows[0].count, 1);
    if (!releaseContention) throw new Error('Runtime contention gate was not initialized');
    releaseContention();
    assert.deepEqual((await Promise.all(contendedRuns)).sort(), [false, true]);
    await waitForState(admin, runtimeContendedJob, 'succeeded');

    const runtimeRecoveryJob = (await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-runtime-cross-instance-recovery',
      payload: { limit: 20 }, maxAttempts: 2
    })).job.id;
    const abandoningRuntimeWorker = new OperationWorker(
      application.operations,
      'worker',
      'worker:runtime-abandon'
    );
    const abandonedRuntimeRun = abandoningRuntimeWorker.runOnce(runtimeRecoveryJob);
    await waitForState(admin, runtimeRecoveryJob, 'running');
    await abandoningRuntimeWorker.stop();
    await abandonedRuntimeRun;
    await waitForLeaseExpiry(admin, runtimeRecoveryJob);
    assert.equal(await instanceTwoRunner.runOnce(runtimeRecoveryJob), true);
    assert.deepEqual((await admin.query(`
      SELECT state, attempts FROM tabular.operation_jobs WHERE id = $1
    `, [runtimeRecoveryJob])).rows[0], { state: 'succeeded', attempts: 2 });
    assert.equal((await admin.query(`
      SELECT outcome FROM tabular.operation_attempts
       WHERE job_id = $1 AND attempt_number = 1
    `, [runtimeRecoveryJob])).rows[0].outcome, 'lease-expired');

    const retryJob = (await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-retry-dead-letter',
      payload: { limit: 13 }, maxAttempts: 2
    })).job.id;
    assert.equal(await runner.runOnce(retryJob), true);
    const retrying = (await admin.query(`
      SELECT state, attempts,
             extract(epoch FROM (available_at - updated_at)) * 1000 AS delay_ms
        FROM tabular.operation_jobs WHERE id = $1
    `, [retryJob])).rows[0];
    assert.equal(retrying.state, 'retrying');
    assert.equal(retrying.attempts, 1);
    assert.ok(Number(retrying.delay_ms) >= 900 && Number(retrying.delay_ms) <= 1100);
    await admin.query(`UPDATE tabular.operation_jobs SET available_at = clock_timestamp() WHERE id = $1`, [retryJob]);
    assert.equal(await runner.runOnce(retryJob), true);
    assert.deepEqual((await admin.query(`
      SELECT state, attempts FROM tabular.operation_jobs WHERE id = $1
    `, [retryJob])).rows[0], { state: 'dead-letter', attempts: 2 });
    const acknowledged = await web.operations.acknowledge(member, retryJob);
    assert.equal(acknowledged?.unread, false);
    assert.ok(acknowledged?.readAt);
    await admin.query(`
      UPDATE tabular.operation_jobs SET attempts = 20, max_attempts = 20 WHERE id = $1
    `, [retryJob]);
    assert.equal((await web.operations.get(memberSession.principal, retryJob))?.retryable, false);
    await assert.rejects(
      web.operations.retry(member, retryJob),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'operation_conflict'
    );

    const failedJob = await enqueue(migrationPool, {
      seed: 'd', kind: 'maintenance.import-staging', authority: 'worker',
      payload: { limit: 14 }, maxAttempts: 3
    });
    assert.equal(await runner.runOnce(failedJob), true);
    assert.equal((await admin.query(`SELECT state FROM tabular.operation_jobs WHERE id = $1`, [failedJob])).rows[0].state, 'failed');

    const gracefulJob = (await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-graceful-shutdown',
      payload: { limit: 15 }, maxAttempts: 2
    })).job.id;
    const gracefulWorker = new OperationWorker(
      application.operations,
      'worker',
      'worker:graceful'
    ).start();
    await waitForState(admin, gracefulJob, 'running');
    const gracefulStop = gracefulWorker.stop();
    const queuedDuringDrain = (await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-queued-during-drain',
      payload: { limit: 10 }, maxAttempts: 2
    })).job.id;
    await delay(25);
    assert.equal((await admin.query(
      `SELECT state FROM tabular.operation_jobs WHERE id = $1`, [gracefulJob]
    )).rows[0].state, 'running');
    if (!releaseGraceful) throw new Error('Graceful worker gate was not initialized');
    releaseGraceful();
    await gracefulStop;
    assert.equal((await admin.query(
      `SELECT state FROM tabular.operation_jobs WHERE id = $1`, [gracefulJob]
    )).rows[0].state, 'succeeded');
    assert.equal((await admin.query(
      `SELECT state FROM tabular.operation_jobs WHERE id = $1`, [queuedDuringDrain]
    )).rows[0].state, 'queued');
    assert.equal(await runner.runOnce(queuedDuringDrain), true);

    const abandonedJob = (await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-shutdown-abandon',
      payload: { limit: 17 }, maxAttempts: 1
    })).job.id;
    const abandoningWorker = new OperationWorker(
      application.operations,
      'worker',
      'worker:abandon'
    ).start();
    await waitForState(admin, abandonedJob, 'running');
    await abandoningWorker.stop();
    await delay(100);
    const stoppedLease = (await admin.query(`
      SELECT state, heartbeat_at, lease_expires_at
        FROM tabular.operation_jobs WHERE id = $1
    `, [abandonedJob])).rows[0];
    assert.equal(stoppedLease.state, 'running');
    await delay(400);
    assert.deepEqual((await admin.query(`
      SELECT heartbeat_at, lease_expires_at
        FROM tabular.operation_jobs WHERE id = $1
    `, [abandonedJob])).rows[0], {
      heartbeat_at: stoppedLease.heartbeat_at,
      lease_expires_at: stoppedLease.lease_expires_at
    });
    await waitForLeaseExpiry(admin, abandonedJob);
    await application.operations.recoverExpired('worker');
    assert.equal((await admin.query(
      `SELECT state FROM tabular.operation_jobs WHERE id = $1`, [abandonedJob]
    )).rows[0].state, 'dead-letter');

    const ddlJob = await enqueue(migrationPool, {
      seed: 'e', kind: 'ddl.apply', authority: 'migrator',
      payload: { requestId: `ddl_${'q'.repeat(32)}` }
    });
    assert.equal(await transaction(workerPool)((database) =>
      new OperationsRepository(database).claim({
        authority: 'worker', leaseOwner: 'worker:wrong', leaseToken: '4'.repeat(43),
        leaseTokenDigest: '4'.repeat(64), leaseSeconds: 30, jobId: ddlJob
      })), undefined);
    migratorApplication.operations.handlers.register(operationHandler(
      'ddl.apply',
      'migrator',
      async (context) => {
        assert.equal(await context.markIrreversible(), true);
        return {
          requestId: context.job.payload.requestId,
          actionType: 'create-file',
          state: 'applied'
        };
      }
    ));
    const migratorConsumer = new OperationWorker(
      migratorApplication.operations,
      'migrator',
      'migrator:continuous'
    ).start();
    await waitForState(admin, ddlJob, 'succeeded');
    await migratorConsumer.stop();

    await assert.rejects(
      web.operations.retention(member, { retentionDays: 30, limit: 20 }),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'operations_retention_denied'
    );
    const oldRetainedJob = (await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-old-retained',
      payload: { limit: 10 }, maxAttempts: 2
    })).job.id;
    assert.equal(await runner.runOnce(oldRetainedJob), true);
    const activeRetainedJob = (await web.operations.enqueue(member, {
      kind: 'maintenance.import-staging', authority: 'worker',
      idempotencyKey: 'member-active-retained',
      payload: { limit: 10 }, maxAttempts: 2
    })).job.id;
    assert.ok(await transaction(workerPool)((database) =>
      new OperationsRepository(database).claim({
        authority: 'worker', leaseOwner: 'worker:retention-active',
        leaseToken: '7'.repeat(43), leaseTokenDigest: '7'.repeat(64),
        leaseSeconds: 30, jobId: activeRetainedJob
      })));
    await admin.query(`
      UPDATE tabular.operation_jobs
         SET created_at = clock_timestamp() - interval '41 days',
             finished_at = clock_timestamp() - interval '40 days',
             retained_until = clock_timestamp() - interval '1 day'
       WHERE id = $1
    `, [oldRetainedJob]);
    await admin.query(`
      UPDATE tabular.operation_jobs
         SET created_at = clock_timestamp() - interval '41 days',
             retained_until = clock_timestamp() - interval '1 day'
       WHERE id = $1
    `, [activeRetainedJob]);
    const beforeRetention = (await admin.query(`
      SELECT sequence FROM tabular.outbox_events
       WHERE connection_id = 'task00012' ORDER BY sequence
    `)).rows.map((row) => Number(row.sequence));
    assert.ok(beforeRetention.length >= 6);
    const prefixEnd = beforeRetention[2] as number;
    const laterOldCursor = beforeRetention[4] as number;
    await admin.query(`
      UPDATE tabular.outbox_events
         SET created_at = clock_timestamp() - interval '40 days'
       WHERE connection_id = 'task00012'
         AND (sequence <= $1 OR sequence = $2)
    `, [prefixEnd, laterOldCursor]);
    const retentionJob = (await web.operations.retention(operator, {
      retentionDays: 30,
      limit: 20
    })).job.id;
    assert.equal(await runner.runOnce(retentionJob), true);
    const retentionActivity = await web.operations.get(
      operatorSession.principal,
      retentionJob
    );
    assert.equal(retentionActivity?.state, 'succeeded');
    assert.deepEqual(retentionActivity?.resultSummary, {
      jobsDeleted: 1,
      eventsDeleted: 3,
      cursorFloorsAdvanced: 1,
      retentionDays: 30
    });
    assert.equal((await admin.query(
      `SELECT count(*)::integer AS count FROM tabular.operation_jobs WHERE id = $1`,
      [oldRetainedJob]
    )).rows[0].count, 0);
    assert.equal((await admin.query(
      `SELECT state FROM tabular.operation_jobs WHERE id = $1`,
      [activeRetainedJob]
    )).rows[0].state, 'running');
    assert.deepEqual((await admin.query(`
      SELECT active_job_id, terminal_state
        FROM tabular.operation_idempotency
       WHERE original_job_id = $1
    `, [oldRetainedJob])).rows[0], {
      active_job_id: null,
      terminal_state: 'succeeded'
    });
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.outbox_events
       WHERE connection_id = 'task00012' AND sequence = $1
    `, [laterOldCursor])).rows[0].count, 1);
    assert.deepEqual(await web.operations.list(operatorSession.principal).then((result) => ({
      canManageRetention: result.canManageRetention,
      retentionDays: result.retentionDays
    })), { canManageRetention: true, retentionDays: 30 });
    assert.deepEqual(await web.operations.list(memberSession.principal).then((result) => ({
      canManageRetention: result.canManageRetention,
      retentionDays: result.retentionDays
    })), { canManageRetention: false, retentionDays: 30 });
    const retentionGap = await web.operations.readEvents(memberSession.principal, 0, 100);
    assert.equal(retentionGap.gap, true);
    assert.equal(retentionGap.retainedFrom, prefixEnd + 1);

    await admin.query(`
      UPDATE tabular.browser_sessions
         SET revoked_at = clock_timestamp(), revoke_reason = 'task12-auth-revoked'
       WHERE id = $1
    `, [memberSession.principal.sessionId]);
    await assert.rejects(
      web.operations.list(memberSession.principal),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'invalid_session'
    );

    const cursors = await admin.query(`
      SELECT sequence FROM tabular.outbox_events
       WHERE connection_id = 'task00012' ORDER BY sequence
    `);
    const stream = (await admin.query(`
      SELECT retained_from_cursor, next_cursor - 1 AS high_water
        FROM tabular.change_streams WHERE connection_id = 'task00012'
    `)).rows[0];
    assert.deepEqual(
      cursors.rows.map((row) => Number(row.sequence)),
      Array.from(
        { length: Number(stream.high_water) - Number(stream.retained_from_cursor) + 1 },
        (_, index) => Number(stream.retained_from_cursor) + index
      )
    );
  } finally {
    releaseGraceful?.();
    if (application) {
      await application.runtime.resources.close(5_000).catch(() => undefined);
    }
    if (applicationTwo) {
      await applicationTwo.runtime.resources.close(5_000).catch(() => undefined);
    }
    if (migratorApplication) {
      await migratorApplication.runtime.resources.close(5_000).catch(() => undefined);
    }
    if (web) await web.runtime.resources.close(5_000).catch(() => undefined);
    await Promise.allSettled([
      workerPool.close(2_000), migratorPool.close(2_000), migrationPool.close(2_000)
    ]);
    await reset(admin).catch(() => undefined);
    await admin.end();
  }
});

/**
 * Wait for the state.
 */
async function waitForState(admin: pg.Pool, jobId: string, state: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const current = (await admin.query(
      `SELECT state FROM tabular.operation_jobs WHERE id = $1`,
      [jobId]
    )).rows[0]?.state;
    if (current === state) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${jobId} to reach ${state}`);
}

/**
 * Wait for the lease expiry.
 */
async function waitForLeaseExpiry(admin: pg.Pool, jobId: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const expired = (await admin.query(`
      SELECT lease_expires_at <= clock_timestamp() AS expired
        FROM tabular.operation_jobs WHERE id = $1
    `, [jobId])).rows[0]?.expired;
    if (expired) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${jobId} lease expiry`);
}

/**
 * Return the delay result.
 */
function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Return the job input result.
 */
function jobInput(input: {
  seed: string,
  idempotencySeed?: string,
  kind: 'import.commit' | 'maintenance.import-staging' | 'ddl.apply',
  authority: 'worker' | 'migrator',
  payload: { importId: string, } | { limit: number, } | { requestId: string, },
  maxAttempts?: number,
}) {
  return {
    jobId: `job_${input.seed.repeat(32)}`,
    connectionId: 'task00012',
    actorIdentityId: identityId,
    sessionId,
    historyScopeId,
    kind: input.kind,
    authority: input.authority,
    idempotencyKey: (input.idempotencySeed || input.seed).repeat(64),
    requestDigest: digestSeed(input.idempotencySeed || input.seed).repeat(64),
    payload: input.payload,
    maxAttempts: input.maxAttempts || 3,
    retainedUntil: new Date(Date.now() + 31 * 86_400_000)
  };
}

/**
 * Return the enqueue result.
 */
async function enqueue(
  pool: ManagedPostgresPool,
  input: Parameters<typeof jobInput>[0]
) {
  const created = await transaction(pool)((database) =>
    new OperationsRepository(database).enqueue(jobInput(input)));
  assert.ok(created.job);
  return created.job.id;
}

/**
 * Return the digest seed result.
 */
function digestSeed(seed: string) {
  const code = seed.charCodeAt(0).toString(16).slice(-1);
  return /[a-f0-9]/.test(code) ? code : 'f';
}

/**
 * Return the transaction result.
 */
function transaction(pool: ManagedPostgresPool) {
  return <Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
    withPostgreSqlTransaction(pool, {
      settings: {
        statement_timeout: '10000',
        lock_timeout: '10000',
        idle_in_transaction_session_timeout: '10000'
      }
    }, callback);
}

/**
 * Return the role URL result.
 */
function roleUrl(base: string, role: string, password: string) {
  const url = new URL(base);
  url.username = role;
  url.password = password;
  return url.toString();
}

/**
 * Reset the current value.
 */
async function reset(admin: pg.Pool) {
  await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS workspace CASCADE');
  for (const role of [
    'tabular_task12_web', 'tabular_task12_worker', 'tabular_task12_migrator',
    'tabular_task12_operator', 'tabular_task12_member'
  ]) {
    await admin.query(`DROP OWNED BY ${role}`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
  }
}
