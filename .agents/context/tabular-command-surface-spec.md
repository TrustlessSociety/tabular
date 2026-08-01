# Tabular Spreadsheet Command Surface

## Purpose

The spreadsheet editor uses a familiar two-row command surface above the
coordinate band. It gives users a Sheets-like vocabulary without claiming full
workbook behavior or changing PostgreSQL schema through visual formatting.
Use this document for command-surface reconstruction; the
[product contract](tabular-product-contract.md) governs which represented
commands are actually included, deferred, authorized, or backed by PostgreSQL.

Use exactly four top-level menus: **File**, **Edit**, **View**, and **Format**.
Do not add a table-screen Import button to the top bar, and do not restore a
separate record/filter/sort toolbar above the grid.

## Shared menu behavior

- A menu opens below its label as a floating surface. Only one top-level menu
  or context menu is open at once.
- Menus use separators to group actions, compact line icons where useful,
  keyboard-shortcut hints, disabled states, and nested submenus only where they
  clarify a real route.
- Pointer: click menu label, item, or sub-trigger. Keyboard: Down opens, Up/Down
  moves items, Left/Right changes top-level menus, Right opens a submenu, Enter
  invokes, and Escape closes one level/restores focus.
- Click-away, grid focus, another menu, or a terminal action closes the open
  surface. Positioning is viewport-clamped and never participates in grid layout.
- Any command acts on the existing selected cell/range/row/column. Right-click
  selects its target first, then opens the matching menu.
- Presentation commands create one in-memory undoable action. They never change
  raw cell values, semantic Field, Format, constraints, PostgreSQL storage, or
  row validity.

## File menu

File contains these actions in this order:

1. **New** — opens a blank Untitled File in the current folder. It does not
   open a create-table builder.
2. **Open** — returns to/opens the file explorer.
3. **Import** — opens the folder-aware, values-only import flow that creates a
   new file. It is not import-to-existing-file.
4. **Export** — exports CSV with headers for the current authorized grid result.
5. **Make a copy** — representative wireframe command; no persistence claim.
6. Separator.
7. **Views** — opens the current table's Personal and Shared saved-view list.
8. **New view** — opens saved-view creation directly.
9. Separator.
10. **Version history** with secondary **Changes** cue — a deferred/representative
   route, not a complete file-version system.
11. **Table settings** — opens the table-level right panel. It must not open a
   selected-column panel.

There is no duplicate Import, New, or Save action in the global sheet header,
and no New record or Save record button in the sheet toolbar.

## Saved views and active-view context

- Do not place a persistent saved-view bar between the menubar and formatting
  toolbar. The formatting toolbar follows the menubar directly.
- File → Views opens a centered dialog grouped into Personal and Shared views.
  Every view link opens the source table in a new browser tab with the saved
  filter, sort, column, and presentation state.
- A table with no views shows **No saved views** and **Create new view**. That
  action closes the list dialog before opening creation; File → New view opens
  creation directly.
- Creation asks for a name, Private or Shared access, and which current-sheet
  presentation settings to include. Shared is unavailable unless the caller is
  the table owner or an owning-role member.
- An opened view uses compact breadcrumb/title context. It must not reintroduce
  the removed persistent controls bar.

## System activity utility

The explorer and spreadsheet top bars expose System activity as a focusable
icon-only link with an accessible name and tooltip. It opens the permission-
filtered operations surface. Visible text is omitted to preserve the compact
shell; the activity page itself retains its full title and breadcrumb.

## Edit menu

Edit provides familiar selection-safe commands:

- Undo and Redo, disabled in a fresh session or when history has no applicable
  command.
- Cut, Copy, and Paste where supported by the current wireframe boundary.
- Clear selected values without shifting adjacent cells.
- Select all and Find as representative spreadsheet commands.

Clear and deletion may never shift cells left or up, because a PostgreSQL row
must retain its column alignment. Copy/undo/redo must agree with the keyboard
contract in the grid specification.

## View menu

View contains the compact spreadsheet viewing vocabulary:

- **Show** — representative choices such as gridlines/compact controls.
- **Freeze** — submenu with:
  - No rows, 1 row, 2 rows, and Up to row 50.
  - No columns, 1 column, 2 columns, and Up to column M.
- **Zoom** — familiar values such as 50%, 75%, 90%, 100%, 125%, 150%, and 200%.
- **Full screen**.

Freeze and zoom are view state only. They do not change records or schema. Use
the visible current selection to make an “up to current row/column” choice
understandable; avoid pretending it is already persisted for collaborators.

## Format menu

Format is a hierarchy for presentation. It is not the column Field/Format
configuration panel.

| Group | Items and behavior |
| --- | --- |
| Theme | Representative route; no persisted product theme claim. |
| Number | Submenu of presentation choices. Never changes the actual Field, configured output Format, PostgreSQL storage, constraints, or invalid stored values. |
| Text | Text appearance commands, including the controls duplicated in the toolbar. |
| Alignment | Opens horizontal and vertical alignment choices. |
| Wrapping | Wrap/overflow behavior for selected presentation. |
| Rotation | Visible but unavailable/deferred. |
| Smart chips | Visible but unavailable/deferred. |
| Font size | Nested size choices 10, 12, 14, 16, 18. |
| Merge cells | Visible but unavailable/deferred. |
| Clear formatting | Removes presentation formatting from the selection without altering raw value or schema. |

Conditional formatting and Alternating colors must **not** appear in Format.
Conditional formatting remains only as a lower-priority route within the
Fill-color palette, matching the reviewed command language.

## Formatting toolbar

### Layout and order

The toolbar sits directly under the menu bar. Group controls with subtle
vertical separators in this order:

1. Undo
2. Redo
3. Font family selector
4. Minus, numeric font-size input, Plus
5. Bold
6. Italic
7. Underline
8. Text color
9. Fill color
10. Borders
11. Horizontal alignment
12. Vertical alignment
13. Wrap

At narrow widths, preserve the four menus and the core font/size/emphasis
controls. Move lower-priority controls into a More surface before constraining
the sheet itself.

### Availability and feedback

- Undo and Redo are visibly subdued/disabled if history cannot move in that
  direction; they become enabled after a supported edit or formatting action.
- The toolbar reflects the active selection, including active or mixed state.
- A control that cannot apply to the selection is disabled and has an accessible
  explanation.
- Do not show a Display format selector in the toolbar. That would confuse
  sheet presentation with Column settings output Format.

### Font-size stepper

The size control is a compact minus / numeric value / plus stepper. Default
review sizes include 10, 12, 14, 16, and 18. It behaves like typography control,
not a large native select. Increment/decrement changes selected-cell
presentation and is undoable.

## Formatting popovers

Each popover anchors to its toolbar trigger, stays above the grid, is
viewport-clamped, and closes with Escape/click-away/choice completion. A
popover can never push grid columns or the coordinate/field bands.

### Text and fill color

- Use compact palette grids rather than immediate cycling controls.
- Main swatches are approximately 20px; Standard swatches approximately 22px.
  The swatch scale must remain visibly smaller than a 14px interface type line
  and not dominate the toolbar.
- The palette includes Reset, a neutral/color main grid, Standard colors, and
  Custom affordance. Fill color may additionally offer the representative
  Conditional formatting route.
- Accessible names expose color meaning; a visible checked state identifies the
  active choice.
- The palette is interaction inspiration from familiar spreadsheets, not
  authorization for custom color persistence or automatic formatting rules.

### Borders

Borders opens an icon-only, two-row placement grid with no visible text labels.
Each 46px hit target contains a compact roughly 20px glyph. The visual order is:

1. All borders
2. Inner borders
3. Horizontal borders
4. Vertical borders
5. Outer borders
6. Left border
7. Top border
8. Right border
9. Bottom border
10. No borders

Each glyph uses the selected edge as a solid line and non-selected grid edges
as dotted guide lines. The control keeps accessible name/tooltips even though
the labels are not visible.

To the right of the grid, provide:

- **Border color** with a compact color picker.
- **Border style** with solid, medium, thick, dashed, dotted, and double line
  choices, rendered visually as line samples.

Placement, color, and style are in-memory presentation state. The specified
review renderer does not need to promise a production-complete border engine.

### Horizontal and vertical alignment

Each alignment control opens a compact icon-only, three-choice popover. Do not
render words such as Left, Center, or Right inside the popover.

- Horizontal: left, center, right.
- Vertical: top, middle, bottom.

Use recognizable Lucide-informed line alignment symbols and selected-state
highlight. Provide aria-labels and tooltips for every choice.

### Wrapping

Wrap is a selection-aware text presentation command. It may expose the expected
wrap/clip/overflow choices as a compact popover or Format submenu. It does not
change Column settings Format.

## Target-specific right-click menus

All three menus are fixed/floating surfaces. They must never move a sticky
field header, change row height, or push the selected column down. A visible
header overflow button is intentionally absent; column actions rely on
right-click and header double-click.

### Cell context menu

Target: one selected body cell.

- Cut, Copy, Paste (within supported wireframe boundary).
- Edit cell.
- Clear cell.
- Insert row above / Insert row below where represented.
- Optional compatible presentation actions.

Never offer “shift cells left” or “shift cells up,” because those operations
would detach values from PostgreSQL columns. Clear affects only the selected
cell/range and is undoable.

### Row context menu

Target: selected row header.

- Cut/Copy/Paste row values where represented.
- Insert row above.
- Insert row below.
- Clear row values.
- Move row up / Move row down.
- Resize row.
- Delete row, visually separated and confirmed.

Deleting a row is structurally/destructively different from clearing values.
The reviewer-facing action stops at an explicit confirmation; it does not make
a live database mutation.

### Column context menu

Target: selected coordinate/header. This is the most schema-aware menu.

1. Cut
2. Copy
3. Paste column values
4. Separator
5. Insert column left
6. Insert column right
7. Rename column
8. Configure column
9. Separator
10. Sort ascending
11. Sort descending
12. Clear column values
13. Move column left
14. Move column right
15. Resize column
16. Separator
17. Delete column

Rename/configure route into the column-configuration flow. Sort represents a
sheet order command; it does not imply a physical PostgreSQL row order.
Delete column is visually separated, requires confirmation, and does not claim
an immediate schema mutation.

## Keyboard and layout acceptance

- Shift+F10/Menu must invoke the row, column, or cell menu matching the active
  target.
- Error, tool, top-level, submenu, and context popovers must stack above the
  canvas and remain in the viewport.
- Opening a context menu keeps coordinate band, field header, and data cell
  geometry stable. This specifically prevents the past selected-column
  displacement regression.
- A normal click may not trigger an unrelated overlay/backdrop.
- Menus, toolbar, and grid continue to work with visible internal grid
  horizontal scrolling and no document-level horizontal overflow.

## Deferred behavior

Menus illustrate a familiar command language, but theme persistence, advanced
number semantics, cut/paste coverage, structural operations, version history,
freezing persistence, full-screen behavior, border rendering fidelity, and
multi-user formatting outside an explicitly saved shared view are not
production commitments.
