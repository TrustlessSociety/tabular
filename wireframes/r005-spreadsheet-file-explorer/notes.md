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
