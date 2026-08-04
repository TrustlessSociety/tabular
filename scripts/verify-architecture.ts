import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const expectedDependencies: Record<string, string> = {
  '@stackpress/ingest': '0.10.8',
  '@stackpress/inquire': '0.10.8',
  '@stackpress/inquire-pg': '0.10.8',
  '@stackpress/lib': '0.10.8',
  exceljs: '4.4.0',
  pg: '8.16.3',
  react: '19.2.4',
  'react-dom': '19.2.4',
  reactus: '0.10.8',
  'tabulator-tables': '6.5.0'
};
const expectedDevelopmentDependencies: Record<string, string> = {
  '@electric-sql/pglite': '0.3.15',
  '@stackpress/inquire-pglite': '0.10.8'
};
const forbiddenPackages = [
  'stackpress',
  '@stackpress/idea',
  'stackpress-admin',
  'stackpress-api',
  'stackpress-session',
  'stackpress-server',
  'stackpress-schema',
  'stackpress-sql',
  'stackpress-csrf'
];
const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(await fs.readFile(path.join(projectRoot, 'package-lock.json'), 'utf8'));
assert.deepEqual(packageJson.plugins, [
  './plugins/database/plugin',
  './plugins/identity/plugin',
  './plugins/operations/plugin',
  './plugins/catalog/plugin',
  './plugins/capability/plugin',
  './plugins/files/plugin',
  './plugins/saved-views/plugin',
  './plugins/import-export/plugin',
  './plugins/explorer/plugin',
  './plugins/ui/plugin',
  './plugins/grid/plugin',
  './plugins/commands/plugin',
  './plugins/realtime/plugin',
  './plugins/mcp/plugin',
  './plugins/app/plugin'
]);
for (const [name, version] of Object.entries(expectedDependencies)) {
  assert.equal(packageJson.dependencies[name], version, `${name} must be pinned to ${version}`);
}
for (const [name, version] of Object.entries(expectedDevelopmentDependencies)) {
  assert.equal(packageJson.dependencies[name], undefined, `${name} must not ship at runtime`);
  assert.equal(packageJson.devDependencies[name], version, `${name} must be pinned to ${version}`);
}
for (const name of forbiddenPackages) {
  assert.equal(packageJson.dependencies?.[name], undefined, `${name} is forbidden`);
  assert.equal(packageJson.devDependencies?.[name], undefined, `${name} is forbidden`);
  assert.equal(lock.packages?.[`node_modules/${name}`], undefined, `${name} exists in lockfile`);
}

async function filesUnder(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }));
  return nested.flat();
}

const sourceRoots = ['bootstrap', 'config', 'entrypoints', 'plugins', 'scripts', 'tests'];
const sourceFiles = (
  await Promise.all(sourceRoots.map((root) => filesUnder(path.join(projectRoot, root))))
).flat().filter((file) =>
  /\.[cm]?[jt]sx?$/.test(file)
  && file !== path.join(projectRoot, 'scripts/verify-architecture.ts')
);
const forbiddenSource = [
  /from\s+['\"]stackpress(?:\/|['\"])/,
  /from\s+['\"]@stackpress\/idea(?:\/|['\"])/,
  /schema\.idea/,
  /generated(?:Store|Client|Model)/
];
for (const file of sourceFiles) {
  const source = await fs.readFile(file, 'utf8');
  for (const pattern of forbiddenSource) {
    assert.doesNotMatch(source, pattern, `${path.relative(projectRoot, file)} violates ${pattern}`);
  }
  if (
    file !== path.join(projectRoot, 'plugins/identity/helpers/contracts.ts')
    && file !== path.join(projectRoot, 'plugins/identity/helpers/service.ts')
  ) {
    assert.doesNotMatch(
      source,
      /issueBrowserMutationPrincipal/,
      `${path.relative(projectRoot, file)} cannot mint browser mutation authority`
    );
  }
}

const browserFiles = sourceFiles.filter((file) =>
  /\/plugins\/[^/]+\/(components|views)\//.test(file)
);
const productionSourceFiles = sourceFiles.filter((file) =>
  !/\/tests\//.test(file)
  && !file.endsWith('.test.ts')
  && !file.endsWith('.test.tsx')
);
for (const file of productionSourceFiles) {
  const source = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(source, /@electric-sql\/pglite|@stackpress\/inquire-pglite/,
    `${path.relative(projectRoot, file)} imports a test-only database adapter`);
}
assert.ok(
  (await Promise.all(productionSourceFiles.map((file) => fs.readFile(file, 'utf8'))))
    .some((source) => /from\s+['"]@stackpress\/lib(?:\/|['"])/.test(source)),
  '@stackpress/lib must have a deliberate direct production use'
);
const serverOnlyBrowserPatterns = [
  /from\s+['\"]node:/,
  /from\s+['\"]@stackpress\/ingest/,
  /from\s+['\"]@stackpress\/inquire/,
  /from\s+['\"]pg['\"]/,
  /from\s+['\"]reactus(?:\/server)?['\"]/,
  /process\./
];
for (const file of browserFiles) {
  const source = await fs.readFile(file, 'utf8');
  for (const pattern of serverOnlyBrowserPatterns) {
    assert.doesNotMatch(source, pattern, `${path.relative(projectRoot, file)} imports server code`);
  }
}

const browserGraph = new Set(browserFiles);
const browserQueue = [...browserFiles];
while (browserQueue.length > 0) {
  const file = browserQueue.shift()!;
  const source = await fs.readFile(file, 'utf8');
  for (const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
    const base = path.resolve(path.dirname(file), match[1]);
    const candidate = [base, `${base}.ts`, `${base}.tsx`, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')]
      .find((entry) => sourceFiles.includes(entry));
    if (candidate && !browserGraph.has(candidate)) {
      browserGraph.add(candidate);
      browserQueue.push(candidate);
    }
  }
}
for (const file of browserGraph) {
  const source = await fs.readFile(file, 'utf8');
  for (const pattern of serverOnlyBrowserPatterns) {
    assert.doesNotMatch(source, pattern, `${path.relative(projectRoot, file)} enters the browser graph with server code`);
  }
}

const pluginRoot = path.join(projectRoot, 'plugins/app');
const allowedPluginEntries = new Set(['helpers', 'pages', 'plugin.ts', 'tests', 'views']);
const pluginEntries = await fs.readdir(pluginRoot, { withFileTypes: true });
for (const entry of pluginEntries) {
  assert.ok(allowedPluginEntries.has(entry.name), `Unexpected app plugin entry ${entry.name}`);
  if (entry.isDirectory()) {
    assert.ok((await fs.readdir(path.join(pluginRoot, entry.name))).length > 0, `${entry.name} is empty`);
  }
}
for (const [feature, allowedEntries] of [
  ['ui', new Set(['components', 'helpers', 'plugin.ts', 'tests', 'views'])],
  ['grid', new Set(['components', 'events', 'helpers', 'pages', 'plugin.ts', 'tests'])],
  ['commands', new Set(['components', 'events', 'helpers', 'plugin.ts', 'tests', 'views'])],
  ['explorer', new Set(['components', 'events', 'helpers', 'pages', 'plugin.ts', 'tests', 'views'])],
  ['import-export', new Set(['components', 'events', 'helpers', 'pages', 'plugin.ts', 'tests', 'views'])],
  ['operations', new Set(['components', 'events', 'helpers', 'pages', 'plugin.ts', 'tests', 'views'])],
  ['mcp', new Set(['events', 'helpers', 'plugin.ts', 'tests'])]
] as const) {
  const featureRoot = path.join(projectRoot, 'plugins', feature);
  const entries = await fs.readdir(featureRoot, { withFileTypes: true });
  for (const entry of entries) {
    assert.ok(allowedEntries.has(entry.name), `Unexpected ${feature} plugin entry ${entry.name}`);
    if (entry.isDirectory()) {
      assert.ok(
        (await fs.readdir(path.join(featureRoot, entry.name))).length > 0,
        `${feature}/${entry.name} is empty`
      );
    }
  }
}
const databasePluginRoot = path.join(projectRoot, 'plugins/database');
const allowedDatabaseEntries = new Set(['helpers', 'migrations', 'plugin.ts', 'tests']);
const databasePluginEntries = await fs.readdir(databasePluginRoot, { withFileTypes: true });
for (const entry of databasePluginEntries) {
  assert.ok(
    allowedDatabaseEntries.has(entry.name),
    `Unexpected database plugin entry ${entry.name}`
  );
  if (entry.isDirectory()) {
    assert.ok(
      (await fs.readdir(path.join(databasePluginRoot, entry.name))).length > 0,
      `database/${entry.name} is empty`
    );
  }
}
for (const feature of ['identity', 'catalog']) {
  const featureRoot = path.join(projectRoot, 'plugins', feature);
  const allowedEntries = new Set([
    ...(feature === 'identity' ? ['events', 'views'] : []),
    'helpers',
    'pages',
    'plugin.ts',
    'tests'
  ]);
  const entries = await fs.readdir(featureRoot, { withFileTypes: true });
  for (const entry of entries) {
    assert.ok(allowedEntries.has(entry.name), `Unexpected ${feature} plugin entry ${entry.name}`);
    if (entry.isDirectory()) {
      assert.ok(
        (await fs.readdir(path.join(featureRoot, entry.name))).length > 0,
        `${feature}/${entry.name} is empty`
      );
    }
  }
}
{
  for (const [feature, allowedEntries] of [
    ['capability', new Set(['events', 'helpers', 'plugin.ts', 'tests'])],
    ['files', new Set(['events', 'helpers', 'pages', 'plugin.ts', 'tests'])]
  ] as const) {
    const featureRoot = path.join(projectRoot, 'plugins', feature);
    const entries = await fs.readdir(featureRoot, { withFileTypes: true });
    for (const entry of entries) {
      assert.ok(allowedEntries.has(entry.name), `Unexpected ${feature} plugin entry ${entry.name}`);
      if (entry.isDirectory()) {
        assert.ok(
          (await fs.readdir(path.join(featureRoot, entry.name))).length > 0,
          `${feature}/${entry.name} is empty`
        );
      }
    }
  }
}
const appRoutesSource = await fs.readFile(
  path.join(projectRoot, 'plugins/app/pages/routes.ts'),
  'utf8'
);
const appPluginSource = await fs.readFile(
  path.join(projectRoot, 'plugins/app/plugin.ts'),
  'utf8'
);
assert.doesNotMatch(
  appRoutesSource,
  /\/events\/(?:explorer|files|grid|grid-relation|import-source)|\/pages\/(?:browse|import|table)\.html/,
  'App routes must remain limited to shell, health, assets, and fallback ownership'
);
assert.doesNotMatch(
  appPluginSource,
  /from\s+['"]\.\.\/(?:capability|commands|explorer|files|grid|identity|import-export|realtime|saved-views|ui)\//,
  'App plugin must not resolve feature services'
);
const bootstrapSource = await fs.readFile(
  path.join(projectRoot, 'bootstrap/application.ts'),
  'utf8'
);
assert.match(bootstrapSource, /rawHandlers\.dispatch\(request, response\)/);
assert.doesNotMatch(
  bootstrapSource,
  /plugins\/[^/'"]+\/pages/,
  'Application bootstrap must not import feature HTTP handlers'
);
for (const [owner, expectedRoutes] of [
  ['plugins/explorer/pages/routes.ts', ['/events/explorer', '/pages/browse.html']],
  ['plugins/grid/pages/routes.ts', ['/events/grid', '/events/grid-relation', '/pages/table.html']],
  ['plugins/files/pages/routes.ts', ['/events/files']],
  ['plugins/import-export/pages/raw-upload.ts', ['/events/import-source']]
] as const) {
  const source = await fs.readFile(path.join(projectRoot, owner), 'utf8');
  for (const route of expectedRoutes) {
    assert.ok(source.includes(route), `${owner} must own ${route}`);
  }
}
await assert.rejects(
  () => fs.access(path.join(projectRoot, 'schema.idea')),
  'Production root must not contain schema.idea'
);
const migrateSource = await fs.readFile(path.join(projectRoot, 'entrypoints/migrate.ts'), 'utf8');
const workerSource = await fs.readFile(path.join(projectRoot, 'entrypoints/worker.ts'), 'utf8');
assert.doesNotMatch(migrateSource, /startWeb|\.listen\(/);
assert.doesNotMatch(workerSource, /startWeb|\.listen\(/);
assert.match(migrateSource, /assertProductionConfiguration\(application\.config\)/);
assert.match(workerSource, /assertProductionConfiguration\(application\.config\)/);
assert.match(migrateSource, /--consume-operations/);
assert.match(migrateSource, /worker\.start\(\)/);
assert.equal(
  packageJson.scripts['migrator:operations'],
  'node dist/entrypoints/migrate.js --consume-operations'
);
process.stdout.write(JSON.stringify({
  result: 'passed',
  plugins: packageJson.plugins,
  directDependencies: Object.keys(expectedDependencies),
  testOnlyDependencies: Object.keys(expectedDevelopmentDependencies),
  forbiddenPackages: 'absent',
  browserImports: 'transitive graph server-free',
  routeOwnership: 'feature-owned',
  rawHandlers: 'registered bootstrap seam'
}, null, 2) + '\n');
