//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import {
  confirmExplorerDdl,
  dispatchExplorerAction,
  waitForExplorerDdl
} from '../../../src/plugins/explorer/events/actions.js';
import { createExplorerSnapshot } from './fixtures.js';

test('blank creation and display rename produce typed file DDL plans without direct transport', async () => {
  const folder = createExplorerSnapshot().folders[0]!;
  const created = await dispatchExplorerAction({
    type: 'file.create.blank', commandId: 'cmd_create', folder, displayName: 'Product Data'
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.file.displayName, 'Product Data');
  assert.equal(created.file.physicalName, 'product_data');
  assert.deepEqual(created.ddl, {
    type: 'file.create', commandId: 'cmd_create', schemaId: folder.id, displayName: 'Product Data'
  });

  const renamed = await dispatchExplorerAction({
    type: 'file.rename.display',
    commandId: 'cmd_rename',
    folder,
    sourceFolder: folder,
    file: created.file,
    displayName: 'Service log'
  });
  assert.equal(renamed.ok, true);
  if (!renamed.ok) return;
  assert.equal(renamed.file.displayName, 'Service log');
  assert.equal(renamed.file.physicalName, 'service_log');
  assert.equal(renamed.physicalChange, 'confirmation-required');
});

test('explorer event boundary reports conflict, denial, failure, and physical confirmation honestly', async () => {
  const folder = createExplorerSnapshot().folders[0]!;
  const file = folder.files[1]!;
  const duplicate = await dispatchExplorerAction({
    type: 'file.rename.display', commandId: 'cmd_duplicate', folder, sourceFolder: folder, file, displayName: 'Customer orders'
  });
  assert.deepEqual(duplicate, {
    ok: false,
    code: 'duplicate_name',
    message: 'A file named “Customer orders” already exists in Operations.'
  });

  const deniedFolder = { ...folder, permissions: { ...folder.permissions, renameFile: false } };
  const denied = await dispatchExplorerAction({
    type: 'file.rename.display', commandId: 'cmd_denied', folder: deniedFolder, sourceFolder: folder, file, displayName: 'Stock ledger'
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, 'permission_denied');

  const failed = await dispatchExplorerAction({
    type: 'file.rename.display', commandId: 'cmd_failed', folder, sourceFolder: folder, file, displayName: 'Stock ledger'
  }, { fail: true });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.code, 'backend_failure');

  const configured = await dispatchExplorerAction({
    type: 'file.settings.apply', commandId: 'cmd_settings', folder, sourceFolder: folder, file,
    displayName: 'Stock ledger', physicalName: 'stock_ledger', physicalNameOverridden: true
  });
  assert.equal(configured.ok, true);
  if (configured.ok) {
    assert.equal(configured.physicalChange, 'confirmation-required');
    assert.equal(configured.file.physicalName, 'stock_ledger');
  }
});

test('explorer DDL confirmation uses the existing protected boundary without exposing tokens in status', async () => {
  const original = globalThis.fetch;
  let body = '';
  try {
    globalThis.fetch = (async (_input, init) => {
      body = String(init?.body || '');
      return new Response(JSON.stringify({
        status: 'ok',
        data: { requestId: 'ddl_request', state: 'confirmed', expiresAt: '2026-08-02T12:00:00.000Z' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const result = await confirmExplorerDdl('ddl_request', 'one-use-secret', 'csrf');
    assert.equal(result.status, 'ok');
    assert.deepEqual(JSON.parse(body), {
      event: {
        kind: 'ddl.confirm',
        requestId: 'ddl_request',
        confirmationToken: 'one-use-secret'
      }
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('explorer DDL wait reports applied, pending, and terminal operation errors honestly', async () => {
  const applied = await waitForExplorerDdl('ddl_request', {
    attempts: 2,
    intervalMs: 0,
    pause: async () => undefined,
    load: async () => ({
      status: 'ok',
      data: {
        requestId: 'ddl_request', state: 'applied', actionType: 'file.create',
        expiresAt: '2026-08-02T12:00:00.000Z',
        result: {
          requestId: 'ddl_request', state: 'applied', actionType: 'file.create',
          targetFileId: `obj_${'A'.repeat(43)}`, physicalName: 'untitled_file'
        }
      }
    })
  });
  assert.equal(applied.status, 'applied');

  const pending = await waitForExplorerDdl('ddl_request', {
    attempts: 1,
    pause: async () => undefined,
    load: async () => ({
      status: 'ok',
      data: {
        requestId: 'ddl_request', state: 'confirmed', actionType: 'file.rename',
        expiresAt: '2026-08-02T12:00:00.000Z', operation: { state: 'running' }
      }
    })
  });
  assert.equal(pending.status, 'pending');

  const failed = await waitForExplorerDdl('ddl_request', {
    attempts: 1,
    pause: async () => undefined,
    load: async () => ({
      status: 'ok',
      data: {
        requestId: 'ddl_request', state: 'confirmed', actionType: 'file.rename',
        expiresAt: '2026-08-02T12:00:00.000Z',
        operation: {
          state: 'dead-letter',
          error: { code: 'file_ddl_stale', message: 'The table changed before apply', retryable: false }
        }
      }
    })
  });
  assert.deepEqual(failed, {
    status: 'error',
    error: { code: 'file_ddl_stale', message: 'The table changed before apply', retryable: false }
  });
});
