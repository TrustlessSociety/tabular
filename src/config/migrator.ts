//client
import type { ProcessConfig } from './phases.js';
import type { ProcessLoadOptions } from './process.js';
import type { TabularConfig } from './index.js';
import { loadProcessConfig } from './process.js';

//The migrator configuration contract, limited to migration and optional jobs
export type MigratorConfig = ProcessConfig<TabularConfig, 'migrator'>;

/**
 * Load configuration for the deployment-only migrator process.
 */
export function loadMigratorConfig(options: ProcessLoadOptions = {}) {
  return loadProcessConfig('migrator', options);
}

