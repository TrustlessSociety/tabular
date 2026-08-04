import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { startWeb } from '../bootstrap/application.js';
import { ApplicationError } from '../bootstrap/errors.js';

const projectRoot = process.cwd();
const built = process.argv.includes('--built');
const runtimeRoot = built ? path.join(projectRoot, 'dist') : projectRoot;
const runtime = await startWeb({
  env: { NODE_ENV: 'test' },
  projectRoot,
  runtimeRoot,
  host: '127.0.0.1',
  port: 0
});
const address = runtime.httpServer.address();
assert.ok(address && typeof address === 'object');
const port = address.port;

try {
  runtime.app.get('/__test/invalid', () => {
    throw new ApplicationError('invalid', 400, 'Invalid input');
  }, Number.MAX_SAFE_INTEGER);
  runtime.app.get('/__test/throw', () => {
    throw new Error('TOP_SECRET_SENTINEL');
  }, Number.MAX_SAFE_INTEGER);
  runtime.app.on('error', ({ res }) => {
    res.set(
      'application/json; charset=utf-8',
      JSON.stringify({ error: { message: res.error || 'LEAK_ATTEMPT' } }),
      res.code
    );
  });
  const health = await fetch(`${runtime.origin}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', phase: 'ready' });
  const ready = await fetch(`${runtime.origin}/readyz`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).status, 'ready');
  const protectedPage = await fetch(runtime.origin, { redirect: 'manual' });
  assert.equal(protectedPage.status, 303);
  assert.equal(protectedPage.headers.get('location'), '/auth/login');
  const login = await fetch(`${runtime.origin}/auth/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Sign in to Tabular/);
  const clientArtifact = runtime.runtime.artifacts.artifacts.find((artifact) =>
    artifact.publicRoute?.startsWith('/client/'));
  const assetArtifact = runtime.runtime.artifacts.artifacts.find((artifact) =>
    artifact.publicRoute?.startsWith('/assets/'));
  assert.ok(clientArtifact?.publicRoute, 'Manifest should expose a client artifact');
  assert.ok(assetArtifact?.publicRoute, 'Manifest should expose a stylesheet artifact');
  const clientRoute = `${clientArtifact.publicRoute}?v=${clientArtifact.sha256.slice(0, 16)}`;
  const assetRoute = `${assetArtifact.publicRoute}?v=${assetArtifact.sha256.slice(0, 16)}`;
  const client = await fetch(`${runtime.origin}${clientRoute}`);
  assert.equal(client.status, 200);
  assert.match(client.headers.get('content-type') || '', /javascript/);
  assert.ok((await client.arrayBuffer()).byteLength > 0);
  const asset = await fetch(`${runtime.origin}${assetRoute}`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type') || '', /text\/css/);
  assert.ok((await asset.arrayBuffer()).byteLength > 0);
  assert.equal((await fetch(`${runtime.origin}/client/not-in-manifest.js`)).status, 404);
  const invalid = await fetch(`${runtime.origin}/__test/invalid`);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {
    error: { code: 'invalid', message: 'Invalid input' }
  });
  const failed = await fetch(`${runtime.origin}/__test/throw`);
  assert.equal(failed.status, 500);
  const failedBody = await failed.text();
  assert.doesNotMatch(failedBody, /TOP_SECRET_SENTINEL|LEAK_ATTEMPT|stack/);
  assert.deepEqual(runtime.runtime.pluginOrder, [
    'tabular.database', 'tabular.identity', 'tabular.operations', 'tabular.catalog', 'tabular.capability', 'tabular.files', 'tabular.saved-views', 'tabular.import-export',
    'tabular.explorer', 'tabular.ui', 'tabular.grid', 'tabular.commands', 'tabular.realtime', 'tabular.mcp', 'tabular.app'
  ]);
  const firstService = runtime.app.plugin('tabular.app');
  await runtime.app.bootstrap();
  assert.equal(runtime.app.plugin('tabular.app'), firstService);
  assert.deepEqual(runtime.runtime.pluginOrder, [
    'tabular.database', 'tabular.identity', 'tabular.operations', 'tabular.catalog', 'tabular.capability', 'tabular.files', 'tabular.saved-views', 'tabular.import-export',
    'tabular.explorer', 'tabular.ui', 'tabular.grid', 'tabular.commands', 'tabular.realtime', 'tabular.mcp', 'tabular.app'
  ]);
} finally {
  await runtime.close();
  await runtime.close();
}

await assert.rejects(() => fetch(`${runtime.origin}/healthz`));
const rebound = net.createServer();
await new Promise<void>((resolve, reject) => {
  rebound.once('error', reject);
  rebound.listen(port, '127.0.0.1', resolve);
});
await new Promise<void>((resolve, reject) => {
  rebound.close((error) => (error ? reject(error) : resolve()));
});
const evidence = {
  result: 'passed',
  built,
  node: process.version,
  health: '/healthz',
  readiness: '/readyz',
  assets: 'manifest-allowlisted',
  shutdown: 'idempotent-port-released'
};
await fs.mkdir(path.join(projectRoot, '.build'), { recursive: true });
await fs.writeFile(
  path.join(projectRoot, '.build/runtime-verification.json'),
  `${JSON.stringify(evidence, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
