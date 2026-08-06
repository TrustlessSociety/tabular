# Wireframe Specification

## Revision Summary

- Revision folder: `wireframes/r005-spreadsheet-file-explorer/`
- Revision: `r005-spreadsheet-file-explorer`
- Change type: new revision
- Previous revision source: `wireframes/r004-spreadsheet-command-surface/`
- Specification status: Round 10 sends New file directly to a blank spreadsheet in review
- Product area: spreadsheet discovery, folder navigation, and direct work in PostgreSQL-backed tables.
- Design mode: clickable grayscale wireframe draft.
- Trigger: the request for a spreadsheet-like shell without a persistent left panel and for a compact, Drive-inspired file explorer that starts with Operations and Finance folders.

### Requested scope

- Remove the persistent left data-navigation panel from the spreadsheet and explorer surfaces.
- Make `pages/browse.html` the folder-first starting point: its root view shows Operations and Finance as folders.
- Use a compact `Acme Inc.` root crumb rather than a browse-page title/description, and omit a root-level creation action.
- When a folder is open, provide one explicit `New file` action that opens a blank, renameable `Untitled File` spreadsheet in that folder.
- Derive a new file's PostgreSQL table name from its current display title in lower_case until Table settings supplies an explicit override.
- In a column's Advanced settings, expose its lower_case PostgreSQL column name separately from the spreadsheet label.
- A Relation field can target any available spreadsheet file in Operations or Finance; folders remain an organization layer, not separate PostgreSQL databases.
- Relation configuration uses the ordered hierarchy Column name → Field: Relation → File → relation-picker Display format → Format: Related record → its saved-cell Display format directly below the Format control.
- The File control is a searchable dropdown of all current table files that can be connected to this sheet; picker and saved-cell templates remain independent.
- Opening a folder reveals the spreadsheets it contains.
- Provide both list and grid views at the root and inside a folder.
- Keep the explorer constrained to existing Tabular capability: folders, spreadsheet tables, blank-file creation, values-only import, search, and the existing table editor.
- Keep the r004 spreadsheet menu bar, formatting controls, context menus, error presentation, and 1,000-row logical canvas available after a spreadsheet is opened.

### Explicitly deferred

- Drive-style sharing, ownership, storage metrics, starred files, activity, trash, recents, permissions, and multi-drive navigation.
- Folder creation, nesting, drag-to-move, file uploads, batch selection, and file-level version-history management.
- Production persistence of explorer view preference, folder membership, search, sort, or table creation.
- Cross-database federation, remote foreign tables, and cross-database referential-integrity policy. Current cross-folder relations are ordinary same-database relationships.
- Roles, sharing, recovery, export, formula evaluation, and all policy decisions still unresolved in the Draft research package.

### Design-source priorities

1. The user’s request: a compact, spreadsheet-first surface with folders and a practical list/grid explorer.
2. Current Tabular r004 tokens and component language: grayscale, Arial-based 14px controls, thin gray dividers, small radii, and compact icon buttons.
3. The supplied Google Drive screenshot: folder-first hierarchy, search-led header, list/grid toggle, and understated list density only. It does not authorize Drive colors, product navigation, storage/owner metadata, or feature breadth.

### Open questions

- Whether folders should later be a user-visible organization layer distinct from the existing department ownership model.
- Whether the explorer needs a saved preferred view or an explicit sort control in a later revision.
- Whether table creation and import should be grouped in a future explorer-level New menu.
- Whether Table settings should later include an explicit rename-and-migrate PostgreSQL workflow, separate from its display-name setting.

## Source Of Truth

- `.agents/specs/00001-stackpress-airtable-like-application-research/index.md`
  - Keeps this work a review artifact under a Draft, Not Frozen research package; it does not authorize production implementation.
- `.agents/specs/00001-stackpress-airtable-like-application-research/postgresql-native-product-direction-findings.md`
  - Defines the canonical model: a spreadsheet maps to a real PostgreSQL table, headers map to columns, and completed rows map to records.
- `wireframes/r004-spreadsheet-command-surface/specs.md`
  - Supplies the accepted spreadsheet canvas, command surface, typed editing, values-only import, and terminology boundaries copied forward.
- `wireframes/r004-spreadsheet-command-surface/lib/base/tokens.css` and `lib/app.css`
  - Supply the existing grayscale type scale, spacing, divider, radius, and compact-control vocabulary to retain.
- User-provided Drive reference screenshot, 2026-07-28
  - Inspires a folder-first explorer, a restrained search field, and list/grid switching. It is a pattern reference, not a surface to reproduce.

## Screen Inventory

| Screen | Purpose | Primary goal | Required states and navigation |
| --- | --- | --- | --- |
| `pages/browse.html` | File explorer root and folder contents | Find, open, or start a spreadsheet | Root folders; Operations and Finance folder contents; list/grid view; search; empty search result; direct blank-file/table/import links |
| `pages/table.html` | Focused spreadsheet editor | Work directly in a PostgreSQL-backed table | No persistent sidebar; Files / folder / spreadsheet breadcrumb; blank Untitled File state; r004 command, formatting, selection, editing, and error states |
| `pages/import.html` | Values-only import wizard | Import values into the chosen folder | Folder-aware return link; existing source, preview, review, and completion states |
| `workflows.html` | Review starting points | Start the folder, blank-file, table, or import flow | Links into the root explorer and representative folder/table routes |

## Workflow Starting Points

| Workflow | Starting screen | Happy path | Alternate state |
| --- | --- | --- | --- |
| Browse files | `pages/browse.html` | Open Operations or Finance, then select a spreadsheet | Toggle grid view or search for a folder/table |
| Open a spreadsheet | `pages/browse.html?folder=operations` | Select Customer orders and work in the sheet | Return to its folder from Files breadcrumb |
| Create a file | `pages/table.html?new=1&folder=operations&table=untitled-file` | Open a blank Untitled File and name columns directly in the sheet | Rename the file or customize its PostgreSQL table name in Table settings |
| Import values | `pages/import.html?folder=operations` | Pick source, preview values, review, then open imported table | Cancel returns to selected folder |

## Layout System

### Focused application shell

- Used by `browse.html` and `table.html`.
- A single full-width top bar replaces the left navigation panel.
- The Acme Inc. mark is a compact route back to file browsing; it is not a collapsible navigation rail.
- On the spreadsheet screen the top bar holds the folder / spreadsheet breadcrumb and account icon. The existing command surface remains directly beneath it.
- On the explorer screen the top bar holds the Acme Inc. mark, search, and account action. It never adds Drive-like global navigation.
- At narrow widths, search wraps below the title/action row and file cards reduce to one column. The spreadsheet canvas retains internal horizontal scrolling.

### File-explorer layout

- A centered, padded content area with a compact Acme Inc. breadcrumb, count, view-toggle group, and one content region.
- Root state shows two folder items only: Operations and Finance.
- Folder state shows table items with existing table name, column-by-record count, and edited time data.
- List view uses thin horizontal dividers; grid view uses compact cards. Neither adds owner, file size, or storage columns.

## Component Inventory

| Component | Where | States and behavior |
| --- | --- | --- |
| Explorer top bar | `browse.html` | Search input and account button; no persistent panel or root-level creation action |
| Breadcrumb | Explorer and table | Acme Inc. returns to root; selected folder returns to its contents; current sheet name is inline-renameable |
| Folder creation action | Explorer folder view | `New file` is visible only while a folder is open; it routes directly to a blank Untitled File in that folder |
| Folder item | Explorer root | Folder icon, name, file count, edited time; opens `?folder=…` |
| Spreadsheet item | Explorer folder view | Table icon, name, schema detail, count, edited time; opens `table.html` |
| View toggle | Explorer root and folder views | List or grid; state stored in memory for the current page only; active choice has `aria-pressed=true` |
| Search | Explorer | Filters visible folder or spreadsheet items; shows a scoped empty state when there are no matches |
| Spreadsheet command surface | `table.html` | Copied forward from r004 unchanged except for the surrounding shell; the sheet name in the breadcrumb can be renamed inline, including a blank new file |
| New-file PostgreSQL identity | `table.html` Table settings | A blank Untitled File derives a lower_case PostgreSQL name from its current display title unless the PostgreSQL input is explicitly changed |
| Advanced column storage | `table.html` right panel | Shows the PostgreSQL column name in lower_case alongside storage controls; it remains distinct from the user-facing column label |
| Relation configuration | `table.html` right panel | When Field is Relation, a searchable File dropdown lists available table files grouped by folder, followed by the relation-picker display template |
| Related-record format | `table.html` right panel | Format follows the Relation settings; when it is Related record, its independent saved-cell Display format appears directly below that control |
| In-cell select menu | `table.html` grid | Double-clicking a Select cell opens visible option choices immediately; choosing one commits its value |
| Import header | `import.html` | Refers to the selected folder and returns to its browse route |

## Interaction And State Contract

| Trigger | Before | After | Visible result |
| --- | --- | --- | --- |
| Open `browse.html` | No folder query | Root state | Operations and Finance folders display in the selected list/grid view |
| Click folder item | Root state | `?folder=operations` or `?folder=finance` | Breadcrumb and content become the selected folder’s spreadsheets |
| Click Acme Inc. breadcrumb | Folder state | Root state | Both folders return to view |
| Click New file | Folder state | Blank sheet route | Untitled File opens with 0 records, 1,000 rows, and no named columns in the selected folder |
| Click spreadsheet item | Folder state | Table route | The existing spreadsheet editor opens with the chosen folder and table context |
| Click List or Grid | Any explorer state | View state changes in memory | Same visible items render as rows or cards; active toggle updates |
| Type in search | Any explorer state | Filtered state | Matching current folders/tables remain; no-match state appears when required |
| Click spreadsheet name | Spreadsheet state | Inline edit state | Name becomes a text input; Enter or click-away commits and Escape reverts the temporary edit |
| File → Table settings | Spreadsheet state | Table settings panel | Right panel shows spreadsheet display name, folder, and editable PostgreSQL table name rather than selected-column controls |
| Apply table settings | Table settings panel | Sheet state | Updates the temporary display name, normalizes the PostgreSQL table name to lower_case, and closes the panel; new files keep deriving that name from the title unless it is explicitly overridden; no live migration runs |
| Apply Advanced column settings | Column settings panel | Sheet state | Normalizes the PostgreSQL column name to lower_case and keeps it separate from the spreadsheet label; no live database migration runs in the wireframe |
| Configure relation column | Column settings panel | Relation form visible | Set Field: Relation, search/select File, and define the relation-picker display template; Format follows |
| View Related record format | Column settings panel | Format: Related record | The independent saved-cell Display format is directly below Format, after the Relation File and picker-template controls |
| Double-click Select cell | Sheet state | Select edit state | A visible option menu opens below the cell; choosing an option commits the selected value |
| Table folder breadcrumb | Spreadsheet state | Browse route | Returns to the spreadsheet’s selected folder |
| Existing r004 spreadsheet actions | Table state | Existing in-memory states | Menus, formatting, context menus, edit states, errors, and guards retain r004 behavior |

## Library Plan

- `lib/base/tokens.css`, `base/reset.css`, and `base/base.css`: copied from r004 unchanged to preserve the accepted grayscale tokens and base controls.
- `lib/icons.css` and `icons.js`: adapted from r004; add a Lucide-guided folder icon for the explorer.
- `lib/app.css`: adapted from r004. Remove its layout dependency on the sidebar, add the full-width application shell, explorer list/grid layout, view toggle, folder/table cards, and responsive rules.
- `lib/app.js`: adapted from r004. Preserve the spreadsheet/import behavior and add focused explorer route, search, view-toggle, and blank-file behavior. Teach the shared folder resolver to accept either legacy `department` or new `folder` query keys for review continuity.

## Page Build Plan

### `pages/browse.html`

- Title: `Acme Inc. files` at root; `<folder> · Acme Inc.` within a folder.
- Imports: base tokens, reset, base, icon CSS, app CSS, icon JS, and app JS through document-relative links.
- Initial state: root list view with Operations and Finance folders, an Acme Inc. root crumb, and no page heading/description.
- Hooks: `data-file-explorer`, `data-explorer-view`, `data-explorer-search`, `data-explorer-new-file`, folder/table cards, and count/empty-state targets.

### `pages/table.html`

- Title: chosen spreadsheet name.
- Layout: full-width top bar, focused folder breadcrumb with inline-renamable spreadsheet name, the existing r004 menu/format surface, and spreadsheet canvas.
- Initial state: Customer orders within Operations; the direct new-file query opens an empty Untitled File with 0 records and no named columns.
- Hooks: retain all existing r004 grid, formatting, context-menu, error, and query-state hooks; add folder-aware return links and an inline spreadsheet-title editor.

### `pages/import.html`

- Keep the existing values-only import flow with folder-aware return navigation.
- Use document-relative links back to the selected folder with a default Operations fallback.

### `workflows.html`

- Present File explorer as the first workflow and link to `pages/browse.html` without a preselected folder.
- Keep the existing spreadsheet, blank-file, and import paths as separate starts.

## Functional Acceptance Checks

- `specs.md` matches all five rendered files and remains within 500 lines.
- `browse.html` root shows only Operations and Finance folders, with no left panel.
- The explorer removes the extra title/description and New table action; folder contents are labeled Files and use file counts.
- The root has no creation action; opening a folder reveals a New file action that opens an empty `Untitled File` in that folder.
- The blank New file route has 0 records, 1,000 logical rows, and 0 named columns; the existing header interaction creates initial Text columns.
- Each folder route shows only its configured spreadsheets, with both functional list and grid views.
- Search filters the current root/folder item set and reaches the scoped empty state.
- Table and import routes return to the appropriate explorer folder and do not render a persistent left navigation panel.
- The table shell uses Acme Inc. and an inline-renameable spreadsheet title without a Files breadcrumb link.
- The spreadsheet command surface, grids, menus, formatting controls, context menus, and validation states still work after the shell change.
- File → Table settings opens a table-level right panel, rather than the selected-column configuration panel, and includes a lower_case PostgreSQL table-name input separate from the display name.
- A new file's Table settings derives the temporary PostgreSQL table identifier from its display name in lower_case until a user enters an explicit override; applying either value does not run a migration.
- Advanced column settings expose and normalize a lower_case PostgreSQL column name without changing the user-facing spreadsheet label.
- Relation configuration presents the requested hierarchy, searches all current Operations and Finance table files, places the two templates under their respective controls, and keeps them independent.
- Select cells open a visible option menu immediately in edit mode and commit the selected option.
- Wide and narrow browser checks confirm readable explorer density, no document-level horizontal overflow, and internal spreadsheet scrolling.
- The rendered UI contains no internal annotations, TODOs, agent commentary, or Drive-branded copy.
- All page links, scripts, and styles remain document-relative.

## Review Boundary

This is a clickable wireframe revision only. Folder organization, view state, blank-file opening, and import completion are simulated for review. The revision does not create folders, alter PostgreSQL schema, change table ownership, or authorize production implementation.
