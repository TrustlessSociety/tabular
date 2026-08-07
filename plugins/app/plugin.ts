//client
import { serve } from 'reactus';
import type {
  ApplicationRuntimeService,
  ApplicationServer,
  AppPluginService
} from '../../bootstrap/application.js';
import { loadArtifactManifest } from '../../bootstrap/artifacts.js';
import { APP_SERVICE, RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { renderRegisteredView } from './helpers/rendering.js';

//The app owns only shell infrastructure, static delivery, and the fallback.
export const APP_ROUTES = [
  '/healthz',
  '/readyz',
  '/client/**',
  '/assets/**',
  '/styles/**',
  '/favicon.ico',
  '/**'
] as const;

/**
 * Register the app plugin with the application server.
 */
export default async function appPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(APP_SERVICE)) {
    throw new Error(`Service already registered: ${APP_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  if (!runtime) throw new Error(`${RUNTIME_SERVICE} must register before ${APP_SERVICE}`);
  const name = server.config.get('app', 'name');
  if (name !== 'Tabular') throw new Error('Typed root configuration was not loaded');

  //Reactus and its verified artifact manifest belong to the app boundary. The
  // bootstrap only tells this plugin which process-safe capabilities to use.
  if (runtime.processKind === 'web' && runtime.rendering.loadArtifacts) {
    runtime.artifacts = await loadArtifactManifest(
      runtime.config.paths.projectRoot,
      runtime.config.reactus.manifestPath,
      runtime.config.reactus
    );
  }
  if (runtime.processKind === 'web' && runtime.rendering.createReactus) {
    runtime.reactus = serve({
      cwd: runtime.config.paths.projectRoot,
      clientRoute: runtime.config.reactus.clientRoute,
      cssRoute: runtime.config.reactus.assetRoute,
      pagePath: runtime.config.reactus.pagePath
    });
  }
  if (runtime.processKind === 'web') {
    //Reactus view actions run after their matching lazy page handler and read
    //only the response data prepared by that handler.
    server.view.engine = async (entry, { req, res }) => {
      await renderRegisteredView(entry, req, res, runtime);
    };

    //The app infrastructure keeps the same route behavior while preserving
    //one anonymous lazy import boundary for every page file.
    server.import.get('/healthz', () => import('./pages/healthz.js'), 1);
    server.import.get('/readyz', () => import('./pages/readyz.js'), 1);
    server.import.get('/client/**', () => import('./pages/client.js'), 1);
    server.import.get('/assets/**', () => import('./pages/assets.js'), 1);
    server.import.get('/styles/**', () => import('./pages/assets.js'), 1);
    server.import.get('/favicon.ico', () => import('./pages/favicon.js'), 1);
    server.import.get('/**', () => import('./pages/not-found.js'));
  }
  const service: AppPluginService = {
    name: APP_SERVICE,
    configName: 'Tabular',
    routes: runtime.processKind === 'web' ? APP_ROUTES : []
  };
  server.register(APP_SERVICE, service);
  runtime.pluginOrder.push(APP_SERVICE);
}
