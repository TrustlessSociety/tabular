import type { HttpServer } from '@stackpress/ingest/types';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { CatalogPluginService } from '../helpers/service.js';

export const CATALOG_ROUTES = ['/api/catalog'] as const;

export function registerCatalogRoutes(
  server: HttpServer<any, any>,
  identity: IdentityPluginService,
  catalog: CatalogPluginService
) {
  server.get('/api/catalog', async ({ req, res }) => {
    res.headers.set('Cache-Control', 'no-store, private');
    const principal = await identity.authenticateBrowserSession(
      req.session(identity.cookieName())
    );
    if (!principal) {
      res.json({ error: { code: 'invalid_session', message: 'The browser session is invalid' } }, 401);
      return;
    }
    res.json(await catalog.discover(principal));
  });
}
