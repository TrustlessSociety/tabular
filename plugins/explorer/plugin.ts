import type { HttpServer } from '@stackpress/ingest/types';
import { RUNTIME_SERVICE, type ApplicationRuntimeService } from '../../bootstrap/application.js';
import { CATALOG_SERVICE, type CatalogPluginService } from '../catalog/helpers/service.js';
import { FILES_SERVICE, type FilesPluginService } from '../files/helpers/service.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../identity/helpers/service.js';
import { EXPLORER_SERVICE, ExplorerPluginService } from './helpers/service.js';
import {
  SAVED_VIEWS_SERVICE,
  type SavedViewsPluginService
} from '../saved-views/helpers/service.js';
import { registerExplorerRoutes } from './pages/routes.js';

export default function explorerPlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(EXPLORER_SERVICE)) {
    throw new Error(`Service already registered: ${EXPLORER_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const catalog = server.plugin<CatalogPluginService>(CATALOG_SERVICE);
  const files = server.plugin<FilesPluginService>(FILES_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const savedViews = server.plugin<SavedViewsPluginService>(SAVED_VIEWS_SERVICE);
  if (!runtime || !catalog || !files || !identity || !savedViews) {
    throw new Error(`${RUNTIME_SERVICE}, ${CATALOG_SERVICE}, ${FILES_SERVICE}, ${IDENTITY_SERVICE}, and ${SAVED_VIEWS_SERVICE} must register before ${EXPLORER_SERVICE}`);
  }
  const service = new ExplorerPluginService(catalog, files, savedViews);
  if (runtime.processKind === 'web') {
    registerExplorerRoutes(server, runtime, identity, service);
  }
  server.register(EXPLORER_SERVICE, service);
  runtime.pluginOrder.push(EXPLORER_SERVICE);
}
