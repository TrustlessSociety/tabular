//The worker config contract exported for module callers
export type WorkerConfig = {
  concurrency: number,
  claimBatchSize: number,
  leaseSeconds: number,
  shutdownTimeoutMs: number,
};

/**
 * Parse a positive worker limit or duration with an owned fallback.
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
 * Load worker concurrency, claim, lease, and shutdown boundaries.
 */
export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  //centralized parsing keeps every worker process on identical positive bounds
  return {
    concurrency: positiveInteger(env.TABULAR_WORKER_CONCURRENCY, 2, 'TABULAR_WORKER_CONCURRENCY'),
    claimBatchSize: positiveInteger(env.TABULAR_WORKER_BATCH_SIZE, 25, 'TABULAR_WORKER_BATCH_SIZE'),
    leaseSeconds: positiveInteger(env.TABULAR_WORKER_LEASE_SECONDS, 30, 'TABULAR_WORKER_LEASE_SECONDS'),
    shutdownTimeoutMs: positiveInteger(
      env.TABULAR_WORKER_SHUTDOWN_TIMEOUT_MS,
      10_000,
      'TABULAR_WORKER_SHUTDOWN_TIMEOUT_MS'
    )
  };
}
