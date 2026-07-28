# QA Notes

## Round 1 planned checks — 2026-07-28

- Verify root and folder explorer routes in both list and grid views.
- Verify search and no-results state at root and inside a folder.
- Verify Files and folder breadcrumbs return from a spreadsheet to the explorer.
- Verify the r004 spreadsheet command surface still opens and no persistent left panel is rendered.
- Verify the explorer at a wide and narrow viewport; spreadsheet canvas must keep internal horizontal scrolling.

## Round 1 live verification — 2026-07-28

- Passed at the wide review viewport: root opens with exactly the Operations and Finance folders; list view is the initial mode and Grid changes the active toggle state.
- Passed: Operations and Finance folder routes show their respective headings and counts; scoped search finds Vendors in Operations and reaches the no-results state for an unmatched search.
- Passed: Customer orders loads its existing spreadsheet grid and Files / Operations breadcrumb without a persistent left `.app-sidebar`.
- Static checks passed: `node --check lib/app.js`, `node --check lib/icons.js`, and the revision specification remains below the 500-line limit.
- Narrow-width behavior was reviewed from the responsive rules; a dedicated device-size browser pass remains a useful follow-up if this round changes further.

## Round 2 planned checks — 2026-07-28

- Verify the stripped explorer header: Acme Inc. crumb, no heading/copy, no New table action, and file-count labels.
- Verify Operations and Finance retain their list/grid states after the copy reduction.
- Verify the spreadsheet breadcrumb has no Files link and its title enters, commits, and cancels inline rename correctly.

## Round 2 live verification — 2026-07-28

- Passed: the root browse header contains no `h1`, root description, New table link, or folder-card secondary count; Acme Inc. and 5 files are present.
- Passed: Operations has no page heading, uses Files as its section label, and retains the expected file count.
- Passed: Customer orders uses Acme Inc. in the focused shell, removes Files from the breadcrumb, and supports inline title rename: click enters the text field, Enter commits, and Escape cancels.
- Static checks passed: `node --check lib/app.js`, `node --check lib/icons.js`, and `specs.md` remains under 500 lines.

## Round 3 planned checks — 2026-07-28

- Verify root browse keeps its no-creation-action state while an open folder shows New file and passes its folder query to the existing builder.
- Verify File → Table settings opens the table-level right panel, with display name, folder, PostgreSQL identifier, and table totals visible.
- Verify applying a display-name change updates the temporary sheet title and does not alter the PostgreSQL identifier.

## Round 3 live verification — 2026-07-28

- Passed: **New file** is hidden at the Acme Inc. root, visible inside Operations, and routes to the existing table builder with Operations selected.
- Passed: File → Table settings opens the table-level right panel rather than a selected-column configuration panel.
- Passed: the right panel exposes a display name, a read-only folder, and PostgreSQL table details (`public.customer_orders`); applying changes updates only the display name.
- Static checks passed: `node --check lib/app.js`, `node --check lib/icons.js`, and no stale prior-round cache tags remain.
