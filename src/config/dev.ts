//client
import type { ProcessConfig } from './phases.js';
import type { ProcessLoadOptions } from './process.js';
import type { TabularConfig } from './index.js';
import { loadProcessConfig } from './process.js';

//The development configuration contract, including its HTTP lifecycle phases
export type DevelopmentConfig = ProcessConfig<TabularConfig, 'development'>;

/**
 * Load configuration for the development web process.
 */
export function loadDevelopmentConfig(options: ProcessLoadOptions = {}) {
  return loadProcessConfig('development', options);
}

