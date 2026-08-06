//The sse config contract exported for module callers
export type SseConfig = {
  route: string,
  heartbeatMs: number,
  replayLimit: number,
  clientQueueLimit: number,
  connectionLimit: number,
  pollMs: number,
};

/**
 * Parse a positive SSE limit or interval with an owned fallback.
 */
function positiveInteger(value: string | undefined, fallback: number, name: string) {
  //only an absent setting receives the default; invalid supplied values fail
  const parsed = typeof value === 'undefined' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

/**
 * Load bounded SSE replay, queue, connection, and heartbeat settings.
 */
export function loadSseConfig(env: NodeJS.ProcessEnv = process.env): SseConfig {
  //keep every capacity and interval strictly positive before startup
  return {
    route: '/events',
    heartbeatMs: positiveInteger(env.TABULAR_SSE_HEARTBEAT_MS, 15_000, 'TABULAR_SSE_HEARTBEAT_MS'),
    replayLimit: positiveInteger(env.TABULAR_SSE_REPLAY_LIMIT, 1_000, 'TABULAR_SSE_REPLAY_LIMIT'),
    clientQueueLimit: positiveInteger(
      env.TABULAR_SSE_CLIENT_QUEUE_LIMIT,
      256,
      'TABULAR_SSE_CLIENT_QUEUE_LIMIT'
    ),
    connectionLimit: positiveInteger(
      env.TABULAR_SSE_CONNECTION_LIMIT,
      1_000,
      'TABULAR_SSE_CONNECTION_LIMIT'
    ),
    pollMs: positiveInteger(env.TABULAR_SSE_POLL_MS, 250, 'TABULAR_SSE_POLL_MS')
  };
}
