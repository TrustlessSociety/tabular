//node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

//client
import type { ApplicationRuntimeService } from '../bootstrap/application.js';
import { prepareProductPage, renderRegisteredView } from '../plugins/app/helpers/rendering.js';
import { registeredViewEntries } from '../bootstrap/build.js';

const root = process.cwd();

test('every page file is one default-exported lazy entry and plugin roots do not eagerly import it', async () => {
  const pageFiles = await pageFilesUnder(path.join(root, 'plugins'));
  assert.ok(pageFiles.length > 0);
  for (const file of pageFiles) {
    const source = await fs.readFile(file, 'utf8');
    assert.equal((source.match(/\bexport\s+default\b/g) || []).length, 1, file);
    assert.doesNotMatch(source, /\bexport\s+(?!default\b)/, file);
  }
  const pluginFiles = await Promise.all([
    'app', 'catalog', 'explorer', 'files', 'grid', 'identity',
    'import-export', 'operations', 'realtime', 'saved-views'
  ].map((plugin) => fs.readFile(path.join(root, 'plugins', plugin, 'plugin.ts'), 'utf8')));
  for (const source of pluginFiles) assert.doesNotMatch(source, /from\s+['"]\.\/pages\//);
});

test('build discovery reads registered views once and never calls a lazy page handler', () => {
  let handlerExecutions = 0;
  const lazyHandler = () => { handlerExecutions += 1; };
  const views = new Map([
    ['/pages/table.html', new Set([{ entry: '@/plugins/grid/views/table', priority: 0 }])],
    ['/pages/browse.html', new Set([{ entry: '@/plugins/explorer/views/index', priority: 0 }])],
    ['/pages/', new Set([{ entry: '@/plugins/grid/views/table', priority: 0 }])]
  ]);
  const entries = registeredViewEntries({ views } as never);
  assert.deepEqual([...entries], [
    '@/plugins/grid/views/table',
    '@/plugins/explorer/views/index'
  ]);
  assert.equal(handlerExecutions, 0);
  void lazyHandler;
});

test('page response data flows to its paired view without widening the Provider projection', async () => {
  let pageData: Record<string, unknown> | undefined;
  let rendered: { entry: string, props: Record<string, unknown> } | undefined;
  const response = {
    headers: new Headers(),
    body: null as string | null,
    code: 0,
    redirected: false,
    data: {
      set(value: Record<string, unknown>) { pageData = value; },
      get<T>() { return pageData as T; }
    },
    statusCode(code: number) { this.code = code; },
    html() { this.body = '<html />'; }
  };
  const runtime = {
    config: { app: { name: 'Tabular', version: '0.1.0' } },
    lifecycle: { phase: 'ready' },
    resources: { readiness: async () => ({ ready: true, checks: [] }) },
    reactus: {
      render: async (entry: string, props: Record<string, unknown>) => {
        rendered = { entry, props };
        return '<html />';
      }
    },
    artifacts: { schemaVersion: 1, generatedAt: '2026-08-07T00:00:00.000Z', artifacts: [] }
  } as unknown as ApplicationRuntimeService;
  await prepareProductPage(response as never, runtime, {
    surface: 'table',
    route: { folder: 'workspace', table: 'orders' },
    identity: { displayName: 'Operator' },
    csrfToken: 'csrf'
  });
  await renderRegisteredView(
    '@/plugins/grid/views/table',
    { method: 'GET', url: new URL('/pages/table.html?folder=workspace&table=orders', 'http://tabular.test') } as never,
    response as never,
    runtime
  );
  assert.equal(rendered?.entry, '@/plugins/grid/views/table');
  assert.equal(rendered?.props.data, pageData);
  const provider = rendered?.props.provider as { request: { route: Record<string, unknown> }, session: Record<string, unknown> };
  assert.deepEqual(provider.request.route, { surface: 'table', folder: 'workspace', table: 'orders' });
  assert.deepEqual(provider.session, {
    authenticated: true,
    displayName: 'Operator',
    capabilities: {},
    csrf: 'csrf'
  });
});

test('each rendered route registers exactly one feature-owned view entry', async () => {
  const expected: Array<[string, string, string]> = [
    ['explorer', '/', '@/plugins/explorer/views/index'],
    ['explorer', '/pages/browse.html', '@/plugins/explorer/views/index'],
    ['grid', '/pages/table.html', '@/plugins/grid/views/table'],
    ['identity', '/auth/login', '@/plugins/identity/views/login'],
    ['identity', '/auth/account', '@/plugins/identity/views/account'],
    ['import-export', '/pages/import.html', '@/plugins/import-export/views/import'],
    ['operations', '/pages/system-activity.html', '@/plugins/operations/views/activity']
  ];
  for (const [plugin, route, entry] of expected) {
    const source = await fs.readFile(path.join(root, 'plugins', plugin, 'plugin.ts'), 'utf8');
    const registration = `server.view.get('${route}', '${entry}')`;
    assert.equal(source.split(registration).length - 1, 1, registration);
    assert.equal(source.split(`server.import.`).length > 1, true, `${plugin} has no import registration`);
  }
});

async function pageFilesUnder(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await pageFilesUnder(absolute));
    else if (absolute.includes(`${path.sep}pages${path.sep}`) && absolute.endsWith('.ts')) files.push(absolute);
  }
  return files;
}
