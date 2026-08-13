//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { RUNTIME_SERVICE } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { EXPLORER_SERVICE, type ExplorerPluginService } from '../helpers/service.js';
import { renderAuthenticationRequired, prepareProductPage } from '../../app/helpers/rendering.js';
import { authenticatedExplorerContext } from '../helpers/authenticated-context.js';
import { explorerPageData } from '../helpers/routes.js';

const browse: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const runtime = ctx.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const explorer = ctx.plugin<ExplorerPluginService>(EXPLORER_SERVICE);
  const context = await authenticatedExplorerContext(
    req.session(identity.cookieName()), identity, explorer
  );
  if (!context) return renderAuthenticationRequired(res, runtime);
  await prepareProductPage(
    res,
    runtime,
    explorerPageData(req.url, context.snapshot, context.identity, context.csrfToken)
  );
};

export default browse;
