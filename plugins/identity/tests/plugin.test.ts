//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { createApplication } from '../../../bootstrap/application.js';
import identityPlugin from '../plugin.js';

test('identity plugin registers after database without a test-only login route', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.identity.name, 'tabular.identity');
  assert.deepEqual(application.runtime.pluginOrder, [
    'tabular.database', 'tabular.identity', 'tabular.operations', 'tabular.catalog', 'tabular.capability', 'tabular.files', 'tabular.saved-views', 'tabular.import-export',
    'tabular.explorer', 'tabular.grid', 'tabular.commands', 'tabular.realtime', 'tabular.mcp', 'tabular.app'
  ]);
  assert.throws(() => identityPlugin(application.app), /already registered/);
});
