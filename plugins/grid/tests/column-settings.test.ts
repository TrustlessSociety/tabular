import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExplorerFile } from '../../explorer/helpers/contracts.js';
import type { FileDescription } from '../../files/helpers/contracts.js';
import {
  buildColumnSettingsAction,
  type ColumnForm
} from '../components/column-settings-panel.js';
import type { GridColumn } from '../helpers/contracts.js';

test('relation settings preserve explicit non-adjacent composite source mapping order', () => {
  const file = { id: `obj_${'f'.repeat(43)}` } as ExplorerFile;
  const tenant = `col_${'t'.repeat(43)}`;
  const spacer = `col_${'x'.repeat(43)}`;
  const customer = `col_${'c'.repeat(43)}`;
  const targetTenant = `col_${'u'.repeat(43)}`;
  const targetCustomer = `col_${'v'.repeat(43)}`;
  const targetFile = `obj_${'r'.repeat(43)}`;
  const columns: GridColumn[] = [
    { id: tenant, coordinate: 'A', label: 'Customer tenant', storageCodec: 'text' },
    { id: spacer, coordinate: 'B', label: 'Internal note', storageCodec: 'text' },
    { id: customer, coordinate: 'C', label: 'Customer code', storageCodec: 'text' }
  ];
  const form: ColumnForm = {
    displayName: 'Customer',
    physicalName: 'customer_tenant',
    storageType: 'text',
    field: 'relation',
    format: 'related-record',
    defaultValue: '',
    required: false,
    unique: false,
    generated: false,
    optionsText: '',
    targetFileId: targetFile,
    targetConstraintName: 'customers_pkey',
    sourceColumnIds: [tenant, customer],
    pickerTemplate: '{{label}} — {{key}}',
    outputTemplate: '{{label}}'
  };
  const eligible = [{
    name: 'customers_pkey',
    kind: 'p',
    columnIds: [targetTenant, targetCustomer]
  }] as FileDescription['constraints'];
  const action = buildColumnSettingsAction(file, columns[0], columns, form, eligible);
  assert.equal(action.type, 'relation.create');
  if (action.type !== 'relation.create') return;
  assert.deepEqual(action.columnIds, [tenant, customer]);
  assert.deepEqual(action.targetColumnIds, [targetTenant, targetCustomer]);
  assert.equal(action.columnIds.includes(spacer), false);
});
