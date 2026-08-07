import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type Artifact = { size: number; sha256: string };
export type ArtifactManifest = Record<string, Artifact>;

async function files(root: string, relative = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const item = path.join(relative, entry.name);
    return entry.isDirectory() ? files(root, item) : [item];
  }));
  return nested.flat();
}

export async function createManifest(root: string): Promise<ArtifactManifest> {
  const manifest: ArtifactManifest = {};
  for (const file of await files(root)) {
    const bytes = await fs.readFile(path.join(root, file));
    manifest[file.replaceAll('\\', '/')] = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  return manifest;
}

export async function readVerifiedArtifact(root: string, manifest: ArtifactManifest, requestPath: string) {
  const key = requestPath.replace(/^\/+/, '');
  if (!key || key.includes('..') || !(key in manifest)) throw new Error('Not found');
  const target = path.resolve(root, key);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Not found');
  const bytes = await fs.readFile(target);
  const expected = manifest[key];
  if (bytes.length !== expected.size || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error('Integrity mismatch');
  return bytes;
}
