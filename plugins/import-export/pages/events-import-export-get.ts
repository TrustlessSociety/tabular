//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { IMPORT_EXPORT_SERVICE, type ImportExportPluginService } from '../helpers/service.js';
import { exactQuery, invalid, invalidSession } from '../helpers/routes.js';

const importExportGet: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const importExport = ctx.plugin<ImportExportPluginService>(IMPORT_EXPORT_SERVICE);
  exactQuery(req.url.searchParams, ['importId', 'googleAvailability']);
  const resumed = await identity.resumeBrowserSession(req.session(identity.cookieName()));
  if (!resumed) invalidSession();
  res.headers.set('Cache-Control', 'no-store, private');
  res.headers.set('X-Tabular-CSRF', resumed.csrfToken);
  if (req.url.searchParams.get('googleAvailability') === '1') {
    res.json({ status: 'ok', data: importExport.googleSheetsAvailability() });
    return;
  }
  const importId = req.url.searchParams.get('importId');
  if (!importId) invalid('Import identity is required');
  res.json({ status: 'ok', data: await importExport.get(resumed.principal, importId) });
};

export default importExportGet;
