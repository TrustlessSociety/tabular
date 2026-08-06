//The database config contract exported for module callers
export type DatabaseConfig = {
  connectionId: string,
  webUrl?: string,
  migratorUrl?: string,
  workerUrl?: string,
  statementTimeoutMs: number,
  poolMaximum: number,
};

/**
 * Return the positive integer result.
 */
function positiveInteger(value: string | undefined, fallback: number, name: string) {
  //use the owned default only when the environment did not provide a value
  const parsed = typeof value === 'undefined' ? fallback : Number(value);

  //reject coercions, fractions, zero, and negative values at the config edge
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

/**
 * Load and validate the database authority and pool configuration.
 */
export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  //keep the connection identifier stable and non-secret because it crosses
  // logs, catalog records, and browser-facing authority snapshots
  const connectionId = env.TABULAR_DATABASE_CONNECTION_ID || 'local';
  if (!/^[a-z][a-z0-9_-]{0,62}$/.test(connectionId)) {
    throw new Error('TABULAR_DATABASE_CONNECTION_ID must be a stable non-secret slug');
  }

  //return role-specific URLs unchanged; downstream pools own parsing and use
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
