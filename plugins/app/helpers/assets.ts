//node
import fs from 'node:fs/promises';
import path from 'node:path';

//modules
import type { Response } from '@stackpress/ingest/http';

//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { ArtifactManifest } from '../../../bootstrap/artifacts.js';
import { publicArtifact, verifyArtifactFile } from '../../../bootstrap/artifacts.js';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/**
 * Return the serve public artifact result.
 */
export async function servePublicArtifact(
  route: string,
  response: Response,
  runtime: ApplicationRuntimeService
) {
  if (runtime.config.environment.mode !== 'production') {
    await serveDevelopmentArtifact(route, response, runtime);
    return;
  }

  //Production requests use an exact manifest route before any filesystem
  // path is derived from browser input.
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

/**
 * Serve one development public file after real-root containment checks.
 */
async function serveDevelopmentArtifact(
  route: string,
  response: Response,
  runtime: ApplicationRuntimeService
) {
  try {
    const resolved = await resolveDevelopmentPublicFile(
      runtime.config.reactus.publicPath,
      route
    );
    const body = await fs.readFile(resolved.destination);
    response.headers.set('Cache-Control', 'no-store');
    response.set(
      CONTENT_TYPES[path.extname(resolved.destination)] || 'application/octet-stream',
      body
    );
  } catch {
    response.json({ error: { code: 'asset_not_found', message: 'Asset not found' } }, 404);
  }
}

/**
 * Resolve one URL pathname to a regular file beneath the real public root.
 */
export async function resolveDevelopmentPublicFile(publicRoot: string, requestPath: string) {
  const decoded = decodeRequestPath(requestPath);
  const relative = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  if (!relative || path.win32.isAbsolute(relative) || path.posix.isAbsolute(relative)
    || /^[A-Za-z]:/.test(relative)) {
    throw new Error('Development public path must be relative');
  }

  //Reject traversal segments before normalization so encoded parent paths do
  // not become harmless-looking paths after path.resolve.
  const segments = relative.split(/[\\/]+/);
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Development public path is invalid');
  }

  const realRoot = await fs.realpath(publicRoot);
  const candidate = path.resolve(realRoot, ...segments);
  const realDestination = await fs.realpath(candidate);
  const contained = path.relative(realRoot, realDestination);
  if (!contained || contained.startsWith('..') || path.isAbsolute(contained)) {
    throw new Error('Development public path escapes its root');
  }
  const stats = await fs.stat(realDestination);
  if (!stats.isFile()) throw new Error('Development public path is not a file');
  return {
    destination: realDestination,
    relative: contained.split(path.sep).join('/')
  };
}

/**
 * Decode one URL path exactly once and reject malformed or NUL-containing data.
 */
function decodeRequestPath(requestPath: string) {
  if (typeof requestPath !== 'string' || requestPath.includes('?') || requestPath.includes('#')) {
    throw new Error('Development public path is invalid');
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    throw new Error('Development public path is invalid');
  }
  if (decoded.includes('\u0000')) throw new Error('Development public path is invalid');
  return decoded;
}

/**
 * Return the version public artifact references result.
 */
export function versionPublicArtifactReferences(html: string, manifest: ArtifactManifest) {
  return manifest.artifacts.reduce((versioned, artifact) => {
    if (!artifact.publicRoute) return versioned;
    const quoted = `"${artifact.publicRoute}"`;
    const reference = `"${artifact.publicRoute}?v=${artifact.sha256.slice(0, 16)}"`;
    return versioned.split(quoted).join(reference);
  }, html);
}
