//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../helpers/service.js';

const loginGet: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  if (await identity.authenticateBrowserSession(req.session(identity.cookieName()))) {
    res.redirect('/', 303);
    return;
  }
  res.data.set({ failed: false });
};

export default loginGet;
