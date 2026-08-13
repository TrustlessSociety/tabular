import { installSignalHandlers, startWeb } from '../../src/bootstrap/application.js';
import { entrypointPaths } from '../../src/bootstrap/entrypoint-paths.js';
import { writeLog } from '../../src/bootstrap/logger.js';
import { loadDevelopmentConfig } from '../../src/config/dev.js';
import { loadLiveConfig } from '../../src/config/live.js';

const { projectRoot, runtimeRoot } = entrypointPaths(import.meta.url);
const production = process.env.NODE_ENV === 'production';
const config = production
  ? loadLiveConfig({ projectRoot, runtimeRoot })
  : loadDevelopmentConfig({ projectRoot, runtimeRoot });
const portArgument = process.argv.indexOf('--port');
const hostArgument = process.argv.indexOf('--host');
const runtime = await startWeb({
  config,
  projectRoot,
  runtimeRoot,
  phaseProfile: production ? 'live' : 'development',
  port: portArgument >= 0 ? Number(process.argv[portArgument + 1]) : undefined,
  host: hostArgument >= 0 ? process.argv[hostArgument + 1] : undefined
});
installSignalHandlers(runtime);
writeLog('info', 'web_listening', {
  origin: runtime.origin,
  plugins: runtime.runtime.pluginOrder
});
