import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadArtifactManifest } from '../../src/bootstrap/artifacts.js';
import { loadReactusConfig } from '../../src/config/reactus.js';

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
const migrationRoot = path.join(projectRoot, 'src/plugins/database/migrations');
const sqlAssets = (await fs.readdir(migrationRoot))
  .filter((entry) => entry.endsWith('.sql'));
for (const sqlAsset of sqlAssets) {
  const source = await fs.readFile(path.join(migrationRoot, sqlAsset));
  assert.ok(source.byteLength > 0, `${sqlAsset} should not be empty`);
}
process.stdout.write(
  `Verified ${manifest.artifacts.length} Reactus artifacts and ${sqlAssets.length} SQL asset(s).\n`
);
