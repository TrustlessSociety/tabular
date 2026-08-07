//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { RUNTIME_SERVICE } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { OPERATIONS_SERVICE, type OperationsPluginService } from '../helpers/service.js';
import { prepareProductPage } from '../../app/helpers/rendering.js';
import { displayConnectionName, exactQuery } from '../helpers/routes.js';
import { presentOperationList } from '../helpers/presenter.js';

const systemActivity: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const runtime = ctx.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const operations = ctx.plugin<OperationsPluginService>(OPERATIONS_SERVICE);
  exactQuery(req.url.searchParams, []);
  const resumed = await identity.resumeBrowserSession(req.session(identity.cookieName()));
  if (!resumed) {
    await prepareProductPage(res, runtime, { surface: 'auth-required' }, 401);
    return;
  }
  const snapshot = await operations.list(resumed.principal, { limit: 100 });
  await prepareProductPage(res, runtime, {
    surface: 'activity',
    connectionDisplayName: displayConnectionName(resumed.principal.connectionId),
    identity: { displayName: resumed.principal.displayName || resumed.principal.identityId },
    snapshot: presentOperationList(snapshot),
    csrfToken: resumed.csrfToken
  });
};

export default systemActivity;
