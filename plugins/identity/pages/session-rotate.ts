//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../helpers/service.js';
import { requireJson } from '../helpers/routes.js';

const sessionRotate: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  requireJson(req.headers.get('content-type'));
  const rotated = await identity.rotateBrowserSession({
    cookieToken: req.session(identity.cookieName()),
    csrfToken: req.headers.get('x-tabular-csrf'),
    origin: req.headers.get('origin')
  }, res);
  res.json({
    csrfToken: rotated.csrfToken,
    expires: {
      idle: rotated.principal.idleExpiresAt.toISOString(),
      absolute: rotated.principal.absoluteExpiresAt.toISOString()
    }
  });
};

export default sessionRotate;
