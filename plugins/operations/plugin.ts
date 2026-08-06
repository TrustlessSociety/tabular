//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { DatabasePluginService } from '../database/helpers/service.js';
import type { IdentityPluginService } from '../identity/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { DATABASE_SERVICE } from '../database/helpers/service.js';
import { IDENTITY_SERVICE } from '../identity/helpers/service.js';
import {
  OPERATIONS_SERVICE,
  OperationsPluginService
} from './helpers/service.js';
import { registerOperationsRoutes } from './pages/routes.js';

/**
 * Register the operations plugin with the application server.
 */
export default function operationsPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(OPERATIONS_SERVICE)) {
    throw new Error(`Service already registered: ${OPERATIONS_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const database = server.plugin<DatabasePluginService>(DATABASE_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  if (!runtime || !database || !identity) {
    throw new Error(
      `${RUNTIME_SERVICE}, ${DATABASE_SERVICE}, and ${IDENTITY_SERVICE} must register before ${OPERATIONS_SERVICE}`
    );
  }
  const service = new OperationsPluginService(runtime, database, identity);
  if (runtime.processKind === 'web') {
    registerOperationsRoutes(server, runtime, identity, service);
  }
  server.register(OPERATIONS_SERVICE, service);
  runtime.pluginOrder.push(OPERATIONS_SERVICE);
}

export { OPERATIONS_ROUTES } from './pages/routes.js';
