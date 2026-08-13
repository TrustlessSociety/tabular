//node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

//modules
import { build } from 'reactus';
import unocss from 'unocss/vite';

//client
import type { ApplicationServer } from './application.js';
import type { BuildConfig } from '../config/build.js';
import type { ArtifactRecord } from './artifacts.js';
import type { ArtifactManifest } from './artifacts.js';

/**
 * Build the unique registered Reactus view entries and record output metadata.
 */
export async function buildReactusArtifacts(
  config: BuildConfig,
  server: ApplicationServer
) {
  //recreate only the renderer-owned output roots before building new assets
  for (const output of [
    config.reactus.pagePath,
    config.reactus.clientPath,
    config.reactus.assetPath
  ]) {
    await fs.rm(output, { recursive: true, force: true });
    await fs.mkdir(output, { recursive: true });
  }

  const engine = build({
    cwd: config.paths.projectRoot,
    assetPath: config.reactus.assetPath,
    clientPath: config.reactus.clientPath,
    pagePath: config.reactus.pagePath,
    cssFiles: config.reactus.cssFiles,
    plugins: [unocss()]
  });
  //Every rendered route can register the same feature view, so deduplicate the
  // registry before asking Reactus to create a dependency graph.
  const entries = registeredViewEntries(server);
  if (entries.size === 0) throw new Error('No registered Reactus views found');
  for (const entry of entries) await engine.set(entry);
  const responses = [
    ...await engine.buildAllClients(),
    ...await engine.buildAllAssets(),
    ...await engine.buildAllPages()
  ];
  const failure = responses.find((response) => response.code && response.code >= 400);
  if (failure) {
    throw new Error(`Reactus production build failed: ${failure.error || failure.code}`);
  }

  //translate each renderer result into a portable, integrity-checked record
  const artifacts: ArtifactRecord[] = [];
  for (const response of responses) {
    if (!response.results) continue;
    const result = response.results;
    const destination = path.resolve(result.destination);
    const body = await fs.readFile(destination);
    artifacts.push({
      type: result.type,
      id: result.id,
      entry: result.entry,
      source: portableSource(config.paths.projectRoot, result.source),
      destination: portableDestination(config.paths.projectRoot, destination),
      publicRoute: publicRoute(config, destination),
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

  //Record source-owned files beneath public as exact static routes. Generated
  // Reactus client and asset roots already have typed records above.
  artifacts.push(...await publicStaticArtifacts(config, artifacts));
  artifacts.sort((left, right) => left.destination.localeCompare(right.destination));

  const manifest: ArtifactManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    artifacts
  };
  await fs.mkdir(path.dirname(config.reactus.manifestPath), { recursive: true });
  await fs.writeFile(
    config.reactus.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return artifacts.length;
}

/**
 * Return each feature-owned Reactus entry once in registry order.
 */
export function registeredViewEntries(server: Pick<ApplicationServer, 'views'>) {
  const entries = new Set<string>();
  for (const views of server.views.values()) {
    for (const view of views) entries.add(view.entry);
  }
  return entries;
}

/**
 * Return the public route for one renderer output when it is publishable.
 */
function publicRoute(config: BuildConfig, destination: string) {
  const clientRelative = path.relative(config.reactus.clientPath, destination);
  if (!clientRelative.startsWith('..') && !path.isAbsolute(clientRelative)) {
    return `${config.reactus.clientRoute}/${clientRelative.split(path.sep).join('/')}`;
  }
  const assetRelative = path.relative(config.reactus.assetPath, destination);
  if (!assetRelative.startsWith('..') && !path.isAbsolute(assetRelative)) {
    return `${config.reactus.assetRoute}/${assetRelative.split(path.sep).join('/')}`;
  }
  return undefined;
}

/**
 * Walk the public root and return regular source-owned static files.
 */
async function publicStaticArtifacts(config: BuildConfig, existing: ArtifactRecord[]) {
  const files = await walkFiles(config.reactus.publicPath);
  const generatedRoots = [config.reactus.clientPath, config.reactus.assetPath]
    .map((root) => path.resolve(root));
  const routes = new Set(existing.flatMap((artifact) => (
    artifact.publicRoute ? [artifact.publicRoute] : []
  )));
  const artifacts: ArtifactRecord[] = [];
  for (const file of files) {
    if (generatedRoots.some((root) => isInside(root, file))) continue;
    const relative = portableDestination(config.reactus.publicPath, file);
    const publicRoute = `/${relative}`;
    if (routes.has(publicRoute)) {
      throw new Error(`Duplicate public artifact route: ${publicRoute}`);
    }
    const body = await fs.readFile(file);
    artifacts.push({
      type: 'static',
      id: `static-${crypto.createHash('sha256').update(relative).digest('hex').slice(0, 16)}`,
      entry: '@/src/plugins/app/public',
      destination: portableDestination(config.paths.projectRoot, file),
      publicRoute,
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
      size: body.byteLength
    });
    routes.add(publicRoute);
  }
  return artifacts;
}

/**
 * Recursively list regular files beneath one public root.
 */
async function walkFiles(root: string, relative = ''): Promise<string[]> {
  const directory = path.join(root, relative);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, path.join(relative, entry.name)));
      continue;
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      throw new Error(`Public artifact is not a regular file: ${item}`);
    }
    const realRoot = await fs.realpath(root);
    const realItem = await fs.realpath(item);
    if (!isInside(realRoot, realItem)) {
      throw new Error(`Public artifact escapes the public root: ${item}`);
    }
    if (!(await fs.stat(realItem)).isFile()) {
      throw new Error(`Public artifact is not a regular file: ${item}`);
    }
    files.push(item);
  }
  return files;
}

/**
 * Report whether one path is a strict descendant of another.
 */
function isInside(root: string, destination: string) {
  const relative = path.relative(path.resolve(root), path.resolve(destination));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function portableDestination(root: string, destination: string) {
  const relative = path.relative(root, destination);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Artifact destination escapes its root: ${destination}`);
  }
  return relative.split(path.sep).join('/');
}

/**
 * Convert a renderer source path into a project-relative manifest value.
 */
function portableSource(projectRoot: string, source: string | undefined) {
  if (!source) return undefined;
  const absolute = path.resolve(source);
  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Reactus source escapes the project root: ${source}`);
  }
  return relative.split(path.sep).join('/');
}
