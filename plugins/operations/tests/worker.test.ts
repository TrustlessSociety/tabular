import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { LogLevel } from '../../../bootstrap/logger.js';
import type { OperationJob } from '../helpers/contracts.js';
import { OperationHandlerRegistry, operationHandler } from '../helpers/handlers.js';
import type { OperationsPluginService } from '../helpers/service.js';
import { OperationWorker } from '../helpers/worker.js';

const SECRET_MESSAGE = 'postgres://secret-user:secret-password@database/private';
const SECRET_JOB_ID = 'job_secret_identifier';
const SECRET_LEASE_TOKEN = 'lease_secret_token';
const SECRET_PAYLOAD = 'import_secret_payload';

describe('operation worker scheduling', { concurrency: false }, () => {
test('scheduled pump failures are contained and retried with bounded log-safe backoff', async () => {
  let recoverCalls = 0;
  const records: CapturedLog[] = [];
  const service = workerService({
    recoverExpired: async () => {
      recoverCalls += 1;
      if (recoverCalls === 1) throw new Error(SECRET_MESSAGE);
      return [];
    }
  });
  const worker = new OperationWorker(
    service,
    'worker',
    'test-pump-worker',
    captureLogger(records)
  );
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);

  try {
    worker.start();
    await waitFor(() => recoverCalls >= 2);
    await worker.stop();
    await delay(25);

    const logs = JSON.stringify(records);
    assert.match(logs, /operation_worker_pump_retry/);
    assert.match(logs, /"retryDelayMs":250/);
    assert.doesNotMatch(logs, new RegExp(escapeRegExp(SECRET_MESSAGE)));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    await worker.stop();
  }
});

test('scheduled heartbeat failures abort execution without leaking rejection or secrets', async () => {
  let claimed = false;
  let heartbeatCalls = 0;
  let handlerAborted = false;
  const completions: Array<Record<string, unknown>> = [];
  const records: CapturedLog[] = [];
  const handlers = new OperationHandlerRegistry().register(operationHandler(
    'import.commit',
    'worker',
    async ({ signal }) => {
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      handlerAborted = true;
      throw new Error('operation-aborted');
    }
  ));
  const service = workerService({
    handlers,
    claim: async () => {
      if (claimed) return undefined;
      claimed = true;
      return operationJob();
    },
    heartbeat: async () => {
      heartbeatCalls += 1;
      throw new Error(SECRET_MESSAGE);
    },
    leaseStatus: async () => ({
      owned: true,
      cancelRequested: false,
      irreversible: false
    }),
    finish: async (
      _authority: unknown,
      _jobId: unknown,
      _owner: unknown,
      _token: unknown,
      completion: Record<string, unknown>
    ) => {
      completions.push(completion);
      return true;
    }
  });
  const worker = new OperationWorker(
    service,
    'worker',
    'test-heartbeat-worker',
    captureLogger(records)
  );
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);

  try {
    worker.start();
    await waitFor(() => handlerAborted && completions.length === 1);
    await worker.stop();
    await delay(25);

    const logs = JSON.stringify(records);
    assert.equal(heartbeatCalls, 1);
    assert.equal(completions[0]?.state, 'retrying');
    assert.match(logs, /operation_worker_heartbeat_unavailable/);
    assert.doesNotMatch(logs, new RegExp(escapeRegExp(SECRET_MESSAGE)));
    assert.doesNotMatch(logs, new RegExp(SECRET_JOB_ID));
    assert.doesNotMatch(logs, new RegExp(SECRET_LEASE_TOKEN));
    assert.doesNotMatch(logs, new RegExp(SECRET_PAYLOAD));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    await worker.stop();
  }
});

test('a claim returned after shutdown begins is left for lease recovery and never executed', async () => {
  let resolveClaim: ((job: OperationJob | undefined) => void) | undefined;
  let claimStarted = false;
  let handlerCalls = 0;
  let heartbeatCalls = 0;
  let finishCalls = 0;
  const records: CapturedLog[] = [];
  const claim = new Promise<OperationJob | undefined>((resolve) => {
    resolveClaim = resolve;
  });
  const handlers = new OperationHandlerRegistry().register(operationHandler(
    'import.commit',
    'worker',
    async () => {
      handlerCalls += 1;
      return { imported: true };
    }
  ));
  const service = workerService({
    handlers,
    claim: async () => {
      claimStarted = true;
      return claim;
    },
    heartbeat: async () => {
      heartbeatCalls += 1;
      return true;
    },
    finish: async () => {
      finishCalls += 1;
      return true;
    }
  });
  const worker = new OperationWorker(
    service,
    'worker',
    'test-draining-worker',
    captureLogger(records)
  );

  worker.start();
  await waitFor(() => claimStarted);
  await worker.stop();
  resolveClaim?.(operationJob());
  await delay(50);

  const logs = JSON.stringify(records);
  assert.equal(handlerCalls, 0);
  assert.equal(heartbeatCalls, 0);
  assert.equal(finishCalls, 0);
  assert.match(logs, /operation_worker_claim_deferred/);
  assert.doesNotMatch(logs, new RegExp(SECRET_JOB_ID));
  assert.doesNotMatch(logs, new RegExp(SECRET_LEASE_TOKEN));
  assert.doesNotMatch(logs, new RegExp(SECRET_PAYLOAD));
});
});

function workerService(overrides: Record<string, unknown> = {}) {
  return {
    runtime: {
      config: {
        workers: {
          concurrency: 1,
          claimBatchSize: 1,
          leaseSeconds: 1,
          shutdownTimeoutMs: 50
        }
      },
      resources: {
        register() {}
      }
    },
    handlers: new OperationHandlerRegistry(),
    prepareAuthority() {},
    recoverExpired: async () => [],
    claim: async () => undefined,
    heartbeat: async () => true,
    markIrreversible: async () => true,
    leaseStatus: async () => ({
      owned: true,
      cancelRequested: false,
      irreversible: false
    }),
    finish: async () => true,
    ...overrides
  } as unknown as OperationsPluginService;
}

function operationJob(): OperationJob<'import.commit'> {
  return {
    id: SECRET_JOB_ID,
    connectionId: 'connection_worker_test',
    actorIdentityId: 'identity_worker_test',
    sessionId: 'session_worker_test',
    historyScopeId: 'history_worker_test',
    kind: 'import.commit',
    schemaVersion: 1,
    authority: 'worker',
    payload: { importId: SECRET_PAYLOAD },
    state: 'running',
    progress: 0,
    attempts: 1,
    maxAttempts: 3,
    version: 1,
    lease: {
      owner: 'test-worker',
      token: SECRET_LEASE_TOKEN,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }
  };
}

type CapturedLog = {
  level: LogLevel;
  event: string;
  fields: Record<string, unknown>;
};

function captureLogger(records: CapturedLog[]) {
  return (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    records.push({ level, event, fields });
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for worker state');
    await delay(10);
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
