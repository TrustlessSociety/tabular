import { createApplication } from '../bootstrap/application.js';
import { entrypointPaths } from '../bootstrap/entrypoint-paths.js';
import { writeLog } from '../bootstrap/logger.js';
import {
  seedLocalDemo,
  type DemoSeedResult
} from '../plugins/database/helpers/demo-seed.js';

if (!process.argv.includes('--confirm-local-demo')) {
  throw new Error('Demo seed requires the explicit --confirm-local-demo argument');
}

const { projectRoot, runtimeRoot } = entrypointPaths(import.meta.url);
const application = await createApplication({
  processKind: 'migrator',
  projectRoot,
  runtimeRoot
});

try {
  if (application.config.environment.mode === 'production') {
    throw new Error('The local demo seed is disabled in production');
  }
  if (!application.config.database.migratorUrl) {
    throw new Error('TABULAR_MIGRATOR_DATABASE_URL is required for the demo seed');
  }
  await application.database.assertReady('migrator');
  const result = await application.database.transaction<DemoSeedResult>(
    'migrator',
    {
      isolation: 'repeatable read',
      settings: {
        statement_timeout: String(application.config.database.statementTimeoutMs),
        lock_timeout: String(application.config.database.statementTimeoutMs),
        idle_in_transaction_session_timeout: String(
          application.config.database.statementTimeoutMs
        )
      }
    },
    (database) => seedLocalDemo(
      database,
      process.env.TABULAR_DEMO_MEMBER_ROLE,
      application.config.database.connectionId
    )
  );
  writeLog('info', 'demo_seed_completed', { ...result });
} finally {
  await application.runtime.resources.close(application.config.server.shutdownTimeoutMs);
}
