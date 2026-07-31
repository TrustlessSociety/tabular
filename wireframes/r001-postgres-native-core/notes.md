# Review Notes

## Round 1 — 2026-07-25 — PostgreSQL-native core structure

### Changed

- Created the first wireframe revision from the accepted Mathesar-like direction.
- Added separate starting points for browsing data, creating a PostgreSQL-native table, configuring a column and adding a record, and reviewing a values-only import.
- Kept database, schema, table, storage type, field type, format, and constraint concepts visible through progressive disclosure.
- Represented incomplete records as persistent grid drafts that do not become real rows until required values pass validation.
- Added reviewable source-selection, value-preview, warning, progress, and success states for one-time import.

### Feedback applied

- Initial user request: use the Chris AI designing skill to start wireframes from the research spec.
- The accepted research direction remains the authority for the rendered product structure.
- No prior wireframe feedback exists for this revision.

### Review now

- Whether the database/schema/table navigation is approachable for internal staff.
- Whether table creation should remain a focused builder or begin directly in an empty grid.
- Whether the grid gives PostgreSQL details enough visibility without making the common path feel like database administration.
- Whether inline persistent draft rows are the right primary data-entry model.
- Whether values-only import should stay a distinct workflow or merge into table creation.

### Simulated or deferred behavior

- All database objects, records, schema changes, draft persistence, validation, import progress, and success states are illustrative and local to the static artifact.
- The grid demonstrates bounded interaction language but does not implement production virtualization, clipboard payloads, concurrent schema drift, permissions, RLS, or native screen-reader verification.
- Google Sheets connection, XLSX/CSV parsing, source-version checks, transactional commit, and recovery are simulated.
- Roles, sharing, comments, export, audit visibility, retention, undo/history policy, recovery, and administration are deferred because the owning research Gaps remain unresolved.
- Formula compatibility, rich formatting, public links, automations, APIs, plugins, AI, and full PostgreSQL administration remain outside this revision.

### Verified

- The workflow index, browse screen, create-table builder, table grid, and import wizard rendered through the local review server.
- Browse search filtered to one table and exposed the zero-result state.
- Table field inference updated both the semantic summary and PostgreSQL preview.
- Missing table-name validation blocked creation; a valid name reached the created-table grid state.
- The Email column menu opened its configuration panel and applied a renamed header.
- Draft validation retained an invalid row; a valid draft promoted to illustrative record `1085`.
- The add-column dialog opened through its keyboard path.
- Import source choice, value preview, warnings, ready state, progress, and success state completed.
- The wide table layout preserved its object navigator and horizontally scrollable grid.
- At 390 × 844, the workflow index and page shell had no document-level horizontal overflow; the table canvas retained intentional horizontal grid scrolling and the mobile navigator opened as an overlay.
- No browser console warnings or errors were recorded.
- JavaScript syntax, whitespace, local file inventory, and relative-link checks passed.
- QA evidence is recorded in `qa/notes.md`.

### Open questions

- Should the left navigator default to business-friendly names with PostgreSQL identifiers secondary, or show both with equal weight?
- Should a new table open in a focused builder first, or in an empty grid with the builder represented inline?
- Should a draft record live only in the grid, only in a row drawer, or move between both depending on width and field complexity?
- Which unresolved policy track should own Round 2: roles/sharing, history/recovery, export, or database connection administration?

### Approval path

If Round 1 is approved, the next step is one additional wireframe round focused on the user-selected unresolved product-policy track or on a requested structural refinement. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 2 — 2026-07-27 — Table terminology and browse density

### Changed

- Removed the PostgreSQL badge from the browse-page Tables section.
- Removed the duplicated Import Values and New Table actions from the browse top bar while retaining the primary actions beside the page heading.
- Changed browse-row metrics from verbose record/column labels to the compact `columns x records` pattern across all five tables.
- Normalized product-facing `spreadsheet` language to `table` across the workflow index, create-table page, and current revision contract.
- Added accessible labels to the compact metrics so their column and record order remains explicit.

### Feedback applied

- Browser Comment 1: remove the PostgreSQL badge from the Tables section.
- Browser Comment 2: remove the duplicated New Spreadsheet action from the top bar.
- Browser Comment 3: remove the duplicated Import Values action from the top bar.
- Browser Comment 4: shorten `248 records · 7 columns` to `7 x 248`; the same convention now applies to every table row.
- Direct request: stop using Spreadsheets and Tables interchangeably and normalize the product terminology to Tables.

### Review now

- Whether the browse header has the right action density after removing the duplicated controls.
- Whether `7 x 248` reads clearly as columns by records in the table list.
- Whether Table terminology now feels consistent across browse, workflow, and create flows.

### Simulated or deferred behavior

- This round changes terminology and browse-page presentation only.
- Existing simulated database, schema, draft, grid, validation, and import behavior is unchanged.
- The unresolved product-policy surfaces listed in Round 1 remain deferred.

### Open questions

- Should the compact table metric retain the plain `x` character, or use a visual column/row label in a later round?

### Approval path

If Round 2 is approved, the next step is to continue the same wireframe phase with the next annotated screen or feedback batch. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.
