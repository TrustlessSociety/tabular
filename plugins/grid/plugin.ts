//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { CapabilityPluginService } from '../capability/helpers/service.js';
import type { ExplorerPluginService } from '../explorer/helpers/service.js';
import type { FilesPluginService } from '../files/helpers/service.js';
import type { IdentityPluginService } from '../identity/helpers/service.js';
import type { SavedViewsPluginService } from '../saved-views/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { GRID_SERVICE, createGridPluginService } from './helpers/service.js';
import { IDENTITY_SERVICE } from '../identity/helpers/service.js';
import { CAPABILITY_SERVICE } from '../capability/helpers/service.js';
import { EXPLORER_SERVICE } from '../explorer/helpers/service.js';
import { FILES_SERVICE } from '../files/helpers/service.js';
import { SAVED_VIEWS_SERVICE } from '../saved-views/helpers/service.js';

export const GRID_ROUTES = [
  '/pages/table.html',
  '/events/grid',
  '/events/grid-relation'
] as const;

/**
 * Register the grid plugin with the application server.
 */
export default function gridPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(GRID_SERVICE)) {
    throw new Error(`Service already registered: ${GRID_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const capability = server.plugin<CapabilityPluginService>(CAPABILITY_SERVICE);
  const explorer = server.plugin<ExplorerPluginService>(EXPLORER_SERVICE);
  const files = server.plugin<FilesPluginService>(FILES_SERVICE);
  const savedViews = server.plugin<SavedViewsPluginService>(SAVED_VIEWS_SERVICE);
  if (!runtime || !identity || !capability || !explorer || !files || !savedViews) {
    throw new Error(
      `${RUNTIME_SERVICE}, ${IDENTITY_SERVICE}, ${CAPABILITY_SERVICE}, ${EXPLORER_SERVICE}, ${FILES_SERVICE}, and ${SAVED_VIEWS_SERVICE} must register before ${GRID_SERVICE}`
    );
  }
  const service = createGridPluginService(identity, capability);
  if (runtime.processKind === 'web') {
    server.import.get('/pages/table.html', () => import('./pages/table.js'), 1);
    server.view.get('/pages/table.html', '@/plugins/grid/views/table');
    server.import.get('/events/grid', () => import('./pages/events-grid-get.js'), 1);
    server.import.get('/events/grid-relation', () => import('./pages/events-grid-relation.js'), 1);
    server.import.post('/events/grid', () => import('./pages/events-grid-post.js'), 1);
  }
  server.register(GRID_SERVICE, service);
  runtime.pluginOrder.push(GRID_SERVICE);
}
