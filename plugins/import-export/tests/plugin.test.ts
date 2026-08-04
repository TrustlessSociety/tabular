import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import importExportPlugin, { IMPORT_EXPORT_ROUTES } from '../plugin.js';

test('import-export plugin registers one process-scoped service before explorer', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.importExport.name, 'tabular.import-export');
  assert.equal(application.app.plugin('tabular.import-export'), application.importExport);
  const index = application.runtime.pluginOrder.indexOf('tabular.import-export');
  assert.equal(application.runtime.pluginOrder[index - 1], 'tabular.saved-views');
  assert.equal(application.runtime.pluginOrder[index + 1], 'tabular.explorer');
  assert.deepEqual(IMPORT_EXPORT_ROUTES, [
    '/pages/import.html',
    '/events/import-export',
    '/events/import-source',
    '/events/import-google-callback'
  ]);
  assert.deepEqual(application.runtime.rawHandlers.routes, [
    'POST /events/import-source'
  ]);
  await assert.rejects(
    application.importExport.cleanupExpiredImports(),
    (error: unknown) => error instanceof ApplicationError
      && error.errorCode === 'import_cleanup_denied'
  );
  assert.throws(() => importExportPlugin(application.app), /already registered/);
});

test('worker process exposes no import HTTP route while retaining one-shot commit service', async () => {
  const application = await createApplication({
    processKind: 'worker',
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.runtime.processKind, 'worker');
  assert.deepEqual(application.runtime.rawHandlers.routes, []);
  await assert.rejects(
    async () => application.importExport.executeConfirmedImport('imp_invalid'),
    (error: unknown) => error instanceof ApplicationError
      && error.errorCode === 'import_unavailable'
  );
});
