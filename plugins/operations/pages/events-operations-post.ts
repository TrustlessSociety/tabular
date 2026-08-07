//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { OPERATIONS_SERVICE, type OperationsPluginService } from '../helpers/service.js';
import { operationAction, requireJson, unavailable } from '../helpers/routes.js';
import { presentOperationActivity } from '../helpers/presenter.js';

const eventsOperationsPost: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const operations = ctx.plugin<OperationsPluginService>(OPERATIONS_SERVICE);
  requireJson(req.headers.get('content-type'));
  const principal = await identity.requireBrowserMutation({
    cookieToken: req.session(identity.cookieName()),
    csrfToken: req.headers.get('x-tabular-csrf'),
    origin: req.headers.get('origin')
  });
  const action = operationAction(req.data.get('action'));
  res.headers.set('Cache-Control', 'no-store, private');
  if (action.type === 'operations.retention.apply') {
    await operations.retention(principal, {
      retentionDays: action.retentionDays,
      limit: action.limit
    });
    res.json({ status: 'ok', data: { retentionDays: action.retentionDays } });
    return;
  }
  const operation = action.type === 'operation.retry'
    ? await operations.retry(principal, action.jobId)
    : action.type === 'operation.cancel'
      ? await operations.cancel(principal, action.jobId)
      : action.type === 'operation.acknowledge'
        ? await operations.acknowledge(principal, action.jobId)
        : await operations.markRead(principal, action.jobId);
  if (!operation) unavailable();
  res.json({ status: 'ok', data: presentOperationActivity(operation) });
};

export default eventsOperationsPost;
