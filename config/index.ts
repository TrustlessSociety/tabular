import path from 'node:path';
import { loadDatabaseConfig, type DatabaseConfig } from './database.js';
import { loadEnvironmentConfig, type EnvironmentConfig } from './environment.js';
import {
  productionConfigurationIssues,
  productionValidation,
  type ProductionProcessScope
} from './production.js';
import { loadReactusConfig, type ReactusConfig } from './reactus.js';
import { loadServerConfig, type ServerConfig } from './server.js';
import { loadSessionConfig, type SessionConfig } from './sessions.js';
import { loadSseConfig, type SseConfig } from './sse.js';
import { loadWorkerConfig, type WorkerConfig } from './workers.js';

export type TabularConfig = {
  app: {
    name: 'Tabular';
    packageName: '@trustless/tabular';
    version: string;
  };
  paths: {
    projectRoot: string;
    runtimeRoot: string;
  };
  environment: EnvironmentConfig;
  server: ServerConfig;
  database: DatabaseConfig;
  reactus: ReactusConfig;
  sessions: SessionConfig;
  sse: SseConfig;
  workers: WorkerConfig;
  production: typeof productionValidation;
  productionIssues: string[];
};

export function loadConfig(options: {
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  runtimeRoot?: string;
  version?: string;
  productionScope?: ProductionProcessScope;
} = {}): TabularConfig {
  const env = options.env || process.env;
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const runtimeRoot = path.resolve(options.runtimeRoot || projectRoot);
  const environment = loadEnvironmentConfig(env);
  const database = loadDatabaseConfig(env);
  const sessions = loadSessionConfig(env, environment.mode);
  const version = options.version || '0.1.0';
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
    throw new Error('Application version must be a safe semantic version');
  }
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
