# Wireframe Review Notes

## Research pass — 2026-07-27 — Spreadsheet command surface

### Changed

- Created `r004-spreadsheet-command-surface` from the complete browser-reviewed `r003-spreadsheet-table-canvas` baseline.
- Updated `specs.md` first to define File, Edit, View, and Format menus, a selection-aware formatting toolbar, and target-specific row, column, and cell context menus.
- Removed Import from the copied table top bar only. Values-only import remains a separate workflow and a lower-prominence File menu route.
- Recorded the boundary between presentation formatting and PostgreSQL field, storage, constraint, and row-validity semantics.

### Research applied

- Google Docs Editors Help informed the familiar desktop menu/toolbar structure, row and column commands, Shift+F10 access, and the duplication of common format commands between the toolbar and Format menu.
- The accepted `r003` interaction baseline supplied the grid, editing, validation, reordering, and responsive behavior carried into this revision.

### Approval path

Approval of this research/specification pass unlocked the rendered Round 1 implementation below. It did not Freeze the owning research spec or authorize production implementation.

## Round 1 — 2026-07-27 — Menus, formatting, and context commands

### Changed

- Added a persistent File, Edit, View, and Format menubar below the table identity bar.
- Added inline undo/redo, font, size, emphasis, text/fill color, border, alignment, wrap, and display-format controls. Lower-priority controls move into More on narrower viewports.
- Added single-cell, range, row, and column selection feedback and one undoable in-memory formatting history shared by the toolbar and Format menu.
- Added distinct right-click menus for cells, row numbers, and column headers, plus Shift+F10 keyboard invocation.
- Added destructive row/column confirmation dialogs that stop before changing PostgreSQL.
- Added gridline, compact-control, zoom, and fullscreen view commands; presentation formatting stays separate from field/storage configuration.
- Updated the workflow index to identify this revision as the spreadsheet command surface.

### Feedback applied

- Approved research/spec pass: rendered the requested first command surface inside `r004` without changing `r003`.
- Previous browser comment: kept Import out of the table top bar.
- Direct request: implemented File, Edit, View, and Format menus; WYSIWYG-style controls; and row, column, and cell context menus.

### Browser verification

- Verified wide layouts at 1168 × 920 and narrow layouts at 720 × 920 and 390 × 844.
- Verified File menu open/dismiss, range formatting and undo, View gridline toggle, More overflow, and viewport-clamped narrow Format menu.
- Verified cell, row, and column right-click routing, Shift+F10 cell-menu access, and the guarded Delete column confirmation.
- Verified zero console warnings or errors.

### Review now

- Whether the two command rows feel appropriately dense without taking too much space from the grid.
- Whether the first row, column, and cell menu registries contain the right commands and grouping.
- Whether More is the right compact treatment below 1040px.
- Whether File > Import values is the right lower-prominence route after removing the top-bar action.

### Simulated or deferred behavior

- Formatting and view preferences persist only in the current in-memory wireframe session.
- Insert, resize, duplicate, and structural PostgreSQL mutations are represented through menus and explanatory toasts or confirmation guards; they do not alter a database.
- Delete confirmation deliberately stops before execution.
- Formulas, charts, pivot tables, conditional formatting, merged cells, comments, collaboration, and additional Insert/Data/Tools/Help menus remain deferred.

### Open questions

- Should cell formatting be shared table presentation or a per-person view preference?
- Should the next command-surface revision add Insert, Data, Tools, and Help, or keep this four-menu scope?
- Should formula/value-bar behavior remain in a later formula-specific revision?

### Approval path

If Round 1 is approved, the next step is the next requested feedback round inside `r004-spreadsheet-command-surface`. Approval does not Freeze the research spec, authorize production implementation, or advance the wireframe phase beyond the explicitly reviewed scope.

## Round 2 — 2026-07-28 — Context stability and choice popovers

### Changed

- Fixed the selected-column layout regression: selection no longer replaces the sticky header positioning, so opening a column context menu leaves its column aligned with the rest of the grid.
- Replaced the five cycling controls with anchored choice popovers for text color, fill color, borders, horizontal alignment, and vertical alignment. Each popover exposes the available values and its current selection.
- Made Undo and Redo truly unavailable at the start of a session, then update their enabled state as edits, formatting changes, Undo, and Redo move through the shared in-memory history.
- Removed all column-header overflow buttons. Column commands remain available from the column right-click menu and double-click configuration flow.

### Feedback applied

- Opening a right-click column menu no longer shifts the selected sticky header into the grid.
- Formatting controls now reveal explicit choices instead of changing a value immediately.
- Empty history is communicated with disabled Undo and Redo controls.
- Column header actions rely on right-click instead of a visible header menu affordance.

### Verification

- `node --check` passes for the updated application and icon scripts.
- Local HTML asset resolution passes for all five r004 pages.
- Confirmed no remaining `data-header-menu`, header-menu binding, or column-menu button copy in r004 source.
- The local r004 preview was restarted at port 4176. The in-app Browser session had already navigated to a connection-error document after the prior preview process stopped; its URL policy then blocked reloading that same error-tab back to localhost. Live visual verification therefore remains for the next browser review rather than being represented as complete.

### Review now

- Does opening a column right-click menu leave every sticky header and grid row in place?
- Do the five popovers make the formatting choices clearer than the earlier cycling controls?
- Are the disabled Undo and Redo controls visually quiet but still understandable?

### Approval path

If this Round 2 correction is approved after live review, the next step is the next requested feedback round inside `r004-spreadsheet-command-surface`. Approval does not Freeze the research spec or authorize production implementation.

## Round 3 — 2026-07-28 — Spreadsheet command fidelity

### Changed

- Reworked File to use the requested spreadsheet routes: New, Open, Import, Make a copy, Version history (Changes), and Table settings.
- Added View submenus for Show, Freeze, and Zoom. Freeze now exposes zero, one, two, and current row/column options; selecting an option updates the in-memory view state.
- Reworked Format into spreadsheet-like groups for Theme, Number, Text, Alignment, Wrapping, Font size, and formatting actions. Deferred choices remain visibly unavailable rather than implying support.
- Replaced the toolbar's size dropdown with a minus / numeric size / plus stepper and removed the Display format control from the visible toolbar.
- Replaced simple choice lists with spreadsheet-like text/fill palette grids, including Reset, Standard colors, Custom, and Conditional formatting routes; added visual border and alignment choice grids.
- Updated row, column, and cell right-click menus to use familiar clipboard, insert, clear, resize, move, sort, rename, and settings commands while retaining Tabular's guarded destructive actions.

### Browser verification

- Verified the live r004 review at 1168 × 920 in the Codex in-app browser.
- File renders the requested seven actions and separator in the requested grouping.
- View > Freeze renders no/one/two/current row and column options; choosing 1 row updates the grid's local freeze state to `1` and reports the view change.
- Format renders the requested hierarchy. Text and Fill color open anchored palette grids; Borders opens ten visual border choices. The toolbar no longer exposes Display format.
- Undo and Redo are disabled on a fresh load; applying a palette color enables Undo through the shared in-memory history.
- Right-clicking the Customer header keeps the grid at 137px and header at 163px before and after its context menu opens—no column shift—and renders the revised column command registry. Row actions were also confirmed live.

### Evidence

- `qa/table-round-3-freeze.jpg`
- `qa/table-round-3-palette.jpg`
- `qa/table-round-3-column-context.jpg`

### Simulated or deferred behavior

- Freeze, Zoom, themes, colors, conditional formatting, alternating colors, structural context commands, and version history remain in-memory wireframe behavior; no PostgreSQL schema or record mutation is performed.
- Format Number affects the wireframe presentation state only; it remains separate from configured field output format and PostgreSQL storage.

### Review now

- Whether the new menu terminology and order feel familiar without over-claiming spreadsheet features that Tabular does not yet persist.
- Whether the palette, borders, alignment, and font-size controls now feel close enough to a familiar spreadsheet editing surface.
- Whether the revised context-menu command grouping has the right default vocabulary for rows, columns, and cells.

### Approval path

If Round 3 is approved, the next step is another scoped feedback pass within `r004-spreadsheet-command-surface` or an explicitly requested new revision. Approval does not Freeze the owning research spec or authorize production implementation.

## Round 4 — 2026-07-28 — Compact palettes and Lucide-guided icon choice grids

### Changed

- Reduced the palette's main swatches to 20px and Standard swatches to 22px so the palette reads as a compact spreadsheet control rather than a large visual panel.
- Replaced labelled Border, Horizontal alignment, and Vertical alignment options with compact icon-only choice grids. Each option retains its accessible name through `aria-label` and native tooltips.
- Added focused border and vertical-alignment SVG treatments guided by the corresponding Lucide icon semantics, then cache-busted the local icon renderer so the live page loads those paths.
- Removed Conditional formatting and Alternating colors from the Format menu while retaining the requested Conditional formatting route inside the Fill-color palette.

### Browser verification

- At 1168 × 920, Text color renders a compact 10-column palette with visibly smaller 20px swatches.
- Borders renders ten label-free icon options; Horizontal and Vertical alignment each render three label-free icon options. DOM checks confirm their descriptive labels are not visible while the controls remain accessible by name.
- The Format menu contains neither Conditional formatting nor Alternating colors.

### Evidence

- `qa/table-round-4-palette.jpg`
- `qa/table-round-4-border-icons.jpg`
- `qa/table-round-4-horizontal-icons.jpg`
- `qa/table-round-4-vertical-icons.jpg`

### Review now

- Whether the reduced palette density now feels proportionate to the type and toolbar controls.
- Whether the icon-only border and alignment pickers have the right visual vocabulary without visible labels.

### Approval path

If Round 4 is approved, the next step is another scoped feedback pass inside `r004-spreadsheet-command-surface` or an explicitly requested new revision. Approval does not Freeze the research spec or authorize production implementation.

## Round 5 — 2026-07-28 — Border-picker fidelity correction

### Changed

- Replaced the earlier generic border glyphs with the reference-matched two-row placement grid: all, inner, horizontal, vertical, and outer borders; then left, top, right, bottom, and no borders.
- Reworked the glyphs so the selected border edge is solid while non-selected grid edges use the reference's dotted treatment.
- Added the border-color and border-style affordances to the right of the grid. Border color opens a compact swatch picker; Border style opens solid, medium, thick, dashed, dotted, and double-line choices.
- Border color and solid/medium/thick state are applied to the selected cell in this in-memory wireframe. Dash, dot, and double selection are represented as saved wireframe state without a production-grade spreadsheet border renderer.

### Feedback applied

- Applied the three attached border-control references as the visual source of truth for icon order, dotted-versus-solid treatment, and the separate color/style controls.

### Browser verification

- Confirmed the live Borders menu exposes all ten placement choices plus uniquely named Border color and Border style controls.
- Confirmed Border style opens all six line-style choices and Border color opens the eight compact color swatches.

### Evidence

- `qa/table-round-5-border-picker.jpg`
- `qa/table-round-6-border-style.jpg`
- `qa/table-round-6-border-color.jpg`

### Review now

- Whether the two-row placement grid now matches the spreadsheet border vocabulary in the supplied references.
- Whether the color and style flyouts have the correct density and anchor relationship to the border picker.

### Approval path

If Round 5 is approved, the next step is another scoped feedback pass inside `r004-spreadsheet-command-surface` or an explicitly requested new revision. Approval does not Freeze the research spec or authorize production implementation.

## Round 6 — 2026-07-28 — Compact border placement glyphs

### Changed

- Reduced only the ten border-placement glyphs from 26px to 20px.
- Kept each picker option's 46px hit area and the reference-matched two-row layout unchanged.

### Feedback applied

- Applied the request to make the border icons smaller without changing the border-color or border-style controls.

### Browser verification

- Confirmed the live Borders picker renders the smaller placement glyphs while retaining all ten icon-only controls and their accessible names.

### Evidence

- `qa/table-round-6-compact-border-picker.jpg`

### Simulated or deferred behavior

- Border placement, color, and style remain in-memory wireframe states; no PostgreSQL schema or record mutation is performed.

### Review now

- Whether the 20px placement glyphs now feel proportionate to the toolbar and spreadsheet scale.
- Whether the unchanged hit areas still feel comfortably selectable.

### Approval path

If Round 6 is approved, the next step is another scoped feedback pass inside `r004-spreadsheet-command-surface` or an explicitly requested new revision. Approval does not Freeze the research spec or authorize production implementation.
