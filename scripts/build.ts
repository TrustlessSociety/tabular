//client
import { createApplication } from '../src/bootstrap/application.js';
import { buildReactusArtifacts } from '../src/bootstrap/build.js';
import { resolveProcessPhases } from '../src/bootstrap/lifecycle.js';
import { loadBuildConfig } from '../src/config/build.js';

//The build profile bootstraps route registration without creating a renderer
//server, opening a pool, starting a worker, or applying migrations
const config = loadBuildConfig();
const application = await createApplication({
  processKind: 'web',
  config,
  loadArtifacts: false,
  createReactus: false
});

try {
  await resolveProcessPhases(application.app, 'build');
  const readiness = await application.runtime.resources.readiness();
  if (readiness.checks.length > 0) {
    throw new Error('Build process registered runtime resources');
  }
  const count = await buildReactusArtifacts(config, application.app);
  process.stdout.write(`Reactus built ${count} production artifacts.\n`);
} finally {
  await application.runtime.resources.close(1_000);
}
