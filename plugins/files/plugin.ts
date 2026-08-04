import type { HttpServer } from '@stackpress/ingest/types';
import {
  RUNTIME_SERVICE,
  type ApplicationRuntimeService
} from '../../bootstrap/application.js';
import {
  DATABASE_SERVICE,
  type DatabasePluginService
} from '../database/helpers/service.js';
import {
  IDENTITY_SERVICE,
  type IdentityPluginService
} from '../identity/helpers/service.js';
import { CATALOG_SERVICE } from '../catalog/helpers/service.js';
import { CAPABILITY_SERVICE } from '../capability/helpers/service.js';
import {
  OPERATIONS_SERVICE,
  type OperationsPluginService
} from '../operations/helpers/service.js';
import { FILES_SERVICE, FilesPluginService } from './helpers/service.js';
import { registerFilesRoutes } from './pages/routes.js';

export default function filesPlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(FILES_SERVICE)) {
    throw new Error(`Service already registered: ${FILES_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const database = server.plugin<DatabasePluginService>(DATABASE_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const catalog = server.plugin(CATALOG_SERVICE);
  const capability = server.plugin(CAPABILITY_SERVICE);
  const operations = server.plugin<OperationsPluginService>(OPERATIONS_SERVICE);
  if (!runtime || !database || !identity || !catalog || !capability || !operations) {
    throw new Error(
      `${DATABASE_SERVICE}, ${IDENTITY_SERVICE}, ${CATALOG_SERVICE}, and ${CAPABILITY_SERVICE} must register before ${FILES_SERVICE}`
    );
  }
  const service = new FilesPluginService(runtime, database, identity, operations);
  if (runtime.processKind === 'web') registerFilesRoutes(server, identity, service);
  server.register(FILES_SERVICE, service);
  runtime.pluginOrder.push(FILES_SERVICE);
}
