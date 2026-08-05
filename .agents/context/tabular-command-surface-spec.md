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
- File, Edit, View, Format, Text color, Fill color, Horizontal alignment,
  Vertical alignment, and Wrapping do not render redundant down chevrons. Their
  menu/dialog semantics and accessible expanded state remain explicit.
- Pointer: click menu label, item, or sub-trigger. Keyboard: Down opens, Up/Down
  moves items, Left/Right changes top-level menus, Right opens a submenu, Enter
  invokes, and Escape closes one level/restores focus.
- Click-away, grid focus, another menu, or a terminal action closes the open
  surface. Positioning is viewport-clamped and never participates in grid layout.
- Any command acts on the existing selected cell/range/row/named-header/
  whole-column/whole-header-row target. Right-click selects its target first,
  then opens the matching menu.
- Presentation commands create one in-memory undoable action. They never change
  raw cell values, semantic Field, Format, constraints, PostgreSQL storage, or
  row validity.

## File menu

File contains these actions in this order:

1. **New** — opens the current folder's **Create a blank spreadsheet** dialog,
   asks for File name, shows the inferred PostgreSQL table, and opens the
   reconciled blank spreadsheet after Create file succeeds. It does not open a
   schema builder.
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

View exposes only Show, Freeze, and Zoom in the current slice. Full screen is
not shown until it has accepted behavior.

Freeze and zoom are view state only. They do not change records or schema. Use
the visible current selection to make an “up to current row/column” choice
understandable; avoid pretending it is already persisted for collaborators.

## Format menu

Format is a hierarchy for presentation. It is not the column Field/Format
configuration panel.

| Group | Items and behavior |
| --- | --- |
| Number | Submenu of presentation choices. Never changes the actual Field, configured output Format, PostgreSQL storage, constraints, or invalid stored values. |
| Text | Text appearance commands, including the controls duplicated in the toolbar. |
| Alignment | Opens horizontal and vertical alignment choices. |
| Wrapping | Wrap/overflow behavior for selected presentation. |
| Font size | Nested size choices 10, 12, 14, 16, 18. |
| Clear formatting | Removes presentation formatting from the selection without altering raw value or schema. |

Theme, Rotation, Smart chips, and Merge cells are not visible placeholders.
They may return only with separately accepted behavior.

Conditional formatting and Alternating colors must **not** appear in Format or
any formatting popover.

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

- Text color, background/fill color, and Border color use one shared palette
  component rather than independent preset lists.
- The palette begins with Reset, then renders the supplied main colors in this
  exact 10-column row order:

  ```text
  #000000 #434343 #666666 #999999 #b7b7b7 #cccccc #d9d9d9 #efefef #f3f3f3 #ffffff
  #980000 #ff0000 #ff9900 #ffff00 #00ff00 #00ffff #4a86e8 #0000ff #9900ff #ff00ff
  #e6b8af #f4cccc #fce5cd #fff2cc #d9ead3 #d0e0e3 #c9daf8 #cfe2f3 #d9d2e9 #ead1dc
  #dd7e6b #ea9999 #f9cb9c #ffe599 #b6d7a8 #a2c4c9 #a4c2f4 #9fc5e8 #b4a7d6 #d5a6bd
  #cc4125 #e06666 #f6b26b #ffd966 #93c47d #76a5af #6d9eeb #6fa8dc #8e7cc3 #c27ba0
  #a61c00 #cc0000 #e69138 #f1c232 #6aa84f #45818e #3c78d8 #3d85c6 #674ea7 #a64d79
  #85200c #990000 #b45f06 #bf9000 #38761d #134f5c #1155cc #0b5394 #351c75 #741b47
  #5b0f00 #660000 #783f04 #7f6000 #274e13 #0c343d #1c4587 #073763 #20124d #4c1130
  ```

- Standard follows in this exact order: `#000000`, `#ffffff`, `#4285f4`,
  `#ea4335`, `#fbbc04`, `#34a853`, `#fa6d03`, `#46bdc6`.
- Main and Standard swatches are compact circles that retain exact hex values
  in their accessible names and visible selected state.
- Custom remains a native color input. A chosen custom color is appended once,
  immediately to the right of the circular plus control, in one shared
  page-session list reused by the text, background/fill, and Border palettes.
  The list resets on page refresh and is never shared between users. Do not add
  a Conditional formatting row to the background/fill color popover.
- Accessible names expose color meaning; a visible checked state identifies the
  active choice.
- The palette is interaction inspiration from familiar spreadsheets, not
  authorization for persisted custom colors or automatic formatting rules.

### Borders

Borders is a single-open accordion with these sections in order:

1. **Border visible**, expanded initially
2. **Border color**
3. **Border style**

Opening either later section collapses the prior section. Border visible
contains an icon-only, two-row placement grid. Each 46px hit target contains a
compact roughly 20px glyph. The visual order is:

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

Border color reuses the exact shared Reset, main, Standard, and Custom palette
specified above. Border style contains solid, medium, thick, dashed, dotted,
and double line choices rendered visually as line samples. The three accordion
labels are bold text with disclosure chevrons and no leading decorative icons.

Placement, color, and style are in-memory presentation state. The specified
renderer paints solid, medium, thick, dashed, dotted, and double lines on the
chosen cell edges without changing cell geometry.

### Horizontal and vertical alignment

Each alignment control opens a compact icon-only, three-choice popover. Its
width is intrinsic to the heading and three controls; it must not retain the
five-column width used by Borders. Do not render words such as Left, Center, or
Right inside the popover.

- Horizontal: left, center, right.
- Vertical: top, middle, bottom.

Use recognizable Lucide-informed line alignment symbols and selected-state
highlight. Provide aria-labels and tooltips for every choice.

### Wrapping

Wrap is a selection-aware text presentation command. It may expose the expected
wrap/clip/overflow choices as a compact popover or Format submenu. It does not
change Column settings Format.

## Target-specific right-click menus

Target-specific menus are fixed/floating surfaces. They must never move a sticky
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
It requires an explicit confirmation and then executes through the authorized,
journal-backed PostgreSQL row action. Cancellation makes no mutation.

### Whole-header-row context menu

Target: the visibly blank corner that selects all visible headers without
selecting PostgreSQL records.

- Copy where supported.
- Clear header formatting.

All accepted header presentation axes apply across the selected headers. The
corner remains blank and owns no row/formula coordinate.

### Column context menu

Target: selected named header, whole column, or tab-local inserted blank. This
is the most schema-aware menu.

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

Insert column left/right immediately creates and selects a tab-local blank on
the requested side; it does not open Column settings. Naming or typing into that
explicit insertion promotes it through the authorized PostgreSQL column-create
boundary. Rename/configure apply only to persisted columns and route into the
column-configuration flow.

Sort represents a transient sheet-order command; it does not imply physical
PostgreSQL row order. Sorting is unavailable for unnamed logical columns and
must explain that the column needs a name. Row moves likewise disable at the
first/last committed boundary and for non-committed retained rows instead of
offering a silent no-op.

Delete column is enabled only for a tracked tab-local blank insertion and
removes it immediately without PostgreSQL DDL or confirmation. A real
PostgreSQL column stays disabled until the confirmed destructive DDL workflow
exists.

## Keyboard and layout acceptance

- Shift+F10/Menu must invoke the cell, relation, row, named-header,
  whole-column, whole-header-row, or explorer menu matching the active target.
- Error, tool, top-level, submenu, and context popovers must stack above the
  canvas and remain in the viewport.
- Opening a context menu keeps coordinate band, field header, and data cell
  geometry stable. This specifically prevents the past selected-column
  displacement regression.
- A normal click may not trigger an unrelated overlay/backdrop.
- Menus, toolbar, and grid continue to work with visible internal grid
  horizontal scrolling and no document-level horizontal overflow.

## Deferred behavior

Advanced number semantics, cut/paste coverage, destructive real-column DDL,
version history, freezing persistence, full-screen behavior, theme, rotation,
smart chips, merge cells, border rendering fidelity, and multi-user formatting
outside an explicitly saved shared view are not production commitments. Do not
show unavailable items merely as orientation placeholders.
