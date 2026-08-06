//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { DATABASE_SERVICE, DatabasePluginService } from './helpers/service.js';

/**
 * Register the database plugin with the application server.
 */
export default function databasePlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(DATABASE_SERVICE)) {
    throw new Error(`Service already registered: ${DATABASE_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  if (!runtime) throw new Error(`${RUNTIME_SERVICE} must be registered before bootstrap`);
  const service = new DatabasePluginService(
    runtime.processKind,
    runtime.config.database,
    runtime.resources,
    runtime.config.server.shutdownTimeoutMs,
    runtime.config.environment.instanceId
  );
  server.register(DATABASE_SERVICE, service);
  runtime.pluginOrder.push(DATABASE_SERVICE);
}
