//client
import type { ProductionProcessScope } from './production.js';
import type { ConfigLoadOptions, TabularConfig } from './index.js';
import {
  type ProcessConfig,
  type ProcessName,
  withProcessProfile
} from './phases.js';
import { loadConfig } from './index.js';

//The process loader options contract shared by dedicated config modules
export type ProcessLoadOptions = Omit<ConfigLoadOptions, 'productionScope'> & {
  productionScope?: ProductionProcessScope,
};

/**
 * Return the production validation scope owned by one process profile.
 */
function defaultProductionScope(name: ProcessName): ProductionProcessScope {
  if (name === 'preflight') return 'all';
  if (name === 'worker') return 'worker';
  if (name === 'migrator') return 'migrator';
  return 'web';
}

/**
 * Load shared settings and attach the selected process lifecycle contract.
 */
export function loadProcessConfig<Name extends ProcessName>(
  name: Name,
  options: ProcessLoadOptions = {}
): ProcessConfig<TabularConfig, Name> {
  const { productionScope, ...sharedOptions } = options;
  return withProcessProfile(
    loadConfig({
      ...sharedOptions,
      productionScope: productionScope || defaultProductionScope(name)
    }),
    name
  );
}

