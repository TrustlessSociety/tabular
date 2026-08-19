//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

//client
import type { ExplorerFile } from '../../../src/plugins/explorer/helpers/contracts.js';
import type { FileDescription } from '../../../src/plugins/files/helpers/contracts.js';
import type { ColumnForm } from '../../../src/plugins/grid/components/column-settings-panel.js';
import type { GridColumn } from '../../../src/plugins/grid/helpers/contracts.js';
import {
  ColumnSettingsPanel,
  buildColumnSettingsAction,
  compatibleFormatKinds,
  defaultValidatorArgs,
  matchingRelationConstraintName,
  presentationOnlyColumnUpdate,
  removeValidator,
  reorderValidator,
  updateValidator
} from '../../../src/plugins/grid/components/column-settings-panel.js';

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
    fieldConfig: {},
    formatConfig: {},
    validatorConfig: { version: 1, rules: [] },
    metadataVersion: 1,
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

test('existing relation settings recover the saved eligible target key by stable columns', () => {
  const source = 'col_source';
  const targetA = 'col_target_a';
  const targetB = 'col_target_b';
  const column: GridColumn = {
    id: source,
    coordinate: 'A',
    label: 'Customer',
    relation: {
      sourceColumnIds: [source],
      targetFileId: 'obj_target',
      targetLabel: 'Customers',
      targetColumnIds: [targetA, targetB],
      pickerTemplate: '{{label}}',
      outputTemplate: '{{label}}'
    }
  };
  const description = {
    constraints: [
      { name: 'customers_code_key', kind: 'u', columnIds: [targetB] },
      { name: 'customers_pkey', kind: 'p', columnIds: [targetA, targetB] }
    ]
  } as Pick<FileDescription, 'constraints'>;

  assert.equal(
    matchingRelationConstraintName(column, description),
    'customers_pkey'
  );
  assert.equal(
    matchingRelationConstraintName({ ...column, relation: { ...column.relation!, targetColumnIds: [targetB, targetA] } }, description),
    ''
  );
});

test('column settings filters refined JSON formats through the shared compatibility registry', () => {
  const metadata = compatibleFormatKinds('jsonb', 'metadata');
  assert.equal(metadata.includes('metadata'), true);
  assert.equal(metadata.includes('tags'), false);
  assert.equal(metadata.includes('plain-text'), true);
  const tags = compatibleFormatKinds('jsonb', 'tags');
  assert.equal(tags.includes('tags'), true);
  assert.equal(tags.includes('metadata'), false);
});

test('Field, Format, and validator-only changes bypass PostgreSQL DDL planning', () => {
  const selected: GridColumn = {
    id: `col_${'p'.repeat(43)}`,
    coordinate: 'A',
    label: 'Notes',
    physicalName: 'notes',
    storageType: 'text',
    storageCodec: 'text',
    field: 'text',
    format: 'plain-text',
    fieldConfig: {},
    formatConfig: {},
    validatorConfig: { version: 1, rules: [] },
    metadataVersion: 2
  };
  const form: ColumnForm = {
    displayName: 'Notes', physicalName: 'notes', storageType: 'text',
    field: 'email', format: 'email-link', fieldConfig: {}, formatConfig: {},
    validatorConfig: {
      version: 1,
      rules: [{ id: 'vr_rule_only_01', kind: 'not_empty', args: {} }]
    },
    metadataVersion: 2, defaultValue: '', required: false, unique: false,
    generated: false, optionsText: '', targetFileId: '', targetConstraintName: '',
    sourceColumnIds: [selected.id], pickerTemplate: '{{label}}', outputTemplate: '{{label}}'
  };
  assert.equal(presentationOnlyColumnUpdate(selected, form), true);
  assert.equal(presentationOnlyColumnUpdate(selected, { ...form, required: true }), false);
  assert.equal(presentationOnlyColumnUpdate(selected, { ...form, storageType: 'numeric' }), false);
});

test('configured validator helpers retain stable IDs across edit, reorder, and removal', () => {
  const initial = {
    version: 1 as const,
    rules: [
      { id: 'vr_first_rule_01', kind: 'min_value' as const, args: { value: '0', inclusive: true } },
      { id: 'vr_second_rule_1', kind: 'max_value' as const, args: { value: '10', inclusive: true } }
    ]
  };
  const edited = updateValidator(initial, 'vr_first_rule_01', { message: 'Zero or more' });
  assert.equal(edited.rules[0]?.id, 'vr_first_rule_01');
  assert.equal(edited.rules[0]?.message, 'Zero or more');
  const reordered = reorderValidator(edited, 1, 0);
  assert.deepEqual(reordered.rules.map((rule) => rule.id), ['vr_second_rule_1', 'vr_first_rule_01']);
  assert.deepEqual(removeValidator(reordered, 'vr_second_rule_1').rules.map((rule) => rule.id), ['vr_first_rule_01']);
  assert.deepEqual(defaultValidatorArgs('multiple_of', 'numeric'), { value: '1' });
});

test('authoring UI keeps native Constraints before disclosed Tabular validators', () => {
  const id = `col_${'u'.repeat(43)}`;
  const selected: GridColumn = {
    id,
    coordinate: 'A',
    label: 'Amount',
    physicalName: 'amount',
    storageType: 'numeric',
    storageCodec: 'decimal',
    field: 'number',
    format: 'number',
    fieldConfig: {},
    formatConfig: { decimals: 2 },
    validatorConfig: {
      version: 1,
      rules: [{ id: 'vr_minimum_rule1', kind: 'min_value', args: { value: '0', inclusive: true } }]
    },
    metadataVersion: 3
  };
  const html = renderToStaticMarkup(createElement(ColumnSettingsPanel, {
    open: true,
    file: { id: `obj_${'f'.repeat(43)}` } as ExplorerFile,
    columns: [selected],
    columnId: id,
    folders: [],
    csrfToken: 'csrf',
    triggerRef: { current: null },
    onClose: () => undefined,
    onConfirmed: () => undefined
  }));
  const column = html.indexOf('<legend>Column</legend>');
  const format = html.indexOf('<legend>Format</legend>');
  const constraints = html.indexOf('<legend>Constraints</legend>');
  const validators = html.indexOf('<legend>Validators</legend>');
  const advanced = html.indexOf('<summary>Advanced</summary>');
  assert.ok(column < format && format < constraints && constraints < validators && validators < advanced);
  assert.match(html, /Validated by Tabular/);
  assert.match(html, /Storage-implied/);
  assert.match(html, /Move Min Value up/);
});
