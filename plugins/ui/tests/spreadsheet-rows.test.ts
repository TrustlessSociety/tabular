//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { GridRow } from '../../grid/helpers/contracts.js';
import {
  committedRowIdsInVisibleOrder,
  padSpreadsheetRows,
  rankForInsertedRow
} from '../helpers/spreadsheet-rows.js';

test('adjacent sparse drafts keep their exact rows regardless of load order', () => {
  const blanks: GridRow[] = Array.from({ length: 24 }, (_, index) => ({
    id: `placeholder_row_${index + 1}`
  }));
  const rows: GridRow[] = [
    { id: 'committed-a', value: 'A' },
    { id: 'draft-row-20', value: 'twenty' },
    { id: 'draft-row-19', value: 'nineteen' }
  ];
  const placed = padSpreadsheetRows(rows, {
    'draft-row-20': '000000000000000020000000',
    'draft-row-19': '000000000000000019000000'
  }, blanks);

  assert.equal(placed[0]!.id, 'committed-a');
  assert.equal(placed[18]!.id, 'draft-row-19');
  assert.equal(placed[19]!.id, 'draft-row-20');
  assert.equal(placed[17]!.id, 'placeholder_row_18');
});

test('committed row boundaries follow visible shared order and exclude retained inserts', () => {
  const committed: GridRow[] = [
    { id: 'row-1' },
    { id: 'row-2' },
    { id: 'row-3' }
  ];
  const visible: GridRow[] = [
    { id: 'row-2' },
    { id: 'retained-insert' },
    { id: 'row-1' },
    { id: 'placeholder_row_4' },
    { id: 'row-3' }
  ];

  assert.deepEqual(
    committedRowIdsInVisibleOrder(visible, committed),
    ['row-2', 'row-1', 'row-3']
  );
});

test('fractional shared ranks preserve server order without reversing an anchored neighbour', () => {
  const blanks: GridRow[] = Array.from({ length: 6 }, (_, index) => ({
    id: `placeholder_row_${index + 1}`
  }));
  const restored = padSpreadsheetRows([
    { id: 'moving-first' },
    { id: 'anchored-second' }
  ], {
    'moving-first': '000000000000000000500000',
    'anchored-second': '000000000000000001000000'
  }, blanks);
  const movedLast = padSpreadsheetRows([
    { id: 'anchored-first' },
    { id: 'moving-last' }
  ], {
    'anchored-first': '000000000000000001000000',
    'moving-last': '999999999999999999000000'
  }, blanks);

  assert.deepEqual(restored.slice(0, 2).map((row) => row.id), [
    'moving-first',
    'anchored-second'
  ]);
  assert.deepEqual(movedLast.slice(0, 2).map((row) => row.id), [
    'anchored-first',
    'moving-last'
  ]);
});

test('inserted rows receive bounded ranks above, between, and below visible records', () => {
  const rows: GridRow[] = [
    { id: 'row-1' },
    { id: 'row-2' }
  ];
  const ranks = {
    'row-1': '000000000000000001000000',
    'row-2': '000000000000000002000000'
  };

  assert.equal(rankForInsertedRow(rows, ranks, 0), '000000000000000000500000');
  assert.equal(rankForInsertedRow(rows, ranks, 1), '000000000000000001500000');
  assert.equal(rankForInsertedRow(rows, ranks, 2), '000000000000000003000000');
});

test('inserted rows use their visible spreadsheet boundary before shared ranks exist', () => {
  const rows: GridRow[] = [
    { id: 'row-1' },
    { id: 'row-2' },
    { id: 'placeholder_row_3' }
  ];

  assert.equal(rankForInsertedRow(rows, {}, 1), '000000000000000002000000');
  assert.equal(rankForInsertedRow(rows, {}, 2), '000000000000000003000000');
});

test('insert above remains available beside one ranked neighbour and one draft row', () => {
  const rows: GridRow[] = [
    { id: 'row-1' },
    { id: 'row-2' },
    { id: 'row-3' },
    { id: 'ranked-row' },
    { id: 'retained-draft' },
    { id: 'row-6' }
  ];

  assert.equal(rankForInsertedRow(rows, {
    'ranked-row': '000000000000000005000000'
  }, 4), '000000000000000005500000');
});

test('insert below remains available before one ranked neighbour', () => {
  const rows: GridRow[] = [
    { id: 'row-1' },
    { id: 'row-2' },
    { id: 'row-3' },
    { id: 'unranked-row' },
    { id: 'ranked-row' }
  ];

  assert.equal(rankForInsertedRow(rows, {
    'ranked-row': '000000000000000005000000'
  }, 4), '000000000000000004500000');
});
