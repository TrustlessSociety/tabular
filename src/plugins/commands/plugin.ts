//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { GRID_SERVICE } from '../grid/helpers/service.js';
import { COMMANDS_SERVICE, createCommandsPluginService } from './helpers/service.js';

/**
 * Register the commands plugin with the application server.
 */
export default function commandsPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(COMMANDS_SERVICE)) throw new Error(`Service already registered: ${COMMANDS_SERVICE}`);
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  if (!runtime || !server.plugin(GRID_SERVICE)) {
    throw new Error(`${RUNTIME_SERVICE} and ${GRID_SERVICE} must register before ${COMMANDS_SERVICE}`);
  }
  server.register(COMMANDS_SERVICE, createCommandsPluginService());
  runtime.pluginOrder.push(COMMANDS_SERVICE);
}