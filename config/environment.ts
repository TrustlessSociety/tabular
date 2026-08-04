export type AppEnvironment = 'development' | 'test' | 'production';

export type EnvironmentConfig = {
  mode: AppEnvironment;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  instanceId: string;
  publicOrigin?: string;
};

const MODES = new Set<AppEnvironment>(['development', 'test', 'production']);
const LOG_LEVELS = new Set<EnvironmentConfig['logLevel']>([
  'debug',
  'info',
  'warn',
  'error'
]);

export function loadEnvironmentConfig(
  env: NodeJS.ProcessEnv = process.env
): EnvironmentConfig {
  const mode = env.NODE_ENV || 'development';
  if (!MODES.has(mode as AppEnvironment)) {
    throw new Error(`Unsupported NODE_ENV ${JSON.stringify(mode)}`);
  }
  const logLevel = env.LOG_LEVEL || (mode === 'development' ? 'debug' : 'info');
  if (!LOG_LEVELS.has(logLevel as EnvironmentConfig['logLevel'])) {
    throw new Error(`Unsupported LOG_LEVEL ${JSON.stringify(logLevel)}`);
  }
  const publicOrigin = env.TABULAR_PUBLIC_ORIGIN || undefined;
  const instanceId = env.TABULAR_INSTANCE_ID || 'local';
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(instanceId)) {
    throw new Error('TABULAR_INSTANCE_ID must be a stable non-secret slug of at most 32 characters');
  }
  if (publicOrigin) {
    let parsed: URL;
    try {
      parsed = new URL(publicOrigin);
    } catch {
      throw new Error('TABULAR_PUBLIC_ORIGIN must be a valid URL origin');
    }
    if (
      publicOrigin !== parsed.origin
      || !['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
    ) {
      throw new Error('TABULAR_PUBLIC_ORIGIN must be exactly one canonical HTTP(S) origin');
    }
  }
  return {
    mode: mode as AppEnvironment,
    logLevel: logLevel as EnvironmentConfig['logLevel'],
    instanceId,
    publicOrigin
  };
}
