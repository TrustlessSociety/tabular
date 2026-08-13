//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { OPERATIONS_SERVICE, type OperationsPluginService } from '../helpers/service.js';
import { exactQuery, invalidSession, jobId, unavailable } from '../helpers/routes.js';
import { presentOperationActivity, presentOperationList } from '../helpers/presenter.js';

const eventsOperationsGet: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const operations = ctx.plugin<OperationsPluginService>(OPERATIONS_SERVICE);
  exactQuery(req.url.searchParams, ['jobId']);
  const resumed = await identity.resumeBrowserSession(req.session(identity.cookieName()));
  if (!resumed) invalidSession();
  res.headers.set('Cache-Control', 'no-store, private');
  res.headers.set('X-Tabular-CSRF', resumed.csrfToken);
  const requested = req.url.searchParams.get('jobId');
  if (requested) {
    const operation = await operations.get(resumed.principal, jobId(requested));
    if (!operation) unavailable();
    res.json({ status: 'ok', data: presentOperationActivity(operation) });
    return;
  }
  res.json({
    status: 'ok',
    data: presentOperationList(await operations.list(resumed.principal, { limit: 100 }))
  });
};

export default eventsOperationsGet;
