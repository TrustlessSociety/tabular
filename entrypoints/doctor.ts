import { createApplication } from '../bootstrap/application.js';
import { entrypointPaths } from '../bootstrap/entrypoint-paths.js';
import { writeLog } from '../bootstrap/logger.js';
import { assertProductionConfiguration } from '../config/index.js';

const scopeIndex = process.argv.indexOf('--scope');
const scope = process.argv[scopeIndex + 1];
if (!['web', 'migrator', 'worker'].includes(scope || '')) {
  throw new Error('Doctor requires --scope web, --scope migrator, or --scope worker');
}
const processKind = scope as 'web' | 'migrator' | 'worker';
const { projectRoot, runtimeRoot } = entrypointPaths(import.meta.url);
const application = await createApplication({ processKind, projectRoot, runtimeRoot });
try {
  assertProductionConfiguration(application.config);
  await application.database.assertReady(processKind);
  const diagnostics = await application.database.transaction(processKind, {}, async (database) => {
    const server = await database.execute<{
      server_version_num: string;
      current_user: string;
      database_oid: number;
    }>(`
      SELECT current_setting('server_version_num') AS server_version_num,
             current_user::text AS current_user,
             oid::integer AS database_oid
      FROM pg_database
      WHERE datname = current_database()
    `);
    const migrations = await database.execute<{ total: number; latest: string }>(`
      SELECT count(*)::integer AS total, coalesce(max(version), '')::text AS latest
      FROM tabular.schema_migrations
    `);
    const operations = await database.execute<{
      active: number;
      dead_letters: number;
      oldest_available_at: string | null;
    }>(`
      SELECT count(*) FILTER (WHERE state IN ('queued', 'running', 'retrying'))::integer AS active,
             count(*) FILTER (WHERE state = 'dead-letter')::integer AS dead_letters,
             min(available_at)::text AS oldest_available_at
      FROM tabular.operation_jobs
    `);
    const outbox = await database.execute<{ high_water: number }>(`
      SELECT coalesce(max(sequence), 0)::bigint AS high_water
      FROM tabular.outbox_events
      WHERE connection_id = ?
    `, [application.config.database.connectionId]);
    return {
      server: server.rows[0],
      migrations: migrations.rows[0],
      operations: operations.rows[0],
      outbox: outbox.rows[0]
    };
  });
  writeLog('info', 'doctor_passed', {
    scope: processKind,
    databaseConnectionId: application.config.database.connectionId,
    serverVersionNumber: diagnostics.server?.server_version_num,
    databaseOid: diagnostics.server?.database_oid,
    migrationCount: diagnostics.migrations?.total,
    latestMigration: diagnostics.migrations?.latest,
    activeOperations: diagnostics.operations?.active,
    deadLetters: diagnostics.operations?.dead_letters,
    oldestAvailableAt: diagnostics.operations?.oldest_available_at,
    outboxHighWater: Number(diagnostics.outbox?.high_water || 0)
  });
} finally {
  await application.runtime.resources.close(application.config.server.shutdownTimeoutMs);
}
