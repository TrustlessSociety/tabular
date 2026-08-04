import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../../../bootstrap/application.js';
import uiPlugin from '../plugin.js';

test('UI plugin registers the accepted compact Reactus shell as a stable service', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.deepEqual(application.ui, {
    name: 'tabular.ui',
    shell: 'reactus',
    density: 'compact',
    theme: 'grayscale-blue-focus'
  });
  assert.equal(application.app.plugin('tabular.ui'), application.ui);
  assert.throws(() => uiPlugin(application.app), /already registered/);
});
