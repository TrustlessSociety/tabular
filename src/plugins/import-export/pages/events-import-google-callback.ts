//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { IMPORT_EXPORT_SERVICE, type ImportExportPluginService } from '../helpers/service.js';
import { exactQuery, invalidSession, providerToken } from '../helpers/routes.js';

const importGoogleCallback: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const importExport = ctx.plugin<ImportExportPluginService>(IMPORT_EXPORT_SERVICE);
  exactQuery(req.url.searchParams, [
    'state', 'code', 'error', 'error_description', 'scope', 'authuser', 'prompt', 'hd'
  ]);
  const resumed = await identity.resumeBrowserSession(req.session(identity.cookieName()));
  if (!resumed) invalidSession();
  const result = await importExport.completeGoogleOAuth(resumed.principal, {
    state: providerToken(req.url.searchParams.get('state'), 'Google OAuth state', 512),
    ...(req.url.searchParams.get('code')
      ? { code: providerToken(req.url.searchParams.get('code'), 'Google OAuth code', 2_048) } : {}),
    ...(req.url.searchParams.get('error')
      ? { error: providerToken(req.url.searchParams.get('error'), 'Google OAuth error', 200) } : {})
  });
  const target = new URL(result.returnPath, 'http://tabular.invalid');
  target.searchParams.set('google', result.status);
  res.headers.set('Cache-Control', 'no-store, private');
  res.redirect(`${target.pathname}${target.search}`, 303);
};

export default importGoogleCallback;
