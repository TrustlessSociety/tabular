import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GridCanvas } from '../../grid/components/grid-canvas.js';
import { REVIEW_COLUMNS, createReviewRows } from '../../grid/tests/fixtures.js';
import { SpreadsheetMenuBar } from '../../commands/components/command-surface.js';
import type { CommandContext } from '../../commands/helpers/contracts.js';
import { SelectionInspector } from '../components/selection-inspector.js';
import { EmphasisButton } from '../components/emphasis-button.js';

test('workbench components render semantic menus, grid instructions, controls, and closed overlay state', () => {
  const menuContext = {
    selectionKind: 'cell', canUndo: false, canRedo: false, hasDraft: false,
    readOnly: false, canMutateValues: true, canMutateSelection: true,
    canCreateFile: true, canImportFile: true,
    canConfigureFile: true, canSaveViews: true, canMoveRows: true,
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
  assert.match(grid, /Double-click a cell to edit/);

  const closedOverlay = renderToStaticMarkup(createElement(SelectionInspector, {
    open: false,
    selection: null,
    columns: REVIEW_COLUMNS,
    triggerRef: createRef<HTMLButtonElement>(),
    onClose: () => undefined
  }));
  assert.equal(closedOverlay, '');
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
