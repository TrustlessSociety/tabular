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
  REALTIME_SERVICE,
  RealtimePluginService
} from './helpers/service.js';
import type { OperationEventReader } from '../operations/events/stream.js';
import { OPERATIONS_SERVICE } from '../operations/helpers/service.js';
import { registerRealtimeRoutes } from './pages/routes.js';

export default function realtimePlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(REALTIME_SERVICE)) {
    throw new Error(`Service already registered: ${REALTIME_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const operations = server.plugin<OperationEventReader>(OPERATIONS_SERVICE);
  if (!runtime || !identity || !operations) {
    throw new Error(
      `${RUNTIME_SERVICE}, ${IDENTITY_SERVICE}, and ${OPERATIONS_SERVICE} must register before ${REALTIME_SERVICE}`
    );
  }
  const service = new RealtimePluginService(identity, runtime.config.sse);
  if (runtime.processKind === 'web') {
    registerRealtimeRoutes(server, runtime.config, identity, service, operations);
  }
  server.register(REALTIME_SERVICE, service);
  runtime.pluginOrder.push(REALTIME_SERVICE);
}
