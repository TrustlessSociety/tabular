//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { createApplication } from '../../../src/bootstrap/application.js';
import realtimePlugin from '../../../src/plugins/realtime/plugin.js';

test('realtime plugin registers one stable PostgreSQL-backed service before app catchall', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.realtime.name, 'tabular.realtime');
  assert.equal(application.app.plugin('tabular.realtime'), application.realtime);
  const realtime = application.runtime.pluginOrder.indexOf('tabular.realtime');
  assert.equal(application.runtime.pluginOrder[realtime - 1], 'tabular.commands');
  assert.equal(application.runtime.pluginOrder[realtime + 1], 'tabular.mcp');
  assert.throws(() => realtimePlugin(application.app), /already registered/);
});
