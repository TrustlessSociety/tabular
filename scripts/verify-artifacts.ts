import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadArtifactManifest } from '../bootstrap/artifacts.js';
import { loadReactusConfig } from '../config/reactus.js';

const projectRoot = process.cwd();
const config = loadReactusConfig(projectRoot);
const manifest = await loadArtifactManifest(projectRoot, config.manifestPath, config);
assert.ok(manifest.artifacts.length >= 3, 'Expected page, client, and asset artifacts');
for (const artifact of manifest.artifacts) {
  const destination = path.resolve(projectRoot, artifact.destination);
  const body = await fs.readFile(destination);
  assert.ok(body.byteLength > 0, `${artifact.destination} should not be empty`);
  assert.equal(body.byteLength, artifact.size, `${artifact.destination} size changed`);
  assert.equal(
    crypto.createHash('sha256').update(body).digest('hex'),
    artifact.sha256,
    `${artifact.destination} hash changed`
  );
}
assert.ok(manifest.artifacts.some((artifact) => artifact.type === 'page'));
assert.ok(manifest.artifacts.some((artifact) => artifact.publicRoute?.startsWith('/client/')));
assert.ok(manifest.artifacts.some((artifact) => artifact.publicRoute?.startsWith('/assets/')));
const sqlAssets = (await fs.readdir(path.join(projectRoot, 'plugins/database/migrations')))
  .filter((entry) => entry.endsWith('.sql'));
for (const sqlAsset of sqlAssets) {
  const source = await fs.readFile(path.join(projectRoot, 'plugins/database/migrations', sqlAsset));
  const built = await fs.readFile(path.join(projectRoot, 'dist/plugins/database/migrations', sqlAsset));
  assert.deepEqual(built, source, `${sqlAsset} built copy differs from source`);
}
process.stdout.write(
  `Verified ${manifest.artifacts.length} Reactus artifacts and ${sqlAssets.length} SQL asset(s).\n`
);
