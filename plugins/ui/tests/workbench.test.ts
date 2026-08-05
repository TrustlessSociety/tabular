import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GridCanvas, displaySelection } from '../../grid/components/grid-canvas.js';
import { REVIEW_COLUMNS, createReviewRows } from '../../grid/tests/fixtures.js';
import { SpreadsheetMenuBar } from '../../commands/components/command-surface.js';
import type { CommandContext } from '../../commands/helpers/contracts.js';
import { Icon, type IconName } from '../components/icon.js';
import { SelectionInspector } from '../components/selection-inspector.js';
import { EmphasisButton } from '../components/emphasis-button.js';

test('shared icon vocabulary renders decorative current-color SVGs without font glyphs', () => {
  const names: IconName[] = [
    'align-left',
    'align-center',
    'align-right',
    'align-top',
    'align-middle',
    'align-bottom',
    'file-spreadsheet',
    'file-down',
    'database',
    'warning',
    'success',
    'canceled',
    'operation',
    'loader'
  ];
  const html = renderToStaticMarkup(createElement(
    'div',
    null,
    ...names.map((name) => createElement(Icon, { key: name, name }))
  ));

  assert.equal(html.match(/<svg/g)?.length, names.length);
  assert.equal(html.match(/stroke="currentColor"/g)?.length, names.length);
  assert.equal(html.match(/aria-hidden="true"/g)?.length, names.length);
  for (const name of names) assert.match(html, new RegExp(`data-icon="${name}"`));
});

test('workbench components render semantic menus, grid instructions, controls, and closed overlay state', () => {
  const menuContext = {
    selectionKind: 'cell', canUndo: false, canRedo: false, hasDraft: false,
    readOnly: false, canMutateValues: true, canMutateSelection: true,
    canCreateFile: true, canImportFile: true,
    canConfigureFile: true, canSaveViews: true, canMoveRows: true,
    canMoveRowUp: true, canMoveRowDown: true, canSortSelection: true,
    relationSelection: false
  } satisfies CommandContext;
  const menu = renderToStaticMarkup(createElement(SpreadsheetMenuBar, {
    context: menuContext,
    onCommand: () => undefined
  }));
  assert.match(menu, /role="menubar"/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, />File</);
  assert.match(menu, />Edit</);
  assert.match(menu, />View</);
  assert.match(menu, />Format</);
  assert.equal(menu.match(/role="menuitem" tabindex="0"/g)?.length, 1);
  assert.equal(menu.match(/role="menuitem" tabindex="-1"/g)?.length, 3);

  const inactiveEmphasis = renderToStaticMarkup(createElement(EmphasisButton, {
    state: false,
    onAction: () => undefined
  }));
  assert.match(inactiveEmphasis, /aria-label="Bold" aria-pressed="false"/);
  const mixedEmphasis = renderToStaticMarkup(createElement(EmphasisButton, {
    state: 'mixed',
    onAction: () => undefined
  }));
  assert.match(mixedEmphasis, /aria-label="Bold" aria-pressed="mixed"/);

  const grid = renderToStaticMarkup(createElement(GridCanvas, {
    rows: createReviewRows(6),
    columns: REVIEW_COLUMNS
  }));
  assert.match(grid, /aria-label="Orders spreadsheet"/);
  assert.match(grid, /aria-describedby=/);
  assert.match(grid, /data-grid-ready="false"/);
  assert.match(grid, /Press Enter, F2, or a printable key to edit/);
  assert.match(grid, /Backspace or Delete clears/);
  assert.match(grid, /blank header corner/);

  const closedOverlay = renderToStaticMarkup(createElement(SelectionInspector, {
    open: false,
    selection: null,
    columns: REVIEW_COLUMNS,
    triggerRef: createRef<HTMLButtonElement>(),
    onClose: () => undefined
  }));
  assert.equal(closedOverlay, '');
});

test('spreadsheet-facing coordinates start value rows at one and leave headers unnumbered', () => {
  const rows = createReviewRows(2);
  assert.equal(displaySelection({
    kind: 'cell',
    anchor: { rowId: '1', columnId: 'order_id' },
    focus: { rowId: '1', columnId: 'order_id' }
  }, REVIEW_COLUMNS, rows), 'A1');
  assert.equal(displaySelection({ kind: 'row', rowId: '1' }, REVIEW_COLUMNS, rows), 'Row 1');
  assert.equal(displaySelection({ kind: 'header-row' }, REVIEW_COLUMNS, rows), 'Headers');
  assert.equal(displaySelection({
    kind: 'header',
    columnId: 'order_id'
  }, REVIEW_COLUMNS, rows), 'Header A');
});

test('selection inspector exposes bounded dialog semantics and logical coordinates', () => {
  const html = renderToStaticMarkup(createElement(SelectionInspector, {
    open: true,
    selection: {
      kind: 'range',
      anchor: { rowId: '2', columnId: 'customer' },
      focus: { rowId: '8', columnId: 'total' }
    },
    columns: REVIEW_COLUMNS,
    triggerRef: createRef<HTMLButtonElement>(),
    onClose: () => undefined
  }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /Cell range/);
  assert.match(html, />B2</);
  assert.match(html, />H8</);
});

test('selection inspector identifies the whole header row without a record anchor', () => {
  const html = renderToStaticMarkup(createElement(SelectionInspector, {
    open: true,
    selection: { kind: 'header-row' },
    columns: REVIEW_COLUMNS,
    triggerRef: createRef<HTMLButtonElement>(),
    onClose: () => undefined
  }));
  assert.match(html, /Entire header row/);
  assert.match(html, /All columns/);
  assert.match(html, />Headers</);
});
