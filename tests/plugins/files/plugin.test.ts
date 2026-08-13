//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { createApplication } from '../../../src/bootstrap/application.js';
import filesPlugin from '../../../src/plugins/files/plugin.js';
import { FILES_ROUTES } from '../../../src/plugins/files/plugin.js';

test('files plugin registers between capability and app with a stable service', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.files.name, 'tabular.files');
  assert.deepEqual(FILES_ROUTES, ['/events/files']);
  assert.equal(application.app.plugin('tabular.files'), application.files);
  assert.deepEqual(application.runtime.pluginOrder, [
    'tabular.database', 'tabular.identity', 'tabular.operations', 'tabular.catalog',
    'tabular.capability', 'tabular.files', 'tabular.saved-views', 'tabular.import-export', 'tabular.explorer', 'tabular.grid',
    'tabular.commands', 'tabular.realtime', 'tabular.mcp', 'tabular.app'
  ]);
  assert.throws(
    () => application.files.applyConfirmed(`ddl_${'A'.repeat(43)}`),
    /Only the separate migrator process/
  );
  assert.throws(() => filesPlugin(application.app), /already registered/);
});
