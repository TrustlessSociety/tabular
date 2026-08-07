//client
import type { ProcessConfig } from './phases.js';
import type { ProcessLoadOptions } from './process.js';
import type { TabularConfig } from './index.js';
import { loadProcessConfig } from './process.js';

//The worker configuration contract, limited to worker-owned resolution
export type WorkerProcessConfig = ProcessConfig<TabularConfig, 'worker'>;

/**
 * Load configuration for the dedicated operation worker process.
 */
export function loadWorkerProcessConfig(options: ProcessLoadOptions = {}) {
  return loadProcessConfig('worker', options);
}

