# Browser QA

## Environment

- Date: 2026-07-27
- Entry point: `http://127.0.0.1:4176/pages/table.html?department=operations&table=customer-orders&round=1-review`
- Browser surface: Codex in-app browser
- Wide check: 1168 × 920
- Narrow checks: 720 × 920 and 390 × 844
- The older screenshots retained in this folder are inherited `r003` baseline references. Only the four `table-round-1-*` files below are `r004` evidence.

## Round 1 checks

### Static checks

- `lib/app.js` and `lib/icons.js` passed `node --check`.
- `specs.md` is exactly 500 lines and `notes.md` contains only revision-local history.
- All local references in the five HTML files resolved.
- The table top bar contains no Import action, and New record / Save record command buttons remain absent.

### Command surface

- File, Edit, View, and Format rendered as one menubar below the table identity bar.
- File opened at the invoking item, exposed New table, Import values, Table settings, and return to Tables, and closed with Escape.
- View toggled gridlines off and on without changing stored cell values.
- The wide toolbar exposed undo/redo, font, size, emphasis, color, border, alignment, wrap, and display-format controls.
- At 720px and 390px wide, core typography controls remained inline and the More panel exposed text color, fill color, borders, horizontal alignment, vertical alignment, and wrap fully within the viewport.
- The narrow Format menu measured inside the viewport and did not introduce document-level horizontal overflow.

### Selection and formatting

- Shift-click selected the contiguous Customer range containing Northstar Market, Harbor Goods, and Acacia Retail.
- Bold applied to all three selected cells as one formatting command; Undo restored normal weight across the range.
- Presentation formatting updated rendered cells without changing raw values or column storage configuration.

### Context menus and database guards

- Right-clicking a cell opened the cell menu with editing, clipboard, clear, format, configure, row-insert, and column-insert groups.
- Right-clicking row 2 opened the row menu with row-specific insert, duplicate, clear, move, resize, and delete commands.
- Right-clicking the Customer header selected column B and opened the column menu with insert, rename, configure, sort, clear, move, resize, and delete commands.
- Shift+F10 on the focused grid opened the cell menu for the current selection.
- Delete column opened a confirmation explaining that deleting a named column changes the connected PostgreSQL table; Cancel closed it without executing a mutation.
- Structural insert, resize, duplicate, and database-write commands remain illustrative or guarded in this wireframe.

### Browser health

- No console warnings or errors were recorded during desktop, compact, formatting, menu, context-menu, keyboard, or confirmation checks.

Evidence:

- `table-round-1-command-surface.jpg`
- `table-round-1-cell-context.jpg`
- `table-round-1-column-context.jpg`
- `table-round-1-narrow.jpg`

## Round 2 static verification — 2026-07-28

- `lib/app.js` and `lib/icons.js` again passed `node --check` after the context-menu and format-popover changes.
- A local-reference check resolved all five r004 HTML pages without missing assets.
- A source check confirmed that no `data-header-menu`, `bindHeaderMenuButton`, or column-header menu-button copy remains in r004.
- The selection rule no longer changes `position`, preserving the existing sticky header `top` behavior when a right-click selects a column.
- Undo and Redo now receive both native `disabled` and `aria-disabled` state from the same shared cell/format history that powers the commands.

### Browser status

- The local preview was restarted at port 4176 after the prior server process had exited.
- The claimed in-app browser tab was already on a browser-generated connection-error document. Its URL policy prevented reloading that error-tab back to localhost, so no new visual screenshot is recorded for Round 2 and live verification remains pending the next review session.

## Round 3 live verification — 2026-07-28

- Entry point: `http://127.0.0.1:4176/pages/table.html?department=operations&table=customer-orders&round=2-review`
- Viewport: 1168 × 920 in the Codex in-app browser.
- Static checks: `node --check` passed for `lib/app.js` and `lib/icons.js`; `git diff --check` passed; local asset resolution passed for all four r004 HTML pages; `specs.md` remains at the 500-line limit.
- Fresh-load toolbar check: Undo and Redo were disabled and no Display format control was present.
- File menu check: New, Open, Import, Make a copy, Version history (Changes), and Table settings rendered in the requested grouping.
- View check: Freeze exposed no/one/two/current rows and columns. Selecting 1 row set the grid's local `data-freeze-rows` state to `1`.
- Format check: the Text/Fill palette exposes Reset, 49 palette swatches, Standard swatches, Custom, and Conditional formatting; Borders exposes all, outer, inner, horizontal, vertical, and edge choices.
- Context-menu check: Customer header right-click produced the revised column command set without moving the grid or header (`gridTop: 137`, `headerTop: 163` before and after); row actions also rendered the revised command set.

Evidence:

- `table-round-3-freeze.jpg`
- `table-round-3-palette.jpg`
- `table-round-3-column-context.jpg`

## Round 4 live verification — 2026-07-28

- Entry point: `http://127.0.0.1:4176/pages/table.html?department=operations&table=customer-orders&round=2-review`
- Viewport: 1168 × 920 in the Codex in-app browser.
- Static checks: `node --check` passed for `lib/app.js` and `lib/icons.js`; `git diff --check` passed; the Format menu source contains no Conditional formatting or Alternating colors entries; `specs.md` remains exactly 500 lines.
- Palette check: Text color opens a compact 10-column palette with 20px main swatches and 22px Standard swatches.
- Icon-grid check: Borders opens ten icon-only controls, while horizontal and vertical alignment each open three icon-only controls. The controls retain accessible names and native titles but show no visible option labels.
- Format-menu check: Conditional formatting and Alternating colors each resolve to zero items in the live Format menu.

Evidence:

- `table-round-4-palette.jpg`
- `table-round-4-border-icons.jpg`
- `table-round-4-horizontal-icons.jpg`
- `table-round-4-vertical-icons.jpg`

## Round 5 live verification — 2026-07-28

- Entry point: `http://127.0.0.1:4176/pages/table.html?department=operations&table=customer-orders&round=2-review`
- Viewport: 1168 × 920 in the Codex in-app browser.
- Static checks: `node --check` passed for `lib/app.js` and `lib/icons.js`; `git diff --check` passed; `specs.md` remains exactly 500 lines.
- Border-picker check: the live menu shows all, inner, horizontal, vertical, and outer icons on row one; left, top, right, bottom, and no-border icons on row two. Each is a named `menuitemradio` for keyboard and assistive-technology access.
- Border-style check: the right-hand Border style control opens a six-option menu for solid, medium, thick, dashed, dotted, and double lines.
- Border-color check: the right-hand Border color control opens the visible compact swatch picker with black, grayscale, red, blue, green, and yellow choices.

Evidence:

- `table-round-5-border-picker.jpg`
- `table-round-6-border-style.jpg`
- `table-round-6-border-color.jpg`

## Round 6 live verification — 2026-07-28

- Entry point: `http://127.0.0.1:4176/pages/table.html?department=operations&table=customer-orders&round=2-review`
- Viewport: 1280 × 720 in the Codex in-app browser.
- Static checks: `node --check` passed for `lib/app.js` and `lib/icons.js`; `git diff --check` passed; `specs.md` remains exactly 500 lines.
- Border-picker density check: the ten placement glyphs render at 20px while the visual choice controls retain their 46px selection targets and two-row order.

Evidence:

- `table-round-6-compact-border-picker.jpg`
