export type DatabaseConfig = {
  connectionId: string;
  webUrl?: string;
  migratorUrl?: string;
  workerUrl?: string;
  statementTimeoutMs: number;
  poolMaximum: number;
};

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = typeof value === 'undefined' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionId = env.TABULAR_DATABASE_CONNECTION_ID || 'local';
  if (!/^[a-z][a-z0-9_-]{0,62}$/.test(connectionId)) {
    throw new Error('TABULAR_DATABASE_CONNECTION_ID must be a stable non-secret slug');
  }
  return {
    connectionId,
    webUrl: env.TABULAR_WEB_DATABASE_URL || undefined,
    migratorUrl: env.TABULAR_MIGRATOR_DATABASE_URL || undefined,
    workerUrl: env.TABULAR_WORKER_DATABASE_URL || undefined,
    statementTimeoutMs: positiveInteger(
      env.TABULAR_STATEMENT_TIMEOUT_MS,
      10_000,
      'TABULAR_STATEMENT_TIMEOUT_MS'
    ),
    poolMaximum: positiveInteger(env.TABULAR_POOL_MAXIMUM, 10, 'TABULAR_POOL_MAXIMUM')
  };
}
