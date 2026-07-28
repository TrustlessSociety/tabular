# Wireframe Specification

## Revision Summary

- Revision folder: `wireframes/r005-spreadsheet-file-explorer/`
- Revision: `r005-spreadsheet-file-explorer`
- Change type: new revision
- Previous revision source: `wireframes/r004-spreadsheet-command-surface/`
- Specification status: Round 3 folder creation action and table-settings panel in review
- Product area: spreadsheet discovery, folder navigation, and direct work in PostgreSQL-backed tables.
- Design mode: clickable grayscale wireframe draft.
- Trigger: the request for a spreadsheet-like shell without a persistent left panel and for a compact, Drive-inspired file explorer that starts with Operations and Finance folders.

### Requested scope

- Remove the persistent left data-navigation panel from the spreadsheet and explorer surfaces.
- Make `pages/browse.html` the folder-first starting point: its root view shows Operations and Finance as folders.
- Use a compact `Acme Inc.` root crumb rather than a browse-page title/description, and omit a root-level creation action.
- When a folder is open, provide one explicit `New file` action that leads to the existing folder-aware table builder.
- Opening a folder reveals the spreadsheets it contains.
- Provide both list and grid views at the root and inside a folder.
- Keep the explorer constrained to existing Tabular capability: folders, spreadsheet tables, table creation, values-only import, search, and the existing table editor.
- Keep the r004 spreadsheet menu bar, formatting controls, context menus, error presentation, and 1,000-row logical canvas available after a spreadsheet is opened.

### Explicitly deferred

- Drive-style sharing, ownership, storage metrics, starred files, activity, trash, recents, permissions, and multi-drive navigation.
- Folder creation, nesting, drag-to-move, file uploads, batch selection, and file-level version-history management.
- Production persistence of explorer view preference, folder membership, search, sort, or table creation.
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
| `pages/browse.html` | File explorer root and folder contents | Find and open a spreadsheet | Root folders; Operations and Finance folder contents; list/grid view; search; empty search result; links to table/create/import |
| `pages/table.html` | Focused spreadsheet editor | Work directly in a PostgreSQL-backed table | No persistent sidebar; Files / folder / spreadsheet breadcrumb; r004 command, formatting, selection, editing, and error states |
| `pages/create-table.html` | New-table builder | Create a table in the chosen folder | Folder-aware return link; existing builder validation and PostgreSQL preview |
| `pages/import.html` | Values-only import wizard | Import values into the chosen folder | Folder-aware return link; existing source, preview, review, and completion states |
| `workflows.html` | Review starting points | Start the folder, table, creation, or import flow | Links into the root explorer and representative folder/table routes |

## Workflow Starting Points

| Workflow | Starting screen | Happy path | Alternate state |
| --- | --- | --- | --- |
| Browse files | `pages/browse.html` | Open Operations or Finance, then select a spreadsheet | Toggle grid view or search for a folder/table |
| Open a spreadsheet | `pages/browse.html?folder=operations` | Select Customer orders and work in the sheet | Return to its folder from Files breadcrumb |
| Create a table | `pages/create-table.html?folder=operations` | Define fields, review the PostgreSQL preview, create, then open the table | Cancel returns to the selected folder |
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
| Folder creation action | Explorer folder view | `New file` is visible only while a folder is open; it routes to the existing builder with that folder selected |
| Folder item | Explorer root | Folder icon, name, file count, edited time; opens `?folder=…` |
| Spreadsheet item | Explorer folder view | Table icon, name, schema detail, count, edited time; opens `table.html` |
| View toggle | Explorer root and folder views | List or grid; state stored in memory for the current page only; active choice has `aria-pressed=true` |
| Search | Explorer | Filters visible folder or spreadsheet items; shows a scoped empty state when there are no matches |
| Spreadsheet command surface | `table.html` | Copied forward from r004 unchanged except for the surrounding shell; the sheet name in the breadcrumb can be renamed inline |
| Builder/import headers | `create-table.html`, `import.html` | Refer to the selected folder and return to its browse route |

## Interaction And State Contract

| Trigger | Before | After | Visible result |
| --- | --- | --- | --- |
| Open `browse.html` | No folder query | Root state | Operations and Finance folders display in the selected list/grid view |
| Click folder item | Root state | `?folder=operations` or `?folder=finance` | Breadcrumb and content become the selected folder’s spreadsheets |
| Click Acme Inc. breadcrumb | Folder state | Root state | Both folders return to view |
| Click New file | Folder state | Folder-aware builder route | The existing New table flow opens with the selected folder already set |
| Click spreadsheet item | Folder state | Table route | The existing spreadsheet editor opens with the chosen folder and table context |
| Click List or Grid | Any explorer state | View state changes in memory | Same visible items render as rows or cards; active toggle updates |
| Type in search | Any explorer state | Filtered state | Matching current folders/tables remain; no-match state appears when required |
| Click spreadsheet name | Spreadsheet state | Inline edit state | Name becomes a text input; Enter or click-away commits and Escape reverts the temporary edit |
| File → Table settings | Spreadsheet state | Table settings panel | Right panel shows spreadsheet display name, folder, PostgreSQL table identifier, and table totals rather than selected-column controls |
| Apply table settings | Table settings panel | Sheet state | Updates the temporary display name and closes the panel; PostgreSQL table identifier remains unchanged |
| Table folder breadcrumb | Spreadsheet state | Browse route | Returns to the spreadsheet’s selected folder |
| Existing r004 spreadsheet actions | Table state | Existing in-memory states | Menus, formatting, context menus, edit states, errors, and guards retain r004 behavior |

## Library Plan

- `lib/base/tokens.css`, `base/reset.css`, and `base/base.css`: copied from r004 unchanged to preserve the accepted grayscale tokens and base controls.
- `lib/icons.css` and `icons.js`: adapted from r004; add a Lucide-guided folder icon for the explorer.
- `lib/app.css`: adapted from r004. Remove its layout dependency on the sidebar, add the full-width application shell, explorer list/grid layout, view toggle, folder/table cards, and responsive rules.
- `lib/app.js`: adapted from r004. Preserve the spreadsheet/creation/import behavior and add focused explorer route, search, and view-toggle behavior. Teach the shared folder resolver to accept either legacy `department` or new `folder` query keys for review continuity.

## Page Build Plan

### `pages/browse.html`

- Title: `Acme Inc. files` at root; `<folder> · Acme Inc.` within a folder.
- Imports: base tokens, reset, base, icon CSS, app CSS, icon JS, and app JS through document-relative links.
- Initial state: root list view with Operations and Finance folders, an Acme Inc. root crumb, and no page heading/description.
- Hooks: `data-file-explorer`, `data-explorer-view`, `data-explorer-search`, `data-explorer-new-file`, folder/table cards, and count/empty-state targets.

### `pages/table.html`

- Title: chosen spreadsheet name.
- Layout: full-width top bar, focused folder breadcrumb with inline-renamable spreadsheet name, the existing r004 menu/format surface, and spreadsheet canvas.
- Initial state: Customer orders within Operations; query state may select Finance and a different existing table.
- Hooks: retain all existing r004 grid, formatting, context-menu, error, and query-state hooks; add folder-aware return links and an inline spreadsheet-title editor.

### `pages/create-table.html` and `pages/import.html`

- Keep the r004 builder and import panels.
- Replace visible department terminology with folder context where it controls explorer routing.
- Use document-relative links back to the selected folder with a default Operations fallback.

### `workflows.html`

- Present File explorer as the first workflow and link to `pages/browse.html` without a preselected folder.
- Keep the existing spreadsheet, table creation, and import paths as separate starts.

## Functional Acceptance Checks

- `specs.md` matches all five rendered files and remains within 500 lines.
- `browse.html` root shows only Operations and Finance folders, with no left panel.
- The explorer removes the extra title/description and New table action; folder contents are labeled Files and use file counts.
- The root has no creation action; opening a folder reveals a New file action that routes to its existing folder-aware builder.
- Each folder route shows only its configured spreadsheets, with both functional list and grid views.
- Search filters the current root/folder item set and reaches the scoped empty state.
- Table, create, and import routes return to the appropriate explorer folder and do not render a persistent left navigation panel.
- The table shell uses Acme Inc. and an inline-renameable spreadsheet title without a Files breadcrumb link.
- The spreadsheet command surface, grids, menus, formatting controls, context menus, and validation states still work after the shell change.
- File → Table settings opens a table-level right panel, rather than the selected-column configuration panel, and applying its display-name change does not rename the PostgreSQL table.
- Wide and narrow browser checks confirm readable explorer density, no document-level horizontal overflow, and internal spreadsheet scrolling.
- The rendered UI contains no internal annotations, TODOs, agent commentary, or Drive-branded copy.
- All page links, scripts, and styles remain document-relative.

## Review Boundary

This is a clickable wireframe revision only. Folder organization, view state, table creation, and import completion are simulated for review. The revision does not create folders, alter PostgreSQL schema, change table ownership, or authorize production implementation.
