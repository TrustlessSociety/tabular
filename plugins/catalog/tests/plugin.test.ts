import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../../../bootstrap/application.js';
import catalogPlugin from '../plugin.js';

test('catalog plugin registers after identity as a stable service', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.catalog.name, 'tabular.catalog');
  assert.equal(application.app.plugin('tabular.catalog'), application.catalog);
  assert.throws(() => catalogPlugin(application.app), /already registered/);
});
