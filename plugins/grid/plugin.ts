import type { HttpServer } from '@stackpress/ingest/types';
import {
  RUNTIME_SERVICE,
  type ApplicationRuntimeService
} from '../../bootstrap/application.js';
import { GRID_SERVICE, createGridPluginService } from './helpers/service.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../identity/helpers/service.js';
import { CAPABILITY_SERVICE, type CapabilityPluginService } from '../capability/helpers/service.js';
import { EXPLORER_SERVICE, type ExplorerPluginService } from '../explorer/helpers/service.js';
import { FILES_SERVICE, type FilesPluginService } from '../files/helpers/service.js';
import {
  SAVED_VIEWS_SERVICE,
  type SavedViewsPluginService
} from '../saved-views/helpers/service.js';
import { registerGridRoutes } from './pages/routes.js';

export default function gridPlugin(server: HttpServer<any, any>) {
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
    registerGridRoutes(
      server,
      runtime,
      identity,
      explorer,
      capability,
      files,
      savedViews,
      service
    );
  }
  server.register(GRID_SERVICE, service);
  runtime.pluginOrder.push(GRID_SERVICE);
}
