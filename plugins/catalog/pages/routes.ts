//client
import type { ApplicationServer } from '../../../bootstrap/application.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { CatalogPluginService } from '../helpers/service.js';

//The catalog routes value exported for module callers
export const CATALOG_ROUTES = ['/api/catalog'] as const;

/**
 * Register the catalog routes.
 */
export function registerCatalogRoutes(
  //Stackpress resolves installed services dynamically, so this route boundary
  // cannot name a complete static service map yet
  server: ApplicationServer,
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
