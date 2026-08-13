//client
import type { ProcessConfig } from './phases.js';
import type { ProcessLoadOptions } from './process.js';
import type { TabularConfig } from './index.js';
import { loadProcessConfig } from './process.js';

//The preflight configuration contract, which validates all three authorities
export type PreflightConfig = ProcessConfig<TabularConfig, 'preflight'>;

/**
 * Load configuration for deployment preflight without opening resources.
 */
export function loadPreflightConfig(options: ProcessLoadOptions = {}) {
  return loadProcessConfig('preflight', options);
}

