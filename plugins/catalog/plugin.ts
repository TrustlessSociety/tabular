//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { IdentityPluginService } from '../identity/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { IDENTITY_SERVICE } from '../identity/helpers/service.js';
import { CATALOG_SERVICE, CatalogPluginService } from './helpers/service.js';
import { registerCatalogRoutes } from './pages/routes.js';

/**
 * Register the catalog plugin with the application server.
 */
export default function catalogPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(CATALOG_SERVICE)) {
    throw new Error(`Service already registered: ${CATALOG_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  if (!runtime || !identity) {
    throw new Error(`${IDENTITY_SERVICE} must be registered before ${CATALOG_SERVICE}`);
  }
  const service = new CatalogPluginService(identity);
  if (runtime.processKind === 'web') registerCatalogRoutes(server, identity, service);
  server.register(CATALOG_SERVICE, service);
  runtime.pluginOrder.push(CATALOG_SERVICE);
}
