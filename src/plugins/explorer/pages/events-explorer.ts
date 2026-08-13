//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { EXPLORER_SERVICE, type ExplorerPluginService } from '../helpers/service.js';
import { resolveExplorerAction } from '../helpers/routes.js';

const eventsExplorer: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const explorer = ctx.plugin<ExplorerPluginService>(EXPLORER_SERVICE);
  requireJson(req.headers.get('content-type'));
  const principal = await identity.requireBrowserMutation({
    cookieToken: req.session(identity.cookieName()),
    csrfToken: req.headers.get('x-tabular-csrf'),
    origin: req.headers.get('origin')
  });
  const snapshot = await explorer.discover(principal);
  const action = resolveExplorerAction(req.data.get('action'), snapshot);
  res.headers.set('Cache-Control', 'no-store, private');
  res.json(await explorer.dispatch(principal, action));
};

function requireJson(contentType: string | string[] | undefined) {
  if (
    typeof contentType !== 'string'
    || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)
  ) {
    throw new Error('Explorer actions require JSON');
  }
}

export default eventsExplorer;
