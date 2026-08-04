import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'reactus';
import { loadReactusConfig } from '../config/reactus.js';
import type { ArtifactManifest, ArtifactRecord } from '../bootstrap/artifacts.js';

const projectRoot = process.cwd();
const config = loadReactusConfig(projectRoot);

for (const output of [config.pagePath, config.clientPath, config.assetPath]) {
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
}

const engine = build({
  cwd: projectRoot,
  assetPath: config.assetPath,
  clientPath: config.clientPath,
  pagePath: config.pagePath
});
await engine.set(config.entry);
const responses = [
  ...await engine.buildAllClients(),
  ...await engine.buildAllAssets(),
  ...await engine.buildAllPages()
];
const failure = responses.find((response) => response.code && response.code >= 400);
if (failure) {
  throw new Error(`Reactus production build failed: ${failure.error || failure.code}`);
}

function routeFor(destination: string) {
  const absolute = path.resolve(destination);
  const clientRelative = path.relative(config.clientPath, absolute);
  if (!clientRelative.startsWith('..') && !path.isAbsolute(clientRelative)) {
    return `${config.clientRoute}/${clientRelative.split(path.sep).join('/')}`;
  }
  const assetRelative = path.relative(config.assetPath, absolute);
  if (!assetRelative.startsWith('..') && !path.isAbsolute(assetRelative)) {
    return `${config.assetRoute}/${assetRelative.split(path.sep).join('/')}`;
  }
  return undefined;
}

function portableSource(source: string | undefined) {
  if (!source) return undefined;
  const absolute = path.resolve(source);
  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Reactus source escapes the project root: ${source}`);
  }
  return relative.split(path.sep).join('/');
}

const artifacts: ArtifactRecord[] = [];
for (const response of responses) {
  if (!response.results) continue;
  const result = response.results;
  const absolute = path.resolve(result.destination);
  const body = await fs.readFile(absolute);
  artifacts.push({
    type: result.type,
    id: result.id,
    entry: result.entry,
    source: portableSource(result.source),
    destination: path.relative(projectRoot, absolute),
    publicRoute: routeFor(absolute),
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
    size: body.byteLength
  });
}
artifacts.sort((left, right) => left.destination.localeCompare(right.destination));
if (!artifacts.some((artifact) => artifact.type === 'page')) {
  throw new Error('Reactus did not emit a page artifact');
}
if (!artifacts.some((artifact) => artifact.type === 'client' && artifact.publicRoute)) {
  throw new Error('Reactus did not emit a public client artifact');
}
if (!artifacts.some((artifact) => artifact.type === 'asset' && artifact.publicRoute)) {
  throw new Error('Reactus did not emit a public asset artifact');
}
const manifest: ArtifactManifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  artifacts
};
await fs.mkdir(path.dirname(config.manifestPath), { recursive: true });
await fs.writeFile(config.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Reactus built ${artifacts.length} production artifacts.\n`);
