import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function entrypointPaths(metaUrl: string) {
  const filename = fileURLToPath(metaUrl);
  const directory = path.dirname(filename);
  const built = directory.split(path.sep).includes('dist');
  const projectRoot = built
    ? path.resolve(directory, '../..')
    : path.resolve(directory, '..');
  return {
    built,
    projectRoot,
    runtimeRoot: built ? path.join(projectRoot, 'dist') : projectRoot
  };
}
