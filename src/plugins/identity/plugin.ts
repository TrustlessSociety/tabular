//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { DatabasePluginService } from '../database/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { DATABASE_SERVICE } from '../database/helpers/service.js';
import { IDENTITY_SERVICE, IdentityPluginService } from './helpers/service.js';

export const IDENTITY_ROUTES = [
  '/auth/login',
  '/auth/account',
  '/auth/session',
  '/auth/session/rotate',
  '/auth/logout'
] as const;

/**
 * Register the identity plugin with the application server.
 */
export default function identityPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(IDENTITY_SERVICE)) {
    throw new Error(`Service already registered: ${IDENTITY_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const database = server.plugin<DatabasePluginService>(DATABASE_SERVICE);
  if (!runtime || !database) {
    throw new Error(`${DATABASE_SERVICE} must be registered before ${IDENTITY_SERVICE}`);
  }
  const service = new IdentityPluginService(database, runtime.config, runtime.developmentLogin);
  if (runtime.processKind === 'web') {
    server.import.get('/auth/login', () => import('./pages/login-get.js'), 1);
    server.view.get('/auth/login', '@/src/plugins/identity/views/login');
    server.import.post('/auth/login', () => import('./pages/login-post.js'), 1);
    server.view.post('/auth/login', '@/src/plugins/identity/views/login');
    server.import.get('/auth/account', () => import('./pages/account.js'), 1);
    server.view.get('/auth/account', '@/src/plugins/identity/views/account');
    server.import.get('/auth/session', () => import('./pages/session-get.js'), 1);
    server.import.post('/auth/session/rotate', () => import('./pages/session-rotate.js'), 1);
    server.import.post('/auth/logout', () => import('./pages/logout.js'), 1);
  }
  server.register(IDENTITY_SERVICE, service);
  runtime.pluginOrder.push(IDENTITY_SERVICE);
}
