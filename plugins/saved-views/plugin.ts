import type { HttpServer } from '@stackpress/ingest/types';
import {
  RUNTIME_SERVICE,
  type ApplicationRuntimeService
} from '../../bootstrap/application.js';
import {
  IDENTITY_SERVICE,
  type IdentityPluginService
} from '../identity/helpers/service.js';
import {
  CAPABILITY_SERVICE,
  type CapabilityPluginService
} from '../capability/helpers/service.js';
import {
  SAVED_VIEWS_SERVICE,
  SavedViewsPluginService
} from './helpers/service.js';
import { registerSavedViewRoutes } from './pages/routes.js';

export default function savedViewsPlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(SAVED_VIEWS_SERVICE)) {
    throw new Error(`Service already registered: ${SAVED_VIEWS_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const capability = server.plugin<CapabilityPluginService>(CAPABILITY_SERVICE);
  if (!runtime || !identity || !capability) {
    throw new Error(
      `${RUNTIME_SERVICE}, ${IDENTITY_SERVICE}, and ${CAPABILITY_SERVICE} must register before ${SAVED_VIEWS_SERVICE}`
    );
  }
  const service = new SavedViewsPluginService(identity, capability);
  if (runtime.processKind === 'web') registerSavedViewRoutes(server, identity, service);
  server.register(SAVED_VIEWS_SERVICE, service);
  runtime.pluginOrder.push(SAVED_VIEWS_SERVICE);
}
