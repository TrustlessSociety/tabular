//node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

//client
import type { ArtifactManifest, ArtifactRecord } from '../bootstrap/artifacts.js';
import { loadArtifactManifest, verifyArtifactFile } from '../bootstrap/artifacts.js';
import { loadReactusConfig } from '../config/reactus.js';
import { versionPublicArtifactReferences } from '../plugins/app/helpers/assets.js';

/**
 * Build a valid artifact record whose fields a scenario can selectively override.
 */
function record(input: Partial<ArtifactRecord> & Pick<ArtifactRecord, 'destination'>): ArtifactRecord {
  //hash the same baseline body written by successful artifact scenarios
  const body = Buffer.from('artifact');
  return {
    type: 'asset',
    id: 'test',
    entry: '@/test',
    publicRoute: '/assets/test.css',
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
    size: body.byteLength,
    ...input
  };
}

test('artifact manifest confines each type to its configured output root', async () => {
  //place a project-shaped fixture under the system temp directory
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-artifacts-'));
  try {
    //point an asset record at a real file outside the configured asset root
    const roots = loadReactusConfig(projectRoot);
    await fs.writeFile(path.join(projectRoot, 'package.json'), 'artifact');
    await fs.mkdir(path.dirname(roots.manifestPath), { recursive: true });
    const manifest: ArtifactManifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      artifacts: [record({ destination: 'package.json' })]
    };
    await fs.writeFile(roots.manifestPath, JSON.stringify(manifest));

    //manifest validation must reject the typed-root escape before trusting it
    await assert.rejects(
      () => loadArtifactManifest(projectRoot, roots.manifestPath, roots),
      /escapes its asset output root/
    );
  } finally {
    //remove the disposable project even when the assertion fails
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('artifact manifest rejects non-portable build-host source paths', async () => {
  //create a valid asset destination so only source portability can fail
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-artifact-source-'));
  try {
    const roots = loadReactusConfig(projectRoot);
    const destination = path.join(roots.assetPath, 'test.css');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, 'artifact');
    await fs.mkdir(path.dirname(roots.manifestPath), { recursive: true });

    //model build-host metadata with an absolute source path
    const manifest: ArtifactManifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      artifacts: [record({
        destination: path.relative(projectRoot, destination),
        source: path.join(path.parse(projectRoot).root, 'private', 'build-host', 'source.ts')
      })]
    };
    await fs.writeFile(roots.manifestPath, JSON.stringify(manifest));

    //the manifest must remain portable across package installation roots
    await assert.rejects(
      () => loadArtifactManifest(projectRoot, roots.manifestPath, roots),
      /source must be portable/
    );
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('artifact integrity rejects files changed after the build manifest', async () => {
  //write a file that initially matches the builder-owned record
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-integrity-'));
  try {
    const artifact = record({ destination: 'public/assets/test.css' });
    const destination = path.join(projectRoot, artifact.destination);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, 'artifact');
    const roots = loadReactusConfig(projectRoot);
    await verifyArtifactFile(projectRoot, artifact, roots);

    //mutate the file after verification to simulate post-build tampering
    await fs.writeFile(destination, 'changed');

    //either size or digest must catch the changed bytes
    await assert.rejects(
      () => verifyArtifactFile(projectRoot, artifact, roots),
      /Artifact size mismatch|Artifact hash mismatch/
    );
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('artifact integrity rejects symlinks that resolve outside the output root', async () => {
  //create an in-project secret and expose it through an asset-root symlink
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-symlink-'));
  try {
    const roots = loadReactusConfig(projectRoot);
    const secret = path.join(projectRoot, '.env');
    await fs.writeFile(secret, 'artifact');
    await fs.mkdir(roots.assetPath, { recursive: true });
    const destination = path.join(roots.assetPath, 'leak.css');
    await fs.symlink(path.relative(roots.assetPath, secret), destination);
    const artifact = record({ destination: path.relative(projectRoot, destination) });

    //realpath confinement must reject the link even though its pathname is safe
    await assert.rejects(
      () => verifyArtifactFile(projectRoot, artifact, roots),
      /resolves outside its asset output root/
    );
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('rendered public artifacts carry a content-version cache key', () => {
  //reuse a valid public asset record as the renderer's verified manifest input
  const asset = record({ destination: 'public/assets/test.css' });
  const manifest: ArtifactManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    artifacts: [asset]
  };

  //the public URL must carry the deterministic truncated content digest
  assert.equal(
    versionPublicArtifactReferences('<link href="/assets/test.css">', manifest),
    `<link href="/assets/test.css?v=${asset.sha256.slice(0, 16)}">`
  );
});
