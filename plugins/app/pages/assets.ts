//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { RUNTIME_SERVICE } from '../../../bootstrap/application.js';
import { servePublicArtifact } from '../helpers/assets.js';

const assets: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const runtime = ctx.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  await servePublicArtifact(req.url.pathname, res, runtime);
};

export default assets;
