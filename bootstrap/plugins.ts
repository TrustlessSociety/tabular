import fs from 'node:fs/promises';
import path from 'node:path';

export type PluginManifest = {
  paths: string[];
};

function normalizedPluginName(pluginPath: string) {
  return pluginPath.replace(/^\.\//, '').replace(/\.(c|m)?[jt]sx?$/, '');
}

export async function loadPluginManifest(projectRoot: string): Promise<PluginManifest> {
  const packagePath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8')) as {
    plugins?: unknown;
  };
  return { paths: validatePluginPaths(packageJson.plugins) };
}

export function validatePluginPaths(input: unknown) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('package.json.plugins must contain at least one plugin');
  }
  const paths = input.map((entry) => {
    if (typeof entry !== 'string' || !entry.startsWith('./plugins/')) {
      throw new Error(`Invalid project plugin entry ${JSON.stringify(entry)}`);
    }
    if (/\.(c|m)?[jt]sx?$/.test(entry)) {
      throw new Error(`Plugin entries must omit the extension: ${entry}`);
    }
    return entry;
  });
  const names = paths.map(normalizedPluginName);
  if (new Set(names).size !== names.length) {
    throw new Error('Duplicate plugin registration in package.json.plugins');
  }
  return paths;
}

export function pluginServiceName(pluginPath: string) {
  return normalizedPluginName(pluginPath);
}
