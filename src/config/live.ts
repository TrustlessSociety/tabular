//client
import type { ProcessConfig } from './phases.js';
import type { ProcessLoadOptions } from './process.js';
import type { TabularConfig } from './index.js';
import { loadProcessConfig } from './process.js';

//The live configuration contract, including its production web phases
export type LiveConfig = ProcessConfig<TabularConfig, 'live'>;

/**
 * Load configuration for the verified live web process.
 */
export function loadLiveConfig(options: ProcessLoadOptions = {}) {
  return loadProcessConfig('live', options);
}

