//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { DatabasePluginService } from '../database/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { DATABASE_SERVICE } from '../database/helpers/service.js';
import { IDENTITY_SERVICE, IdentityPluginService } from './helpers/service.js';
import { registerIdentityRoutes } from './pages/routes.js';

/**
 * Register the identity plugin with the application server.
 */
export default function identityPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(IDENTITY_SERVICE)) {
    throw new Error(`Service already registered: ${IDENTITY_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const database = server.plugin<DatabasePluginService>(DATABASE_SERVICE);
  if (!runtime || !database) {
    throw new Error(`${DATABASE_SERVICE} must be registered before ${IDENTITY_SERVICE}`);
  }
  const service = new IdentityPluginService(database, runtime.config);
  if (runtime.processKind === 'web') registerIdentityRoutes(server, service, runtime);
  server.register(IDENTITY_SERVICE, service);
  runtime.pluginOrder.push(IDENTITY_SERVICE);
}
