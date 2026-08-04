import type { HttpServer } from '@stackpress/ingest/types';
import {
  RUNTIME_SERVICE,
  type ApplicationRuntimeService
} from '../../bootstrap/application.js';
import { CATALOG_SERVICE } from '../catalog/helpers/service.js';
import { IDENTITY_SERVICE } from '../identity/helpers/service.js';
import { CAPABILITY_SERVICE, CapabilityPluginService } from './helpers/service.js';

export default function capabilityPlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(CAPABILITY_SERVICE)) {
    throw new Error(`Service already registered: ${CAPABILITY_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = server.plugin(IDENTITY_SERVICE);
  const catalog = server.plugin(CATALOG_SERVICE);
  if (!runtime || !identity || !catalog) {
    throw new Error(`${IDENTITY_SERVICE} and ${CATALOG_SERVICE} must register before ${CAPABILITY_SERVICE}`);
  }
  const service = new CapabilityPluginService();
  server.register(CAPABILITY_SERVICE, service);
  runtime.pluginOrder.push(CAPABILITY_SERVICE);
}
