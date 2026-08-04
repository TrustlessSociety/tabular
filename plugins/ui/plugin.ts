import type { HttpServer } from '@stackpress/ingest/types';
import {
  RUNTIME_SERVICE,
  type ApplicationRuntimeService
} from '../../bootstrap/application.js';
import { UI_SERVICE, createUiPluginService } from './helpers/service.js';

export default function uiPlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(UI_SERVICE)) {
    throw new Error(`Service already registered: ${UI_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  if (!runtime) throw new Error(`${RUNTIME_SERVICE} must register before ${UI_SERVICE}`);
  server.register(UI_SERVICE, createUiPluginService());
  runtime.pluginOrder.push(UI_SERVICE);
}
