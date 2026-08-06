# Wireframe Specification

## Revision Summary

- Revision folder: `wireframes/r004-spreadsheet-command-surface/`
- Revision: `r004-spreadsheet-command-surface`
- Change type: new revision
- Previous revision source: `wireframes/r003-spreadsheet-table-canvas/`
- Specification status: Round 6 compact border-icon update is browser-verified and ready for wireframe review
- Product area: department-first table discovery, PostgreSQL-native table authoring, spreadsheet-style table editing and formatting, and values-only import
- Design mode: clickable grayscale wireframe draft
- Trigger: approval of the `r003` spreadsheet canvas as the base, followed by a request for a more familiar spreadsheet command surface with menus, WYSIWYG formatting controls, and target-specific context menus
- Requested scope:
  - preserve the accepted department-to-table navigation and spreadsheet canvas from `r003`;
  - remove the table-screen Import action from the top bar;
  - add a desktop menu bar with File, Edit, View, and Format menus;
  - make the visible formatting toolbar closer to familiar spreadsheet controls: undo/redo, font, size stepper, emphasis, palette-based text/fill color, borders, alignment, and wrapping; remove the display-format toolbar control;
  - expose spreadsheet Number options only through Format without changing PostgreSQL storage types or the column's configured output format;
  - add distinct right-click context menus for a selected row header, column header, and cell;
  - keep menu, toolbar, and context-menu commands synchronized with the current grid selection;
  - create a user-facing table that maps directly to a real PostgreSQL table;
  - choose semantic field types while retaining visible PostgreSQL storage details;
  - present the table as a spreadsheet canvas with column letters A–Z, numbered rows, four populated records, and blank rows within a 1,000-row logical sheet;
  - remove New record and Save record actions because users type directly into blank cells;
  - render existing values through output formats, including Yes/No text for boolean values rather than input switches;
  - make cell editors edge-to-edge with no nested form-control inset;
  - show invalid committed values as spreadsheet error tokens with a titled floating popover and no repair action, while flagging rows PostgreSQL cannot accept at their row numbers;
  - treat unnamed columns as Text until configured, support spreadsheet clear/copy/undo/redo commands, and allow drag or keyboard reordering of valid rows and named columns;
  - let a double-click on a named header open its column configuration panel;
  - provide a bottom row-count input and Add Rows action;
  - configure a column through independent field, storage, format, and constraint controls;
  - preview a values-only CSV, XLSX, or Google Sheets import before commit;
  - reveal Number, Select, Price, Switch, and Date-time editors until their cells lose focus, and name empty headers through an inline input.
- Terminology rule: use `department`, `table`, and `tables` throughout primary product UI. Use `PostgreSQL`, `database`, and `schema` only for the underlying data source, storage, or advanced configuration.
- Explicitly deferred:
  - roles, sharing, commenting, public links, audit visibility, retention, restore authority, and recovery;
  - export, APIs, automations, webhooks, plugins, AI, and Qdrant;
  - formula compatibility, formula evaluation, charts, pivot tables, and rich workbook fidelity;
  - persisted theme, conditional-format, alternating-color, merge-cell, text-rotation, protected-range, hidden-row/column, and sheet-tab behavior; menus may communicate these deferred routes without representing them as saved table state;
  - multi-user formatting conflicts and production persistence of cell presentation metadata;
  - full PostgreSQL administration and database connection provisioning;
  - polished branding and production implementation.
- Authority boundary: the owning research spec is Draft and Not Frozen. This revision is a review artifact for resolving product structure; it does not authorize scaffolding, schema authoring, or production code.
- Open questions affecting later rounds:
  - whether the department-first navigation correctly represents table responsibility without implying settled authorization policy;
  - whether technical database/schema identity belongs only in advanced details or also as subdued secondary metadata in the table list;
  - whether the field-name row should remain below the A–Z coordinate band or replace it once a PostgreSQL column exists;
  - how blank-row drafts should visibly indicate unsaved or database-rejected values without adding record-form controls;
  - how much PostgreSQL vocabulary should be visible by default versus behind advanced disclosure;
  - whether import belongs in the primary table-creation path or as a separate action;
  - whether formatting is shared table presentation metadata or a personal view preference;
  - whether the first command-surface implementation should remain limited to File, Edit, View, and Format or later add Insert, Data, Tools, and Help;
  - whether formula/value-bar work belongs in this revision or a later formula-specific revision.

## Source Of Truth

- `.agents/specs/00001-stackpress-airtable-like-application-research/index.md`
  - Contributes the current package boundary and its Draft, Not Frozen status.
  - The package is research-only and does not authorize implementation.
- `.agents/specs/00001-stackpress-airtable-like-application-research/decisions.md`
  - Contributes accepted decisions D-010 through D-014, accepted flows under G-018, the accepted field/format registry under G-027, and the metadata/draft boundary under G-028.
  - Remaining policy Gaps are not rendered as settled product behavior.
- `.agents/specs/00001-stackpress-airtable-like-application-research/postgresql-native-product-direction-findings.md`
  - Contributes the Mathesar-like direct PostgreSQL model, primary interaction contract, four independent column axes, first product boundary, and progressive PostgreSQL details.
- `.agents/specs/00001-stackpress-airtable-like-application-research/computed-columns-and-frui-support-findings.md`
  - Contributes low-friction fields and formats, the PostgreSQL generated-column boundary, and exclusions for raw HTML, password fields, and JavaScript-evaluated formulas.
- `.agents/specs/00001-stackpress-airtable-like-application-research/grid-interaction-findings.md`
  - Contributes logical selection, distinct edit state, bounded grid behavior, clipboard expectations, keyboard behavior, and accessible grid semantics.
- `.agents/resources/2026-07-24-mathesar-frui-direction.md`
  - Preserves the user direction that creating a Tabular table creates a real PostgreSQL table, headers create columns, simple field choices infer PostgreSQL storage, and incomplete rows remain drafts.
- `wireframes/r003-spreadsheet-table-canvas/`
  - Provides the accepted department/table hierarchy, shared shell, full spreadsheet canvas, editing behavior, validation treatment, and browser-reviewed interaction baseline copied forward.
  - Its minimal table top bar is intentionally extended by this revision's spreadsheet command surface.
- [Google Docs Editors Help: Edit and format a spreadsheet](https://support.google.com/docs/answer/46973)
  - Confirms the familiar desktop toolbar model for undo, redo, font, size, bold, italic, text color, fill color, borders, alignment, rotation, and wrapping.
  - Informs control grouping and selection-driven formatting behavior without making Google Sheets the product specification.
- [Google Docs Editors Help: Add or move columns and cells](https://support.google.com/docs/answer/54813?co=GENIE.Platform%3DDesktop)
  - Confirms right-click insertion and deletion for row, column, and cell targets, row/column resizing, drag movement, and the bottom Add Rows convention.
  - Informs target-specific context menus while Tabular retains PostgreSQL-aware guards.
- [Google Docs Editors Help: Keyboard shortcuts for Google Sheets](https://support.google.com/docs/answer/181110?co=GENIE.Platform%3DDesktop)
  - Confirms standard selection, clipboard, undo/redo, row/column operations, and keyboard context-menu access through Shift+F10.
  - Informs keyboard parity and accessible context-menu invocation.
- [Google Docs Editors Help: Use Google Sheets with a screen reader](https://support.google.com/docs/answer/1632199)
  - Confirms a navigable top-level menu sequence and that formatting controls are available from both the toolbar and Format menu.
  - Informs menubar semantics, arrow-key navigation, and command duplication between menu and toolbar.
- Direct browser review feedback on 2026-07-27 and 2026-07-28
  - Requires output formats in read cells, Text defaults for unnamed columns, edge-to-edge field editors, spreadsheet clear/copy/undo/redo commands, row/column drag reordering, red spreadsheet-style cell/row/unnamed-column errors with titled popovers and no Fix action, unclipped Price inputs, inline empty-header naming, removal of record and view toolbars, 1,000 logical rows, an A–Z coordinate band, bottom Add Rows controls, double-clickable field headers, and the shortened Advanced label.
  - Requires removal of the table-screen Import action; a spreadsheet-closer File menu (New, Open, Import, Make a copy, Version history/Changes, Table settings); View Freeze options; a screenshot-informed Format hierarchy and WYSIWYG palette/size controls; and revised target-specific right-click menus.
- `chrisai-designing` bundled wireframe library
  - Contributes the grayscale base tokens, reset, base styles, button/form/panel patterns, panel-layout guidance, and Lucide-guided icon treatment. Lucide's text-align and vertical-alignment icons guide the compact, icon-only choice popovers.

## Research Synthesis
- Familiar command hierarchy: spreadsheet users expect persistent top-level menus plus a faster toolbar for common actions. The same formatting command may appear in Format and in the toolbar; both entry points must resolve to one command implementation and one history entry.
- Selection before command: formatting and target actions apply to the current cell, range, row, or column. Right-click first selects the target, then opens the corresponding menu so the command's scope remains visible.
- Formatting is not schema: font, size, emphasis, colors, borders, alignment, and wrapping are presentation metadata. Spreadsheet Number choices do not change the Field, configured output format, PostgreSQL storage, constraints, defaults, generated values, or row validity.
- Database alignment guard: conventional spreadsheet commands that shift only some cells left or up are excluded because they would break the stable relationship between a PostgreSQL row and its columns.
- Destructive clarity: Delete row and Delete column remain available where familiar, but are visually separated and confirmed. Named-column changes use the existing schema-aware flow.
- Keyboard parity: File/Edit/View/Format menus and all three context menus must be operable without a pointer. Shift+F10 or the Menu key opens the context menu for the active grid target.
- Responsive preservation: wide menus and toolbars must overflow or compact before the spreadsheet columns become unreadable; the grid remains the primary horizontal scrolling surface.
- Persistence recommendation for review: cell formatting should be shared table presentation so every editor sees the same formatted table; zoom, gridline visibility, compact controls, and open-menu state should remain personal view preferences. Production storage for either category remains unresolved.
- Recommended first rendered scope: implement the requested four menus, nested View/Format command groups, the visible toolbar, single/range selection feedback, palette/alignment/border popovers, and one representative open state for each row/column/cell context menu. Defer formulas, collaboration tools, and stateful advanced spreadsheet features until this command language is visually approved.

## Screen Inventory

### Workflow index

- File: `workflows.html`
- Purpose: provide a separate, product-like starting surface for all reviewable workflows.
- Primary goal: choose a realistic workflow entry point.
- Layout: centered workflow index with revision title, workflow cards, and direct state links.
- Components: header, workflow cards, status badges, buttons.
- Required states: default.
- Navigation out: browse data, create table, open table grid, spreadsheet cell-error state, and import.
- Content: Operations and Finance departments with representative tables for each.

### Browse department tables

- File: `pages/browse.html`
- Purpose: let staff choose a department and work with the tables that department manages.
- Primary goal: find and open a department table or create a new table in the selected department.
- Layout: desktop panel shell with department/table navigator, top command bar, and table-list center; overlay navigation on narrow screens.
- Components: department/table navigator, search field, table rows, compact column-by-record metrics, recent items, and buttons.
- Required states: Operations list, Finance list through `?department=finance`, filtered list, and empty search result.
- Navigation in: workflow index.
- Navigation out: table grid, create table, and import.
- Content: `Operations` with five tables and `Finance` with three tables; technical `schema.table` paths remain secondary row metadata.

### Create table

- File: `pages/create-table.html`
- Purpose: make real-table creation approachable through semantic field defaults.
- Primary goal: name a table and define its first useful columns without starting from raw PostgreSQL DDL.
- Layout: focused two-column builder with form content and sticky PostgreSQL preview.
- Components: breadcrumb, table identity form, column cards, field-type selects, constraint switches, PostgreSQL preview, action footer.
- Required states: valid initial form, added column, removed column, inferred storage/format changes, missing-name validation, and simulated create success.
- Navigation in: browse data or workflow index.
- Navigation out: table grid after create, or browse on cancel.
- Content: a Customer orders table managed by Operations, with `public.customer_orders` retained as advanced PostgreSQL identity.

### Table grid

- File: `pages/table.html`
- Purpose: represent direct PostgreSQL record editing through a spreadsheet-style canvas with a familiar command and formatting surface.
- Primary goal: inspect and format selected values, type into cells and blank rows, use target-specific menus, configure a column, and extend row capacity.
- Layout: full-height panel shell with department/table navigator, identity top bar, menu bar, formatting toolbar, scrollable sheet canvas, sticky row-adder, status bar, contextual right panel, floating menus, and toast.
- Components: breadcrumbs, File/Edit/View/Format menubar, selection-aware WYSIWYG toolbar, draggable A–Z coordinate band, draggable semantic field-name row, accessible grid with in-memory command history, draggable row numbers, blank rows, field-specific edge-to-edge cell editors, row/column/cell context menus, red cell/row/unnamed-column error popovers, row-adder, column configuration panel, row detail drawer, toast.
- Required states:
  - default table;
  - selected cell;
  - selected row and selected column;
  - File, Edit, View, and Format menu open states, with one menu open at a time;
  - formatting toolbar default, active, disabled, and mixed-selection states;
  - text-color, fill-color, border, alignment, and wrap popovers;
  - row-header, column-header, and cell context menus opened by pointer or keyboard;
  - edge-to-edge text, Number, Select, Price, Switch, and Date-time cell editing;
  - Backspace/Delete clear, system copy, undo, and redo keyboard commands while no editor is active;
  - drag and keyboard row/column reordering, followed by unnamed interior-gap validation;
  - double-clicked named-header configuration panel;
  - unnamed-header inline naming;
  - column context menu;
  - column configuration panel;
  - blank spreadsheet rows through a 1,000-row logical capacity;
  - cell validation error token, non-layout titled popover, and invalid-row number state through `?state=error`;
  - Add Rows capacity update;
  - row detail drawer;
  - created-table confirmation through `?created=1`.
- Navigation in: browse, create table, import, or workflow index.
- Navigation out: browse; import is no longer promoted from the table top bar.
- Content: customer orders with text, relation, email, select, price, boolean, and date-time fields; read cells stay output-formatted while double-click reveals the matching field editor.

### Import values

- File: `pages/import.html`
- Purpose: preview one-time, values-only import behavior without implying live synchronization or formula support.
- Primary goal: choose a source, review inferred columns and fidelity warnings, and commit imported values.
- Layout: focused wizard with step rail, content panel, preview table, and sticky actions.
- Components: source cards, file/source summary, stepper, mapping controls, warning list, preview table, import progress/success state.
- Required states: source choice, preview and mapping, ready to import, importing, and success.
- Navigation in: browse, workflow index, or table grid.
- Navigation out: imported table or browse.
- Content: `Q3-orders.csv`, 248 rows, typed values, source tokens, and unsupported-feature warning treatment.

## Workflow Starting Points

### Browse and open a department table

- Starting screen: `pages/browse.html`
- Intended role: authenticated internal staff editor
- Happy path: choose Operations or Finance, search its tables, open a table, and inspect the grid.
- Alternate path: a search with no matching tables shows a clear empty result.

### Create a department table

- Starting screen: `pages/create-table.html`
- Intended role: authenticated user allowed to create tables managed by Operations
- Happy path: name the table, review inferred field/storage/format choices, create it, open the grid.
- Alternate path: missing table name blocks create and focuses the identity field.

### Configure a column and edit blank rows

- Starting screen: `pages/table.html`
- Intended role: authenticated table editor with applicable department responsibility and underlying data privileges
- Happy path: double-click a named header to configure it, then type directly into an empty sheet row.
- Alternate path: an invalid email keeps the cell value and shows a corner marker; the affected row number turns red and offers a row-level explanation of why PostgreSQL cannot accept the row.

### Format selected cells

- Starting screen: `pages/table.html`
- Intended role: authenticated table editor who can change the table's presentation metadata
- Happy path: select one or more cells, choose font, size, emphasis, palette color, borders, alignment, or wrapping, and see the rendered selection update without changing stored values or the configured column output format.
- Alternate path: a mixed selection shows an indeterminate toolbar value; a control that does not apply to the selection is disabled and explains why.

### Use target-specific spreadsheet commands

- Starting screen: `pages/table.html`
- Intended role: authenticated table editor with the applicable data and schema privileges
- Happy path: right-click a cell, row number, or column letter/header and receive only commands that apply to that target.
- Alternate path: destructive or database-structural commands remain visually distinct and require confirmation or open the existing column configuration flow rather than mutating PostgreSQL immediately.

### Review a values-only import

- Starting screen: `pages/import.html`
- Intended role: authenticated user allowed to create or populate the selected table
- Happy path: choose a source, review types and warnings, import exact values, open the resulting table.
- Alternate path: return to source selection before commit; unsupported workbook behavior is reported rather than executed.

## Layout And Component Contract
- `workflows.html` uses the existing workflow-card layout; browse and table pages keep the accepted department/table panel shell; create and import retain the focused-builder layout.
- The table screen adds a persistent menubar and formatting toolbar between the identity bar and the A-Z coordinate band. The 26-column grid remains the primary horizontal scrolling surface.
- File provides New, Open, Import, Make a copy, Version history (Changes), and Table settings. Edit provides undo/redo, clipboard, clear, select-all, and find. View provides Show, Freeze, Zoom, and full screen. Format follows a spreadsheet-style hierarchy with Number, Text, Alignment, Wrapping, Rotation, Font size, safe deferred routes, and Clear formatting.
- Toolbar order is Undo, Redo, Font, minus/size/plus, Bold, Italic, Underline, Text color, Fill color, Borders, Horizontal alignment, Vertical alignment, and Wrap. Palette color, visual border, and alignment controls open anchored popovers; unavailable undo/redo controls are disabled. Lower-priority controls move into More below 1040px.
- Row, column, and cell context menus expose target-appropriate Cut/Copy/Paste, insert, clear, resize/reorder, configure, sort, and guarded deletion commands. Shift-left and shift-up cell deletion are excluded because PostgreSQL rows must retain column alignment.
- Named row/column deletion requires confirmation. Column creation, rename, type, storage, and constraint changes continue through schema-aware configuration.
- Formatting changes presentation metadata only; PostgreSQL storage, raw values, semantic fields, constraints, and validation remain unchanged.
- Menus use ARIA menubar/menu semantics, pointer and keyboard activation, Escape dismissal, viewport clamping, and focus recovery. The grid retains its existing accessible selection, editing, validation, and reorder contracts.
- Wide layouts keep all requested controls visible. Narrow layouts hide the sidebar by default, retain the four menu labels, keep core typography controls inline, and reveal lower-priority formatting through More.
- Shared implementation remains in `lib/app.css`, `lib/app.js`, `lib/icons.css`, and `lib/icons.js`.

## Interaction And State Contract

### Global navigation

- Trigger: click a relative page link.
- Before: current screen.
- After: destination screen.
- Visible result: destination loads with the matching object context.
- URL result: document-relative HTML path.
- Owner: native anchor navigation.

### Mobile navigator

- Trigger: click the menu icon below 920px.
- Before: left navigator closed.
- After: navigator overlays the center pane and backdrop is visible.
- Visible result: department and table navigation remains usable without shrinking the grid.
- Guard: the shell owns navigation state, only the menu button can open it, and the backdrop initializes hidden and closes above 920px.
- URL result: none.
- Owner: `lib/app.js`.

### Top-level spreadsheet menus

- Trigger: activate File, Edit, View, or Format by pointer or keyboard.
- Before: all menus closed or another top-level menu open.
- After: the requested menu opens and any prior menu closes; moving horizontally while a menu is open switches menus.
- Visible result: a floating command list aligned beneath its label with separators, shortcut hints, disabled states, and nested submenus where required.
- Keyboard result: Down opens and enters a menu, Left/Right changes top-level menu, Up/Down moves between items, Right opens a submenu, Enter invokes, and Escape closes one level before restoring focus.
- Dismissal: selecting a terminal command, pressing Escape, clicking outside, moving focus into the grid, or opening a context menu.
- URL result: File navigation commands may use document-relative routes; other commands remain in memory.
- Owner: `lib/app.js`.

### Selection-aware formatting

- Trigger: select a cell/range, then activate a formatting toolbar control or the equivalent Format command.
- Before: the selected cells retain their prior presentation metadata.
- After: presentation metadata changes in memory and the rendered cells update immediately; the raw value and PostgreSQL schema remain unchanged.
- Visible result: font, size, emphasis, palette text/fill color, borders, alignment, or wrapping updates; the toolbar reflects the selection's active or mixed state.
- Guard: commands that cannot apply to the selection are disabled. Format > Number cannot coerce or repair an invalid stored value, change a Field choice, change a configured column output format, or change PostgreSQL storage.
- History: each completed formatting action creates one undoable command, including a multi-cell range change.
- URL result: none.
- Owner: `lib/app.js`.

### Row, column, and cell context menus

- Trigger: right-click a row number, coordinate/field header, or data cell; keyboard users invoke the active target with Shift+F10 or the Menu key.
- Before: target may or may not be selected; all floating menus may be closed.
- After: the target becomes the active row, column, or cell and only its matching context menu opens at a viewport-clamped position.
- Visible result: target highlight plus a target-specific command list; submenu and destructive-command treatments follow the same menu language as the top menubar.
- Dismissal: command invocation, Escape, click-away, scroll that moves the target out of view, or opening a different menu.
- Guard: row/column deletion requires confirmation, schema mutations route through column configuration, and cell deletion never shifts neighboring cells out of their PostgreSQL columns.
- URL result: none.
- Owner: `lib/app.js`.

### Row and column reordering
- Drag any coordinate/header or row number, with Alt+Left/Right and Alt+Up/Down as keyboard alternatives; rows and columns move first, then each unnamed gap before the last named column turns red and explains its missing name without writing to the database.

### Browse filtering

- Trigger: type in the table search input.
- Before: all table rows visible.
- After: rows in the selected department whose labels or technical identity do not match are hidden.
- Visible result: matching table list or an empty result.
- URL result: none.
- Owner: `lib/app.js`.

### Create-table field inference

- Trigger: change a semantic field select.
- Before: prior storage and format labels.
- After: safe default PostgreSQL storage and output format are updated.
- Visible result: column card and SQL preview change together.
- URL result: none.
- Owner: `lib/app.js`.

### Add or remove a proposed column

- Trigger: activate Add column or a column remove control.
- Before: current column list.
- After: a new default text column is appended or an optional column is removed.
- Visible result: builder and PostgreSQL preview remain in sync.
- URL result: none.
- Owner: `lib/app.js`.

### Create table

- Trigger: activate Create table.
- Before: editable table and column proposal.
- After: invalid name shows an inline error; valid content shows a brief creating state and navigates to the grid.
- Visible result: created-table confirmation on `pages/table.html`.
- URL result: `./table.html?created=1`.
- Owner: `lib/app.js`.

### Grid selection and editing

- Trigger: click a data cell; Shift+click or Shift+arrow extends a range; clicking a row number or column letter selects that target; double-click, Enter, F2, or printable input enters edit mode; Backspace/Delete clears; Command/Ctrl+C copies; Command/Ctrl+Z undoes; Command/Ctrl+Shift+Z or Ctrl+Y redoes.
- Before: prior logical active cell and navigation mode.
- After: selected cells, row, or column receive selection semantics; editing exposes the field-matched control until Enter, Tab, or click-away commits it, while Escape cancels it; navigation and formatting commands update an in-memory history and unnamed columns use Text inputs.
- Visible result: cell/range/row/column selection treatment, edge-to-edge editor, cleared value, copied value, restored history state, or formatting update; configured Number fields use numeric inputs, Status uses a select, Total a currency-prefixed price field, Paid a switch, and Ordered at a date-time field while read cells retain formatted output.
- URL result: none.
- Owner: `lib/app.js`.

### Header configuration

- Trigger: double-click any named field header, or use its menu and Configure column.
- Before: menu and contextual panel closed.
- After: menu closes and right panel opens with current column settings.
- Visible result: field, storage, format, required, unique, and advanced controls.
- URL result: none.
- Owner: `lib/app.js`.

### Empty-header naming

- Trigger: double-click an unnamed field header beneath an empty spreadsheet coordinate.
- Before: the field header is blank.
- After: an edge-to-edge name input fills the header until click-away or Tab commits it; Escape restores the blank header.
- Visible result: a named Text column with no dialog; later double-click opens its normal column configuration panel.
- URL result: none.
- Owner: `lib/app.js`.

### Blank-row drafting and validation

- Trigger: type into a blank body cell and commit with Enter, Tab, or click-away.
- Before: the logical sheet row is blank.
- After on invalid input: the raw value remains available for re-editing while the cell shows `#VALUE!` or `#ERROR!` and a titled Error popover without a Fix action; the unselected cell has no border, and its sticky row number turns red with a separate corner popover listing one bullet per failing column.
- After on valid input: the value remains as a spreadsheet draft until the illustrative database boundary accepts the row.
- Visible result: formatted value, spreadsheet error token, selected-cell border, cell Error popover, or red invalid-row number with a row explanation; sticky row numbers remain above horizontally scrolled cells and no New record, Save record, or Fix action appears.
- URL result: `?state=error` links directly to the representative cell-error state.
- Owner: `lib/app.js`.

### Add sheet rows

- Trigger: enter a positive row count and activate Add Rows at the bottom of the canvas.
- Before: the sheet exposes 1,000 logical rows.
- After: logical row capacity and `aria-rowcount` increase by the requested count.
- Visible result: row count and status update while the row-adder remains available.
- URL result: none.
- Owner: `lib/app.js`.

### Import progression

- Trigger: choose a source and use Continue, Back, or Import values.
- Before: current wizard step.
- After: next or prior step; import transitions through progress to success.
- Visible result: appropriate source, preview/mapping, warnings, or success content.
- URL result: success action links to `./table.html?imported=1`.
- Owner: `lib/app.js`.

### State persistence

- `?department=finance` links to the Finance table list; table query parameters may carry illustrative department and table identity into the representative grid.
- Query strings also link to created/imported and spreadsheet cell-error review states.
- In-memory state owns menubar/submenu/context-menu state, palette and alignment popovers, panels, cell/range/row/column selection, presentation formatting, freeze and gridline preferences, cell edits, inline header naming, logical row capacity, builder changes, and import steps.
- This research pass intentionally leaves production formatting persistence unresolved; it must not be represented as PostgreSQL cell data without an accepted metadata model.
- No wireframe state is written to PostgreSQL or any external service.

## Library Plan

- `lib/base/tokens.css`
  - Copied from the bundled wireframe library.
  - Provides grayscale tokens, spacing, type, shadows, and motion.
- `lib/base/reset.css`
  - Copied from the bundled wireframe library.
  - Provides predictable box sizing, controls, media, tables, and hidden-state handling.
- `lib/base/base.css`
  - Copied from the bundled wireframe library.
  - Provides page, container, stack, row, surface, heading, and assistive-text primitives.
- `lib/app.css`
  - Copied from `r003` and extended with menu/submenu, toolbar, palette/border/alignment popover, confirmation, selection, formatting, and responsive-overflow patterns.
  - Owns the workflow index, department/table navigator, focused builder, spreadsheet menubar/toolbar, context menus, coordinate/field bands, grid, cell error tooltip, row-adder, column panel, import wizard, toast, and responsive behavior.
- `lib/icons.css`
  - Adapted from the bundled Lucide icon CSS.
- `lib/icons.js`
  - Adapted from the bundled Lucide-guided SVG renderer.
  - Includes only icons used in this revision, including formatting, alignment, border, and menu commands.
- `lib/app.js`
  - Copied from `r003` and extended with selection ranges, formatting history, nested menu/palette state, target-specific context menus, confirmation guards, and spreadsheet view preferences while preserving the accepted table interactions.
- No sample files, frameworks, package manager, or build tooling are copied.

## Page Build Plan

### `workflows.html`

- Title: Tabular workflows
- Layout: workflow index
- Components: top identity, revision summary, workflow cards, buttons, badges
- Imports: base CSS, app CSS, icon CSS, icon JS
- Initial state: default
- Interaction hooks: native links only
- Links: browse, create table, table grid, spreadsheet cell-error state, import

### `pages/browse.html`

- Title: Operations tables
- Layout: data-browser panel layout
- Components: department/table navigator, command bar, search, department-scoped table lists, recent tables
- Imports: base CSS, app CSS, icon CSS, icon JS, app JS
- Initial state: Operations selected with its five tables visible
- Interaction hooks: department query state, navigator toggle, backdrop, department-scoped table search
- Links: workflow index, create table, import, table grid

### `pages/create-table.html`

- Title: Create a table
- Layout: focused builder
- Components: breadcrumb, identity form, column cards, inferred labels, SQL preview, footer actions
- Imports: base CSS, app CSS, icon CSS, icon JS, app JS
- Initial state: three useful columns
- Interaction hooks: add/remove column, change field type, validate, create
- Links: browse, table grid after successful create

### `pages/table.html`

- Title: Customer orders
- Layout: data-browser panel layout plus grid canvas
- Components: navigator, identity top bar without Import, File/Edit/View/Format menubar with nested command groups, WYSIWYG formatting toolbar and choice popovers, draggable A–Z coordinate band, draggable field-name row and row numbers, accessible spreadsheet grid, blank rows, field-specific cell editors, row/column/cell context menus, inline empty-header naming, red cell/row/unnamed-column error popovers, row-adder, right panel, toast
- Imports: base CSS, app CSS, icon CSS, icon JS, app JS
- Initial state: query-driven department/table identity plus default, created, imported, or spreadsheet cell-error state
- Interaction hooks: top-level menu and submenu navigation, spreadsheet palette/border/alignment popovers, font-size stepper, freeze state, undo/redo availability, revised right-click context-menu routing, cell/range/row/column selection without layout displacement, grid editing, row/column drag and keyboard reorder, inline header naming, header double-click, spreadsheet cell/row/column validation, Add Rows, row drawer
- Links: workflow index, browse, create table; Import values may remain available through File rather than the top bar

### `pages/import.html`

- Title: Import values
- Layout: focused wizard
- Components: stepper, source cards, source summary, mapping selects, preview table, warnings, status, actions
- Imports: base CSS, app CSS, icon CSS, icon JS, app JS
- Initial state: source selection
- Interaction hooks: source choice, step progression, import progress/success
- Links: browse, table grid after import

## Functional Acceptance Checks

- `specs.md`, `notes.md`, and `workflows.html` exist in the revision.
- Every listed screen exists and uses document-relative links.
- `workflows.html` links to each workflow start and the spreadsheet cell-error alternate state.
- Operations and Finance are visible as peer departments, each with at least two direct child tables and no singleton Company or Departments wrapper.
- Department switching updates the browse heading, count, active navigation state, and table list.
- Database and schema do not appear as primary navigation levels; technical PostgreSQL identity remains secondary or advanced.
- Browse filtering works and displays its empty result.
- Create-table field changes update inferred storage, format, and SQL preview.
- Create-table validation blocks a missing name and valid create reaches the table grid.
- Grid selection, Text-default unnamed cells, field-specific editing, clear/copy/undo/redo, row/column drag and keyboard reorder, post-drop unnamed-gap errors, inline header naming, header double-click, column menu, column panel, and row drawer work.
- The table top bar has no Import button.
- File, Edit, View, and Format appear as a keyboard-navigable menubar with one open menu at a time, viewport-clamped menus, shortcut hints, disabled states, and Escape/click-away dismissal.
- The formatting toolbar exposes undo, redo, font, a minus/size/plus stepper, bold, italic, underline, text color, fill color, borders, horizontal alignment, vertical alignment, and wrapping with clear grouping and narrow-screen overflow; display-format is absent from the toolbar, while palette color, visual border, and alignment choices open viewport-clamped popovers.
- Formatting a selected cell or range changes its rendered presentation and creates one undoable command without changing its PostgreSQL storage type, semantic Field, constraints, or raw stored value.
- Right-click and Shift+F10/Menu key open different row, column, and cell context menus; opening selects the target without moving its row or column, command availability matches that target, Escape restores focus, and menus remain within the viewport.
- Row and column structural commands preserve PostgreSQL alignment; destructive row/column deletion requires confirmation and schema changes use the column-configuration path.
- Grid column headers show labels only and no overflow-menu buttons; right-click owns column commands while double-click opens configuration. Field types, storage, relations, and constraints remain in the configuration panel.
- Ordinary desktop clicks cannot open the mobile navigator backdrop.
- The sheet exposes A–Z coordinates, 1,000 logical rows, populated output-formatted values, and blank editable rows.
- Boolean read cells render Yes/No output text rather than switch inputs.
- Validation uses black regular-weight `#ERROR!` tokens with red corner indicators, compact red popover accent/title treatments without a Fix action, red sticky row numbers with column bullets, and one sticky gray field header showing `#ERROR!` with a top-right red corner per unnamed interior gap without shifting into the record rows. A column-error popover opens immediately only when its header is selected, opens after a one-second hover delay, never opens automatically after a reorder, and stacks above neighboring invalid headers.
- New record and Save record are absent; the bottom row-adder accepts a number and Add Rows updates logical capacity.
- Import source selection, preview, back/continue, progress, and success states work.
- The rendered UI contains no visible annotations, TODOs, review prose, or implementation commentary.
- The artifact remains grayscale and readable at wide and narrow viewports.
- JavaScript parses without syntax errors.
- Internal page links and local assets resolve.
- Browser verification covers the workflow index and primary flows at desktop and narrow widths.
- Revision `r004` Round 3 applies the spreadsheet-fidelity feedback. Review approval authorizes only the next requested wireframe feedback round; it does not Freeze the research spec or authorize production implementation.
