//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../helpers/service.js';
import { loginCredentials, requireForm } from '../helpers/routes.js';

const loginPost: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  identity.requireLoginOrigin(req.headers.get('origin'));
  try {
    requireForm(req.headers.get('content-type'));
    const credentials = loginCredentials(
      req.data.get('username'),
      req.data.get('password')
    );
    await identity.loginWithPostgreSqlCredentials({
      ...credentials,
      origin: req.headers.get('origin')
    }, res);
    res.redirect('/', 303);
  } catch (error) {
    if (error instanceof ApplicationError && error.errorCode === 'invalid_origin') {
      throw error;
    }
    res.statusCode(401);
    res.data.set({ failed: true });
  }
};

export default loginPost;
