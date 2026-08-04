import type { HttpServer } from '@stackpress/ingest/types';
import {
  RUNTIME_SERVICE,
  type ApplicationRuntimeService
} from '../../bootstrap/application.js';
import {
  DATABASE_SERVICE,
  type DatabasePluginService
} from '../database/helpers/service.js';
import { IDENTITY_SERVICE, IdentityPluginService } from './helpers/service.js';
import { registerIdentityRoutes } from './pages/routes.js';

export default function identityPlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(IDENTITY_SERVICE)) {
    throw new Error(`Service already registered: ${IDENTITY_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const database = server.plugin<DatabasePluginService>(DATABASE_SERVICE);
  if (!runtime || !database) {
    throw new Error(`${DATABASE_SERVICE} must be registered before ${IDENTITY_SERVICE}`);
  }
  const service = new IdentityPluginService(database, runtime.config);
  if (runtime.processKind === 'web') registerIdentityRoutes(server, service);
  server.register(IDENTITY_SERVICE, service);
  runtime.pluginOrder.push(IDENTITY_SERVICE);
}
