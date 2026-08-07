//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../helpers/service.js';

const account: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const resumed = await identity.resumeBrowserSession(
    req.session(identity.cookieName())
  );
  if (!resumed) {
    res.redirect('/auth/login', 303);
    return;
  }
  const displayName = resumed.principal.displayName || 'PostgreSQL user';
  res.data.set({
    displayName,
    identity: { displayName },
    csrfToken: resumed.csrfToken
  });
};

export default account;
