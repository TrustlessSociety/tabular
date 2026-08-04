import type { HttpServer } from '@stackpress/ingest/types';
import {
  APP_SERVICE,
  RUNTIME_SERVICE,
  type ApplicationRuntimeService,
  type AppPluginService
} from '../../bootstrap/application.js';
import { APP_ROUTES, registerAppRoutes } from './pages/routes.js';

export default function appPlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(APP_SERVICE)) {
    throw new Error(`Service already registered: ${APP_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  if (!runtime) throw new Error(`${RUNTIME_SERVICE} must register before ${APP_SERVICE}`);
  const name = server.config.get('app', 'name');
  if (name !== 'Tabular') throw new Error('Typed root configuration was not loaded');
  if (runtime.processKind === 'web') registerAppRoutes(server, runtime);
  const service: AppPluginService = {
    name: APP_SERVICE,
    configName: 'Tabular',
    routes: runtime.processKind === 'web' ? APP_ROUTES : []
  };
  server.register(APP_SERVICE, service);
  runtime.pluginOrder.push(APP_SERVICE);
}
