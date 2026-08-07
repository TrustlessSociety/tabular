//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { CatalogPluginService } from '../catalog/helpers/service.js';
import type { FilesPluginService } from '../files/helpers/service.js';
import type { IdentityPluginService } from '../identity/helpers/service.js';
import type { SavedViewsPluginService } from '../saved-views/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { CATALOG_SERVICE } from '../catalog/helpers/service.js';
import { FILES_SERVICE } from '../files/helpers/service.js';
import { IDENTITY_SERVICE } from '../identity/helpers/service.js';
import { EXPLORER_SERVICE, ExplorerPluginService } from './helpers/service.js';
import { SAVED_VIEWS_SERVICE } from '../saved-views/helpers/service.js';

export const EXPLORER_ROUTES = [
  '/',
  '/pages/browse.html',
  '/events/explorer'
] as const;

/**
 * Register the explorer plugin with the application server.
 */
export default function explorerPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
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
    server.import.get('/', () => import('./pages/index.js'), 1);
    server.view.get('/', '@/plugins/explorer/views/index');
    server.import.get('/pages/browse.html', () => import('./pages/browse.js'), 1);
    server.view.get('/pages/browse.html', '@/plugins/explorer/views/index');
    server.import.post('/events/explorer', () => import('./pages/events-explorer.js'), 1);
  }
  server.register(EXPLORER_SERVICE, service);
  runtime.pluginOrder.push(EXPLORER_SERVICE);
}
