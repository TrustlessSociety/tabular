//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import {
  duplicateDisplayName,
  filterExplorerItems,
  mapCatalogToExplorer,
  normalizePhysicalName,
  reconcileExplorerSelection
} from '../helpers/model.js';
import { createExplorerSnapshot } from './fixtures.js';

test('explorer maps caller-visible catalog objects without replacing stable identifiers', () => {
  const permissions = {
    createFile: true,
    importFile: true,
    renameFile: true,
    configureFile: true
  };
  const snapshot = mapCatalogToExplorer({
    connections: [{ id: 'connection_stable' }],
    databases: [{ id: 'database_stable', connectionId: 'connection_stable', name: 'tabular' }],
    schemas: [{
      id: 'schema_stable',
      name: 'operations',
      drift: 'current',
      files: [{
        id: 'file_stable',
        schemaId: 'schema_stable',
        name: 'customer_orders',
        kind: 'table',
        readOnly: false,
        drift: 'current',
        columns: [{ id: 'column_stable', name: 'order_id', type: 'text', nullable: false, drift: 'current' }]
      }, {
        id: 'view_stable',
        schemaId: 'schema_stable',
        name: 'monthly_rollup',
        kind: 'view',
        readOnly: true,
        drift: 'current',
        columns: []
      }]
    }]
  }, new Map([['schema_stable', permissions]]));
  assert.equal(snapshot.connection.id, 'connection_stable');
  assert.equal(snapshot.connection.displayName, 'Connection stable');
  assert.equal(snapshot.database.id, 'database_stable');
  assert.equal(snapshot.folders[0]?.id, 'schema_stable');
  assert.equal(snapshot.folders[0]?.files[0]?.id, 'file_stable');
  assert.equal(snapshot.folders[0]?.files[0]?.columnCount, 1);
  assert.equal(snapshot.folders[0]?.files[0]?.recordCount, undefined);
  assert.equal(snapshot.folders[0]?.files[0]?.updatedLabel, undefined);
  assert.deepEqual(snapshot.folders[0]?.permissions, permissions);
  assert.equal(snapshot.folders[0]?.files[1]?.id, 'view_stable');
  assert.equal(snapshot.folders[0]?.files[1]?.kind, 'view');
  assert.equal(snapshot.folders[0]?.files[1]?.readOnly, true);
  assert.deepEqual(snapshot.folders[0]?.views, []);
});

test('search, selection reconciliation, names, and duplicate checks stay scoped', () => {
  const operations = createExplorerSnapshot().folders[0]!;
  assert.deepEqual(
    filterExplorerItems(operations.files, 'public name', (item) => `${item.displayName} ${item.physicalName}`).map((item) => item.id),
    []
  );
  assert.deepEqual(
    filterExplorerItems(operations.files, 'customer_orders', (item) => `${item.displayName} ${item.physicalName}`).map((item) => item.id),
    ['file_customer_orders']
  );
  assert.equal(reconcileExplorerSelection('file_customer_orders', operations.files.map((item) => item.id)), 'file_customer_orders');
  assert.equal(reconcileExplorerSelection('removed_file', operations.files.map((item) => item.id)), null);
  assert.equal(normalizePhysicalName(' Q3 orders! '), 'q3_orders');
  assert.equal(normalizePhysicalName('---'), 'untitled_file');
  assert.equal(duplicateDisplayName(operations.files, 'customer ORDERS'), true);
  assert.equal(duplicateDisplayName(operations.files, 'Customer orders', 'file_customer_orders'), false);
});
