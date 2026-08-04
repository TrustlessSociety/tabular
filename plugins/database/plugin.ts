import type { HttpServer } from '@stackpress/ingest/types';
import {
  RUNTIME_SERVICE,
  type ApplicationRuntimeService
} from '../../bootstrap/application.js';
import { DATABASE_SERVICE, DatabasePluginService } from './helpers/service.js';

export default function databasePlugin(server: HttpServer<any, any>) {
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
