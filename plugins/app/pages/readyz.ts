//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { RUNTIME_SERVICE } from '../../../bootstrap/application.js';

const readyz: ApplicationHttpAction = async ({ res, ctx }) => {
  const runtime = ctx.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const resources = await runtime.resources.readiness();
  const ready = runtime.lifecycle.phase === 'ready' && resources.ready;
  res.headers.set('Cache-Control', 'no-store');
  res.json(
    { status: ready ? 'ready' : 'not-ready', phase: runtime.lifecycle.phase, resources },
    ready ? 200 : 503
  );
};

export default readyz;
