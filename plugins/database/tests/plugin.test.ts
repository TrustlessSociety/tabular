import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../../../bootstrap/application.js';
import databasePlugin from '../plugin.js';

test('database plugin registers a stable lazy service before app bootstrap completes', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.database.name, 'tabular.database');
  assert.equal(application.database.processKind, 'web');
  assert.equal(application.database.configured('web'), false);
  assert.throws(() => application.database.openPool('web'), /not configured/);
  assert.throws(() => application.database.openPool('migrator'), /cannot open/);
  await assert.rejects(() => application.database.migrate(), /Only the migrator process/);
  assert.deepEqual(application.runtime.pluginOrder, [
    'tabular.database', 'tabular.identity', 'tabular.operations', 'tabular.catalog', 'tabular.capability', 'tabular.files', 'tabular.saved-views', 'tabular.import-export',
    'tabular.explorer', 'tabular.ui', 'tabular.grid', 'tabular.commands', 'tabular.realtime', 'tabular.mcp', 'tabular.app'
  ]);
  const service = application.app.plugin('tabular.database');
  await application.app.bootstrap();
  assert.equal(application.app.plugin('tabular.database'), service);
  assert.deepEqual(application.runtime.pluginOrder, [
    'tabular.database', 'tabular.identity', 'tabular.operations', 'tabular.catalog', 'tabular.capability', 'tabular.files', 'tabular.saved-views', 'tabular.import-export',
    'tabular.explorer', 'tabular.ui', 'tabular.grid', 'tabular.commands', 'tabular.realtime', 'tabular.mcp', 'tabular.app'
  ]);
  assert.throws(() => databasePlugin(application.app), /already registered/);
});
