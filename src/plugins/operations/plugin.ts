//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { DatabasePluginService } from '../database/helpers/service.js';
import type { IdentityPluginService } from '../identity/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { DATABASE_SERVICE } from '../database/helpers/service.js';
import { IDENTITY_SERVICE } from '../identity/helpers/service.js';
import {
  OPERATIONS_SERVICE,
  OperationsPluginService
} from './helpers/service.js';

export const OPERATIONS_ROUTES = [
  '/pages/system-activity.html',
  '/events/operations'
] as const;

/**
 * Register the operations plugin with the application server.
 */
export default function operationsPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(OPERATIONS_SERVICE)) {
    throw new Error(`Service already registered: ${OPERATIONS_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const database = server.plugin<DatabasePluginService>(DATABASE_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  if (!runtime || !database || !identity) {
    throw new Error(
      `${RUNTIME_SERVICE}, ${DATABASE_SERVICE}, and ${IDENTITY_SERVICE} must register before ${OPERATIONS_SERVICE}`
    );
  }
  const service = new OperationsPluginService(runtime, database, identity);
  if (runtime.processKind === 'web') {
    server.import.get('/pages/system-activity.html', () => import('./pages/system-activity.js'), 1);
    server.view.get('/pages/system-activity.html', '@/src/plugins/operations/views/activity');
    server.import.get('/events/operations', () => import('./pages/events-operations-get.js'), 1);
    server.import.post('/events/operations', () => import('./pages/events-operations-post.js'), 1);
  }
  server.register(OPERATIONS_SERVICE, service);
  runtime.pluginOrder.push(OPERATIONS_SERVICE);
}
