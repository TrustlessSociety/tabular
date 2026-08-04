import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertProductionConfiguration,
  loadConfig
} from '../config/index.js';

test('configuration is typed, secret-free by default, and production-aware', () => {
  const local = loadConfig({ env: { NODE_ENV: 'test' } });
  assert.equal(local.server.port, 3000);
  assert.equal(local.server.maxRequestBodyBytes, 1_048_576);
  assert.equal(local.database.connectionId, 'local');
  assert.equal(local.database.webUrl, undefined);
  assert.equal(local.sessions.secure, false);
  assert.deepEqual(local.productionIssues, []);
  const production = loadConfig({
    env: {
      NODE_ENV: 'production',
      TABULAR_PUBLIC_ORIGIN: 'http://tabular.example'
    }
  });
  assert.ok(production.productionIssues.some((issue) => issue.includes('HTTPS')));
  assert.ok(production.productionIssues.some((issue) => issue.includes('WEB_DATABASE_URL')));

  const sharedAuthority = loadConfig({
    env: {
      NODE_ENV: 'production',
      TABULAR_PUBLIC_ORIGIN: 'https://tabular.example',
      TABULAR_DATABASE_CONNECTION_ID: 'production',
      TABULAR_WEB_DATABASE_URL: 'postgres://same:one@db.example:5432/tabular',
      TABULAR_WORKER_DATABASE_URL: 'postgres://same:two@db.example:5432/tabular',
      TABULAR_MIGRATOR_DATABASE_URL: 'postgres://migrator:three@db.example:5432/tabular'
    }
  });
  assert.ok(sharedAuthority.productionIssues.some((issue) =>
    issue.includes('distinct database users')));
  assert.throws(
    () => assertProductionConfiguration(sharedAuthority),
    /distinct database users/
  );

  const separated = loadConfig({
    env: {
      NODE_ENV: 'production',
      TABULAR_PUBLIC_ORIGIN: 'https://tabular.example',
      TABULAR_DATABASE_CONNECTION_ID: 'production',
      TABULAR_WEB_DATABASE_URL: 'postgres://web:one@db.example:5432/tabular',
      TABULAR_WORKER_DATABASE_URL: 'postgres://worker:two@db.example:5432/tabular',
      TABULAR_MIGRATOR_DATABASE_URL: 'postgres://migrator:three@db.example:5432/tabular'
    }
  });
  assert.deepEqual(separated.productionIssues, []);
  assert.doesNotThrow(() => assertProductionConfiguration(separated));

  const scopedWorker = loadConfig({
    productionScope: 'worker',
    env: {
      NODE_ENV: 'production',
      TABULAR_PUBLIC_ORIGIN: 'https://tabular.example',
      TABULAR_DATABASE_CONNECTION_ID: 'production',
      TABULAR_WORKER_DATABASE_URL: 'postgres://worker:two@db.example:5432/tabular'
    }
  });
  assert.deepEqual(scopedWorker.productionIssues, []);
  assert.doesNotThrow(() => assertProductionConfiguration(scopedWorker));

  const wrongScopedWorker = loadConfig({
    productionScope: 'worker',
    env: {
      NODE_ENV: 'production',
      TABULAR_PUBLIC_ORIGIN: 'https://tabular.example',
      TABULAR_DATABASE_CONNECTION_ID: 'production',
      TABULAR_WEB_DATABASE_URL: 'postgres://web:one@db.example:5432/tabular'
    }
  });
  assert.ok(wrongScopedWorker.productionIssues.some((issue) =>
    issue.includes('WORKER_DATABASE_URL')));
});

test('configuration rejects malformed operational values', () => {
  assert.throws(
    () => loadConfig({ env: { NODE_ENV: 'test', TABULAR_WORKER_CONCURRENCY: '0' } }),
    /positive integer/
  );
  assert.throws(
    () => loadConfig({
      env: { NODE_ENV: 'test', TABULAR_MAX_REQUEST_BODY_BYTES: '100' }
    }),
    /TABULAR_MAX_REQUEST_BODY_BYTES/
  );
  assert.throws(
    () => loadConfig({
      env: { NODE_ENV: 'test', TABULAR_PUBLIC_ORIGIN: 'https://tabular.example/' }
    }),
    /canonical HTTP\(S\) origin/
  );
  assert.throws(
    () => loadConfig({ env: { NODE_ENV: 'invalid' } }),
    /Unsupported NODE_ENV/
  );
  assert.throws(
    () => loadConfig({ env: { NODE_ENV: 'test' }, version: '</script>' }),
    /safe semantic version/
  );
});
