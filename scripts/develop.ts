//client
import { installSignalHandlers, startWeb } from '../bootstrap/application.js';
import { entrypointPaths } from '../bootstrap/entrypoint-paths.js';
import { writeLog } from '../bootstrap/logger.js';
import { loadDevelopmentConfig } from '../config/dev.js';
import { createPGliteDevelopmentRuntime } from './develop-pglite.js';

const { projectRoot, runtimeRoot } = entrypointPaths(import.meta.url);
const portArgument = process.argv.indexOf('--port');
const hostArgument = process.argv.indexOf('--host');
const host = hostArgument >= 0
  ? process.argv[hostArgument + 1]
  : process.env.TABULAR_HOST || '127.0.0.1';
const port = portArgument >= 0
  ? Number(process.argv[portArgument + 1])
  : Number(process.env.PORT || process.env.TABULAR_PORT || 3000);
const environment = {
  ...process.env,
  NODE_ENV: 'development',
  TABULAR_PUBLIC_ORIGIN: process.env.TABULAR_PUBLIC_ORIGIN || `http://${host}:${port}`
};
const config = loadDevelopmentConfig({
  env: environment,
  projectRoot,
  runtimeRoot
});
const usePGliteDevelopment = !config.database.webUrl;
const pglite = usePGliteDevelopment
  ? await createPGliteDevelopmentRuntime()
  : undefined;

try {
  //The source entrypoint injects PGlite only after the development config has
  // proved that no web PostgreSQL URL was supplied.
  const runtime = await startWeb({
    config,
    projectRoot,
    runtimeRoot,
    phaseProfile: 'development',
    port,
    host,
    developmentDatabase: pglite?.backend,
    developmentLogin: pglite?.login
  });
  installSignalHandlers(runtime);
  writeLog('info', 'web_listening', {
    origin: runtime.origin,
    database: pglite ? 'pglite-development' : 'postgresql',
    plugins: runtime.runtime.pluginOrder
  });
} catch (error) {
  await pglite?.close();
  throw error;
}
