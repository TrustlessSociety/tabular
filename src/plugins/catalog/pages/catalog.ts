//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { CATALOG_SERVICE, type CatalogPluginService } from '../helpers/service.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';

const catalog: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const catalogService = ctx.plugin<CatalogPluginService>(CATALOG_SERVICE);
  res.headers.set('Cache-Control', 'no-store, private');
  const principal = await identity.authenticateBrowserSession(
    req.session(identity.cookieName())
  );
  if (!principal) {
    res.json({ error: { code: 'invalid_session', message: 'The browser session is invalid' } }, 401);
    return;
  }
  res.json(await catalogService.discover(principal));
};

export default catalog;
