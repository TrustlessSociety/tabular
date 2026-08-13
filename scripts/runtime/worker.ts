import { createApplication } from '../../src/bootstrap/application.js';
import { entrypointPaths } from '../../src/bootstrap/entrypoint-paths.js';
import { resolveProcessPhases } from '../../src/bootstrap/lifecycle.js';
import { writeLog } from '../../src/bootstrap/logger.js';
import { ApplicationError } from '../../src/bootstrap/errors.js';
import { loadWorkerProcessConfig } from '../../src/config/worker.js';
import { assertProductionConfiguration } from '../../src/config/index.js';
import { operationHandler } from '../../src/plugins/operations/helpers/handlers.js';
import {
  OperationExecutionError,
  OperationWorker
} from '../../src/plugins/operations/helpers/worker.js';

const { projectRoot, runtimeRoot } = entrypointPaths(import.meta.url);
const config = loadWorkerProcessConfig({ projectRoot, runtimeRoot });
const requestedJobId = process.env.TABULAR_OPERATION_JOB_ID;
if (requestedJobId && !/^job_[A-Za-z0-9_-]{32,64}$/.test(requestedJobId)) {
  throw new Error('TABULAR_OPERATION_JOB_ID must be an opaque operation job ID');
}

const application = await createApplication({
  processKind: 'worker',
  config,
  projectRoot,
  runtimeRoot
});
await resolveProcessPhases(application.app, 'worker');
assertProductionConfiguration(application.config);
const shutdownTimeoutMs = Math.max(
  application.config.server.shutdownTimeoutMs,
  application.config.workers.shutdownTimeoutMs
);

application.operations.handlers
  .register(operationHandler('import.commit', 'worker', async (context) => {
    if (!await context.heartbeat(5)) cancelled();
    if (!await context.markIrreversible()) cancelled();
    const result = await application.importExport.executeConfirmedImport(
      context.job.payload.importId,
      { terminalOnFailure: false }
    );
    return {
      importId: result.importId,
      state: result.state,
      fileId: result.fileId,
      rowsCommitted: result.rowsCommitted,
      columnsCommitted: result.columnsCommitted,
      warnings: result.warnings
    };
  }))
  .register(operationHandler('maintenance.import-staging', 'worker', async (context) => {
    if (!await context.markIrreversible()) cancelled();
    const result = await application.importExport.cleanupExpiredImports(
      context.job.payload.limit
    );
    return { operationsDeleted: result.cleaned };
  }))
  .register(operationHandler('operations.retention', 'worker', async (context) => {
    if (!await context.markIrreversible()) cancelled();
    let result: Awaited<ReturnType<typeof application.operations.applyRetentionJob>>;
    try {
      result = await application.operations.applyRetentionJob('worker', context.job);
    } catch (error) {
      if (error instanceof ApplicationError
        && error.errorCode === 'operations_retention_stale') {
        throw new OperationExecutionError('retention_stale', false);
      }
      if (error instanceof ApplicationError
        && ['operations_retention_denied', 'invalid_session'].includes(error.errorCode)) {
        throw new OperationExecutionError('retention_denied', false);
      }
      throw error;
    }
    return {
      ...result,
      retentionDays: context.job.payload.retentionDays
    };
  }));

const worker = new OperationWorker(
  application.operations,
  'worker',
  `worker:${application.config.environment.instanceId}:${process.pid}`
);

writeLog('info', 'worker_entrypoint_initialized', {
  application: application.config.app.name,
  authorityConfigured: Boolean(application.config.database.workerUrl),
  concurrency: application.config.workers.concurrency,
  ownsHttpListener: false,
  explicitJobRequested: Boolean(requestedJobId)
});

if (!application.config.database.workerUrl) {
  writeLog('error', 'worker_authority_missing', {
    ownsHttpListener: false,
    required: 'TABULAR_WORKER_DATABASE_URL'
  });
  process.exitCode = 1;
  await application.runtime.resources.close(shutdownTimeoutMs);
} else if (requestedJobId) {
  try {
    await application.database.assertReady('worker');
    if (!await worker.runOnce(requestedJobId)) {
      writeLog('error', 'operation_job_unavailable', { jobId: requestedJobId });
      process.exitCode = 1;
    }
  } finally {
    await application.runtime.resources.close(shutdownTimeoutMs);
  }
} else {
  try {
    await application.database.assertReady('worker');
    worker.start();
    writeLog('info', 'worker_ready', {
      authority: 'worker',
      ownsHttpListener: false
    });
    let closing = false;
    const shutdown = async (signal: NodeJS.Signals) => {
      if (closing) return;
      closing = true;
      try {
        await application.runtime.resources.close(shutdownTimeoutMs);
        writeLog('info', 'worker_entrypoint_stopped', { signal, ownsHttpListener: false });
      } catch (error) {
        writeLog('error', 'worker_shutdown_failed', {
          signal,
          error: error instanceof Error ? error.name : 'unknown_error'
        });
        process.exitCode = 1;
      }
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (error) {
    await application.runtime.resources.close(shutdownTimeoutMs);
    throw error;
  }
}

function cancelled(): never {
  throw new OperationExecutionError('operation_failed', true);
}
