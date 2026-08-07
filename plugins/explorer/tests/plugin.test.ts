//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { BrowserMutationPrincipal } from '../../identity/helpers/contracts.js';
import { ExplorerPluginService } from '../helpers/service.js';
import { createExplorerSnapshot } from './fixtures.js';
import { EXPLORER_ROUTES } from '../plugin.js';

test('explorer owns its page and action routes', () => {
  assert.deepEqual(EXPLORER_ROUTES, [
    '/',
    '/pages/browse.html',
    '/events/explorer'
  ]);
});

test('explorer service delegates discovery and owner mutations to established plugin boundaries', async () => {
  const calls: unknown[] = [];
  let permissionReads = 0;
  const catalog = {
    discover: async () => ({
      connections: [{ id: 'connection' }],
      databases: [{ id: 'database', connectionId: 'connection', name: 'tabular' }],
      schemas: []
    })
  };
  const files = {
    folderPermissions: async () => {
      permissionReads += 1;
      return new Map();
    },
    displayNames: async () => new Map<string, string>(),
    plan: async (_principal: BrowserMutationPrincipal, action: unknown) => {
      calls.push(action);
      return {
        requestId: 'request',
        confirmationToken: 'secret',
        actionType: 'file.create' as const,
        requestDigest: 'digest',
        expiresAt: '2026-08-02T12:00:00.000Z',
        summary: { physicalName: 'untitled_file' }
      };
    }
  };
  const service = new ExplorerPluginService(catalog as never, files as never);
  const principal = {} as BrowserMutationPrincipal;
  const discovered = await service.discover(principal);
  assert.equal(discovered.connection.id, 'connection');
  assert.equal(permissionReads, 1);

  const folder = createExplorerSnapshot().folders[0]!;
  const created = await service.dispatch(principal, {
    type: 'file.create.blank', commandId: 'cmd_create', folder, displayName: 'Product Data'
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.plan?.requestId, 'request');
  assert.equal(created.plan?.confirmationToken, 'secret');
  await service.plan(principal, {
    type: 'file.rename.display', commandId: 'cmd_rename', folder, sourceFolder: folder,
    file: folder.files[0]!, displayName: 'Customer ledger'
  });
  assert.deepEqual(calls, [
    { type: 'file.create', commandId: 'cmd_create', schemaId: folder.id, displayName: 'Product Data' },
    {
      type: 'file.rename', commandId: 'cmd_rename', fileId: 'file_customer_orders',
      displayName: 'Customer ledger', physicalName: 'customer_ledger'
    }
  ]);
});

test('explorer discovery overlays persisted file display names', async () => {
  const catalog = {
    discover: async () => ({
      connections: [{ id: 'connection' }],
      databases: [{ id: 'database', connectionId: 'connection', name: 'tabular' }],
      schemas: [{
        id: 'schema_workspace', name: 'workspace', drift: 'current' as const,
        files: [{
          id: 'obj_persisted', schemaId: 'schema_workspace', name: 'untitled_file',
          kind: 'table' as const, readOnly: false, drift: 'current' as const, columns: []
        }]
      }]
    })
  };
  const files = {
    folderPermissions: async () => new Map(),
    displayNames: async () => new Map([['obj_persisted', 'Customer Orders']]),
    plan: async () => { throw new Error('not used'); }
  };
  const service = new ExplorerPluginService(catalog as never, files as never);
  const snapshot = await service.discover({} as BrowserMutationPrincipal);
  assert.equal(snapshot.folders[0]!.files[0]!.displayName, 'Customer Orders');
});
