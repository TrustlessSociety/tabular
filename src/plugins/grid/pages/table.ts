//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { RUNTIME_SERVICE } from '../../../bootstrap/application.js';
import { EXPLORER_SERVICE, type ExplorerPluginService } from '../../explorer/helpers/service.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { renderAuthenticationRequired, prepareProductPage } from '../../app/helpers/rendering.js';
import { authenticatedExplorerContext } from '../../explorer/helpers/authenticated-context.js';

const table: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const runtime = ctx.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const explorer = ctx.plugin<ExplorerPluginService>(EXPLORER_SERVICE);
  exactPageQuery(req.url.searchParams);
  const context = await authenticatedExplorerContext(
    req.session(identity.cookieName()), identity, explorer
  );
  if (!context) return renderAuthenticationRequired(res, runtime);
  const folderSlug = req.url.searchParams.get('folder') || '';
  const folder = context.snapshot.folders.find((item) => item.slug === folderSlug);
  if (!folder) throw new ApplicationError('grid_folder_unavailable', 404, 'The requested folder is unavailable');
  const denied = Boolean(!folder.permissions.renameFile || !folder.permissions.configureFile);
  const requestedTable = req.url.searchParams.get('table') || '';
  const newFile = req.url.searchParams.get('new') === '1';
  const file = folder.files.find((candidate) => candidate.slug === requestedTable);
  if ((!newFile && !file) || (newFile && (
    requestedTable !== 'untitled-file' || !folder.permissions.createFile || Boolean(file)
  ))) {
    throw new ApplicationError('grid_file_unavailable', 404, 'The requested file is unavailable');
  }
  await prepareProductPage(res, runtime, {
    surface: 'table',
    route: {
      folder: folderSlug,
      table: requestedTable,
      newFile,
      ...(req.url.searchParams.get('view') ? { view: req.url.searchParams.get('view')! } : {}),
      ...(['views', 'create'].includes(req.url.searchParams.get('dialog') || '')
        ? { dialog: req.url.searchParams.get('dialog') as 'views' | 'create' } : {}),
      ...(denied ? { scenario: 'denied' as const } : {})
    },
    snapshot: context.snapshot,
    identity: context.identity,
    csrfToken: context.csrfToken
  });
};

function exactPageQuery(parameters: URLSearchParams) {
  const allowed = new Set(['folder', 'table', 'new', 'view', 'dialog']);
  if (
    [...parameters.keys()].some((key) => !allowed.has(key))
    || [...allowed].some((key) => parameters.getAll(key).length > 1)
    || (parameters.has('new') && parameters.get('new') !== '1')
  ) {
    throw new ApplicationError('invalid_grid_query', 400, 'The table page query is invalid');
  }
}

export default table;
