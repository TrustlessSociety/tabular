import assert from 'node:assert/strict';
import test from 'node:test';
import type { GridColumn } from '../../grid/helpers/contracts.js';
import {
  applyBlankColumnInsertions,
  applyColumnInsertion,
  reconcileBlankColumnInsertions,
  removeBlankColumnInsertion
} from '../helpers/column-insertion.js';

const columns = ['id', 'title', 'detail'].map((id, index) => ({
  id,
  coordinate: String.fromCharCode(65 + index),
  label: id,
  kind: 'text',
  storageCodec: 'text'
}) satisfies GridColumn);

test('a newly discovered column is placed on either requested side of its anchor', () => {
  const refreshed = [...columns, {
    id: 'created',
    coordinate: 'D',
    label: 'Created',
    kind: 'text',
    storageCodec: 'text'
  } satisfies GridColumn];
  const knownColumnIds = columns.map((column) => column.id);

  assert.deepEqual(applyColumnInsertion(refreshed, {
    anchorColumnId: 'title',
    knownColumnIds,
    placement: 'left'
  })?.columns.map((column) => column.id), ['id', 'created', 'title', 'detail']);
  assert.deepEqual(applyColumnInsertion(refreshed, {
    anchorColumnId: 'title',
    knownColumnIds,
    placement: 'right'
  })?.columns.map((column) => column.id), ['id', 'title', 'created', 'detail']);
});

test('column placement waits for one unambiguous created column and a live anchor', () => {
  const request = {
    anchorColumnId: 'missing',
    knownColumnIds: columns.map((column) => column.id),
    placement: 'left' as const
  };

  assert.equal(applyColumnInsertion(columns, request), undefined);
  assert.equal(applyColumnInsertion([...columns, ...columns], request), undefined);
});

test('column insertion immediately projects a blank column without schema configuration', () => {
  assert.deepEqual(applyBlankColumnInsertions(columns, [{
    id: 'draft_insert_left',
    anchorColumnId: 'title',
    placement: 'left'
  }]).map((column) => column.id), [
    'id',
    'draft_insert_left',
    'title',
    'detail'
  ]);
  assert.deepEqual(applyBlankColumnInsertions(columns, [{
    id: 'draft_insert_right',
    anchorColumnId: 'title',
    placement: 'right'
  }]).map((column) => column.id), [
    'id',
    'title',
    'draft_insert_right',
    'detail'
  ]);
});

test('multiple blank insertions remain stable across repeated projections', () => {
  const insertions = [{
    id: 'draft_insert_one',
    anchorColumnId: 'title',
    placement: 'right' as const
  }, {
    id: 'draft_insert_two',
    anchorColumnId: 'draft_insert_one',
    placement: 'right' as const
  }];
  const inserted = applyBlankColumnInsertions(columns, insertions);

  assert.deepEqual(inserted.map((column) => column.id), [
    'id',
    'title',
    'draft_insert_one',
    'draft_insert_two',
    'detail'
  ]);
  assert.deepEqual(
    applyBlankColumnInsertions(inserted, insertions).map((column) => column.id),
    inserted.map((column) => column.id)
  );
});

test('dragging a named column across inserted blanks preserves the exact drop boundary', () => {
  const insertions = [{
    id: 'draft_insert_left',
    anchorColumnId: 'title',
    placement: 'left' as const
  }, {
    id: 'draft_insert_right',
    anchorColumnId: 'title',
    placement: 'right' as const
  }];

  const beforeLeftBlank = reconcileBlankColumnInsertions([
    'id',
    'title',
    'draft_insert_left',
    'draft_insert_right',
    'detail'
  ], insertions);
  assert.deepEqual(
    applyBlankColumnInsertions(columns, beforeLeftBlank).map((column) => column.id),
    [ 'id', 'title', 'draft_insert_left', 'draft_insert_right', 'detail' ]
  );

  const beforeFirstNamedColumn = reconcileBlankColumnInsertions([
    'title',
    'id',
    'draft_insert_left',
    'draft_insert_right',
    'detail'
  ], insertions);
  assert.deepEqual(
    applyBlankColumnInsertions([
      columns[1]!,
      columns[0]!,
      columns[2]!
    ], beforeFirstNamedColumn).map((column) => column.id),
    [ 'title', 'id', 'draft_insert_left', 'draft_insert_right', 'detail' ]
  );
});

test('removing either inserted blank preserves the surviving blank position', () => {
  const insertions = [{
    id: 'draft_insert_left',
    anchorColumnId: 'title',
    placement: 'left' as const
  }, {
    id: 'draft_insert_right',
    anchorColumnId: 'draft_insert_left',
    placement: 'right' as const
  }];
  const visible = [
    'id',
    'draft_insert_left',
    'draft_insert_right',
    'title',
    'detail'
  ];

  const withoutLeft = removeBlankColumnInsertion(
    visible,
    insertions,
    'draft_insert_left'
  );
  assert.deepEqual(
    applyBlankColumnInsertions(columns, withoutLeft).map((column) => column.id),
    ['id', 'draft_insert_right', 'title', 'detail']
  );

  const withoutRight = removeBlankColumnInsertion(
    visible,
    insertions,
    'draft_insert_right'
  );
  assert.deepEqual(
    applyBlankColumnInsertions(columns, withoutRight).map((column) => column.id),
    ['id', 'draft_insert_left', 'title', 'detail']
  );
});
