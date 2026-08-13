//node
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Resolve a checked-in runtime entrypoint to its project and runtime roots.
 */
export function entrypointPaths(metaUrl: string) {
  // development lives directly under scripts while production process
  // entrypoints live one level deeper under scripts/runtime
  const filename = fileURLToPath(metaUrl);
  const directory = path.dirname(filename);
  const scriptsRoot = path.basename(directory) === 'runtime'
    ? path.dirname(directory)
    : directory;
  if (path.basename(scriptsRoot) !== 'scripts') {
    throw new Error('Entrypoint must live beneath the project scripts directory');
  }
  const projectRoot = path.dirname(scriptsRoot);

  //application source, package metadata, migrations, and public artifacts all
  // resolve from the same source-runtime package root
  return {
    projectRoot,
    runtimeRoot: projectRoot
  };
}
