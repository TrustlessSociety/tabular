import { configureLogging, writeLog } from '../../src/bootstrap/logger.js';
import { loadPreflightConfig } from '../../src/config/preflight.js';
import { assertProductionConfiguration } from '../../src/config/index.js';

const config = loadPreflightConfig();
configureLogging(config.environment.logLevel, {
  instanceId: config.environment.instanceId,
  processKind: 'preflight'
});
if (config.environment.mode !== 'production') {
  throw new Error('Deployment preflight requires NODE_ENV=production');
}
assertProductionConfiguration(config);
writeLog('info', 'deployment_preflight_passed', {
  application: config.app.name,
  mode: config.environment.mode,
  databaseConnectionId: config.database.connectionId,
  authorities: ['web', 'migrator', 'worker'],
  sameTarget: true,
  distinctUsernames: true
});
