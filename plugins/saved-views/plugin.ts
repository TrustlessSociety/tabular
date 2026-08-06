//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { CapabilityPluginService } from '../capability/helpers/service.js';
import type { IdentityPluginService } from '../identity/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { IDENTITY_SERVICE } from '../identity/helpers/service.js';
import { CAPABILITY_SERVICE } from '../capability/helpers/service.js';
import {
  SAVED_VIEWS_SERVICE,
  SavedViewsPluginService
} from './helpers/service.js';
import { registerSavedViewRoutes } from './pages/routes.js';

/**
 * Register the saved views plugin with the application server.
 */
export default function savedViewsPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(SAVED_VIEWS_SERVICE)) {
    throw new Error(`Service already registered: ${SAVED_VIEWS_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const capability = server.plugin<CapabilityPluginService>(CAPABILITY_SERVICE);
  if (!runtime || !identity || !capability) {
    throw new Error(
      `${RUNTIME_SERVICE}, ${IDENTITY_SERVICE}, and ${CAPABILITY_SERVICE} must register before ${SAVED_VIEWS_SERVICE}`
    );
  }
  const service = new SavedViewsPluginService(identity, capability);
  if (runtime.processKind === 'web') registerSavedViewRoutes(server, identity, service);
  server.register(SAVED_VIEWS_SERVICE, service);
  runtime.pluginOrder.push(SAVED_VIEWS_SERVICE);
}
