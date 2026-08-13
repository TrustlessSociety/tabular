import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const packageRoot = path.join(projectRoot, '.build/release-package');
const finalizeInstalledPackage = process.argv.includes('--finalize-installed');

if (!finalizeInstalledPackage) {
  await fs.rm(packageRoot, { recursive: true, force: true });
  await fs.mkdir(packageRoot, { recursive: true });

  for (const entry of [
    'src',
    'scripts/runtime',
    'public',
    'docs',
    'package.json',
    'package-lock.json',
    'README.md',
    '.env.example',
    'LICENSE'
  ]) {
    const source = path.join(projectRoot, entry);
    const destination = path.join(packageRoot, entry);
    const stat = await fs.stat(source);
    if (stat.isDirectory()) await fs.cp(source, destination, { recursive: true });
    else await fs.copyFile(source, destination);
  }
  await fs.mkdir(path.join(packageRoot, '.build'), { recursive: true });
  await fs.cp(
    path.join(projectRoot, '.build/pages'),
    path.join(packageRoot, '.build/pages'),
    { recursive: true }
  );
  await fs.copyFile(
    path.join(projectRoot, '.build/artifact-manifest.json'),
    path.join(packageRoot, '.build/artifact-manifest.json')
  );

  const packagedPackagePath = path.join(packageRoot, 'package.json');
  const packagedPackage = JSON.parse(await fs.readFile(packagedPackagePath, 'utf8')) as {
    scripts: Record<string, string>;
  };
  const runtimeScriptNames = [
    'start',
    'preflight',
    'doctor',
    'migrate',
    'seed:demo',
    'migrator:operations',
    'worker',
    'audit:production'
  ];
  packagedPackage.scripts = Object.fromEntries(runtimeScriptNames.map((name) => {
    const command = packagedPackage.scripts[name];
    assert.ok(command, `Missing runtime package script ${name}`);
    return [name, command];
  }));
  await fs.writeFile(packagedPackagePath, `${JSON.stringify(packagedPackage, null, 2)}\n`);
} else {
  await fs.access(path.join(packageRoot, 'node_modules'));
}

const files = (await filesUnder(packageRoot))
  .filter((file) => path.basename(file) !== 'release-manifest.json')
  .sort();
const artifacts = await Promise.all(files.map(async (file) => {
  const body = await fs.readFile(file);
  const relative = path.relative(packageRoot, file);
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    assert.doesNotMatch(
      body.toString('utf8'),
      /@electric-sql\/pglite|@stackpress\/inquire-pglite/,
      `${relative} imports a test-only adapter`
    );
  }
  return {
    file: relative,
    bytes: body.byteLength,
    sha256: crypto.createHash('sha256').update(body).digest('hex')
  };
}));
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  node: process.version,
  application: '@trustless/tabular@0.1.0',
  installedProductionDependencies: finalizeInstalledPackage,
  coverage: 'all packaged files except release-manifest.json itself',
  files: artifacts
};
await fs.writeFile(
  path.join(packageRoot, 'release-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { mode: 0o600 }
);
process.stdout.write(`${JSON.stringify({
  result: 'passed',
  packageRoot,
  files: artifacts.length,
  installedProductionDependencies: finalizeInstalledPackage,
  testOnlyAdapters: 'absent'
}, null, 2)}\n`);

async function filesUnder(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }));
  return nested.flat();
}
