//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { createApplication } from '../../../bootstrap/application.js';
import { OPERATIONS_ROUTES } from '../plugin.js';
import operationsPlugin from '../plugin.js';

test('operations plugin registers before import/export and exposes the activity routes', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.operations.name, 'tabular.operations');
  assert.equal(application.app.plugin('tabular.operations'), application.operations);
  const operations = application.runtime.pluginOrder.indexOf('tabular.operations');
  assert.equal(application.runtime.pluginOrder[operations - 1], 'tabular.identity');
  assert.equal(application.runtime.pluginOrder[operations + 1], 'tabular.catalog');
  assert.ok(operations < application.runtime.pluginOrder.indexOf('tabular.import-export'));
  assert.deepEqual(OPERATIONS_ROUTES, [
    '/pages/system-activity.html',
    '/events/operations'
  ]);
  assert.throws(() => operationsPlugin(application.app), /already registered/);
});
