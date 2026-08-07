//client
import type { ProcessConfig } from './phases.js';
import type { ProcessLoadOptions } from './process.js';
import type { ProductionProcessScope } from './production.js';
import type { TabularConfig } from './index.js';
import { loadProcessConfig } from './process.js';

//The doctor configuration contract, retaining only the selected authority
export type DoctorConfig = ProcessConfig<TabularConfig, 'doctor'>;

//The accepted database authority scope for one doctor invocation
export type DoctorScope = Exclude<ProductionProcessScope, 'all'>;

/**
 * Load configuration for one scoped database doctor process.
 */
export function loadDoctorConfig(
  scope: DoctorScope,
  options: ProcessLoadOptions = {}
) {
  return loadProcessConfig('doctor', { ...options, productionScope: scope });
}

