//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { runMigrations } from '../../../src/plugins/database/helpers/migrator.js';
import { createPGliteTestDatabase } from '../database/helpers/pglite.js';
import { loadMigrations } from '../../../src/plugins/database/migrations/index.js';
import { OperationsRepository } from '../../../src/plugins/operations/helpers/repository.js';
import { OperationsPluginService } from '../../../src/plugins/operations/helpers/service.js';

const identityId = `id_${'i'.repeat(32)}`;
const otherIdentityId = `id_${'o'.repeat(32)}`;
const sessionId = `sess_${'s'.repeat(32)}`;
const historyScopeId = `hist_${'h'.repeat(32)}`;

test('PGlite durable operations enforce idempotency, lease fencing, immutable attempts, and cursor continuity', async () => {
  const local = await createPGliteTestDatabase();
  try {
    await runMigrations(local.transaction, await loadMigrations(), { advisoryLock: false });
    await seedIdentities(local.database);
    const first = await local.transaction((database) => new OperationsRepository(database).enqueue({
      jobId: `job_${'a'.repeat(32)}`,
      connectionId: 'operations_test',
      actorIdentityId: identityId,
      sessionId,
      historyScopeId,
      kind: 'import.commit',
      authority: 'worker',
      idempotencyKey: '1'.repeat(64),
      requestDigest: '2'.repeat(64),
      payload: { importId: `imp_${'m'.repeat(32)}` },
      maxAttempts: 3,
      retainedUntil: future()
    }));
    assert.equal(first.replayed, false);
    const firstJob = first.job;
    assert.ok(firstJob);
    const replay = await local.transaction((database) => new OperationsRepository(database).enqueue({
      jobId: `job_${'b'.repeat(32)}`,
      connectionId: 'operations_test',
      actorIdentityId: identityId,
      sessionId,
      historyScopeId,
      kind: 'import.commit',
      authority: 'worker',
      idempotencyKey: '1'.repeat(64),
      requestDigest: '2'.repeat(64),
      payload: { importId: `imp_${'m'.repeat(32)}` },
      maxAttempts: 3,
      retainedUntil: future()
    }));
    assert.equal(replay.replayed, true);
    assert.equal(replay.job?.id, firstJob.id);

    const claimed = await local.transaction((database) =>
      new OperationsRepository(database).claim({
        authority: 'worker',
        leaseOwner: 'worker:one',
        leaseToken: 't'.repeat(43),
        leaseTokenDigest: '3'.repeat(64),
        leaseSeconds: 30
      }));
    assert.equal(claimed?.id, firstJob.id);
    assert.equal(await new OperationsRepository(local.database).heartbeat({
      jobId: firstJob.id,
      leaseOwner: 'worker:other',
      leaseToken: 't'.repeat(43),
      leaseSeconds: 30,
      progress: 50
    }), false);
    assert.equal(await new OperationsRepository(local.database).heartbeat({
      jobId: firstJob.id,
      leaseOwner: 'worker:one',
      leaseToken: 't'.repeat(43),
      leaseSeconds: 30
    }), true);
    assert.equal(await new OperationsRepository(local.database).heartbeat({
      jobId: firstJob.id,
      leaseOwner: 'worker:one',
      leaseToken: 't'.repeat(43),
      leaseSeconds: 30,
      progress: 50
    }), true);
    assert.equal(await local.transaction((database) =>
      new OperationsRepository(database).finish({
        jobId: firstJob.id,
        leaseOwner: 'worker:other',
        leaseToken: 't'.repeat(43),
        state: 'succeeded',
        progress: 100,
        diagnostics: {}
      })), undefined);
    const completed = await local.transaction((database) =>
      new OperationsRepository(database).finish({
        jobId: firstJob.id,
        leaseOwner: 'worker:one',
        leaseToken: 't'.repeat(43),
        state: 'succeeded',
        progress: 100,
        result: { rowsCommitted: 1 },
        diagnostics: {}
      }));
    assert.equal(completed?.state, 'succeeded');
    await assert.rejects(
      local.database.execute(`
        UPDATE tabular.operation_attempts SET diagnostics = '{}'::jsonb
         WHERE job_id = ? AND attempt_number = 1
      `, [firstJob.id]),
      /immutable/
    );
    const events = await new OperationsRepository(local.database).events(
      'operations_test',
      0,
      20
    );
    assert.deepEqual(events.map((event) => Number(event.sequence)), [1, 2, 3, 4]);
  } finally {
    await local.close();
  }
});

test('PGlite automatic retry gives each attempt a fresh irreversible boundary', async () => {
  const local = await createPGliteTestDatabase();
  try {
    await runMigrations(local.transaction, await loadMigrations(), { advisoryLock: false });
    await seedIdentities(local.database);
    const jobId = `job_${'r'.repeat(32)}`;
    await local.transaction((database) => new OperationsRepository(database).enqueue({
      jobId,
      connectionId: 'operations_test',
      actorIdentityId: identityId,
      sessionId,
      historyScopeId,
      kind: 'import.commit',
      authority: 'worker',
      idempotencyKey: '4'.repeat(64),
      requestDigest: '5'.repeat(64),
      payload: { importId: `imp_${'r'.repeat(32)}` },
      maxAttempts: 3,
      retainedUntil: future()
    }));
    const repository = new OperationsRepository(local.database);
    const first = await repository.claim({
      authority: 'worker',
      leaseOwner: 'worker:first',
      leaseToken: 'a'.repeat(43),
      leaseTokenDigest: '6'.repeat(64),
      leaseSeconds: 30,
      jobId
    });
    assert.equal(first?.attempts, 1);
    assert.equal(await repository.markIrreversible(jobId, 'worker:first', 'a'.repeat(43)), true);
    const retrying = await repository.finish({
      jobId,
      leaseOwner: 'worker:first',
      leaseToken: 'a'.repeat(43),
      state: 'retrying',
      progress: 0,
      availableAt: new Date(Date.now() - 1000),
      error: { code: 'operation_failed', retryable: true },
      diagnostics: { reason: 'retry-scheduled' }
    });
    assert.equal(retrying?.state, 'retrying');
    assert.equal(retrying?.irreversible_at, null);

    const second = await repository.claim({
      authority: 'worker',
      leaseOwner: 'worker:second',
      leaseToken: 'b'.repeat(43),
      leaseTokenDigest: '7'.repeat(64),
      leaseSeconds: 30,
      jobId
    });
    assert.equal(second?.attempts, 2);
    assert.equal(await repository.markIrreversible(jobId, 'worker:second', 'b'.repeat(43)), true);
    const succeeded = await repository.finish({
      jobId,
      leaseOwner: 'worker:second',
      leaseToken: 'b'.repeat(43),
      state: 'succeeded',
      progress: 100,
      result: { rowsCommitted: 1 },
      diagnostics: { reason: 'completed' }
    });
    assert.equal(succeeded?.state, 'succeeded');
    assert.ok(succeeded?.irreversible_at);
  } finally {
    await local.close();
  }
});

test('PGlite durable operations clear acknowledgement on retry and retain only the selected connection', async () => {
  const local = await createPGliteTestDatabase();
  try {
    await runMigrations(local.transaction, await loadMigrations(), { advisoryLock: false });
    await seedIdentities(local.database);
    const first = await createFailed(local, 'operations_test', identityId, 'c');
    const other = await createFailed(local, 'operations_other', otherIdentityId, 'd');
    assert.ok(await new OperationsRepository(local.database).acknowledge(first, identityId));
    const acknowledged = await new OperationsRepository(local.database)
      .byIdForIdentity(first, identityId);
    assert.ok(acknowledged?.read_at);
    assert.ok(new Date(acknowledged.read_at).getTime()
      >= new Date(acknowledged.updated_at).getTime());
    const retried = await new OperationsRepository(local.database).retry(first, 3);
    assert.equal(retried?.state, 'queued');
    assert.equal(retried?.acknowledged_at, null);
    assert.ok(new Date(acknowledged.read_at).getTime()
      < new Date(retried!.updated_at).getTime());

    await local.database.execute(`
      UPDATE tabular.operation_jobs
         SET state = 'failed', attempts = 20, max_attempts = 20,
             finished_at = clock_timestamp(),
             error_summary = jsonb_build_object(
               'code', 'operation_failed', 'message', 'safe', 'retryable', false
             )
       WHERE id = ?
    `, [first]);
    assert.equal(await new OperationsRepository(local.database).retry(first, 3), undefined);

    await local.database.execute(`
      UPDATE tabular.operation_jobs
         SET state = 'failed', finished_at = clock_timestamp() - interval '40 days',
             created_at = clock_timestamp() - interval '41 days',
             retained_until = clock_timestamp() - interval '1 day',
             error_summary = jsonb_build_object(
               'code', 'operation_failed', 'message', 'safe', 'retryable', false
             )
       WHERE id = ?
    `, [first]);
    await local.database.execute(`
      UPDATE tabular.operation_jobs
         SET finished_at = clock_timestamp() - interval '40 days',
             created_at = clock_timestamp() - interval '41 days',
             retained_until = clock_timestamp() - interval '1 day'
       WHERE id = ?
    `, [other]);
    const retained = await local.transaction((database) =>
      new OperationsRepository(database).retain({
        connectionId: 'operations_test', retentionDays: 30, limit: 10
      }));
    assert.equal(retained.jobsDeleted, 1);
    assert.equal(await new OperationsRepository(local.database).byId(first), undefined);
    assert.ok(await new OperationsRepository(local.database).byId(other));
    const tombstone = await local.database.execute<{ active_job_id: string | null, }>(`
      SELECT active_job_id FROM tabular.operation_idempotency
       WHERE connection_id = 'operations_test'
    `);
    assert.equal(tombstone.rows[0]?.active_job_id, null);
  } finally {
    await local.close();
  }
});

test('operation event reads scan private non-operation rows but emit only validated operation changes', async () => {
  const local = await createPGliteTestDatabase();
  try {
    await runMigrations(local.transaction, await loadMigrations(), { advisoryLock: false });
    await seedIdentities(local.database);
    await local.database.execute(`
      SELECT tabular.append_outbox_event(
        ?, 'operations_test', ?, ?, ?, 'saved-view.changed',
        'private-saved-view:test', jsonb_build_object('viewId', ?::text)
      )
    `, [
      `evt_${'v'.repeat(32)}`,
      `obj_${'f'.repeat(32)}`,
      identityId,
      identityId,
      `view_${'w'.repeat(32)}`
    ]);
    await local.transaction((database) => new OperationsRepository(database).enqueue({
      jobId: `job_${'e'.repeat(32)}`,
      connectionId: 'operations_test',
      actorIdentityId: identityId,
      sessionId,
      historyScopeId,
      kind: 'maintenance.import-staging',
      authority: 'worker',
      idempotencyKey: '9'.repeat(64),
      requestDigest: 'a'.repeat(64),
      payload: { limit: 10 },
      maxAttempts: 1,
      retainedUntil: future()
    }));
    const principal = {
      transport: 'browser' as const,
      sessionId,
      identityId,
      connectionId: 'operations_test',
      historyScopeId,
      idleExpiresAt: future(),
      absoluteExpiresAt: future()
    };
    const identity = {
      /**
       * Report the authorized transaction condition.
       */
      async authorizedTransaction(
        caller: typeof principal,
        _capability: string,
        callback: Function,
        prepare?: Function
      ) {
        if (prepare) await prepare(local.database);
        return callback(local.database, caller);
      }
    };
    const service = new OperationsPluginService(
      {} as never,
      {} as never,
      identity as never
    );
    const batch = await service.readEvents(principal, 0, 20);
    assert.equal(batch.events.length, 1);
    assert.equal(batch.events[0]?.kind, 'maintenance.import-staging');
    assert.equal(batch.scannedThrough, 2);
    assert.equal(batch.highWater, 2);
  } finally {
    await local.close();
  }
});

/**
 * Return the seed identities result.
 */
async function seedIdentities(database: { execute: Function, }) {
  await database.execute(`
    INSERT INTO tabular.identities (id, provider, issuer, provider_subject)
    VALUES (?, 'test', 'https://issuer.invalid', 'one'),
           (?, 'test', 'https://issuer.invalid', 'two')
  `, [identityId, otherIdentityId]);
}

/**
 * Create the failed.
 */
async function createFailed(
  local: Awaited<ReturnType<typeof createPGliteTestDatabase>>,
  connectionId: string,
  actorIdentityId: string,
  seed: string
) {
  const id = `job_${seed.repeat(32)}`;
  await local.transaction(async (database) => {
    const repository = new OperationsRepository(database);
    await repository.enqueue({
      jobId: id,
      connectionId,
      actorIdentityId,
      sessionId,
      historyScopeId,
      kind: 'maintenance.import-staging',
      authority: 'worker',
      idempotencyKey: seed.repeat(64),
      requestDigest: (seed === 'c' ? 'e' : 'f').repeat(64),
      payload: { limit: 10 },
      maxAttempts: 1,
      retainedUntil: future()
    });
    const claimed = await repository.claim({
      authority: 'worker',
      leaseOwner: `worker:${seed}`,
      leaseToken: seed.repeat(43),
      leaseTokenDigest: (seed === 'c' ? '7' : '8').repeat(64),
      leaseSeconds: 30
    });
    assert.equal(claimed?.id, id);
    await repository.finish({
      jobId: id,
      leaseOwner: `worker:${seed}`,
      leaseToken: seed.repeat(43),
      state: 'failed',
      progress: 0,
      error: { code: 'operation_failed', message: 'safe', retryable: false },
      diagnostics: {}
    });
  });
  return id;
}

/**
 * Return the future result.
 */
function future() {
  return new Date(Date.now() + 31 * 86_400_000);
}
