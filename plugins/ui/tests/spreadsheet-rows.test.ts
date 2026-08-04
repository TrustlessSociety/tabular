import assert from 'node:assert/strict';
import test from 'node:test';
import type { GridRow } from '../../grid/helpers/contracts.js';
import { padSpreadsheetRows } from '../helpers/spreadsheet-rows.js';

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
