import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { ApplicationError } from './errors.js';

export type ArtifactRecord = {
  type: 'page' | 'client' | 'asset';
  id: string;
  entry: string;
  source?: string;
  destination: string;
  publicRoute?: string;
  sha256: string;
  size: number;
};

export type ArtifactManifest = {
  schemaVersion: 1;
  generatedAt: string;
  artifacts: ArtifactRecord[];
};

export type ArtifactRoots = {
  pagePath: string;
  clientPath: string;
  assetPath: string;
  clientRoute: string;
  assetRoute: string;
};

function isInside(root: string, destination: string) {
  const relative = path.relative(path.resolve(root), path.resolve(destination));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function artifactRoot(artifact: ArtifactRecord, roots: ArtifactRoots) {
  switch (artifact.type) {
    case 'page': return roots.pagePath;
    case 'client': return roots.clientPath;
    case 'asset': return roots.assetPath;
    default: throw new Error(`Unsupported artifact type ${String(artifact.type)}`);
  }
}

export async function verifyArtifactFile(
  projectRoot: string,
  artifact: ArtifactRecord,
  roots: ArtifactRoots
) {
  const destination = path.resolve(projectRoot, artifact.destination);
  const realRoot = await fs.realpath(artifactRoot(artifact, roots));
  const realDestination = await fs.realpath(destination);
  if (!realDestination.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`Artifact resolves outside its ${artifact.type} output root`);
  }
  const body = await fs.readFile(realDestination);
  if (body.byteLength !== artifact.size) {
    throw new Error(`Artifact size mismatch: ${artifact.destination}`);
  }
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  if (hash !== artifact.sha256) {
    throw new Error(`Artifact hash mismatch: ${artifact.destination}`);
  }
  return { body, destination: realDestination };
}

export async function loadArtifactManifest(
  projectRoot: string,
  manifestPath: string,
  roots: ArtifactRoots
): Promise<ArtifactManifest> {
  const body = await fs.readFile(manifestPath, 'utf8').catch(() => undefined);
  if (!body) {
    throw new ApplicationError(
      'artifact_manifest_missing',
      503,
      'Reactus production artifacts have not been built',
      true
    );
  }
  const manifest = JSON.parse(body) as ArtifactManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts)) {
    throw new Error('Unsupported Reactus artifact manifest');
  }
  const publicRoutes = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (artifact.source) {
      if (path.isAbsolute(artifact.source)) {
        throw new Error(`Artifact source must be portable: ${artifact.destination}`);
      }
      const source = path.resolve(projectRoot, artifact.source);
      const relativeSource = path.relative(projectRoot, source);
      if (relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
        throw new Error(`Artifact source escapes project root: ${artifact.destination}`);
      }
    }
    const destination = path.resolve(projectRoot, artifact.destination);
    const relative = path.relative(projectRoot, destination);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Artifact escapes project root: ${artifact.destination}`);
    }
    if (!isInside(artifactRoot(artifact, roots), destination)) {
      throw new Error(`Artifact escapes its ${artifact.type} output root: ${artifact.destination}`);
    }
    const expectedRoute = artifact.type === 'client'
      ? roots.clientRoute
      : artifact.type === 'asset'
        ? roots.assetRoute
        : undefined;
    if (expectedRoute && !artifact.publicRoute?.startsWith(`${expectedRoute}/`)) {
      throw new Error(`Artifact has an invalid public route: ${artifact.destination}`);
    }
    if (!expectedRoute && artifact.publicRoute) {
      throw new Error(`Page artifacts cannot be public static routes: ${artifact.destination}`);
    }
    if (artifact.publicRoute) {
      if (publicRoutes.has(artifact.publicRoute)) {
        throw new Error(`Duplicate artifact public route: ${artifact.publicRoute}`);
      }
      publicRoutes.add(artifact.publicRoute);
    }
    if (!/^[a-f0-9]{64}$/.test(artifact.sha256) || artifact.size < 1) {
      throw new Error(`Artifact integrity metadata is invalid: ${artifact.destination}`);
    }
    await verifyArtifactFile(projectRoot, artifact, roots);
  }
  return manifest;
}

export function publicArtifact(manifest: ArtifactManifest, route: string) {
  return manifest.artifacts.find((artifact) => artifact.publicRoute === route);
}
