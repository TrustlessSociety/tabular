import { createApplication } from '../../../bootstrap/application.js';
import pg from 'pg';
import { operationHandler } from '../../../plugins/operations/helpers/handlers.js';
import {
  OperationExecutionError,
  OperationWorker
} from '../../../plugins/operations/helpers/worker.js';

type ParentCommand =
  | { type: 'start' }
  | { type: 'release'; jobId: string }
  | { type: 'stop' };

const resultFileId = process.env.TABULAR_TASK00012_RESULT_FILE_ID;
if (!resultFileId || !/^obj_[A-Za-z0-9_-]{32,64}$/.test(resultFileId)) {
  throw new Error('TABULAR_TASK00012_RESULT_FILE_ID is required');
}

const application = await createApplication({
  processKind: 'worker',
  env: process.env,
  projectRoot: process.cwd(),
  runtimeRoot: process.cwd()
});
const effectPool = new pg.Pool({
  connectionString: process.env.TABULAR_WORKER_DATABASE_URL,
  max: 1,
  allowExitOnIdle: true
});
const gates = new Map<string, () => void>();

application.operations.handlers
  .register(operationHandler('import.commit', 'worker', async (context) => {
    await context.heartbeat(42);
    await waitAtGate(context.job.id, 'linked-result', context.signal);
    if (!await context.markIrreversible()) cancelled();
    return {
      importId: context.job.payload.importId,
      state: 'committed',
      fileId: resultFileId,
      rowsCommitted: 12,
      columnsCommitted: 4,
      warnings: 1
    };
  }))
  .register(operationHandler('maintenance.import-staging', 'worker', async (context) => {
    const scenario = context.job.payload.limit;
    if (scenario === 102) {
      await effectPool.query(`
        INSERT INTO workspace.task12_operation_effects (effect_key, job_id)
        VALUES ('retry-idempotent-effect', $1)
        ON CONFLICT (effect_key) DO NOTHING
      `, [context.job.id]);
      if (context.job.attempts === 1) {
        throw new OperationExecutionError('operation_failed', true);
      }
    }
    if (scenario === 106) {
      throw new OperationExecutionError('operation_failed', true);
    }
    if (scenario === 103) {
      await context.heartbeat(25);
      await waitAtGate(context.job.id, 'cancellable', context.signal);
    }
    return { operationsDeleted: scenario === 104 ? 2 : 0 };
  }))
  .register(operationHandler('operations.retention', 'worker', async (context) => {
    if (!await context.markIrreversible()) cancelled();
    const result = await application.operations.applyRetentionJob('worker', context.job);
    return { ...result, retentionDays: context.job.payload.retentionDays };
  }));

const worker = new OperationWorker(
  application.operations,
  'worker',
  `worker:task00012-browser-${process.pid}`
);
let started = false;
let stopping: Promise<void> | undefined;

process.on('message', (message: ParentCommand) => {
  if (message.type === 'start' && !started) {
    started = true;
    worker.start();
    send({ type: 'started' });
  } else if (message.type === 'release') {
    gates.get(message.jobId)?.();
  } else if (message.type === 'stop') {
    void stop();
  }
});
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
send({ type: 'ready' });

await new Promise<void>((resolve) => process.once('disconnect', resolve));
await stop();

function waitAtGate(jobId: string, scenario: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      gates.delete(jobId);
      signal.removeEventListener('abort', onAbort);
    };
    const release = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new OperationExecutionError('operation_failed', true));
    };
    gates.set(jobId, release);
    signal.addEventListener('abort', onAbort, { once: true });
    send({ type: 'gated', jobId, scenario });
  });
}

function send(message: Record<string, unknown>) {
  if (process.connected && process.send) process.send(message);
}

async function stop() {
  stopping ||= (async () => {
    await application.runtime.resources.close(5_000).catch(() => undefined);
    await effectPool.end().catch(() => undefined);
    if (process.connected) process.disconnect();
  })();
  await stopping;
}

function cancelled(): never {
  throw new OperationExecutionError('operation_failed', true);
}
