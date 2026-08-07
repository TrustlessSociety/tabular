//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { DatabasePluginService } from '../database/helpers/service.js';
import type { OperationsPluginService } from '../operations/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { DATABASE_SERVICE } from '../database/helpers/service.js';
import { IDENTITY_SERVICE } from '../identity/helpers/service.js';
import { CATALOG_SERVICE } from '../catalog/helpers/service.js';
import { CAPABILITY_SERVICE } from '../capability/helpers/service.js';
import { OPERATIONS_SERVICE } from '../operations/helpers/service.js';
import { FILES_SERVICE, FilesPluginService } from './helpers/service.js';

export const FILES_ROUTES = ['/events/files'] as const;

/**
 * Register the files plugin with the application server.
 */
export default function filesPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(FILES_SERVICE)) {
    throw new Error(`Service already registered: ${FILES_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const database = server.plugin<DatabasePluginService>(DATABASE_SERVICE);
  const identity = server.plugin(IDENTITY_SERVICE);
  const catalog = server.plugin(CATALOG_SERVICE);
  const capability = server.plugin(CAPABILITY_SERVICE);
  const operations = server.plugin<OperationsPluginService>(OPERATIONS_SERVICE);
  if (!runtime || !database || !identity || !catalog || !capability || !operations) {
    throw new Error(
      `${DATABASE_SERVICE}, ${IDENTITY_SERVICE}, ${CATALOG_SERVICE}, and ${CAPABILITY_SERVICE} must register before ${FILES_SERVICE}`
    );
  }
  const service = new FilesPluginService(runtime, database, identity, operations);
  if (runtime.processKind === 'web') {
    server.import.get('/events/files', () => import('./pages/events-files.js'), 1);
  }
  server.register(FILES_SERVICE, service);
  runtime.pluginOrder.push(FILES_SERVICE);
}
