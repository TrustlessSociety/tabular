//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { createApplication } from '../../../src/bootstrap/application.js';
import savedViewsPlugin from '../../../src/plugins/saved-views/plugin.js';

test('saved-views plugin registers one stable service before explorer discovery', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.savedViews.name, 'tabular.saved-views');
  assert.equal(application.app.plugin('tabular.saved-views'), application.savedViews);
  const savedViews = application.runtime.pluginOrder.indexOf('tabular.saved-views');
  assert.equal(application.runtime.pluginOrder[savedViews - 1], 'tabular.files');
  assert.equal(application.runtime.pluginOrder[savedViews + 1], 'tabular.import-export');
  assert.equal(application.runtime.pluginOrder[savedViews + 2], 'tabular.explorer');
  assert.throws(() => savedViewsPlugin(application.app), /already registered/);
});
