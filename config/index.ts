//node
import path from 'node:path';

//client
import type { DatabaseConfig } from './database.js';
import type { EnvironmentConfig } from './environment.js';
import type { ProductionProcessScope } from './production.js';
import type { ReactusConfig } from './reactus.js';
import type { ServerConfig } from './server.js';
import type { SessionConfig } from './sessions.js';
import type { SseConfig } from './sse.js';
import type { WorkerConfig } from './workers.js';
import { loadDatabaseConfig } from './database.js';
import { loadEnvironmentConfig } from './environment.js';
import { productionConfigurationIssues, productionValidation } from './production.js';
import { loadReactusConfig } from './reactus.js';
import { loadServerConfig } from './server.js';
import { loadSessionConfig } from './sessions.js';
import { loadSseConfig } from './sse.js';
import { loadWorkerConfig } from './workers.js';

//The tabular config contract exported for module callers
export type TabularConfig = {
  app: {
    name: 'Tabular',
    packageName: '@trustless/tabular',
    version: string,
  },
  paths: {
    projectRoot: string,
    runtimeRoot: string,
  },
  environment: EnvironmentConfig,
  server: ServerConfig,
  database: DatabaseConfig,
  reactus: ReactusConfig,
  sessions: SessionConfig,
  sse: SseConfig,
  workers: WorkerConfig,
  production: typeof productionValidation,
  productionIssues: string[],
};

/**
 * Compose and validate the complete application configuration.
 */
export function loadConfig(options: {
  env?: NodeJS.ProcessEnv,
  projectRoot?: string,
  runtimeRoot?: string,
  version?: string,
  productionScope?: ProductionProcessScope,
} = {}): TabularConfig {
  //resolve caller overrides once so every nested loader observes one root set
  const env = options.env || process.env;
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const runtimeRoot = path.resolve(options.runtimeRoot || projectRoot);

  //load the related boundaries before assembling the immutable config shape
  const environment = loadEnvironmentConfig(env);
  const database = loadDatabaseConfig(env);
  const sessions = loadSessionConfig(env, environment.mode);

  //keep the release version safe for manifests, logs, and response metadata
  const version = options.version || '0.1.0';
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
    throw new Error('Application version must be a safe semantic version');
  }

  //compose the shared config first so production checks inspect exactly the
  // same values consumed by the selected process
  const config: TabularConfig = {
    app: {
      name: 'Tabular',
      packageName: '@trustless/tabular',
      version
    },
    paths: { projectRoot, runtimeRoot },
    environment,
    server: loadServerConfig(env),
    database,
    reactus: loadReactusConfig(projectRoot),
    sessions,
    sse: loadSseConfig(env),
    workers: loadWorkerConfig(env),
    production: productionValidation,
    productionIssues: []
  };

  //record rather than throw here so doctor and preflight entrypoints can
  // report every owned production issue in one pass
  config.productionIssues = productionConfigurationIssues(
    config,
    options.productionScope || 'all'
  );
  return config;
}

export * from './database.js';
export * from './environment.js';
export * from './production.js';
export * from './reactus.js';
export * from './server.js';
export * from './sessions.js';
export * from './sse.js';
export * from './workers.js';
