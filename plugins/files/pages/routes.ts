//client
import type { ApplicationServer } from '../../../bootstrap/application.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { FilesPluginService } from '../helpers/service.js';
import { ApplicationError } from '../../../bootstrap/errors.js';

//The files routes value exported for module callers
export const FILES_ROUTES = ['/events/files'] as const;

/**
 * Registers Files-owned description routes.
 */
export function registerFilesRoutes(
  //Stackpress resolves installed services dynamically, so this route boundary
  // cannot name a complete static service map yet
  server: ApplicationServer,
  identity: IdentityPluginService,
  files: FilesPluginService
) {
  server.get('/events/files', async ({ req, res }) => {
    const resumed = await identity.resumeBrowserSession(
      req.session(identity.cookieName())
    );
    if (!resumed) {
      res.json({
        error: { code: 'invalid_session', message: 'The browser session is invalid' }
      }, 401);
      return;
    }
    const allowed = new Set(['fileId', 'ddlRequestId']);
    if (
      [...req.url.searchParams.keys()].some((key) => !allowed.has(key))
      || [...allowed].some((key) => req.url.searchParams.getAll(key).length > 1)
    ) {
      throw invalidQuery();
    }
    const fileId = req.url.searchParams.get('fileId');
    const ddlRequestId = req.url.searchParams.get('ddlRequestId');
    if (Boolean(fileId) === Boolean(ddlRequestId)) {
      throw invalidQuery();
    }
    const identifier = fileId || ddlRequestId;
    if (!identifier || !/^[A-Za-z0-9_.:-]{1,80}$/.test(identifier)) {
      throw invalidQuery();
    }
    res.headers.set('Cache-Control', 'no-store, private');
    res.headers.set('X-Tabular-CSRF', resumed.csrfToken);
    res.json({
      status: 'ok',
      data: ddlRequestId
        ? await files.status(resumed.principal, ddlRequestId)
        : await files.describe(resumed.principal, fileId!)
    });
  });
}

/**
 * Report the invalid query condition.
 */
function invalidQuery() {
  return new ApplicationError('invalid_query', 400, 'File query is invalid');
}
