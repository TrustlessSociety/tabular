import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  GridCellPresentation,
  GridColumn,
  GridRow,
  LogicalGridSelection
} from '../../grid/helpers/contracts.js';
import { GRID_HEADER_ROW_ID } from '../../grid/helpers/contracts.js';
import { presentationPatchForCommand } from '../events/dispatcher.js';
import {
  DEFAULT_PRESENTATION,
  applyPresentationPatch,
  clearPresentation,
  decodePresentation,
  encodePresentation,
  presentationKey,
  presentationPoints,
  remapPresentationRow,
  presentationValue
} from '../helpers/presentation.js';

//A compact logical sheet proves cell, range, row, and column projection without
//depending on mounted Tabulator cells.
const ROWS: GridRow[] = [
  { id: 'row-1', alpha: 'A1', beta: 'B1', gamma: 'C1' },
  { id: 'row-2', alpha: 'A2', beta: 'B2', gamma: 'C2' },
  { id: 'row-3', alpha: 'A3', beta: 'B3', gamma: 'C3' }
];
const COLUMNS: GridColumn[] = [
  { id: 'alpha', coordinate: 'A', label: 'Alpha' },
  { id: 'beta', coordinate: 'B', label: 'Beta' },
  { id: 'gamma', coordinate: 'C', label: 'Gamma' }
];

/** Creates a cell or range selection from stable row and column identities. */
function selection(
  kind: 'cell' | 'range',
  rowA: string,
  columnA: string,
  rowB = rowA,
  columnB = columnA
): LogicalGridSelection {
  return {
    kind,
    anchor: { rowId: rowA, columnId: columnA },
    focus: { rowId: rowB, columnId: columnB }
  };
}

test('presentation points project stable selections across both axes', () => {
  //A reversed range must normalize to row-major logical order.
  assert.deepEqual(
    presentationPoints(
      selection('range', 'row-3', 'gamma', 'row-2', 'beta'),
      ROWS,
      COLUMNS
    ),
    [
      { rowId: 'row-2', columnId: 'beta' },
      { rowId: 'row-2', columnId: 'gamma' },
      { rowId: 'row-3', columnId: 'beta' },
      { rowId: 'row-3', columnId: 'gamma' }
    ]
  );

  //Band selections expand only over the supplied live logical sheet.
  assert.deepEqual(
    presentationPoints({ kind: 'row', rowId: 'row-2' }, ROWS, COLUMNS),
    COLUMNS.map((column) => ({ rowId: 'row-2', columnId: column.id }))
  );
  assert.deepEqual(
    presentationPoints({ kind: 'column', columnId: 'beta' }, ROWS, COLUMNS),
    [
      { rowId: GRID_HEADER_ROW_ID, columnId: 'beta' },
      ...ROWS.map((row) => ({ rowId: row.id, columnId: 'beta' }))
    ]
  );
  assert.deepEqual(
    presentationPoints({ kind: 'header', columnId: 'beta' }, ROWS, COLUMNS),
    [{ rowId: GRID_HEADER_ROW_ID, columnId: 'beta' }]
  );
  assert.deepEqual(
    presentationPoints({ kind: 'header-row' }, ROWS, COLUMNS),
    COLUMNS.map((column) => ({ rowId: GRID_HEADER_ROW_ID, columnId: column.id }))
  );
  assert.deepEqual(presentationPoints(null, ROWS, COLUMNS), []);
  assert.deepEqual(
    presentationPoints(selection('cell', 'missing', 'alpha'), ROWS, COLUMNS),
    []
  );
});

test('presentation apply and clear are immutable, selection-scoped operations', () => {
  const first = { rowId: 'row-1', columnId: 'alpha' };
  const second = { rowId: 'row-2', columnId: 'beta' };
  const untouched = { rowId: 'row-3', columnId: 'gamma' };
  const current: Record<string, GridCellPresentation> = {
    [presentationKey(first)]: { italic: true, fillColor: '#eef0f2' },
    [presentationKey(untouched)]: { underline: true }
  };

  //Applying one patch merges existing style, creates missing style, and leaves
  //both the source object and non-selected cell unchanged.
  const applied = applyPresentationPatch(current, [ first, second ], {
    bold: true,
    fillColor: null
  });
  assert.deepEqual(current[presentationKey(first)], {
    italic: true,
    fillColor: '#eef0f2'
  });
  assert.deepEqual(applied, {
    [presentationKey(first)]: { italic: true, bold: true },
    [presentationKey(second)]: { bold: true },
    [presentationKey(untouched)]: { underline: true }
  });

  //Clear removes complete presentation records for exactly the target points.
  const cleared = clearPresentation(applied, [ first, second ]);
  assert.deepEqual(cleared, {
    [presentationKey(untouched)]: { underline: true }
  });
  assert.notEqual(cleared, applied);

  //Deleting the only property removes the empty cell record instead of
  //persisting meaningless presentation state.
  assert.deepEqual(
    applyPresentationPatch(
      { [presentationKey(first)]: { bold: true } },
      [ first ],
      { bold: null }
    ),
    {}
  );
});

test('presentation values distinguish defaults, uniform selections, and mixed selections', () => {
  const first = { rowId: 'row-1', columnId: 'alpha' };
  const second = { rowId: 'row-2', columnId: 'beta' };

  //Absent properties resolve through the accepted presentation defaults.
  assert.equal(presentationValue({}, [], 'fontSize'), DEFAULT_PRESENTATION.fontSize);
  assert.equal(presentationValue({}, [ first, second ], 'bold'), false);

  //Equal explicit values stay uniform, while explicit/default disagreement is
  //reported as mixed for toolbar and menu state.
  assert.equal(presentationValue({
    [presentationKey(first)]: { fontFamily: 'Georgia' },
    [presentationKey(second)]: { fontFamily: 'Georgia' }
  }, [ first, second ], 'fontFamily'), 'Georgia');
  assert.equal(presentationValue({
    [presentationKey(first)]: { bold: true }
  }, [ first, second ], 'bold'), 'mixed');
});

test('draft-row presentation follows the PostgreSQL row identity or clears on cancel', () => {
  const draftPoint = { rowId: 'draft_row_1', columnId: 'alpha' };
  const current = {
    [presentationKey(draftPoint)]: { bold: true },
    [presentationKey({ rowId: 'row-2', columnId: 'beta' })]: { italic: true }
  };

  assert.deepEqual(remapPresentationRow(current, 'draft_row_1', 'row-stable'), {
    [presentationKey({ rowId: 'row-stable', columnId: 'alpha' })]: { bold: true },
    [presentationKey({ rowId: 'row-2', columnId: 'beta' })]: { italic: true }
  });
  assert.deepEqual(remapPresentationRow(current, 'draft_row_1'), {
    [presentationKey({ rowId: 'row-2', columnId: 'beta' })]: { italic: true }
  });
});

test('presentation encoding round-trips valid cells and rejects malformed envelopes', () => {
  const point = { rowId: 'row-1', columnId: 'alpha' };
  const current: Record<string, GridCellPresentation> = {
    [presentationKey(point)]: {
      fontFamily: 'Georgia',
      fontSize: 16,
      bold: true,
      fillColor: '#dbeafe',
      horizontal: 'center',
      wrap: 'wrap',
      numberFormat: 'currency'
    }
  };

  //The versioned current-tab payload is deterministic and lossless.
  const encoded = encodePresentation(current);
  assert.deepEqual(decodePresentation(encoded), current);
  assert.deepEqual(JSON.parse(encoded), { version: 1, cells: current });

  //Invalid storage cannot inject non-cell containers into the live selection
  //map; safe decoding falls back to an empty record.
  assert.deepEqual(decodePresentation(null), {});
  assert.deepEqual(decodePresentation('{broken'), {});
  assert.deepEqual(decodePresentation('{"version":2,"cells":{}}'), {});
  assert.deepEqual(decodePresentation('{"version":1,"cells":[]}'), {});
  assert.deepEqual(decodePresentation(JSON.stringify({
    version: 1,
    cells: {
      valid: { bold: true },
      array: [ 'invalid' ],
      missing: null,
      ['x'.repeat(701)]: { italic: true }
    }
  })), { valid: { bold: true } });
});

test('typed presentation commands map to exact patches and toggle emphasis', () => {
  //Each formatting family maps to presentation-only values. The exhaustive
  //table catches accidental schema/value commands entering this dispatcher.
  const cases: Array<[
    Parameters<typeof presentationPatchForCommand>[0],
    GridCellPresentation,
    ReturnType<typeof presentationPatchForCommand>
  ]> = [
    [ 'format.bold', {}, { bold: true } ],
    [ 'format.bold', { bold: true }, { bold: false } ],
    [ 'format.italic', {}, { italic: true } ],
    [ 'format.underline', { underline: true }, { underline: false } ],
    [ 'format.size.10', {}, { fontSize: 10 } ],
    [ 'format.size.18', {}, { fontSize: 18 } ],
    [ 'format.font.arial', {}, { fontFamily: 'Arial' } ],
    [ 'format.font.georgia', {}, { fontFamily: 'Georgia' } ],
    [ 'format.font.mono', {}, { fontFamily: 'Courier New' } ],
    [ 'format.text.black', {}, { textColor: '#111827' } ],
    [ 'format.text.reset', {}, { textColor: null } ],
    [ 'format.text.color.15803d', {}, { textColor: '#15803d' } ],
    [ 'format.text.blue', {}, { textColor: '#174ea6' } ],
    [ 'format.text.red', {}, { textColor: '#b42318' } ],
    [ 'format.fill.reset', {}, { fillColor: null } ],
    [ 'format.fill.gray', {}, { fillColor: '#64748b' } ],
    [ 'format.fill.blue', {}, { fillColor: '#3b82f6' } ],
    [ 'format.fill.yellow', {}, { fillColor: '#facc15' } ],
    [ 'format.fill.color.dcfce7', {}, { fillColor: '#dcfce7' } ],
    [ 'format.align.left', {}, { horizontal: 'left' } ],
    [ 'format.align.center', {}, { horizontal: 'center' } ],
    [ 'format.align.right', {}, { horizontal: 'right' } ],
    [ 'format.vertical.top', {}, { vertical: 'top' } ],
    [ 'format.vertical.middle', {}, { vertical: 'middle' } ],
    [ 'format.vertical.bottom', {}, { vertical: 'bottom' } ],
    [ 'format.wrap.wrap', {}, { wrap: 'wrap' } ],
    [ 'format.wrap.clip', {}, { wrap: 'clip' } ],
    [ 'format.wrap.overflow', {}, { wrap: 'overflow' } ],
    [ 'format.border.all', {}, { border: 'all' } ],
    [ 'format.border.inner', {}, { border: 'inner' } ],
    [ 'format.border.horizontal', {}, { border: 'horizontal' } ],
    [ 'format.border.vertical', {}, { border: 'vertical' } ],
    [ 'format.border.outer', {}, { border: 'outer' } ],
    [ 'format.border.left', {}, { border: 'left' } ],
    [ 'format.border.top', {}, { border: 'top' } ],
    [ 'format.border.right', {}, { border: 'right' } ],
    [ 'format.border.bottom', {}, { border: 'bottom' } ],
    [ 'format.border.none', {}, { border: 'none' } ],
    [ 'format.border.color.174ea6', {}, { borderColor: '#174ea6' } ],
    [ 'format.border.style.dashed', {}, { borderStyle: 'dashed' } ],
    [ 'format.number.auto', {}, { numberFormat: 'automatic' } ],
    [ 'format.number.plain', {}, { numberFormat: 'number' } ],
    [ 'format.number.currency', {}, { numberFormat: 'currency' } ],
    [ 'format.number.percent', {}, { numberFormat: 'percent' } ],
    [ 'file.open', {}, undefined ]
  ];

  for (const [ id, current, expected ] of cases) {
    assert.deepEqual(presentationPatchForCommand(id, current), expected, id);
  }
});
