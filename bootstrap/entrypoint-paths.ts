//node
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Resolve source and built entrypoints to their project and runtime roots.
 */
export function entrypointPaths(metaUrl: string) {
  //the compiled entrypoint lives beneath dist while source runs from the
  // project tree, so the containing path reveals the active runtime mode
  const filename = fileURLToPath(metaUrl);
  const directory = path.dirname(filename);
  const built = directory.split(path.sep).includes('dist');
  const projectRoot = built
    ? path.resolve(directory, '../..')
    : path.resolve(directory, '..');

  //built processes load runtime files from dist but keep project assets rooted
  // at the package directory
  return {
    built,
    projectRoot,
    runtimeRoot: built ? path.join(projectRoot, 'dist') : projectRoot
  };
}
