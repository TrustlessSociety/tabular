import type { HttpServer } from '@stackpress/ingest/types';
import { RUNTIME_SERVICE, type ApplicationRuntimeService } from '../../bootstrap/application.js';
import { GRID_SERVICE } from '../grid/helpers/service.js';
import { UI_SERVICE } from '../ui/helpers/service.js';
import { COMMANDS_SERVICE, createCommandsPluginService } from './helpers/service.js';

export default function commandsPlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(COMMANDS_SERVICE)) throw new Error(`Service already registered: ${COMMANDS_SERVICE}`);
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  if (!runtime || !server.plugin(UI_SERVICE) || !server.plugin(GRID_SERVICE)) {
    throw new Error(`${RUNTIME_SERVICE}, ${UI_SERVICE}, and ${GRID_SERVICE} must register before ${COMMANDS_SERVICE}`);
  }
  server.register(COMMANDS_SERVICE, createCommandsPluginService());
  runtime.pluginOrder.push(COMMANDS_SERVICE);
}
