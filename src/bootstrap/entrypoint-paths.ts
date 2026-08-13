//node
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Resolve a checked-in runtime entrypoint to its project and runtime roots.
 */
export function entrypointPaths(metaUrl: string) {
  //runtime entrypoints live beneath scripts/runtime and execute the packaged
  // TypeScript source through tsx
  const filename = fileURLToPath(metaUrl);
  const directory = path.dirname(filename);
  const projectRoot = path.resolve(directory, '../..');

  //application source, package metadata, migrations, and public artifacts all
  // resolve from the same source-runtime package root
  return {
    projectRoot,
    runtimeRoot: projectRoot
  };
}
