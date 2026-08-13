//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { SAVED_VIEWS_SERVICE, type SavedViewsPluginService } from '../helpers/service.js';

const savedViewsGet: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const savedViews = ctx.plugin<SavedViewsPluginService>(SAVED_VIEWS_SERVICE);
  exactQuery(req.url.searchParams, ['fileId', 'viewId']);
  const resumed = await identity.resumeBrowserSession(req.session(identity.cookieName()));
  if (!resumed) invalidSession();
  res.headers.set('Cache-Control', 'no-store, private');
  res.headers.set('X-Tabular-CSRF', resumed.csrfToken);
  const viewId = req.url.searchParams.get('viewId');
  if (viewId) {
    res.json({ status: 'ok', data: await savedViews.get(resumed.principal, bounded(viewId, 'view ID', 80)) });
    return;
  }
  const fileId = req.url.searchParams.get('fileId');
  res.json({ status: 'ok', data: await savedViews.list(resumed.principal, fileId ? [bounded(fileId, 'file ID', 80)] : undefined) });
};

function exactQuery(parameters: URLSearchParams, allowed: string[]) {
  if ([...parameters.keys()].some((key) => !allowed.includes(key))) {
    throw new ApplicationError('invalid_query', 400, 'The saved-view query is invalid');
  }
}

function bounded(value: string, label: string, maximum: number) {
  if (!value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ApplicationError('invalid_query', 400, `The ${label} is invalid`);
  }
  return value;
}

function invalidSession(): never {
  throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
}

export default savedViewsGet;
