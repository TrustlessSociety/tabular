import { installSignalHandlers, startWeb } from '../bootstrap/application.js';
import { entrypointPaths } from '../bootstrap/entrypoint-paths.js';
import { writeLog } from '../bootstrap/logger.js';
import { loadDevelopmentConfig } from '../config/dev.js';
import { loadLiveConfig } from '../config/live.js';

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
