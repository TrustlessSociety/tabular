//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import {
  assertProductionConfiguration,
  loadConfig
} from '../../src/config/index.js';

test('configuration is typed, secret-free by default, and production-aware', () => {
  //Start with the ordinary test defaults and prove no authority secret appears
  const local = loadConfig({ env: { NODE_ENV: 'test' } });
  assert.equal(local.server.port, 3000);
  assert.equal(local.server.maxRequestBodyBytes, 1_048_576);
  assert.equal(local.database.connectionId, 'local');
  assert.equal(local.database.webUrl, undefined);
  assert.equal(local.sessions.secure, false);
  assert.deepEqual(local.productionIssues, []);

  //production with HTTP and no web authority should report both owned gaps
  const production = loadConfig({
    env: {
      NODE_ENV: 'production',
      TABULAR_PUBLIC_ORIGIN: 'http://tabular.example'
    }
  });
  assert.ok(production.productionIssues.some((issue) => issue.includes('HTTPS')));
  assert.ok(production.productionIssues.some((issue) => issue.includes('WEB_DATABASE_URL')));

  //three URLs that reuse one PostgreSQL role violate authority separation
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

  //distinct roles on one database satisfy the full production contract
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

  //worker-only validation requires just the worker role for that executable
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

  //a web role cannot substitute for the worker role under scoped validation
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
  //worker capacity must remain strictly positive
  assert.throws(
    () => loadConfig({ env: { NODE_ENV: 'test', TABULAR_WORKER_CONCURRENCY: '0' } }),
    /positive integer/
  );

  //the HTTP body cap retains its minimum safe request size
  assert.throws(
    () => loadConfig({
      env: { NODE_ENV: 'test', TABULAR_MAX_REQUEST_BODY_BYTES: '100' }
    }),
    /TABULAR_MAX_REQUEST_BODY_BYTES/
  );

  //public origin input must be canonical rather than merely parseable
  assert.throws(
    () => loadConfig({
      env: { NODE_ENV: 'test', TABULAR_PUBLIC_ORIGIN: 'https://tabular.example/' }
    }),
    /canonical HTTP\(S\) origin/
  );

  //unknown operating modes never fall back silently
  assert.throws(
    () => loadConfig({ env: { NODE_ENV: 'invalid' } }),
    /Unsupported NODE_ENV/
  );

  //release metadata rejects markup and other unsafe version strings
  assert.throws(
    () => loadConfig({ env: { NODE_ENV: 'test' }, version: '</script>' }),
    /safe semantic version/
  );
});
