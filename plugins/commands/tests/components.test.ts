import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FormattingToolbar,
  SpreadsheetMenuBar,
  anchoredPopoverLeft,
  type PresentationToolbarState
} from '../components/command-surface.js';
import {
  CommandContextMenu,
  clampMenuPosition
} from '../components/context-menu.js';
import type { CommandContext } from '../helpers/contracts.js';

//A fully authorized cell context keeps static rendering focused on component
//semantics rather than permission setup.
const CONTEXT = {
  selectionKind: 'cell',
  canUndo: true,
  canRedo: false,
  hasDraft: false,
  readOnly: false,
  canMutateValues: true,
  canMutateSelection: true,
  canCreateFile: true,
  canImportFile: true,
  canConfigureFile: true,
  canSaveViews: true,
  canMoveRows: true,
  relationSelection: false
} satisfies CommandContext;

//Mixed values prove the toolbar emits tri-state selection feedback.
const PRESENTATION = {
  fontFamily: 'mixed',
  fontSize: 'mixed',
  bold: 'mixed',
  italic: false,
  underline: true,
  textColor: 'mixed',
  fillColor: 'transparent',
  horizontal: 'mixed',
  vertical: 'middle',
  wrap: 'clip',
  border: 'none',
  borderColor: '#4b5563',
  borderStyle: 'solid',
  numberFormat: 'automatic'
} satisfies PresentationToolbarState;

test('formatting popovers anchor to their trigger and clamp within the viewport', () => {
  assert.equal(anchoredPopoverLeft(420, 100, 176, 1440), 320);
  assert.equal(anchoredPopoverLeft(1380, 100, 176, 1440), 1156);
  assert.equal(anchoredPopoverLeft(4, 0, 176, 390), 8);
  assert.equal(anchoredPopoverLeft(350, 0, 264, 390), 118);
  assert.equal(anchoredPopoverLeft(354, 8, 192, 390), 182);
});

/** Extracts command identities without coupling assertions to label markup. */
function commandIds(markup: string) {
  return [ ...markup.matchAll(/data-command="([^"]+)"/g) ].map((match) => match[1]);
}

test('closed command surface statically renders exact top-level and toolbar semantics', () => {
  //The menubar begins with one roving tab stop and no prematurely mounted menu.
  const menus = renderToStaticMarkup(createElement(SpreadsheetMenuBar, {
    context: CONTEXT,
    onCommand: () => undefined
  }));
  assert.match(menus, /role="menubar" aria-label="Spreadsheet menus"/);
  assert.equal(menus.match(/class="command-menu-trigger"/g)?.length, 4);
  assert.match(menus, />File<span aria-hidden="true">⌄<\/span>/);
  assert.match(menus, />Edit<span aria-hidden="true">⌄<\/span>/);
  assert.match(menus, />View<span aria-hidden="true">⌄<\/span>/);
  assert.match(menus, />Format<span aria-hidden="true">⌄<\/span>/);
  assert.equal(menus.match(/tabindex="0"/g)?.length, 1);
  assert.equal(menus.match(/tabindex="-1"/g)?.length, 3);
  assert.doesNotMatch(menus, /class="command-menu"/);

  //The toolbar exposes selection state and availability through accessible
  //controls, including mixed emphasis and disabled redo.
  const toolbar = renderToStaticMarkup(createElement(FormattingToolbar, {
    context: CONTEXT,
    presentation: PRESENTATION,
    onCommand: () => undefined
  }));
  assert.match(toolbar, /role="toolbar" aria-label="Formatting tools"/);
  assert.match(toolbar, /aria-label="Redo" disabled=""/);
  assert.match(toolbar, /aria-label="Font family"/);
  assert.match(toolbar, /<option value="" disabled="" selected="">Mixed<\/option>/);
  assert.match(toolbar, /type="number"[^>]*aria-label="Font size"[^>]*placeholder="—"[^>]*value=""/);
  assert.match(
    toolbar,
    /aria-label="Bold" aria-keyshortcuts="Meta\+B Control\+B" aria-pressed="mixed"/
  );
  assert.match(
    toolbar,
    /aria-label="Italic" aria-keyshortcuts="Meta\+I Control\+I" aria-pressed="false"/
  );
  assert.match(
    toolbar,
    /aria-label="Underline" aria-keyshortcuts="Meta\+U Control\+U" aria-pressed="true"/
  );
  assert.match(toolbar, /aria-label="Text color" aria-haspopup="dialog"/);
  assert.doesNotMatch(toolbar, /Display format/);
});

test('no-selection toolbar disables presentation controls without hiding them', () => {
  const toolbar = renderToStaticMarkup(createElement(FormattingToolbar, {
    context: { ...CONTEXT, selectionKind: 'none' },
    presentation: PRESENTATION,
    onCommand: () => undefined
  }));

  //Visible disabled controls preserve orientation and accessible names while
  //preventing a command from acting without a target.
  assert.match(toolbar, /aria-label="Font family" disabled=""/);
  assert.match(
    toolbar,
    /aria-label="Bold" aria-keyshortcuts="Meta\+B Control\+B" aria-pressed="mixed" disabled=""/
  );
  assert.match(toolbar, /aria-label="Fill color" aria-haspopup="dialog" aria-expanded="false" disabled=""/);
});

test('retained drafts do not disable presentation-only controls', () => {
  const toolbar = renderToStaticMarkup(createElement(FormattingToolbar, {
    context: { ...CONTEXT, hasDraft: true },
    presentation: PRESENTATION,
    onCommand: () => undefined
  }));

  assert.doesNotMatch(toolbar, /aria-label="Bold"[^>]*disabled=""/);
  assert.doesNotMatch(toolbar, /aria-label="Font family"[^>]*disabled=""/);
});

test('context menus render target-specific commands, permission states, and clamped positions', () => {
  //Cell menus include the accepted direct edit command and keep schema-specific
  //column actions out of the surface.
  const cell = renderToStaticMarkup(createElement(CommandContextMenu, {
    menu: { target: 'cell', x: 1400, y: 880 },
    context: CONTEXT,
    onCommand: () => undefined,
    onClose: () => undefined
  }));
  assert.match(cell, /role="menu" aria-label="cell context menu"/);
  assert.match(cell, /style="left:1190px;top:470px;max-height:422px"/);
  assert.match(cell, />Edit cell<\/button>/);
  assert.match(cell, />Clear cell<\/button>/);
  assert.doesNotMatch(cell, /Configure column/);
  assert.deepEqual(commandIds(cell), [
    'edit.cut',
    'edit.copy',
    'edit.paste',
    'edit.cell',
    'edit.clear',
    'row.insert-above',
    'row.insert-below'
  ]);

  //Read-only row menus retain orientation while row-order capability remains
  //a separate permission boundary.
  //commands with the reason selected by the shared registry.
  const row = renderToStaticMarkup(createElement(CommandContextMenu, {
    menu: { target: 'row', x: 4, y: 4 },
    context: { ...CONTEXT, selectionKind: 'row', readOnly: true, canMoveRows: false },
    onCommand: () => undefined,
    onClose: () => undefined
  }));
  assert.match(row, /style="left:8px;top:8px;max-height:884px"/);
  assert.match(
    row,
    /data-command="row.insert-below"[^>]*disabled=""[^>]*title="This PostgreSQL file is read-only\."[^>]*>Insert row below/
  );
  assert.match(
    row,
    /data-command="row.move-up"[^>]*disabled=""[^>]*title="Shared row-order permission is required\."[^>]*>Move row up/
  );
  assert.match(row, />Copy<\/button>/);
  assert.deepEqual(commandIds(row), [
    'edit.cut',
    'edit.copy',
    'edit.paste',
    'row.insert-above',
    'row.insert-below',
    'row.clear',
    'row.move-up',
    'row.move-down',
    'row.resize',
    'row.delete'
  ]);

  //Relation, column, and explorer surfaces keep their own exact shared-command
  //routes without growing page-specific action implementations.
  const relation = renderToStaticMarkup(createElement(CommandContextMenu, {
    menu: { target: 'relation', x: 20, y: 20 },
    context: { ...CONTEXT, relationSelection: true },
    onCommand: () => undefined,
    onClose: () => undefined
  }));
  assert.deepEqual(commandIds(relation), [
    'edit.cut',
    'edit.copy',
    'edit.paste',
    'edit.cell',
    'edit.clear',
    'relation.configure'
  ]);

  const column = renderToStaticMarkup(createElement(CommandContextMenu, {
    menu: { target: 'column', x: 20, y: 20 },
    context: { ...CONTEXT, selectionKind: 'column' },
    onCommand: () => undefined,
    onClose: () => undefined
  }));
  assert.deepEqual(commandIds(column), [
    'edit.cut',
    'edit.copy',
    'edit.paste',
    'column.insert-left',
    'column.insert-right',
    'column.rename',
    'column.configure',
    'column.sort-asc',
    'column.sort-desc',
    'column.clear',
    'column.move-left',
    'column.move-right',
    'column.resize',
    'column.delete'
  ]);

  const explorer = renderToStaticMarkup(createElement(CommandContextMenu, {
    menu: { target: 'explorer', x: 20, y: 20 },
    context: { ...CONTEXT, selectionKind: 'none' },
    onCommand: () => undefined,
    onClose: () => undefined
  }));
  assert.deepEqual(commandIds(explorer), [
    'file.open',
    'file.table-settings',
    'file.copy'
  ]);

  //The pure clamp helper also protects a 390 x 844 narrow viewport.
  assert.deepEqual(clampMenuPosition(999, 999, 390, 844), { x: 140, y: 414 });
  assert.deepEqual(clampMenuPosition(-20, -30, 390, 844), { x: 8, y: 8 });
});
