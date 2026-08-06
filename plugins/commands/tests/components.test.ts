//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

//client
import type { PresentationToolbarState } from '../components/command-surface.js';
import type { CommandContext } from '../helpers/contracts.js';
import {
  BorderGlyph,
  BorderFormattingAccordion,
  COLOR_PALETTE_ROWS,
  ColorPalette,
  FormattingToolbar,
  STANDARD_COLOR_PALETTE,
  SpreadsheetMenuBar,
  addSessionCustomColor,
  anchoredPopoverLeft
} from '../components/command-surface.js';
import {
  CommandContextMenu,
  clampMenuPosition
} from '../components/context-menu.js';

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
  canMoveRowUp: true,
  canMoveRowDown: true,
  canSortSelection: true,
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

/**
 * Extracts command identities without coupling assertions to label markup.
 */
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
  assert.match(menus, />File<\/button>/);
  assert.match(menus, />Edit<\/button>/);
  assert.match(menus, />View<\/button>/);
  assert.match(menus, />Format<\/button>/);
  assert.doesNotMatch(menus, /⌄/);
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
  for (const icon of [
    'undo',
    'redo',
    'minus',
    'plus',
    'bold',
    'italic',
    'underline',
    'text',
    'paint-bucket',
    'borders',
    'align-left',
    'align-middle',
    'clip',
    'ellipsis-vertical'
  ]) {
    assert.match(toolbar, new RegExp(`data-icon="${icon}"`));
  }
  for (const label of [
    'Text color',
    'Fill color',
    'Horizontal alignment',
    'Vertical alignment',
    'Wrap'
  ]) {
    //Each requested popover keeps its behavior and accessible disclosure state
    //without rendering the redundant visual caret.
    const control = toolbar.match(
      new RegExp(`<button[^>]*aria-label="${label}"[^>]*>.*?<\\/button>`)
    )?.[0];
    assert.ok(control, `${label} control should render`);
    assert.doesNotMatch(control, /⌄/);
  }
  assert.doesNotMatch(toolbar, /Display format/);
  assert.doesNotMatch(toolbar, /[↶↷⇧⇩↕≡≣▦▣]/);
});

test('border placement diagrams distinguish guide geometry from exact selected edges', () => {
  const horizontal = renderToStaticMarkup(createElement(BorderGlyph, {
    placement: 'horizontal'
  }));
  const vertical = renderToStaticMarkup(createElement(BorderGlyph, {
    placement: 'vertical'
  }));
  const none = renderToStaticMarkup(createElement(BorderGlyph, {
    placement: 'none'
  }));

  assert.match(horizontal, /class="border-guide"/);
  assert.match(horizontal, /class="border-selected" d="M2 10H18"/);
  assert.doesNotMatch(horizontal, /class="border-selected" d="M2 (?:2|18)H18"/);
  assert.match(vertical, /class="border-selected" d="M10 2V18"/);
  assert.doesNotMatch(vertical, /class="border-selected" d="M(?:2|18) 2V18"/);
  assert.doesNotMatch(none, /class="border-selected"/);
});

test('color palettes preserve the supplied main and Standard order for every color surface', () => {
  assert.equal(COLOR_PALETTE_ROWS.length, 8);
  assert.ok(COLOR_PALETTE_ROWS.every((row) => row.length === 10));
  assert.deepEqual([...STANDARD_COLOR_PALETTE], [
    '#000000', '#ffffff', '#4285f4', '#ea4335',
    '#fbbc04', '#34a853', '#fa6d03', '#46bdc6'
  ]);

  for (const kind of ['text', 'fill', 'border'] as const) {
    const palette = renderToStaticMarkup(createElement(ColorPalette, {
      kind,
      current: kind === 'fill' ? 'transparent' : '#000000',
      customColors: [],
      selectedFor: () => false,
      onCommand: () => undefined,
      onCustomColor: () => undefined
    }));
    assert.equal(palette.match(/data-palette-group="main"/g)?.length, 80);
    assert.equal(palette.match(/data-palette-group="standard"/g)?.length, 8);
    const renderedOrder = [...palette.matchAll(/title="(#[0-9A-F]{6})"/g)]
      .map((match) => match[1]?.toLowerCase());
    assert.deepEqual(renderedOrder, [
      ...COLOR_PALETTE_ROWS.flat(),
      ...STANDARD_COLOR_PALETTE
    ]);
    assert.match(palette, new RegExp(`aria-label="Custom ${kind === 'fill' ? 'background' : kind} color"`));
    assert.doesNotMatch(palette, /Conditional formatting/);
  }
});

test('session custom colors append once and render to the right of the plus control', () => {
  const first = addSessionCustomColor([], '#123456');
  const second = addSessionCustomColor(first, '#ABCDEF');
  assert.deepEqual(addSessionCustomColor(second, '#123456'), ['#123456', '#abcdef']);

  const palette = renderToStaticMarkup(createElement(ColorPalette, {
    kind: 'text',
    current: '#123456',
    customColors: second,
    selectedFor: (id) => id === 'format.text.color.123456',
    onCommand: () => undefined,
    onCustomColor: () => undefined
  }));
  const customRow = palette.match(/<div class="custom-color-row">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.ok(customRow.indexOf('custom-color-control') < customRow.indexOf('data-palette-group="custom"'));
  assert.equal(customRow.match(/data-palette-group="custom"/g)?.length, 2);
  assert.match(customRow, /title="#123456"/);
  assert.match(customRow, /title="#ABCDEF"/);
});

test('Border accordion initially exposes only Border visible', () => {
  const accordion = renderToStaticMarkup(createElement(BorderFormattingAccordion, {
    presentation: PRESENTATION,
    customColors: [],
    selectedFor: () => false,
    onCommand: () => undefined,
    onCustomColor: () => undefined
  }));

  assert.match(accordion, /aria-label="Border formatting"/);
  assert.match(accordion, /aria-expanded="true"[^>]*><span>Border visible<\/span>/);
  assert.match(accordion, /aria-expanded="false"[^>]*><span>Border color<\/span>/);
  assert.match(accordion, /aria-expanded="false"[^>]*><span>Border style<\/span>/);
  assert.equal(accordion.match(/class="border-accordion-panel"/g)?.length, 1);
  assert.equal(accordion.match(/class="border-placement-glyph"/g)?.length, 10);
  assert.doesNotMatch(accordion, /aria-label="border color palette"/);
  assert.doesNotMatch(accordion, /aria-label="solid border"/);
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

  const headerRow = renderToStaticMarkup(createElement(CommandContextMenu, {
    menu: { target: 'header-row', x: 20, y: 20 },
    context: { ...CONTEXT, selectionKind: 'header-row' },
    onCommand: () => undefined,
    onClose: () => undefined
  }));
  assert.match(headerRow, /aria-label="header-row context menu"/);
  assert.deepEqual(commandIds(headerRow), ['edit.copy', 'format.clear']);
  assert.match(headerRow, />Clear header formatting<\/button>/);

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
  assert.match(
    column,
    /data-command="column.delete"[^>]*disabled=""[^>]*title="Only an inserted blank column can be removed directly\."/
  );

  const removableBlankColumn = renderToStaticMarkup(createElement(CommandContextMenu, {
    menu: { target: 'column', x: 20, y: 20 },
    context: { ...CONTEXT, selectionKind: 'column', canDeleteColumn: true },
    onCommand: () => undefined,
    onClose: () => undefined
  }));
  assert.match(
    removableBlankColumn,
    /data-command="column.delete"[^>]*aria-disabled="false"[^>]*>Delete column/
  );

  const unnamedColumn = renderToStaticMarkup(createElement(CommandContextMenu, {
    menu: { target: 'column', x: 20, y: 20 },
    context: {
      ...CONTEXT,
      selectionKind: 'column',
      canSortSelection: false,
      sortReason: 'Name this column before sorting it.'
    },
    onCommand: () => undefined,
    onClose: () => undefined
  }));
  assert.match(
    unnamedColumn,
    /data-command="column.sort-asc"[^>]*disabled=""[^>]*title="Name this column before sorting it\."/
  );

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
