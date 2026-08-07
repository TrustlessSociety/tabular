//client
import type { ProcessConfig } from './phases.js';
import type { ProcessLoadOptions } from './process.js';
import type { TabularConfig } from './index.js';
import { loadProcessConfig } from './process.js';

//The build configuration contract, including only build lifecycle metadata
export type BuildConfig = ProcessConfig<TabularConfig, 'build'>;

/**
 * Load configuration for the side-effect-free Reactus build process.
 */
export function loadBuildConfig(options: ProcessLoadOptions = {}) {
  return loadProcessConfig('build', options);
}

