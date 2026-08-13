//node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

//client
import { createApplication } from '../../../src/bootstrap/application.js';
import { loadPluginManifest, validatePluginPaths } from '../../../src/bootstrap/plugins.js';
import { createExplorerSnapshot } from '../explorer/fixtures.js';
import { dispatchExplorerAction } from '../../../src/plugins/explorer/events/actions.js';
import { resolveExplorerAction } from '../../../src/plugins/explorer/helpers/routes.js';
import appPlugin from '../../../src/plugins/app/plugin.js';

test('app plugin loads in declared order with config and stable service lookup', async () => {
  const projectRoot = process.cwd();
  assert.deepEqual((await loadPluginManifest(projectRoot)).paths, [
    './src/plugins/database/plugin',
    './src/plugins/identity/plugin',
    './src/plugins/operations/plugin',
    './src/plugins/catalog/plugin',
    './src/plugins/capability/plugin',
    './src/plugins/files/plugin',
    './src/plugins/saved-views/plugin',
    './src/plugins/import-export/plugin',
    './src/plugins/explorer/plugin',
        './src/plugins/grid/plugin',
    './src/plugins/commands/plugin',
    './src/plugins/realtime/plugin',
    './src/plugins/mcp/plugin',
    './src/plugins/app/plugin'
  ]);
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot,
    runtimeRoot: projectRoot
  });
  const service = application.app.plugin('tabular.app');
  assert.deepEqual(service, {
    name: 'tabular.app',
    configName: 'Tabular',
    routes: [
      '/healthz', '/readyz', '/client/**', '/assets/**', '/styles/**', '/favicon.ico', '/**'
    ]
  });
  assert.deepEqual(application.runtime.rawHandlers.routes, [
    'POST /events/import-source'
  ]);
  assert.deepEqual(application.runtime.pluginOrder, [
    'tabular.database', 'tabular.identity', 'tabular.operations', 'tabular.catalog', 'tabular.capability', 'tabular.files', 'tabular.saved-views', 'tabular.import-export',
    'tabular.explorer', 'tabular.grid', 'tabular.commands', 'tabular.realtime', 'tabular.mcp', 'tabular.app'
  ]);
  assert.equal(application.operations.name, 'tabular.operations');
  assert.equal(application.app.plugin('tabular.operations'), application.operations);
  assert.equal(application.app.plugins.has('src/plugins/app/plugin'), false);
  await application.app.bootstrap();
  assert.equal(application.app.plugin('tabular.app'), service);
  assert.deepEqual(application.runtime.pluginOrder, [
    'tabular.database', 'tabular.identity', 'tabular.operations', 'tabular.catalog', 'tabular.capability', 'tabular.files', 'tabular.saved-views', 'tabular.import-export',
    'tabular.explorer', 'tabular.grid', 'tabular.commands', 'tabular.realtime', 'tabular.mcp', 'tabular.app'
  ]);
  await assert.rejects(() => appPlugin(application.app), /already registered/);
});

test('worker composition does not initialize web artifacts or HTTP routes', async () => {
  const runtimeRoot = process.cwd();
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-worker-project-'));
  try {
    await fs.copyFile(
      path.join(runtimeRoot, 'package.json'),
      path.join(projectRoot, 'package.json')
    );
    const application = await createApplication({
      processKind: 'worker',
      env: { NODE_ENV: 'test' },
      projectRoot,
      runtimeRoot
    });
    assert.equal(application.runtime.reactus, undefined);
    assert.deepEqual(application.runtime.artifacts.artifacts, []);
    assert.deepEqual(application.appService.routes, []);
    assert.deepEqual(application.runtime.rawHandlers.routes, []);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('plugin manifest rejects duplicates and extensions', () => {
  assert.throws(
    () => validatePluginPaths(['./src/plugins/app/plugin', './src/plugins/app/plugin']),
    /Duplicate plugin registration/
  );
  assert.throws(() => validatePluginPaths(['./src/plugins/app/plugin.ts']), /omit the extension/);
  assert.throws(() => validatePluginPaths(['stackpress']), /Invalid project plugin entry/);
});

test('source runtime plugin path remains extensionless', () => {
  assert.equal(path.extname('./src/plugins/app/plugin'), '');
});

test('table settings rebinds an existing stable file independently from its temporary destination folder', () => {
  const snapshot = createExplorerSnapshot();
  const source = snapshot.folders.find((folder) => folder.slug === 'operations')!;
  const destination = snapshot.folders.find((folder) => folder.slug === 'finance')!;
  const file = source.files.find((candidate) => candidate.slug === 'customer-orders')!;
  const action = resolveExplorerAction({
    type: 'file.settings.apply',
    commandId: 'cmd_settings_move',
    folder: destination,
    file,
    displayName: 'Customer orders',
    physicalName: 'customer_orders',
    physicalNameOverridden: false
  }, snapshot);
  assert.equal(action.type, 'file.settings.apply');
  if (action.type !== 'file.settings.apply') return;
  assert.equal(action.folder.id, destination.id);
  assert.equal(action.sourceFolder.id, source.id);
  assert.equal(action.file.id, file.id);
  assert.equal(action.file.folderId, source.id);
});

test('cross-folder rename and settings require source authority as well as destination authority', async () => {
  const snapshot = createExplorerSnapshot();
  const source = snapshot.folders.find((folder) => folder.slug === 'operations')!;
  const destination = snapshot.folders.find((folder) => folder.slug === 'finance')!;
  source.permissions = {
    createFile: false,
    importFile: false,
    renameFile: false,
    configureFile: false
  };
  const file = source.files.find((candidate) => candidate.slug === 'customer-orders')!;
  const settings = resolveExplorerAction({
    type: 'file.settings.apply',
    commandId: 'cmd_settings_mixed_authority',
    folder: destination,
    file,
    displayName: 'Customer archive',
    physicalName: 'customer_orders',
    physicalNameOverridden: false
  }, snapshot);
  const settingsResult = await dispatchExplorerAction(settings);
  assert.equal(settingsResult.ok, false);
  if (!settingsResult.ok) assert.equal(settingsResult.code, 'permission_denied');

  const rename = resolveExplorerAction({
    type: 'file.rename.display',
    commandId: 'cmd_rename_mixed_authority',
    folder: destination,
    file,
    displayName: 'Customer archive'
  }, snapshot);
  const renameResult = await dispatchExplorerAction(rename);
  assert.equal(renameResult.ok, false);
  if (!renameResult.ok) assert.equal(renameResult.code, 'permission_denied');
});
