import { createApplication } from '../../src/bootstrap/application.js';
import { entrypointPaths } from '../../src/bootstrap/entrypoint-paths.js';
import { resolveProcessPhases } from '../../src/bootstrap/lifecycle.js';
import { writeLog } from '../../src/bootstrap/logger.js';
import { loadMigratorConfig } from '../../src/config/migrator.js';
import { assertProductionConfiguration } from '../../src/config/index.js';
import { operationHandler } from '../../src/plugins/operations/helpers/handlers.js';
import {
  OperationExecutionError,
  OperationWorker
} from '../../src/plugins/operations/helpers/worker.js';

const { projectRoot, runtimeRoot } = entrypointPaths(import.meta.url);
const config = loadMigratorConfig({ projectRoot, runtimeRoot });
const requestedJobId = process.env.TABULAR_OPERATION_JOB_ID;
const consumeOperations = process.argv.includes('--consume-operations');
if (requestedJobId && !/^job_[A-Za-z0-9_-]{32,64}$/.test(requestedJobId)) {
  throw new Error('TABULAR_OPERATION_JOB_ID must be an opaque operation job ID');
}
if (requestedJobId && consumeOperations) {
  throw new Error('Choose an exact operation job or continuous migrator consumption, not both');
}

const application = await createApplication({
  processKind: 'migrator',
  config,
  projectRoot,
  runtimeRoot
});
await resolveProcessPhases(
  application.app,
  'migrator',
  consumeOperations ? ['worker'] : []
);
const shutdownTimeoutMs = Math.max(
  application.config.server.shutdownTimeoutMs,
  application.config.workers.shutdownTimeoutMs
);
writeLog('info', 'migrator_entrypoint_initialized', {
  application: application.config.app.name,
  authorityConfigured: Boolean(application.config.database.migratorUrl),
  ownsHttpListener: false,
  explicitJobRequested: Boolean(requestedJobId),
  consumesOperations: consumeOperations
});

let staysRunning = false;
try {
  assertProductionConfiguration(application.config);
  if (!application.config.database.migratorUrl) {
    writeLog('error', 'migrator_authority_missing', {
      ownsHttpListener: false,
      required: 'TABULAR_MIGRATOR_DATABASE_URL'
    });
    throw new Error('PostgreSQL migrator authority is not configured');
  }
  const result = await application.database.migrate();
  writeLog('info', 'migrations_completed', result);
  if (requestedJobId || consumeOperations) {
    application.operations.handlers.register(operationHandler(
      'ddl.apply',
      'migrator',
      async (context) => {
        if (!await context.markIrreversible()) cancelled();
        const applied = await application.files.applyConfirmed(context.job.payload.requestId);
        return {
          requestId: applied.requestId,
          actionType: applied.actionType,
          state: applied.state,
          ...(applied.targetFileId ? { targetObjectId: applied.targetFileId } : {})
        };
      }
    ));
    const worker = new OperationWorker(
      application.operations,
      'migrator',
      `migrator:${application.config.environment.instanceId}:${process.pid}`
    );
    if (requestedJobId && !await worker.runOnce(requestedJobId)) {
      writeLog('error', 'operation_job_unavailable', { jobId: requestedJobId });
      process.exitCode = 1;
    } else if (consumeOperations) {
      staysRunning = true;
      worker.start();
      let closing = false;
      const shutdown = async (signal: NodeJS.Signals) => {
        if (closing) return;
        closing = true;
        try {
          await application.runtime.resources.close(
            shutdownTimeoutMs
          );
          writeLog('info', 'migrator_operations_stopped', {
            signal,
            ownsHttpListener: false
          });
        } catch (error) {
          writeLog('error', 'migrator_operations_shutdown_failed', {
            signal,
            error: error instanceof Error ? error.name : 'unknown_error'
          });
          process.exitCode = 1;
        }
      };
      process.once('SIGINT', () => void shutdown('SIGINT'));
      process.once('SIGTERM', () => void shutdown('SIGTERM'));
      writeLog('info', 'migrator_operations_started', {
        authority: 'migrator',
        ownsHttpListener: false
      });
    }
  }
} finally {
  if (!staysRunning) {
    await application.runtime.resources.close(application.config.server.shutdownTimeoutMs);
  }
}

function cancelled(): never {
  throw new OperationExecutionError('operation_failed', true);
}
