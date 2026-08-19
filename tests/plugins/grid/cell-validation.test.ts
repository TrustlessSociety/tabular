//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { canonicalJsonValue } from '../../../src/plugins/capability/helpers/value-contracts.js';
import { gridValueIssues } from '../../../src/plugins/grid/helpers/cell-validation.js';
import type { GridColumn, GridRow } from '../../../src/plugins/grid/helpers/contracts.js';

test('existing violating values project #VALUE without changing raw PostgreSQL data', () => {
  const amount = `col_${'a'.repeat(43)}`;
  const tags = `col_${'t'.repeat(43)}`;
  const rows: GridRow[] = [{
    id: 'row_existing',
    [amount]: '9007199254740993.000000001',
    [tags]: canonicalJsonValue('{"legacy":true}')
  }];
  const columns: GridColumn[] = [{
    id: amount,
    coordinate: 'A',
    label: 'Amount',
    storageType: 'numeric',
    storageCodec: 'decimal',
    field: 'number',
    format: 'number',
    fieldConfig: {},
    validatorConfig: {
      version: 1,
      rules: [{ id: 'vr_minimum_0001', kind: 'min_value', args: { value: '9007199254740994', inclusive: true } }]
    }
  }, {
    id: tags,
    coordinate: 'B',
    label: 'Tags',
    storageType: 'jsonb',
    storageCodec: 'json',
    field: 'tags',
    format: 'tags',
    fieldConfig: {},
    validatorConfig: { version: 1, rules: [] }
  }];

  const before = structuredClone(rows);
  const issues = gridValueIssues(rows, columns);
  assert.deepEqual(issues.map((issue) => issue.token), ['#VALUE!', '#VALUE!']);
  assert.match(issues[0]!.message, /below the configured minimum/);
  assert.match(issues[1]!.message, /JSON value does not match/);
  assert.deepEqual(rows, before);
});

test('SQL NULL skips Tabular validation in grid projection', () => {
  const id = `col_${'n'.repeat(43)}`;
  assert.deepEqual(gridValueIssues([{ id: 'row_null', [id]: null }], [{
    id,
    coordinate: 'A',
    label: 'Optional',
    storageType: 'text',
    field: 'text',
    validatorConfig: {
      version: 1,
      rules: [{ id: 'vr_notempty_01', kind: 'not_empty', args: {} }]
    }
  }]), []);
});
