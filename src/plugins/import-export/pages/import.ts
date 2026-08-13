//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { EXPLORER_SERVICE, type ExplorerPluginService } from '../../explorer/helpers/service.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { RUNTIME_SERVICE } from '../../../bootstrap/application.js';
import { prepareProductPage, renderAuthenticationRequired } from '../../app/helpers/rendering.js';
import { authenticatedExplorerContext } from '../../explorer/helpers/authenticated-context.js';
import { exactQuery } from '../helpers/routes.js';

const importPage: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const runtime = ctx.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const explorer = ctx.plugin<ExplorerPluginService>(EXPLORER_SERVICE);
  exactQuery(req.url.searchParams, ['folder']);
  const context = await authenticatedExplorerContext(
    req.session(identity.cookieName()), identity, explorer
  );
  if (!context) return renderAuthenticationRequired(res, runtime);
  const requestedFolder = req.url.searchParams.get('folder');
  const folder = context.snapshot.folders.find((candidate) => candidate.slug === requestedFolder);
  if (!requestedFolder || !folder) {
    throw new ApplicationError(
      'import_folder_unavailable',
      404,
      'The requested import folder is unavailable'
    );
  }
  await prepareProductPage(res, runtime, {
    surface: 'import-entry',
    route: { folder: folder.slug },
    snapshot: context.snapshot,
    identity: context.identity,
    csrfToken: context.csrfToken
  });
};

export default importPage;
