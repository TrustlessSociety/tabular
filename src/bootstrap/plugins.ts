//node
import fs from 'node:fs/promises';
import path from 'node:path';

//The plugin manifest contract exported for module callers
export type PluginManifest = {
  paths: string[],
};

/**
 * Normalize a package plugin path for duplicate and service-name checks.
 */
function normalizedPluginName(pluginPath: string) {
  return pluginPath.replace(/^\.\//, '').replace(/\.(c|m)?[jt]sx?$/, '');
}

/**
 * Load and validate the package-owned plugin manifest.
 */
export async function loadPluginManifest(projectRoot: string): Promise<PluginManifest> {
  //read the package manifest from the resolved project root rather than the
  // process working directory
  const packagePath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8')) as {
    plugins?: unknown,
  };
  return { paths: validatePluginPaths(packageJson.plugins) };
}

/**
 * Validate plugin entries without importing or executing plugin modules.
 */
export function validatePluginPaths(input: unknown) {
  //the application requires an explicit non-empty registration order
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('package.json.plugins must contain at least one plugin');
  }

  //accept only project-local extensionless plugin entrypoints
  const paths = input.map((entry) => {
    if (typeof entry !== 'string' || !entry.startsWith('./src/plugins/')) {
      throw new Error(`Invalid project plugin entry ${JSON.stringify(entry)}`);
    }
    if (/\.(c|m)?[jt]sx?$/.test(entry)) {
      throw new Error(`Plugin entries must omit the extension: ${entry}`);
    }
    return entry;
  });

  //compare normalized names so extension tricks cannot register one plugin
  // more than once
  const names = paths.map(normalizedPluginName);
  if (new Set(names).size !== names.length) {
    throw new Error('Duplicate plugin registration in package.json.plugins');
  }
  return paths;
}

/**
 * Return the stable service name derived from a validated plugin path.
 */
export function pluginServiceName(pluginPath: string) {
  return normalizedPluginName(pluginPath);
}
