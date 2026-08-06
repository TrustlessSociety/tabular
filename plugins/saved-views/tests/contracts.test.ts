//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import {
  savedViewSlug,
  validateDefinition,
  validateSavedViewAction
} from '../helpers/validation.js';

const fileId = `obj_${'f'.repeat(32)}`;
const columnId = `col_${'c'.repeat(32)}`;
const secondColumnId = `col_${'d'.repeat(32)}`;
const rowId = `row_${'r'.repeat(16)}`;

/**
 * Return the definition result.
 */
function definition() {
  return {
    schemaVersion: 1,
    columnOrder: [columnId, secondColumnId],
    hiddenColumnIds: [secondColumnId],
    sorts: [{ columnId, direction: 'asc' }],
    filters: [{ columnId, operation: 'like', value: 'ready%' }],
    presentation: {
      [JSON.stringify([rowId, columnId])]: {
        fontFamily: 'Georgia', fontSize: 14, bold: true,
        textColor: '#112233', fillColor: 'transparent',
        horizontal: 'center', vertical: 'middle', wrap: 'clip',
        border: 'bottom', borderColor: '#445566', borderStyle: 'solid',
        numberFormat: 'automatic'
      }
    },
    includes: {
      filtersAndSorting: true,
      columnLayout: true,
      cellPresentation: true
    }
  } as const;
}

test('saved-view contracts retain the complete typed state and reject transport authority', () => {
  const action = validateSavedViewAction({
    type: 'saved-view.create',
    commandId: 'cmd_view_contract_001',
    fileId,
    name: 'Ready orders',
    access: 'shared',
    definition: definition()
  });
  assert.equal(action.type, 'saved-view.create');
  if (action.type !== 'saved-view.create') return;
  assert.deepEqual(action.definition, definition());

  assert.throws(() => validateSavedViewAction({
    type: 'saved-view.create',
    commandId: 'cmd_view_contract_002',
    fileId,
    name: 'Forged',
    access: 'private',
    definition: definition(),
    role: 'postgres'
  }), /unsupported fields/);
});

test('saved-view definitions reject stale columns, malformed filters, and forged presentation values', () => {
  assert.throws(() => validateDefinition({
    ...definition(),
    presentation: {
      [JSON.stringify([rowId, `col_${'z'.repeat(32)}`])]: { bold: true }
    }
  }), /outside its column order/);
  assert.throws(() => validateDefinition({
    ...definition(),
    filters: [{ columnId, operation: 'contains', value: 'ready' }]
  }), /filter operation/);
  assert.throws(() => validateDefinition({
    ...definition(),
    presentation: {
      [JSON.stringify([rowId, columnId])]: { bold: 'yes' }
    }
  }), /bold is invalid/);
  assert.throws(() => validateDefinition({
    ...definition(),
    presentation: {
      [JSON.stringify([rowId, columnId])]: { fontSize: 13 }
    }
  }), /font size is invalid/);
});

test('row-order actions require one distinct stable neighbour and an optimistic version', () => {
  assert.deepEqual(validateSavedViewAction({
    type: 'row-order.move',
    commandId: 'cmd_row_order_001',
    fileId,
    rowId,
    beforeRowId: `row_${'b'.repeat(16)}`,
    expectedVersion: 3
  }), {
    type: 'row-order.move',
    commandId: 'cmd_row_order_001',
    fileId,
    rowId,
    beforeRowId: `row_${'b'.repeat(16)}`,
    expectedVersion: 3
  });
  assert.throws(() => validateSavedViewAction({
    type: 'row-order.move',
    commandId: 'cmd_row_order_002',
    fileId,
    rowId,
    expectedVersion: 1
  }), /requires one stable neighbour/);
  assert.throws(() => validateSavedViewAction({
    type: 'row-order.move',
    commandId: 'cmd_row_order_003',
    fileId,
    rowId,
    afterRowId: rowId,
    expectedVersion: 1
  }), /distinct stable rows/);
});

test('saved-view slugs normalize every opaque-ID character into the URL contract', () => {
  assert.equal(
    savedViewSlug('  Résumé / Ready  ', `view_${'a'.repeat(24)}AB_CD-E_`),
    'resume-ready-ab0cd-e0'
  );
  assert.match(savedViewSlug('***', `view_${'_'.repeat(32)}`), /^[a-z0-9][a-z0-9-]{0,79}$/);
});
