//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { RUNTIME_SERVICE } from '../../../bootstrap/application.js';

const healthz: ApplicationHttpAction = ({ res, ctx }) => {
  const runtime = ctx.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  res.headers.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', phase: runtime.lifecycle.phase });
};

export default healthz;
