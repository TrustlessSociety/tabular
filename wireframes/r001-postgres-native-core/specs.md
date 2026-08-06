# Wireframe Specification

## Revision Summary

- Revision folder: `wireframes/r001-postgres-native-core/`
- Revision: `r001-postgres-native-core`
- Change type: new revision
- Previous revision source: none
- Product area: PostgreSQL-native table discovery, schema authoring, grid editing, persistent draft rows, and values-only import
- Design mode: clickable grayscale wireframe draft
- Trigger: begin wireframes from the current research package using the `chrisai-designing` workflow
- Requested scope:
  - browse a connected PostgreSQL database, schemas, and tables through approachable labels;
  - create a user-facing table that maps directly to a real PostgreSQL table;
  - choose semantic field types while retaining visible PostgreSQL storage details;
  - open and edit a real table in a grid;
  - configure a column through independent field, storage, format, and constraint controls;
  - create a persistent draft row and promote it only after required values pass validation;
  - preview a values-only CSV, XLSX, or Google Sheets import before commit;
  - expose saved-view controls without treating them as database security.
- Terminology rule: use `table` and `tables` throughout product-facing UI. Use
  `PostgreSQL` only when describing the underlying database, schema, storage,
  or advanced configuration.
- Explicitly deferred:
  - roles, sharing, commenting, public links, audit visibility, retention, restore authority, and recovery;
  - export, APIs, automations, webhooks, plugins, AI, and Qdrant;
  - formula compatibility, formula evaluation, and rich workbook fidelity;
  - full PostgreSQL administration and database connection provisioning;
  - polished branding and production implementation.
- Authority boundary: the owning research spec is Draft and Not Frozen. This revision is a review artifact for resolving product structure; it does not authorize scaffolding, schema authoring, or production code.
- Open questions affecting later rounds:
  - whether the database/schema navigator should be always visible or collapse behind a single workspace switcher;
  - whether table creation should be a focused page, dialog, or grid-first empty state;
  - whether draft records should remain inline in the grid, move into a row drawer, or support both;
  - how much PostgreSQL vocabulary should be visible by default versus behind advanced disclosure;
  - whether import belongs in the primary table-creation path or as a separate action.

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
- `chrisai-designing` bundled wireframe library
  - Contributes the grayscale base tokens, reset, base styles, button/form/dialog patterns, panel-layout guidance, and Lucide-guided icon treatment.

## Screen Inventory

### Workflow index

- File: `workflows.html`
- Purpose: provide a separate, product-like starting surface for all reviewable workflows.
- Primary goal: choose a realistic workflow entry point.
- Layout: centered workflow index with revision title, workflow cards, and direct state links.
- Components: header, workflow cards, status badges, buttons.
- Required states: default.
- Navigation out: browse data, create table, open table grid, draft-error state, and import.
- Content: Operations database, public schema, customer orders, and inventory tables.

### Browse data

- File: `pages/browse.html`
- Purpose: make PostgreSQL database/schema/table discovery approachable without hiding the underlying objects.
- Primary goal: find and open an existing table or create a new one.
- Layout: desktop panel shell with database/schema tree, top command bar, and table-list center; overlay navigation on narrow screens.
- Components: search field, schema tree, table rows, compact column-by-record metrics, recent items, buttons.
- Required states: default list, filtered list, and empty search result.
- Navigation in: workflow index.
- Navigation out: table grid, create table, and import.
- Content: `Operations` database, `public` and `reporting` schemas, and realistic internal tables.

### Create table

- File: `pages/create-table.html`
- Purpose: make real-table creation approachable through semantic field defaults.
- Primary goal: name a table and define its first useful columns without starting from raw PostgreSQL DDL.
- Layout: focused two-column builder with form content and sticky PostgreSQL preview.
- Components: breadcrumb, table identity form, column cards, field-type selects, constraint switches, PostgreSQL preview, action footer.
- Required states: valid initial form, added column, removed column, inferred storage/format changes, missing-name validation, and simulated create success.
- Navigation in: browse data or workflow index.
- Navigation out: table grid after create, or browse on cancel.
- Content: `customer_orders` in the `public` schema.

### Table grid

- File: `pages/table.html`
- Purpose: represent direct PostgreSQL record editing through a familiar table grid.
- Primary goal: inspect records, edit a cell, configure a column, and promote a valid draft row.
- Layout: full-height panel shell with schema tree, command bar, grid canvas, status bar, contextual right panel, dialogs, and toast.
- Components: breadcrumbs, saved-view control, filter/sort controls, semantic column headers, accessible grid, draft row inputs, header menu, column configuration panel, cell editor, validation state, row detail drawer, toast.
- Required states:
  - default table;
  - selected cell;
  - inline cell editing;
  - empty-header create-column dialog;
  - column context menu;
  - column configuration panel;
  - draft row with missing required email;
  - draft save failure mapped to the email cell;
  - successful draft promotion;
  - row detail drawer;
  - created-table confirmation through `?created=1`.
- Navigation in: browse, create table, import, or workflow index.
- Navigation out: browse and import.
- Content: customer orders with text, relation, email, select, price, switch, and date-time fields.

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

### Browse and open an existing table

- Starting screen: `pages/browse.html`
- Intended role: authenticated internal staff editor
- Happy path: search or browse schema, open `customer_orders`, inspect the grid.
- Alternate path: a search with no matching tables shows a clear empty result.

### Create a PostgreSQL-native table

- Starting screen: `pages/create-table.html`
- Intended role: authenticated user allowed to create tables in the selected schema
- Happy path: name the table, review inferred field/storage/format choices, create it, open the grid.
- Alternate path: missing table name blocks create and focuses the identity field.

### Configure a column and add a record

- Starting screen: `pages/table.html`
- Intended role: authenticated table editor with applicable schema and data privileges
- Happy path: open the email header menu, configure the column, complete the draft record, and save it.
- Alternate path: save with a blank required email maps the validation error to that draft cell without inserting a row.

### Review a values-only import

- Starting screen: `pages/import.html`
- Intended role: authenticated user allowed to create or populate the selected table
- Happy path: choose a source, review types and warnings, import exact values, open the resulting table.
- Alternate path: return to source selection before commit; unsupported workbook behavior is reported rather than executed.

## Layout System

### Workflow index layout

- Used by `workflows.html`.
- Regions: top identity bar, intro, workflow-card grid, footer boundary.
- Responsive behavior: three columns at wide widths, one column below 760px.
- Shared styles: `lib/app.css`.

### Data-browser panel layout

- Used by `pages/browse.html` and `pages/table.html`.
- Regions: left database/schema navigator, top command bar, central working surface, optional right contextual panel.
- Desktop behavior: navigator remains visible; table grid can open a 360px right panel.
- Narrow behavior: navigator and contextual panel become overlays; the grid retains horizontal scrolling instead of compressing columns beyond recognition.
- Shared styles and behavior: `lib/app.css`, `lib/app.js`.

### Focused builder layout

- Used by `pages/create-table.html` and `pages/import.html`.
- Regions: top bar, main form or wizard content, sticky summary/preview rail, action footer.
- Desktop behavior: content and summary use a two-column grid.
- Narrow behavior: summary stacks below content and actions remain full width.
- Shared styles and behavior: `lib/app.css`, `lib/app.js`.

### Grid canvas

- Used by `pages/table.html`.
- Regions: table toolbar, column-header row, record rows, persistent draft row, add-column header, horizontal scroll area, status bar.
- Desktop behavior: minimum intrinsic grid width with center-pane overflow.
- Narrow behavior: object navigator closes by default and horizontal scrolling preserves readable cells.
- Shared styles and behavior: `lib/app.css`, `lib/app.js`.

## Component Inventory

### Buttons and icon buttons

- Appear on every screen.
- Variants: primary, secondary, ghost, compact, icon-only, disabled.
- Inputs: click or keyboard activation.
- Outputs: navigation, state change, dialog/panel open, or form submission.
- Accessibility: text labels or `aria-label`; visible focus.
- Shared files: `lib/app.css`, `lib/icons.js`, `lib/icons.css`.

### Database/schema tree

- Appears in browse and table screens.
- Variants: expanded database, expanded schema, current table.
- Inputs: click or keyboard activation.
- Outputs: navigation or current selection.
- Accessibility: nested list semantics, `aria-current`, and labelled navigation.
- Shared files: `lib/app.css`.

### Field and format controls

- Appear in create-table cards and the table column panel.
- Variants: text, email, relation, price, select, switch, and date-time in the rendered examples.
- Inputs: semantic field selection, advanced storage selection, output-format selection, constraint toggles.
- Outputs: updated inferred storage and format labels or updated grid header metadata.
- Accessibility: explicit labels and help text.
- Shared files: `lib/app.css`, `lib/app.js`.

### Accessible grid

- Appears on the table screen.
- Variants: read row, selected cell, editing cell, draft row, invalid draft cell, promoted row.
- Inputs: click, double click, Enter, F2, Escape, arrow keys, Tab, and draft form input.
- Outputs: logical selection, edit state, validation feedback, or committed illustrative row.
- Accessibility: `role="grid"`, logical row/column counts, indexed rows and cells, selected state, managed active cell, labelled headers, and focus recovery.
- Shared files: `lib/app.css`, `lib/app.js`.

### Header menu and column panel

- Appear on the table screen.
- Variants: menu closed/open; panel closed/open; default/advanced detail disclosed.
- Inputs: click, Escape, and form changes.
- Outputs: configure field, format, storage, and constraints; visible header metadata update.
- Accessibility: labelled menu button, dialog-like panel, focusable controls, and close button.
- Shared files: `lib/app.css`, `lib/app.js`.

### Dialog

- Appears for adding a new column.
- Variants: closed/open and validation error.
- Inputs: double-click empty header, submit, cancel, Escape.
- Outputs: a new illustrative column header or dialog closure.
- Accessibility: native `dialog`, labelled title, initial focus, and explicit actions.
- Shared files: `lib/app.css`, `lib/app.js`.

### Import stepper and preview

- Appear on the import screen.
- Variants: choose source, preview, ready, importing, success.
- Inputs: source selection, mapping selection, continue/back, and import.
- Outputs: step transitions and completion route.
- Accessibility: ordered step list, active-step announcement, labelled mapping controls, and progress status.
- Shared files: `lib/app.css`, `lib/app.js`.

### Toast

- Appears on table and import screens.
- Variants: success and error.
- Inputs: triggered by simulated actions.
- Outputs: concise live status.
- Accessibility: `role="status"` and non-blocking dismissal.
- Shared files: `lib/app.css`, `lib/app.js`.

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
- Visible result: schema navigation remains usable without shrinking the grid.
- URL result: none.
- Owner: `lib/app.js`.

### Browse filtering

- Trigger: type in the table search input.
- Before: all table rows visible.
- After: rows whose labels or schema do not match are hidden.
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

- Trigger: click a data cell; double-click, Enter, F2, or printable input enters edit mode.
- Before: prior logical active cell and navigation mode.
- After: selected cell receives `aria-selected`; editing cell exposes an input and owns keyboard events.
- Visible result: cell selection border or editor.
- URL result: none.
- Owner: `lib/app.js`.

### Header configuration

- Trigger: click the email header menu, then Configure column.
- Before: menu and contextual panel closed.
- After: menu closes and right panel opens with current column settings.
- Visible result: field, storage, format, required, unique, and advanced controls.
- URL result: none.
- Owner: `lib/app.js`.

### Empty-header column creation

- Trigger: double-click the trailing add-column header.
- Before: dialog closed.
- After: dialog opens with the column name focused.
- Visible result: semantic field choice and inferred storage/format summary.
- URL result: none.
- Owner: `lib/app.js`.

### Draft record promotion

- Trigger: activate Save record on the persistent draft row.
- Before: typed patch exists only in the draft row.
- After on invalid input: no record is inserted; error maps to the required email cell.
- After on valid input: draft styling clears, record receives an illustrative ID, and success status appears.
- Visible result: inline cell error or promoted row.
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

- Query strings link to created/imported and draft-error review states.
- In-memory state owns menus, panels, grid selection, dialog, builder changes, and import steps.
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
  - Created for this revision using the bundled panel layout, button, form, dialog, badge, tree, and table patterns as guides.
  - Owns the workflow index, data navigator, focused builder, grid, column panel, import wizard, toast, and responsive behavior.
- `lib/icons.css`
  - Adapted from the bundled Lucide icon CSS.
- `lib/icons.js`
  - Adapted from the bundled Lucide-guided SVG renderer.
  - Includes only icons used in this revision.
- `lib/app.js`
  - Created for revision-specific navigation, search, table builder, grid, column panel, dialog, draft validation, import wizard, and toast behavior.
- No sample files, frameworks, package manager, or build tooling are copied.

## Page Build Plan

### `workflows.html`

- Title: Tabular workflows
- Layout: workflow index
- Components: top identity, revision summary, workflow cards, buttons, badges
- Imports: base CSS, app CSS, icon CSS, icon JS
- Initial state: default
- Interaction hooks: native links only
- Links: browse, create table, table grid, draft-error grid, import

### `pages/browse.html`

- Title: Operations data
- Layout: data-browser panel layout
- Components: navigator, command bar, search, table list, recent tables
- Imports: base CSS, app CSS, icon CSS, icon JS, app JS
- Initial state: all tables visible
- Interaction hooks: navigator toggle, backdrop, table search
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
- Components: navigator, command bar, toolbar, accessible grid, header menu, right panel, dialog, toast
- Imports: base CSS, app CSS, icon CSS, icon JS, app JS
- Initial state: query-driven default, created, imported, or draft-error state
- Interaction hooks: menu/panel/dialog toggles, grid selection/editing, draft validation/promotion, row drawer
- Links: workflow index, browse, create table, import

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
- `workflows.html` links to each workflow start and the draft-error alternate state.
- Browse filtering works and displays its empty result.
- Create-table field changes update inferred storage, format, and SQL preview.
- Create-table validation blocks a missing name and valid create reaches the table grid.
- Grid cell selection, inline edit, column menu, column panel, add-column dialog, and row drawer work.
- Draft row save maps a missing required email to the cell and promotes the draft after correction.
- Import source selection, preview, back/continue, progress, and success states work.
- The rendered UI contains no visible annotations, TODOs, review prose, or implementation commentary.
- The artifact remains grayscale and readable at wide and narrow viewports.
- JavaScript parses without syntax errors.
- Internal page links and local assets resolve.
- Browser verification covers the workflow index and primary flows at desktop and narrow widths.
- Round 1 is partial wireframe scope. Approval unlocks a second wireframe round for policy-facing product surfaces or requested structural revisions; it does not unlock implementation or creative design.
