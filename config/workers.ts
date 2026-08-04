export type WorkerConfig = {
  concurrency: number;
  claimBatchSize: number;
  leaseSeconds: number;
  shutdownTimeoutMs: number;
};

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = typeof value === 'undefined' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
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
