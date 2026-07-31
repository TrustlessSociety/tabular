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

## Round 4 planned checks — 2026-07-28

- Verify Advanced column settings show a lowercase PostgreSQL name separately from the spreadsheet label.
- Verify Apply changes normalizes the storage name and retains the user-facing column label.

## Round 4 live verification — 2026-07-28

- Passed: Configure Email → Advanced exposes a PostgreSQL column name field with `email` and a clear lower_case storage-name helper.
- Passed: `Contact Email` normalizes to `contact_email` after Apply changes; reopening confirms the normalized name while the visible column label remains Email.
- Static checks passed: `node --check lib/app.js`, `node --check lib/icons.js`, and `specs.md` remains within the 500-line limit.

## Round 5 planned checks — 2026-07-28

- Verify Relation reveals all current Operations and Finance files grouped by folder, with a separate picker display template.
- Verify Related record format reveals its own saved-cell display template independently.
- Verify selecting a relation record uses the picker template in edit mode and the related-record template after the cell is committed.

## Round 5 live verification — 2026-07-28

- Passed: Configure Customer reveals a Relation section and a separate Related record format section. Relation targets are grouped under Operations and Finance, with Invoices selected for this reference flow.
- Passed: the relation picker displays `INV-9321 — Northstar Market`, `INV-9317 — Harbor Goods`, and `INV-9308 — Acacia Retail` from its own `{invoice_number} — {customer_name}` template.
- Passed: selecting `INV-9321 — Northstar Market` commits the reference and renders `INV-9321` in the sheet using the independent Related record `{invoice_number}` template.
- Passed: changing Field away from Relation hides only the target/picker-template controls; changing Format away from Related record hides only the saved-cell-template controls.
- Static checks passed: `node --check lib/app.js`, `node --check lib/icons.js`, `git diff --check`, and `specs.md` remains within the 500-line limit.

## Round 6 live verification — 2026-07-28

- Passed: Customer → Field: Relation exposes File as a searchable dropdown with all eight current Operations and Finance table files. Searching `vendors` retains only Vendors / Operations; selecting it updates the configured target and closes the list.
- Passed: Relation-picker and Related record Display format remain separate controls under their respective Field and Format sections.
- Passed: double-clicking a Status cell visibly opens Processing, Ready, Shipped, and Cancelled beneath the cell. Choosing Ready commits immediately and returns the cell to its formatted badge state.
- Static checks passed: `node --check lib/app.js`, `node --check lib/icons.js`, `git diff --check`, and `specs.md` remains within the 500-line limit.

## Round 7 live verification — 2026-07-28

- Passed: Configure Customer shows Column name → Field: Relation → Relation / File → relation-picker Display format in that order.
- Passed: scrolling after the picker template reaches Format: Related record with its own saved-cell Display format immediately below it, before Constraints.
- Passed: the two template values remain independent: `{invoice_number} — {customer_name}` for picker options and `{invoice_number}` for the rendered related record.
- Static checks passed: `node --check lib/app.js`, `node --check lib/icons.js`, `git diff --check`, and `specs.md` remains within the 500-line limit.

## Round 8 planned checks — 2026-07-28

- Verify New file removes the requested heading, explanatory, folder-context, Columns-card, and PostgreSQL-preview surfaces while retaining Table identity, Add column, and Create table.
- Verify File → Table settings removes Table details, exposes PostgreSQL table name, and normalizes a mixed-case input to lower_case with underscores after Apply changes.

## Round 8 static verification — 2026-07-28

- Passed: `create-table.html` no longer contains the requested page-introduction copy, folder badge, Columns-card heading/copy, top-bar folder label, or PostgreSQL summary/preview surface. Table identity, Add column, and Create table remain.
- Passed: File → Table settings no longer contains Table details and now exposes `data-table-settings-postgres-name` with a lower_case helper. Applying settings normalizes its in-memory value through `postgresTableName` without changing the display-name flow.
- Passed: `node --check lib/app.js`, `node --check lib/icons.js`, `git diff --check`, and the revision specification remains within the 500-line limit.
- Browser review blocked: after the local preview server was restarted, this session’s in-app Browser blocked localhost retry and the equivalent `file://` route by URL policy. Browser-visible checks remain for the user’s next local review.

## Round 9 planned checks — 2026-07-28

- Verify New file contains only File Name and PostgreSQL table identity inputs with Cancel and Create File actions.
- Verify the creation screen does not contain a partial Columns, Field, Format, or Advanced PostgreSQL configuration surface.

## Round 9 static verification — 2026-07-28

- Passed: `create-table.html` no longer contains the Columns section, column preset inputs, Add column control, or the Table identity heading/card.
- Passed: File Name, PostgreSQL table, Cancel, and Create File remain; both identifiers validate independently and the temporary submit label reads `Creating file…`.
- Browser review blocked: this session's in-app Browser cannot reopen the local review route after its URL-policy block. No browser-visible checks are claimed for this round.

## Round 10 static verification — 2026-07-30

- Verify every current **New file** entry point opens `table.html?new=1&folder=<folder>&table=untitled-file`; this includes the folder explorer, File menu, and workflow index.
- Verify the direct route initializes `Untitled File`, no sample records, no named columns, and the summary `0 records · 1,000 rows · 0 named columns` before grid construction.
- Verify inline renaming updates the display title. In Table settings for a new file, the PostgreSQL value follows the title in lower_case until a distinct value is entered; a custom value remains the in-memory override.
- Verify `pages/create-table.html` and the builder-only JavaScript no longer exist.
- Browser review remains intentionally unclaimed because the known local-route Browser URL-policy restriction was not retried.
