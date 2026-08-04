import type { HttpServer } from '@stackpress/ingest/types';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import { servePublicArtifact } from '../helpers/assets.js';

export const APP_ROUTES = [
  '/healthz',
  '/readyz',
  '/client/**',
  '/assets/**',
  '/favicon.ico',
  '/**'
] as const;

/** Registers only application-shell infrastructure and the final fallback. */
export function registerAppRoutes(
  server: HttpServer<any, any>,
  runtime: ApplicationRuntimeService
) {
  server.get('/healthz', ({ res }) => {
    res.headers.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', phase: runtime.lifecycle.phase });
  });

  server.get('/readyz', async ({ res }) => {
    const resources = await runtime.resources.readiness();
    const ready = runtime.lifecycle.phase === 'ready' && resources.ready;
    res.headers.set('Cache-Control', 'no-store');
    res.json(
      { status: ready ? 'ready' : 'not-ready', phase: runtime.lifecycle.phase, resources },
      ready ? 200 : 503
    );
  });

  server.get('/client/**', async ({ req, res }) => {
    await servePublicArtifact(req.url.pathname, res, runtime);
  });

  server.get('/assets/**', async ({ req, res }) => {
    await servePublicArtifact(req.url.pathname, res, runtime);
  });

  server.get('/favicon.ico', ({ res }) => {
    res.set('image/x-icon', Buffer.alloc(0), 204);
  });

  server.get('/**', ({ res }) => {
    if (!res.code) {
      res.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    }
  });
}
