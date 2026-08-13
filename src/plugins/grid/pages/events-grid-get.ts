//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { EXPLORER_SERVICE, type ExplorerPluginService } from '../../explorer/helpers/service.js';
import { FILES_SERVICE, type FilesPluginService } from '../../files/helpers/service.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { SAVED_VIEWS_SERVICE, type SavedViewsPluginService } from '../../saved-views/helpers/service.js';
import { CAPABILITY_SERVICE, type CapabilityPluginService } from '../../capability/helpers/service.js';
import { GRID_SERVICE, type GridPluginService } from '../helpers/service.js';
import { WebCapabilityAdapter } from '../../capability/events/web-adapter.js';
import { authenticatedExplorerContext } from '../../explorer/helpers/authenticated-context.js';
import { resolveGridReadQuery } from '../helpers/routes.js';

const eventsGridGet: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const explorer = ctx.plugin<ExplorerPluginService>(EXPLORER_SERVICE);
  const capability = ctx.plugin<CapabilityPluginService>(CAPABILITY_SERVICE);
  const files = ctx.plugin<FilesPluginService>(FILES_SERVICE);
  const savedViews = ctx.plugin<SavedViewsPluginService>(SAVED_VIEWS_SERVICE);
  const grid = ctx.plugin<GridPluginService>(GRID_SERVICE);
  exactGridQuery(req.url.searchParams);
  const context = await authenticatedExplorerContext(
    req.session(identity.cookieName()), identity, explorer
  );
  if (!context) {
    res.json({ status: 'error', error: { code: 'invalid_session', message: 'The browser session is invalid' } }, 401);
    return;
  }
  res.headers.set('Cache-Control', 'no-store, private');
  res.headers.set('X-Tabular-CSRF', context.csrfToken);
  const folder = context.snapshot.folders.find((item) => item.slug === req.url.searchParams.get('folder'));
  const file = folder?.files.find((item) => item.slug === req.url.searchParams.get('table'));
  if (!file || file.readOnly) {
    res.json({
      status: 'unavailable',
      reason: file?.readOnly ? 'This PostgreSQL object is read-only.' : 'The requested file is unavailable.'
    }, file ? 409 : 404);
    return;
  }
  const query = await resolveGridReadQuery(
    req.url.searchParams, context.principal, file.id, files, savedViews
  );
  const resource = await grid.load(context.principal, file.id, query);
  const draftResponse = resource
    ? await new WebCapabilityAdapter(identity, capability).invoke(context.principal, {
      action: { type: 'draft.list', fileId: file.id }
    })
    : undefined;
  const drafts = draftResponse?.status === 'ok' && Array.isArray(draftResponse.data)
    ? draftResponse.data
    : [];
  res.json(resource
    ? { status: 'ok', data: { ...resource, drafts } }
    : { status: 'unavailable', reason: 'This table needs a supported non-null primary or unique key before editing.' }, resource ? 200 : 409);
};

function exactGridQuery(parameters: URLSearchParams) {
  const allowed = new Set(['folder', 'table', 'viewId', 'expectedViewVersion', 'sortColumnId', 'sortDirection']);
  if ([...parameters.keys()].some((key) => !allowed.has(key))
    || [...allowed].some((key) => parameters.getAll(key).length > 1)) {
    throw new Error('The grid query is invalid');
  }
}

export default eventsGridGet;
