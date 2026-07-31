# Review Notes

## Round 1 — 2026-07-28 — Folder-first explorer and focused spreadsheet shell

### Changed

- Created r005 from the accepted r004 spreadsheet command surface.
- Replaced the persistent left panel with a full-width top bar on the explorer and spreadsheet screens.
- Reworked `browse.html` into a folder-first explorer for Operations and Finance, with table contents, list/grid view, and scoped search.
- Updated table, creation, and import routes to return through the selected folder.

### Feedback applied

- Applied the request to make the experience feel more like a spreadsheet app and use a Google Drive-inspired explorer only where it maps to current Tabular features.

### Browser verification

- Verified the root folder route at `http://127.0.0.1:4177/pages/browse.html`: it opens with Operations and Finance, starts in list view, and switches to grid view.
- Verified Operations and Finance folder routes, scoped search, and the no-results state. Operations exposes the expected Customer orders, Inventory, Vendors, Stock movements, and Purchase requests entries; Finance exposes its spreadsheet set.
- Verified the focused Customer orders screen at `pages/table.html?folder=operations&table=customer-orders`: its PostgreSQL-backed spreadsheet grid and command surface remain present, while the persistent `.app-sidebar` count is zero.

### Simulated or deferred behavior

- Folder membership, list/grid preference, search, creation, and import completion are in-memory wireframe behavior only.
- Drive-style sharing, storage, recent files, trash, upload, ownership, and multi-folder organization are intentionally not represented.

### Open questions

- Whether folders are a permanent organization layer distinct from the current department model.
- Whether a future explorer needs persistent sort or view preferences.

### Review now

- Whether the focused top bar makes the spreadsheet feel appropriately primary without losing a clear route back to files.
- Whether the explorer includes the right amount of Drive-inspired structure without importing Drive’s unrelated product surfaces.
- Whether root/folder list and grid views make the table hierarchy easy to understand.

### Approval path

If Round 1 is approved, the next step is a scoped feedback pass in `r005-spreadsheet-file-explorer` or an explicitly requested new revision. Approval does not Freeze the owning research spec or authorize production implementation.

## Round 2 — 2026-07-28 — Explorer simplification and spreadsheet rename

### Changed

- Removed the browse-page heading, explanatory copy, and top-level New table action.
- Changed the explorer root crumb and focused application marks to Acme Inc.
- Simplified folder cards by removing their duplicate secondary spreadsheet count; list rows now use concise file counts.
- Changed the folder content section label from Spreadsheets to Files and counts from spreadsheets to files.
- Removed the Files link from the spreadsheet breadcrumb; the selected folder remains the return route.
- Made the spreadsheet title inline-editable: click the name, edit it, then press Enter or click away to commit; Escape restores the existing name.

### Feedback applied

- Applied all thirteen annotated browse and table comments from this feedback pass, including the requested hierarchy reductions and renameable title.

### Browser verification

- Verified at `http://127.0.0.1:4177/pages/browse.html`: the root has no `h1`, explanatory copy, New table action, or duplicate folder-card secondary count; it shows the Acme Inc. crumb and the updated file count.
- Verified `?folder=operations`: its title/description remain absent while the section label is Files and the visible count reads 5 files.
- Verified the Customer orders sheet: the top mark is Acme Inc., the breadcrumb contains Operations and the sheet name without a Files link, and the name enters edit mode on click. Enter commits the temporary title and Escape restores the prior title.

### Simulated or deferred behavior

- Spreadsheet title changes remain local, in-memory wireframe state; they do not rename a PostgreSQL table or persist after reload.
- Folder organization, file counts, list/grid preference, search, creation, and import completion remain simulated review behavior.

### Open questions

- Whether a future product title change should rename only its display name, its PostgreSQL table, or both through an explicit confirmation flow.

### Review now

- Whether the Acme Inc. crumb establishes the correct top-level context without the removed browse title.
- Whether folder list rows and grid cards now have the right amount of count information.
- Whether the click-to-rename spreadsheet title feels sufficiently familiar and direct.

### Approval path

If Round 2 is approved, the next step is another scoped r005 feedback pass only if new review notes arise; approval does not Freeze the owning research spec or authorize production implementation.

## Round 3 — 2026-07-28 — Folder creation action and table settings panel

### Changed

- Added a `New file` action to an open folder only. It opens the existing table builder with that folder selected; the root remains free of a creation action.
- Changed File → Table settings to open a table-level right panel with the display name, folder, PostgreSQL table identifier, and current record/column totals.
- Applying table settings updates the temporary sheet display name only; it does not rename or migrate the PostgreSQL table.

### Feedback applied

- Applied both annotated comments: the Operations folder now exposes an appropriate creation action, and Table settings no longer opens a selected-column configuration panel.

### Browser verification

- Passed: the root Files view hides **New file**; the Operations folder shows it and opens `pages/create-table.html?folder=operations`, with Operations selected in the builder.
- Passed: File → Table settings opens a **Table settings** panel; table settings are visible while column and row configuration are hidden.
- Passed: the panel identifies the spreadsheet as Customer orders in Operations and shows its existing PostgreSQL table as `public.customer_orders`.
- Passed: applying a display-name change updates the sheet title and accessible grid name, closes the panel, and leaves the PostgreSQL storage identifier unchanged.

### Simulated or deferred behavior

- New-file completion and table-settings changes remain wireframe behavior. Display-name changes are in memory and reset after reload; PostgreSQL identifiers and schema are unchanged.

### Review now

- Whether New file belongs at this folder-level location and has the right visual priority.
- Whether the table-level panel draws a clear enough distinction between spreadsheet display settings and individual column settings.

### Approval path

If Round 3 is approved, r005 can be marked review-complete. Approval does not Freeze the owning research spec or authorize production implementation.

## Round 4 — 2026-07-28 — PostgreSQL column-name setting

### Changed

- Added a PostgreSQL column name field inside Advanced column settings.
- The field is distinct from the spreadsheet label and normalizes values to lower_case with underscores when applied.
- Updated the Advanced storage warning to cover a future PostgreSQL column rename as well as a storage-type change.

### Feedback applied

- Applied the request for a direct lower_case PostgreSQL column-name setting under Advanced.

### Browser verification

- Passed: Email column settings open with Advanced collapsed, and its PostgreSQL column name is `email` when Advanced is opened.
- Passed: entering `Contact Email` and applying changes normalizes the PostgreSQL column name to `contact_email`.
- Passed: reopening the column settings retains `contact_email` while the spreadsheet label remains Email.

### Simulated or deferred behavior

- Applying the setting changes in-memory wireframe configuration only. A production PostgreSQL column rename, migration planning, conflict handling, and rollback remain out of scope.

### Review now

- Whether the distinction between the spreadsheet label and PostgreSQL storage name is clear enough.
- Whether the migration warning gives the right amount of caution at this wireframe stage.

### Approval path

If Round 4 is approved, r005 returns to review-complete status. Approval does not authorize a live PostgreSQL migration.

## Round 5 — 2026-07-28 — Relation targets and templates

### Changed

- Relation fields now reveal a Relate to menu of all available files, grouped into Operations and Finance.
- Relation display format controls labels in the cell-input picker.
- Related record display format is a separate template controlling the saved cell presentation outside input mode.

### Feedback applied

- Applied the decision to use two independent templates: one owned by Field → Relation and one owned by Format → Related record.

### Browser verification

- Passed: Configure Customer opens both settings sections with Finance / Invoices selected as the relation target.
- Passed: the relation-picker template is `{invoice_number} — {customer_name}`, while the independent saved-cell template is `{invoice_number}`.
- Passed: editing Customer offers options such as `INV-9321 — Northstar Market`; after selection, the saved cell renders `INV-9321`.
- Passed: Relation controls and Related record controls toggle independently when their respective Field and Format selections change.

### Simulated or deferred behavior

- Cross-folder relation targets remain same-database wireframe state. Remote PostgreSQL databases, federation setup, migrations, and referential-integrity policy remain out of scope.

### Review now

- Whether grouping target files by folder makes cross-folder relationships understandable without implying multiple physical databases.
- Whether the two Display format fields are sufficiently differentiated by their section and helper copy.

### Approval path

If Round 5 is approved, r005 returns to review-complete status. Approval does not authorize federation or a live PostgreSQL schema change.

## Round 6 — 2026-07-28 — Searchable relation files and visible select choices

### Changed

- Reordered the Relation configuration around the requested relationship hierarchy: Column name, Field, File, relation-picker Display format, Format, and Related record Display format.
- Replaced the static relation target select with a searchable File dropdown containing every current Operations and Finance table file.
- Changed Select-cell editing from a compact native control to an immediately visible option menu that commits on selection.

### Feedback applied

- Applied the request to make File explicit, searchable, and scoped to possible table connections.
- Applied the request for Status choices to appear as a real dropdown when the cell enters input mode.

### Browser verification

- Passed: Customer configuration displays File below Field: Relation, with Invoices selected and a searchable menu containing all eight current table files.
- Passed: filtering File by `vendors` leaves the Operations / Vendors target visible; selecting it updates the relation target and closes the menu.
- Passed: double-clicking Status opens Processing, Ready, Shipped, and Cancelled directly below the cell; selecting Ready immediately commits and renders the value.

### Review now

- Whether the File dropdown’s search behavior and folder labels make the available relation targets sufficiently clear.
- Whether the visible Select edit menu has the right spreadsheet-like density and placement.

### Approval path

If Round 6 is approved, r005 returns to review-complete status. Approval does not authorize database federation, a live foreign key, or a PostgreSQL schema change.

## Round 7 — 2026-07-28 — Relation form ordering

### Changed

- Reordered the Customer column form to follow the approved relationship sequence: Column name, Field: Relation, File, relation-picker Display format, Format: Related record, then the saved-cell Display format.
- Moved the saved-cell template out of a separate lower section and placed it directly below Format.
- A Relation field now opens with Format set to Related record so the connected-record format and its template remain coherent.

### Feedback applied

- Applied the correction that the second Display format belongs under Format, after the File and relation-picker template controls.

### Browser verification

- Passed: the panel top shows Column name, Field: Relation, then Relation → File and the picker Display format.
- Passed: scrolling down from the picker template leads directly to Format: Related record and its independent Display format, before Constraints.
- Passed: both template inputs remain distinct, with `{invoice_number} — {customer_name}` used for picker options and `{invoice_number}` used for the saved cell.

### Review now

- Whether this exact top-to-bottom sequence now matches the intended relationship mental model.

### Approval path

If Round 7 is approved, r005 returns to review-complete status. Approval does not authorize a live PostgreSQL foreign key, migration, or cross-database federation.

## Round 8 — 2026-07-28 — New file simplification and table PostgreSQL name

### Changed

- Reduced `create-table.html` to the essentials: the folder-aware New file breadcrumb, Table identity, direct column fields, and creation actions.
- Removed the New file page title/description, folder badge, Columns heading/copy, focused-topbar folder label, and PostgreSQL preview/defaults sidebar.
- Removed Table details from File → Table settings and added an editable PostgreSQL table name input with a lower_case helper.

### Feedback applied

- Applied all nine annotated removals across the New file and Table settings surfaces.
- Renamed the builder breadcrumb from **New table** to **New file**.

### Browser verification

- The local preview server responds, but this review session’s in-app Browser blocked both the localhost page after a connection error and the equivalent `file://` page by URL policy. No browser-visible assertion is claimed for this round.
- Static checks confirm the requested removed surfaces are absent and the retained Add column, Create table, and Table settings hooks remain in place.

### Simulated or deferred behavior

- The PostgreSQL table-name input updates in-memory review state only; it does not run a live PostgreSQL rename or migration.

### Review now

- Whether the compact New file surface is sufficiently self-explanatory without a heading, intro copy, or preview sidebar.
- Whether the table-level lower_case identifier belongs alongside Display name and Folder as shown.

### Approval path

If Round 8 is approved, r005 returns to review-complete status. Approval does not authorize a PostgreSQL table rename or migration.

## Round 9 — 2026-07-28 — Identity-only New file flow

### Changed

- Removed the New file screen's remaining Columns section, including its presets and Add column action.
- Removed the Table identity heading and card chrome so the two supported inputs are presented directly.
- Renamed **Table name** to **File Name** and **Create table** to **Create File**, including the temporary submit state.

### Feedback applied

- Applied the direction not to present partial column setup when a complete configuration would need field-specific, format-specific, and Advanced PostgreSQL controls.
- Kept detailed column configuration in the existing spreadsheet Column settings flow, where the relation, format, and Advanced states are already represented.

### Browser verification

- No browser-visible assertion is claimed for this round. This review session's in-app Browser remains blocked from the local route by URL policy after the prior connection failure; the restriction was not retried through a workaround.
- Static checks confirm the Columns section and identity heading are absent while File Name, PostgreSQL table, Cancel, and Create File remain.

### Simulated or deferred behavior

- New file still routes into the wireframe's in-memory table state. It does not create a live PostgreSQL table.
- Field, Format, and Advanced PostgreSQL column configuration are intentionally deferred until the spreadsheet is open, rather than partially modeled during creation.

### Review now

- Whether the direct File Name and PostgreSQL table inputs make the New file flow appropriately narrow and clear.

### Approval path

If Round 9 is approved, r005 returns to review-complete status. Approval does not authorize live table creation or PostgreSQL schema changes.

## Round 10 — 2026-07-30 — Direct blank-file opening

### Changed

- Removed the standalone `create-table.html` page and its unused builder behavior.
- Updated folder **New file**, File → **New**, and the workflow index to open `table.html?new=1&folder=<folder>&table=untitled-file` directly.
- The direct route opens a blank, inline-renameable **Untitled File** with 0 records, 1,000 logical rows, and no named columns.
- For this blank-file route, Table settings derives the PostgreSQL table identifier from the current display title in lower_case (for example, `Untitled File` becomes `untitled_file`) until the PostgreSQL name input is explicitly changed.

### Feedback applied

- Removed the creation screen entirely so a new file starts where its columns and values are actually configured: the spreadsheet.
- Kept PostgreSQL naming editable in Table settings, without requiring it before the file can be opened and renamed.

### Browser verification

- No browser-visible assertion is claimed for this round. The prior local-route Browser URL-policy restriction remains in effect and was not retried through a workaround.
- Static verification covers the direct links, blank-sheet query-state initialization, dynamic summary, derived PostgreSQL identifier, and absence of the deleted page.

### Simulated or deferred behavior

- Opening a file, renaming it, and setting a PostgreSQL identifier are in-memory wireframe behavior only. No PostgreSQL table is created, renamed, or migrated.

### Review now

- From an open folder, confirm **New file** opens the blank **Untitled File** sheet immediately.
- Rename the spreadsheet, then open File → Table settings and confirm the PostgreSQL name follows the title until you type an explicit override.

### Approval path

If Round 10 is approved, r005 returns to review-complete status. Approval does not authorize live table creation, renaming, or PostgreSQL schema changes.

## Round 11 — 2026-07-30 — Folder import entry

### Changed

- Added an **Import** button beside **New file** in an open folder's explorer header.
- The button stays hidden at the root and carries the active folder into the existing import page.

### Feedback applied

- Kept **New file** exclusively for the blank Untitled File flow.
- Added no import-to-existing-file behavior or other workflow changes.

### Simulated or deferred behavior

- The existing import page remains the current review artifact; this round adds only its folder-level entry point.

### Review now

- Confirm Operations and Finance each show **New file** and **Import** side by side, while the Acme Inc. root shows neither action.

### Approval path

If Round 11 is approved, the next step is to refine the existing new-file import flow only.

## Round 12 — 2026-07-30 — Import file identity

### Changed

- Removed the import page eyebrow and page title.
- In the final Import step, ordered the identity fields as **File name**, **Table name**, and **Folder**.

### Feedback applied

- Preserved the existing source, preview, and import steps; this round changes only the annotated presentation and final-step identity inputs.

### Browser verification

- No browser-visible assertion is claimed for this round. This review session's in-app Browser remains blocked from the local route by URL policy after the prior connection failure; the restriction was not retried through a workaround.

### Simulated or deferred behavior

- This remains a static wireframe. The values in the identity fields do not create a live file or PostgreSQL table.

### Review now

- Confirm the ready-to-import screen presents File name, Table name, and Folder in that order.

### Approval path

If Round 12 is approved, no import behavior changes are implied.

## Round 13 — 2026-07-30 — Import spacing

### Changed

- Added equal vertical padding above and below the import-page explanatory copy.
- Added a top margin before the selected-source summary equal to its existing bottom margin.
- Added a top margin before the final-step PostgreSQL data-source alert.

### Feedback applied

- Applied only the three annotated spacing refinements. Source selection, preview, import identity fields, and import behavior remain unchanged.

### Browser verification

- No browser-visible assertion is claimed for this round. This review session's in-app Browser remains blocked from the local route by URL policy after the prior connection failure; the restriction was not retried through a workaround.

### Simulated or deferred behavior

- This remains a static wireframe. Its controls do not create a live file or PostgreSQL table.

### Review now

- Confirm the explanatory copy has equal top and bottom breathing room, and that the selected-source and final-step data-source blocks have the requested separation above them.

### Approval path

If Round 13 is approved, no import behavior changes are implied.
