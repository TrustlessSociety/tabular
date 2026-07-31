# Browser QA

## Environment

- Date: 2026-07-25
- Entry point: `http://127.0.0.1:4173/workflows.html`
- Browser surface: Codex in-app browser
- Desktop check: 1280 × 900
- Narrow check: 390 × 844

## Static checks

- `node --check` passed for `lib/app.js` and `lib/icons.js`.
- `git diff --check -- wireframes/r001-postgres-native-core` passed.
- Every expected revision file was present.
- HTML, CSS, and JavaScript contained no visible TODO, annotation, review-note, or implementation-note copy.
- Local page links and asset references resolved within the revision.

## Workflow index

- Four workflow starting points rendered.
- Wide layout used a two-column card grid.
- Narrow layout stacked cards without document-level horizontal overflow.

Evidence:

- `workflow-default.jpg`
- `workflow-mobile.jpg`

## Browse data

- Table search reduced the list to the matching `inventory` table.
- A missing-table query displayed `0 tables` and the empty state.
- Database, schema, recent-table, create-table, import, and workflow links were present.

## Create table

- Adding a fourth column updated the column count.
- Changing the fourth field to Switch updated its inference to `boolean · yes / no`.
- The PostgreSQL preview updated to include the inferred Boolean column.
- Clearing the table name exposed the inline validation error and `aria-invalid="true"`.
- A valid name navigated to `pages/table.html?created=1`.

## Table grid

- The created-table banner rendered.
- Grid semantics exposed logical row and column counts, row and column headers, selected cell state, draft inputs, and labelled controls.
- The Email header menu opened and exposed Configure, Sort, Filter, and Insert actions.
- Configure column opened the contextual panel; applying `Customer email` updated the visible header and closed the panel.
- Closed contextual panels were removed from the accessibility tree and made inert.
- Empty-header keyboard activation opened the native add-column dialog.
- Saving a blank required email kept the record as a draft, mapped the error to the email cell, and showed a draft-retained status.
- Supplying `orders@pine.co` from a clean draft state promoted the record to illustrative ID `1085` and hid the draft toolbar action.
- At 1280 × 900, the left data navigator remained visible and the grid retained intentional horizontal overflow for later columns.
- At 390 × 844, the document remained 390px wide, the grid canvas exposed its 1190px internal width, the draft error remained visible within the scrollable canvas, and the data navigator opened as a 264px overlay.

Evidence:

- `table-desktop.jpg`
- `table-mobile.jpg`

## Import values

- XLSX selection updated `aria-pressed` and the source summary.
- Preview exposed inferred field mappings, representative values, cached-formula warnings, and date-token warnings.
- Review reached the ready-to-import state.
- Import progressed to the success state with 248 records and hid the commit actions.

## Browser health

- No console warnings or errors were recorded across the tested routes.
- The browser viewport override was reset after responsive verification.

## Review Round 2 — 2026-07-27

- Removed the PostgreSQL badge from the browse-page Tables section header.
- Removed the duplicate `Import values` and `New spreadsheet` actions from the topbar; the page-level `Import` and `New table` actions remain.
- Confirmed all five browse rows use the compact `columns x records` format, including `7 x 248`, with descriptive column-by-record accessibility labels.
- Confirmed product-facing `spreadsheet` wording is absent from the rendered HTML, CSS, and JavaScript surfaces.
- Confirmed the workflow index uses `Create a table`, and the create route uses `Create a table` and `Table name`.
- At 1280 × 720 and 390 × 844, the browse page had no document-level horizontal overflow.
- No browser console errors were recorded during the Round 2 route checks.

Evidence:

- `browse-round-2.jpg`
- `browse-round-2-mobile.jpg`
