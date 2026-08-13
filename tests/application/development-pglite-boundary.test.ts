//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { DevelopmentDatabaseBackend } from '../../src/plugins/database/helpers/development-contracts.js';
import { createApplication } from '../../src/bootstrap/application.js';
import { loadConfig } from '../../src/config/index.js';

const backend: DevelopmentDatabaseBackend = {
  async transaction() {
    throw new Error('unused test backend');
  },
  async ready() {
    return true;
  },
  async close() {}
};

test('development PGlite injection is refused by production configuration', async () => {
  //Use a complete production authority set so this assertion reaches the
  //development-adapter boundary rather than failing on unrelated config.
  const config = loadConfig({
    env: {
      NODE_ENV: 'production',
      TABULAR_PUBLIC_ORIGIN: 'https://tabular.example',
      TABULAR_DATABASE_CONNECTION_ID: 'production',
      TABULAR_WEB_DATABASE_URL: 'postgresql://web@db.example:5432/tabular',
      TABULAR_MIGRATOR_DATABASE_URL: 'postgresql://migrator@db.example:5432/tabular',
      TABULAR_WORKER_DATABASE_URL: 'postgresql://worker@db.example:5432/tabular'
    },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });

  await assert.rejects(
    createApplication({
      processKind: 'web',
      config,
      developmentDatabase: backend,
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd()
    }),
    /Development database adapters are available only for the development web process/
  );
});

test('development PGlite injection is refused by non-web process configuration', async () => {
  //A development config still cannot hand the web-only backend to a migrator,
  //worker, or live process profile.
  const config = loadConfig({
    env: { NODE_ENV: 'development' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });

  await assert.rejects(
    createApplication({
      processKind: 'migrator',
      config,
      developmentDatabase: backend,
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd()
    }),
    /Development database adapters are available only for the development web process/
  );
});
