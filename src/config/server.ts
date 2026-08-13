//The server config contract exported for module callers
export type ServerConfig = {
  host: string,
  port: number,
  shutdownTimeoutMs: number,
  requestTimeoutMs: number,
  headersTimeoutMs: number,
  keepAliveTimeoutMs: number,
  maxRequestBodyBytes: number,
};

/**
 * Parse one bounded integer environment setting or use its owned default.
 */
function integerValue(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number
) {
  //preserve an explicit zero when the setting permits ephemeral port binding
  const parsed = typeof value === 'undefined' ? fallback : Number(value);

  //reject implicit coercions and values below the setting-specific floor
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

/**
 * Load HTTP listener, timeout, and request-size configuration.
 */
export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  //parse every numeric boundary through the same strict integer helper
  return {
    host: env.TABULAR_HOST || '127.0.0.1',
    port: integerValue(env.PORT || env.TABULAR_PORT, 3000, 'TABULAR_PORT', 0),
    shutdownTimeoutMs: integerValue(
      env.TABULAR_SHUTDOWN_TIMEOUT_MS,
      10_000,
      'TABULAR_SHUTDOWN_TIMEOUT_MS',
      100
    ),
    requestTimeoutMs: integerValue(
      env.TABULAR_REQUEST_TIMEOUT_MS,
      30_000,
      'TABULAR_REQUEST_TIMEOUT_MS',
      1_000
    ),
    headersTimeoutMs: integerValue(
      env.TABULAR_HEADERS_TIMEOUT_MS,
      15_000,
      'TABULAR_HEADERS_TIMEOUT_MS',
      1_000
    ),
    keepAliveTimeoutMs: integerValue(
      env.TABULAR_KEEP_ALIVE_TIMEOUT_MS,
      5_000,
      'TABULAR_KEEP_ALIVE_TIMEOUT_MS',
      100
    ),
    maxRequestBodyBytes: integerValue(
      env.TABULAR_MAX_REQUEST_BODY_BYTES,
      1_048_576,
      'TABULAR_MAX_REQUEST_BODY_BYTES',
      1_024
    )
  };
}
