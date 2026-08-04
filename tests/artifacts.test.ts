import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  loadArtifactManifest,
  verifyArtifactFile,
  type ArtifactManifest,
  type ArtifactRecord
} from '../bootstrap/artifacts.js';
import { loadReactusConfig } from '../config/reactus.js';
import { versionPublicArtifactReferences } from '../plugins/app/helpers/assets.js';

function record(input: Partial<ArtifactRecord> & Pick<ArtifactRecord, 'destination'>): ArtifactRecord {
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
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-artifacts-'));
  try {
    const roots = loadReactusConfig(projectRoot);
    await fs.writeFile(path.join(projectRoot, 'package.json'), 'artifact');
    await fs.mkdir(path.dirname(roots.manifestPath), { recursive: true });
    const manifest: ArtifactManifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      artifacts: [record({ destination: 'package.json' })]
    };
    await fs.writeFile(roots.manifestPath, JSON.stringify(manifest));
    await assert.rejects(
      () => loadArtifactManifest(projectRoot, roots.manifestPath, roots),
      /escapes its asset output root/
    );
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('artifact manifest rejects non-portable build-host source paths', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-artifact-source-'));
  try {
    const roots = loadReactusConfig(projectRoot);
    const destination = path.join(roots.assetPath, 'test.css');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, 'artifact');
    await fs.mkdir(path.dirname(roots.manifestPath), { recursive: true });
    const manifest: ArtifactManifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      artifacts: [record({
        destination: path.relative(projectRoot, destination),
        source: path.join(path.parse(projectRoot).root, 'private', 'build-host', 'source.ts')
      })]
    };
    await fs.writeFile(roots.manifestPath, JSON.stringify(manifest));
    await assert.rejects(
      () => loadArtifactManifest(projectRoot, roots.manifestPath, roots),
      /source must be portable/
    );
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('artifact integrity rejects files changed after the build manifest', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-integrity-'));
  try {
    const artifact = record({ destination: 'public/assets/test.css' });
    const destination = path.join(projectRoot, artifact.destination);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, 'artifact');
    const roots = loadReactusConfig(projectRoot);
    await verifyArtifactFile(projectRoot, artifact, roots);
    await fs.writeFile(destination, 'changed');
    await assert.rejects(
      () => verifyArtifactFile(projectRoot, artifact, roots),
      /Artifact size mismatch|Artifact hash mismatch/
    );
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('artifact integrity rejects symlinks that resolve outside the output root', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-symlink-'));
  try {
    const roots = loadReactusConfig(projectRoot);
    const secret = path.join(projectRoot, '.env');
    await fs.writeFile(secret, 'artifact');
    await fs.mkdir(roots.assetPath, { recursive: true });
    const destination = path.join(roots.assetPath, 'leak.css');
    await fs.symlink(path.relative(roots.assetPath, secret), destination);
    const artifact = record({ destination: path.relative(projectRoot, destination) });
    await assert.rejects(
      () => verifyArtifactFile(projectRoot, artifact, roots),
      /resolves outside its asset output root/
    );
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('rendered public artifacts carry a content-version cache key', () => {
  const asset = record({ destination: 'public/assets/test.css' });
  const manifest: ArtifactManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    artifacts: [asset]
  };
  assert.equal(
    versionPublicArtifactReferences('<link href="/assets/test.css">', manifest),
    `<link href="/assets/test.css?v=${asset.sha256.slice(0, 16)}">`
  );
});
