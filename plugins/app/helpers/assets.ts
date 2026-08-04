import path from 'node:path';
import type { Response } from '@stackpress/ingest/http';
import { publicArtifact, verifyArtifactFile } from '../../../bootstrap/artifacts.js';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { ArtifactManifest } from '../../../bootstrap/artifacts.js';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

export async function servePublicArtifact(
  route: string,
  response: Response,
  runtime: ApplicationRuntimeService
) {
  const artifact = publicArtifact(runtime.artifacts, route);
  if (!artifact) {
    response.json({ error: { code: 'asset_not_found', message: 'Asset not found' } }, 404);
    return;
  }
  const verified = await verifyArtifactFile(
    runtime.config.paths.projectRoot,
    artifact,
    runtime.config.reactus
  );
  const body = verified.body;
  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  response.headers.set('ETag', `\"sha256-${artifact.sha256}\"`);
  response.set(CONTENT_TYPES[path.extname(verified.destination)] || 'application/octet-stream', body);
}

export function versionPublicArtifactReferences(html: string, manifest: ArtifactManifest) {
  return manifest.artifacts.reduce((versioned, artifact) => {
    if (!artifact.publicRoute) return versioned;
    const quoted = `"${artifact.publicRoute}"`;
    const reference = `"${artifact.publicRoute}?v=${artifact.sha256.slice(0, 16)}"`;
    return versioned.split(quoted).join(reference);
  }, html);
}
