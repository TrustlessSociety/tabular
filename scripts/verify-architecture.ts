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

/**
 * Normalize one project-relative source path for portable architecture checks.
 */
function relativePath(file: string) {
  return path.relative(projectRoot, file).replaceAll('\\', '/');
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
  /plugins\/[^/]+\/(components|views)\//.test(relativePath(file))
);
const developmentOnlySourcePaths = new Set([
  'scripts/develop.ts',
  'scripts/develop-pglite.ts'
]);
const productionSourceFiles = sourceFiles.filter((file) => {
  const relative = relativePath(file);
  return !developmentOnlySourcePaths.has(relative)
    && !relative.includes('/tests/')
    && !file.endsWith('.test.ts')
    && !file.endsWith('.test.tsx');
});
for (const file of productionSourceFiles) {
  const source = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(source, /@electric-sql\/pglite|@stackpress\/inquire-pglite/,
    `${path.relative(projectRoot, file)} imports a test-only database adapter`);
}
const developmentSource = await fs.readFile(
  path.join(projectRoot, 'scripts/develop-pglite.ts'),
  'utf8'
);
assert.match(developmentSource, /import\(['"]@electric-sql\/pglite['"]\)/);
assert.match(developmentSource, /import\(['"]@stackpress\/inquire-pglite\/Connection['"]\)/);
const developmentEntrypoint = await fs.readFile(
  path.join(projectRoot, 'scripts/develop.ts'),
  'utf8'
);
assert.match(developmentEntrypoint, /NODE_ENV: 'development'/);
assert.match(developmentEntrypoint, /!config\.database\.webUrl/);

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
const allowedPluginEntries = new Set(['components', 'helpers', 'pages', 'plugin.ts', 'tests', 'views']);
const pluginEntries = await fs.readdir(pluginRoot, { withFileTypes: true });
for (const entry of pluginEntries) {
  assert.ok(allowedPluginEntries.has(entry.name), `Unexpected app plugin entry ${entry.name}`);
  if (entry.isDirectory()) {
    assert.ok((await fs.readdir(path.join(pluginRoot, entry.name))).length > 0, `${entry.name} is empty`);
  }
}
for (const [feature, allowedEntries] of [
  ['grid', new Set(['components', 'events', 'helpers', 'pages', 'plugin.ts', 'tests', 'views'])],
  ['commands', new Set(['components', 'events', 'helpers', 'plugin.ts', 'tests', 'views'])],
  ['explorer', new Set(['components', 'events', 'helpers', 'pages', 'plugin.ts', 'tests', 'views'])],
  ['import-export', new Set(['components', 'events', 'helpers', 'pages', 'plugin.ts', 'tests', 'views'])],
  ['operations', new Set(['components', 'events', 'helpers', 'pages', 'plugin.ts', 'tests', 'views'])],
  ['mcp', new Set(['events', 'helpers', 'plugin.ts', 'tests'])],
  ['realtime', new Set(['events', 'helpers', 'pages', 'plugin.ts', 'tests'])],
  ['saved-views', new Set(['components', 'events', 'helpers', 'pages', 'plugin.ts', 'tests', 'views'])]
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
const appPluginSource = await fs.readFile(
  path.join(projectRoot, 'plugins/app/plugin.ts'),
  'utf8'
);
assert.doesNotMatch(
  appPluginSource,
  /from\s+['"]\.\.\/(?:capability|commands|explorer|files|grid|identity|import-export|realtime|saved-views|)\//,
  'App plugin must not resolve feature services'
);
assert.doesNotMatch(
  appPluginSource,
  /from\s+['"]\.\/pages\//,
  'App plugin must not eagerly import page handlers'
);
assert.doesNotMatch(
  appPluginSource,
  /pages\/routes/,
  'App plugin must not use a route aggregator'
);
const pageFiles = (await filesUnder(path.join(projectRoot, 'plugins'))).filter((file) =>
  relativePath(file).includes('/pages/') && /\.ts$/.test(file)
);
for (const file of pageFiles) {
  const source = await fs.readFile(file, 'utf8');
  assert.match(source, /export\s+default\s+(?:async\s+)?(?:function|class|[A-Za-z_$][\w$]*)/, `${relativePath(file)} must have one default page export`);
  assert.equal(
    (source.match(/\bexport\s+default\b/g) || []).length,
    1,
    `${relativePath(file)} must have exactly one default export`
  );
  assert.doesNotMatch(source, /\bexport\s+(?!default\b)/, `${relativePath(file)} must not export helper symbols`);
}
const forbiddenAggregators = [
  'plugins/app/pages/routes.ts',
  'plugins/catalog/pages/routes.ts',
  'plugins/explorer/pages/routes.ts',
  'plugins/files/pages/routes.ts',
  'plugins/grid/pages/routes.ts',
  'plugins/identity/pages/routes.ts',
  'plugins/import-export/pages/routes.ts',
  'plugins/operations/pages/routes.ts',
  'plugins/realtime/pages/routes.ts',
  'plugins/saved-views/pages/routes.ts',
  'plugins/operations/pages/contracts.ts',
  'plugins/operations/pages/presenter.ts',
  'plugins/import-export/pages/raw-upload.ts'
];
for (const relative of forbiddenAggregators) {
  await assert.rejects(() => fs.access(path.join(projectRoot, relative)), `${relative} must be removed from pages`);
}
const registeredPageImports: Array<[string, string, string]> = [
  ['plugins/catalog/plugin.ts', 'get', '/api/catalog'],
  ['plugins/explorer/plugin.ts', 'get', '/'],
  ['plugins/explorer/plugin.ts', 'get', '/pages/browse.html'],
  ['plugins/explorer/plugin.ts', 'post', '/events/explorer'],
  ['plugins/files/plugin.ts', 'get', '/events/files'],
  ['plugins/grid/plugin.ts', 'get', '/pages/table.html'],
  ['plugins/grid/plugin.ts', 'get', '/events/grid'],
  ['plugins/grid/plugin.ts', 'get', '/events/grid-relation'],
  ['plugins/grid/plugin.ts', 'post', '/events/grid'],
  ['plugins/identity/plugin.ts', 'get', '/auth/login'],
  ['plugins/identity/plugin.ts', 'post', '/auth/login'],
  ['plugins/identity/plugin.ts', 'get', '/auth/account'],
  ['plugins/identity/plugin.ts', 'get', '/auth/session'],
  ['plugins/identity/plugin.ts', 'post', '/auth/session/rotate'],
  ['plugins/identity/plugin.ts', 'post', '/auth/logout'],
  ['plugins/import-export/plugin.ts', 'get', '/pages/import.html'],
  ['plugins/import-export/plugin.ts', 'get', '/events/import-google-callback'],
  ['plugins/import-export/plugin.ts', 'get', '/events/import-export'],
  ['plugins/import-export/plugin.ts', 'post', '/events/import-export'],
  ['plugins/operations/plugin.ts', 'get', '/pages/system-activity.html'],
  ['plugins/operations/plugin.ts', 'get', '/events/operations'],
  ['plugins/operations/plugin.ts', 'post', '/events/operations'],
  ['plugins/saved-views/plugin.ts', 'get', '/events/saved-views'],
  ['plugins/saved-views/plugin.ts', 'post', '/events/saved-views']
];
for (const [owner, method, route] of registeredPageImports) {
  const source = await fs.readFile(path.join(projectRoot, owner), 'utf8');
  assert.match(source, new RegExp(`server\\.import\\.${method}\\(['"]${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`), `${owner} must lazily register ${method.toUpperCase()} ${route}`);
  assert.doesNotMatch(source, /from\s+['"]\.\/pages\//, `${owner} must not eagerly import page handlers`);
}
const renderedRouteViews: Array<[string, string]> = [
  ['plugins/explorer/plugin.ts', "server.view.get('/'"],
  ['plugins/explorer/plugin.ts', "server.view.get('/pages/browse.html'"],
  ['plugins/grid/plugin.ts', "server.view.get('/pages/table.html'"],
  ['plugins/identity/plugin.ts', "server.view.get('/auth/login'"],
  ['plugins/identity/plugin.ts', "server.view.get('/auth/account'"],
  ['plugins/import-export/plugin.ts', "server.view.get('/pages/import.html'"],
  ['plugins/operations/plugin.ts', "server.view.get('/pages/system-activity.html'"]
];
for (const [owner, registration] of renderedRouteViews) {
  const source = await fs.readFile(path.join(projectRoot, owner), 'utf8');
  assert.equal(source.split(registration).length - 1, 1, `${owner} must pair ${registration} exactly once`);
}
assert.doesNotMatch(
  await fs.readFile(path.join(projectRoot, 'config/reactus.ts'), 'utf8'),
  /\bentry\s*:/,
  'Reactus config must not expose a singleton entry'
);
await assert.rejects(
  () => fs.access(path.join(projectRoot, 'plugins/ui')),
  'The global UI plugin must be removed'
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
  rawHandlers: 'registered bootstrap seam',
  developmentRuntime: 'source-only dynamic PGlite gate'
}, null, 2) + '\n');
