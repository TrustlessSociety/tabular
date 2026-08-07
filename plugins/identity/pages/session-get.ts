//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../helpers/service.js';

const sessionGet: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  res.headers.set('Cache-Control', 'no-store, private');
  const resumed = await identity.resumeBrowserSession(
    req.session(identity.cookieName())
  );
  if (!resumed) {
    res.json({ authenticated: false }, 401);
    return;
  }
  res.json({
    authenticated: true,
    csrfToken: resumed.csrfToken,
    identity: {
      id: resumed.principal.identityId,
      ...(resumed.principal.displayName
        ? { displayName: resumed.principal.displayName } : {})
    },
    expires: {
      idle: resumed.principal.idleExpiresAt.toISOString(),
      absolute: resumed.principal.absoluteExpiresAt.toISOString()
    }
  });
};

export default sessionGet;
