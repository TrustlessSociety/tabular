import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { projectBrowserProvider } from '../src/hydration.js';
import { createManifest, readVerifiedArtifact } from '../src/artifacts.js';

const cwd = process.cwd();

test('P-002 source and build signals', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies.stackpress, undefined);
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@stackpress/ingest', '@stackpress/lib', 'react', 'react-dom', 'reactus']);
  for (const page of ['home', 'customer']) {
    const source = await fs.readFile(path.join(cwd, 'pages', `${page}.ts`), 'utf8');
    assert.match(source, /export default/);
  }
  const routes = await fs.readFile(path.join(cwd, 'plugins/routes/plugin.ts'), 'utf8');
  assert.match(routes, /\(\) => import\('\.\.\/\.\.\/pages\/home\.js'\)/);
  assert.match(routes, /\(\) => import\('\.\.\/\.\.\/pages\/customer\.js'\)/);
  const proof = JSON.parse(await fs.readFile(path.join(cwd, '.build', 'proof.json'), 'utf8'));
  assert.equal(proof.views, 2);
  assert.equal(proof.sideEffects, false);
  assert.ok(proof.artifactCount > 0);
});

test('P-002 provider projection excludes server-only state', () => {
  const provider = projectBrowserProvider({ method: 'GET', path: '/customer', csrf: 'csrf' });
  const serialized = JSON.stringify({ provider, headers: undefined, password: undefined, stack: undefined });
  assert.match(serialized, /"csrf":"csrf"/);
  for (const denied of ['headers', 'cookie', 'password', 'credential', 'stack', 'database', 'session']) assert.doesNotMatch(serialized, new RegExp(denied, 'i'));
});

test('P-002 production artifacts require an exact verified manifest entry', async () => {
  const artifactRoot = await fs.mkdtemp(path.join(cwd, '.artifact-test-'));
  try {
    await fs.writeFile(path.join(artifactRoot, 'safe.js'), 'export default 1;');
    const manifest = await createManifest(artifactRoot);
    assert.equal((await readVerifiedArtifact(artifactRoot, manifest, '/safe.js')).toString(), 'export default 1;');
    await assert.rejects(() => readVerifiedArtifact(artifactRoot, manifest, '/../package.json'), /Not found/);
    await assert.rejects(() => readVerifiedArtifact(artifactRoot, manifest, '/missing.js'), /Not found/);
    await fs.writeFile(path.join(artifactRoot, 'safe.js'), 'tampered');
    await assert.rejects(() => readVerifiedArtifact(artifactRoot, manifest, '/safe.js'), /Integrity mismatch/);
  } finally { await fs.rm(artifactRoot, { recursive: true, force: true }); }
});
