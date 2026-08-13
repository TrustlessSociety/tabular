//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../helpers/service.js';
import { isFormContentType, requireJson } from '../helpers/routes.js';

const logout: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const contentType = req.headers.get('content-type');
  const isForm = isFormContentType(contentType);
  if (!isForm) requireJson(contentType);
  await identity.logoutBrowserSession({
    cookieToken: req.session(identity.cookieName()),
    csrfToken: isForm
      ? req.data.get('csrfToken') as string | string[] | undefined
      : req.headers.get('x-tabular-csrf'),
    origin: req.headers.get('origin')
  });
  identity.clearSessionCookie(res);
  if (isForm) res.redirect('/auth/login', 303);
  else res.json({ loggedOut: true });
};

export default logout;
