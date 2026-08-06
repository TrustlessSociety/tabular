//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { UI_SERVICE, createUiPluginService } from './helpers/service.js';

/**
 * Register the ui plugin with the application server.
 */
export default function uiPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(UI_SERVICE)) {
    throw new Error(`Service already registered: ${UI_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  if (!runtime) throw new Error(`${RUNTIME_SERVICE} must register before ${UI_SERVICE}`);
  server.register(UI_SERVICE, createUiPluginService());
  runtime.pluginOrder.push(UI_SERVICE);
}
