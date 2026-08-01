# Wireframe Specification

## Revision Summary

- Revision folder: `wireframes/r007-integrated-views-activity/`
- Revision: `r007-integrated-views-activity`
- Change type: Approved Review Round 2 update within the existing copy-forward revision
- Previous revision source: `wireframes/r006-saved-views-system-activity/`
- Specification status: **Approved 2026-08-01**
- Product area: spreadsheet discovery and editing, saved views, shared row ordering, and operator activity.
- Design mode: clickable grayscale wireframe draft.
- Trigger: user feedback that the new surfaces were isolated from `browse.html` and `table.html`, followed by five browser comments refining saved-view discovery, File-menu ownership, utility labeling, export placement, and activity-row geometry.

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
- Copy forward the complete r006 browse, blank-file/table, import, shared-library, saved-view, activity, and workflow behavior that remains part of the new integrated contract.
- Keep saved views attached to a spreadsheet without adding a second spreadsheet page, but remove the persistent saved-view bar from the grid surface.
- Add Files and Views tabs to an open folder. Files retains spreadsheet files; Views lists saved views across files in that folder and opens a selected view in a new browser tab.
- Add File-menu `Export`, `Views`, and `New view` entries. Views opens a saved-view dialog, New view opens creation directly, and the Views-dialog creation action swaps into the create dialog.
- Make the shared-shell System activity utilities in `browse.html` and `table.html` icon-only while retaining an accessible name, and link System activity back to the originating Customer orders table.
- Add System activity with active/attention/completed filtering, queued row-order maintenance, dead-letter recovery, and retention controls.
- Represent real-time row-order delivery with a durable queued maintenance fallback and a collision-safe hidden rank column proposal.
- Record W-015 as permissive URL and Phone string entry with best-effort formatters; formatting does not redefine the stored text value.
- Ensure every desktop activity-table cell fills the dynamic height of its row.

### Explicitly deferred

- Drive-style ownership, storage metrics, starred files, trash, recents, and multi-drive navigation.
- Folder creation, nesting, drag-to-move, file uploads, batch selection, and file-level version-history management.
- Production persistence of explorer view preference, folder membership, search, sort, or table creation.
- Cross-database federation, remote foreign tables, and cross-database referential-integrity policy. Current cross-folder relations are ordinary same-database relationships.
- Broader role administration, file-level sharing, export, formula evaluation, and policy decisions outside this revision.

### Design-source priorities

1. The user’s request: a compact, spreadsheet-first surface with folders and a practical list/grid explorer.
2. Current Tabular r004 tokens and component language: grayscale, Arial-based 14px controls, thin gray dividers, small radii, and compact icon buttons.
3. The supplied Google Drive screenshot: folder-first hierarchy, search-led header, list/grid toggle, and understated list density only. It does not authorize Drive colors, product navigation, storage/owner metadata, or feature breadth.
4. Spec 00002 feature ledger: D-007 requires visible saved-view controls and D-010 requires visible job, dead-letter, and operations-admin states.
5. User decisions: real-time reorder visibility may fall back to queued maintenance; W-015 loosely accepts URL and Phone strings and applies best-effort formatters.

### Accepted defaults and non-blocking follow-ups

- Operations and Finance remain PostgreSQL schema folders under the accepted
  server/database hierarchy; r007 does not introduce a separate department
  ownership layer.
- List/grid preference, explorer sorting, a high-volume table filter for the
  folder Views tab, and a future combined New menu remain later refinements.
- Table settings may later add an explicit PostgreSQL rename-and-migrate flow;
  the current display-name setting does not silently perform that migration.
- The first slice may create a Shared view directly when the caller is the
  table owner or an owning-role member. A mandatory private-then-publish flow
  is not required.
- System activity remains discoverable from Browse and Table. Its contents and
  actions are filtered by caller authority; retention controls remain
  administrator-only.
- Acknowledging a dead letter retains its audit history and acknowledged state
  rather than deleting the record. Whether a later operations view separates
  acknowledged items is a non-blocking refinement.

## Source Of Truth

- `wireframes/r006-saved-views-system-activity/`
  - Supplies the complete copy-forward baseline and the saved-view/activity behavior to integrate into the real application paths.

- `.agents/specs/00001-stackpress-airtable-like-application-research/index.md`
  - Supplies Frozen product-research provenance; this approved wireframe still
    does not authorize production implementation.
- `.agents/specs/00001-stackpress-airtable-like-application-research/postgresql-native-product-direction-findings.md`
  - Defines the canonical model: a spreadsheet maps to a real PostgreSQL table, headers map to columns, and completed rows map to records.
- `wireframes/r004-spreadsheet-command-surface/specs.md`
  - Supplies the accepted spreadsheet canvas, command surface, typed editing, values-only import, and terminology boundaries copied forward.
- `wireframes/r004-spreadsheet-command-surface/lib/base/tokens.css` and `lib/app.css`
  - Supply the existing grayscale type scale, spacing, divider, radius, and compact-control vocabulary to retain.
- User-provided Drive reference screenshot, 2026-07-28
  - Inspires a folder-first explorer, a restrained search field, and list/grid switching. It is a pattern reference, not a surface to reproduce.
- `.agents/specs/00002-tabular-proof-led-implementation/feature-proof-matrix.md`
  - Identifies W-015, D-007, and D-010 as the relevant proof-led coverage rows. It does not itself approve rendered design choices.
- User feedback, 2026-08-01
  - Requires a complete copy-forward, accepts permissive URL/Phone string entry, prefers real-time reorder propagation with queued fallback, and rejects isolated new screens that cannot be reached from the main app.
- Browser comments, 2026-08-01, r007 Round 2
  - Replace the folder Files heading with Files and Views tabs; remove the visible System activity label; remove the persistent saved-view bar; add Export, Views, and New view to File; open saved views in new tabs; and repair unequal activity-cell height.

## Accepted W-015 Policy For Promotion

- URL and Phone editors loosely accept entered values as strings rather than blocking save on strict parsing.
- The PostgreSQL storage value remains text/string data. A field formatter may produce a best-effort URL or phone presentation, but it does not silently replace the stored string.
- Owner-installed PostgreSQL constraints remain authoritative when present; the permissive Tabular editor does not bypass a database rejection.
- This user decision passed the r007 review gate and is promoted to the KB and
  Spec 00002.

## Screen Inventory

| Screen | Purpose | Primary goal | Required states and navigation |
| --- | --- | --- | --- |
| `pages/browse.html` | File explorer root and folder contents | Find, open, or start a spreadsheet or saved view | Root folders; Operations and Finance folder contents; Files/Views tabs inside folders; list/grid view; search; empty states; direct blank-file/table/import links; icon-only System activity utility |
| `pages/table.html` | Focused spreadsheet editor with File-menu saved views | Work directly in a PostgreSQL-backed table and open, create, or publish presentation state without reducing grid space | Existing command/format/edit/error states; blank file; File-menu Export/Views/New view; saved-view list and empty dialogs; create-dialog swap; editor denial; query-driven view filtering; icon-only System activity utility |
| `pages/import.html` | Values-only import wizard | Import values into the chosen folder | Folder-aware return link; existing source, preview, review, and completion states |
| `pages/system-activity.html` | Shared-shell operator activity and recovery | Monitor work, recover failures, and return to the affected table | All/active/needs-attention/completed filters; queued row-order maintenance; dead-letter detail; retry; acknowledge; retention dialog; Customer orders return |
| `workflows.html` | Review starting points | Enter every representative workflow state | All starts target the same reachable browse/table/activity product graph |

## Workflow Starting Points

| Workflow | Starting screen | Happy path | Alternate state |
| --- | --- | --- | --- |
| Browse files | `pages/browse.html` | Open Operations or Finance, then select a spreadsheet | Toggle grid view or search for a folder/table |
| Open a spreadsheet | `pages/browse.html?folder=operations` | Select Customer orders and work in the sheet | Return to its folder from Files breadcrumb |
| Create a file | `pages/table.html?new=1&folder=operations&table=untitled-file` | Open a blank Untitled File and name columns directly in the sheet | Rename the file or customize its PostgreSQL table name in Table settings |
| Import values | `pages/import.html?folder=operations` | Pick source, preview values, review, then open imported table | Cancel returns to selected folder |
| Open or create a view | `pages/table.html?folder=operations&table=customer-orders&dialog=views` | Open a Personal or Shared view in a new tab | Create new view swaps into the creation dialog; owner may select Shared |
| Review publication denial | `pages/table.html?folder=operations&table=customer-orders&role=editor&dialog=create` | Save a personal table view | Shared remains unavailable with an owner requirement |
| Monitor activity | `pages/system-activity.html` | Filter current work and open job detail | Inspect queued row-order maintenance |
| Recover a dead letter | `pages/system-activity.html?job=import-q3` | Inspect attempts and review/retry | Acknowledge while retaining an auditable record |

## Layout System

### Focused application shell

- Used by `browse.html`, `table.html`, and `system-activity.html`.
- A single full-width top bar replaces the left navigation panel.
- The Acme Inc. mark is a compact route back to file browsing; it is not a collapsible navigation rail.
- On spreadsheet and explorer screens the top bar includes an icon-only System activity utility with an accessible label before the account action.
- On System activity the same top bar includes the Acme Inc. root link, System activity breadcrumb, Customer orders return link, and account action.
- At narrow widths, search wraps below the title/action row and file cards reduce to one column. The spreadsheet canvas retains internal horizontal scrolling.

### File-explorer layout

- A centered, padded content area with a compact Acme Inc. breadcrumb, count, view-toggle group, and one content region.
- Root state shows two folder items only: Operations and Finance.
- Folder state adds Files and Views tabs. Files shows table items with existing table name, column-by-record count, and edited time data; Views shows saved-view identity, source file, access, and update time.
- List view uses thin horizontal dividers; grid view uses compact cards. Neither adds owner, file size, or storage columns.

### Saved-view discovery and dialog layout

- Saved views are discoverable from a folder’s Views tab and from File → Views inside `table.html`.
- File → Views opens a centered list dialog with Personal and Shared groups; each saved view is a real link with `target="_blank"` into a query-driven table state.
- A table with no saved views shows an explicit empty state and Create new view action instead of an empty list.
- File → New view opens creation directly. Create new view from the list closes the list dialog before opening the create dialog.
- The formatting toolbar follows the menu bar directly, preserving maximum spreadsheet height at wide and narrow widths.

### System activity layout

- Uses the same full-width application identity with a dedicated administrative page body.
- Summary metrics, horizontally scrollable filter tabs, and an activity list lead to an overlay detail panel.
- At narrow widths the table becomes stacked cards and the detail panel fills the available viewport.

## Component Inventory

| Component | Where | States and behavior |
| --- | --- | --- |
| Explorer top bar | `browse.html` | Search, icon-only System activity utility with tooltip/accessible name, and account; no persistent panel or root-level creation action |
| Breadcrumb | Explorer and table | Acme Inc. returns to root; selected folder returns to its contents; current sheet name is inline-renameable |
| Folder creation action | Explorer folder view | `New file` is visible only while a folder is open; it routes directly to a blank Untitled File in that folder |
| Folder item | Explorer root | Folder icon, name, file count, edited time; opens `?folder=…` |
| Spreadsheet item | Explorer folder view | Table icon, name, schema detail, count, edited time; opens `table.html` |
| Folder Files/Views tabs | Explorer folder view | Query-link tabs; Files shows spreadsheets, Views shows saved views belonging to the folder; selected tab uses `aria-selected=true` |
| Folder saved-view item | Explorer Views tab | Saved-view name, source file, access, update time, and open-new affordance; opens `table.html?view=…` in a new tab |
| View toggle | Explorer root and folder views | List or grid; state stored in memory for the current page only; active choice has `aria-pressed=true` |
| Search | Explorer | Filters visible folder or spreadsheet items; shows a scoped empty state when there are no matches |
| Spreadsheet command surface | `table.html` | Copied command and formatting behavior with no persistent saved-view bar; the sheet name remains inline-renameable |
| New-file PostgreSQL identity | `table.html` Table settings | A blank Untitled File derives a lower_case PostgreSQL name from its current display title unless the PostgreSQL input is explicitly changed |
| Advanced column storage | `table.html` right panel | Shows the PostgreSQL column name in lower_case alongside storage controls; it remains distinct from the user-facing column label |
| Relation configuration | `table.html` right panel | When Field is Relation, a searchable File dropdown lists available table files grouped by folder, followed by the relation-picker display template |
| Related-record format | `table.html` right panel | Format follows the Relation settings; when it is Related record, its independent saved-cell Display format appears directly below that control |
| In-cell select menu | `table.html` grid | Double-clicking a Select cell opens visible option choices immediately; choosing one commits its value |
| Import header | `import.html` | Refers to the selected folder and returns to its browse route |
| File menu data actions | `table.html` | Export follows Import; Views and New view follow Make a copy after a divider; existing history/settings remain a later group |
| Views dialog | `table.html` | Personal/Shared saved-view list, new-tab links, empty state for a new file, and Create new view swap action |
| New-view dialog | `table.html` | Name, Private/Shared access, included presentation state, owner/editor permission state; reachable directly or from Views |
| Active-view context | `table.html` | Query-driven row filtering plus a compact breadcrumb label and document title; no inline saved-view controls |
| System activity utility | `browse.html` and `table.html` | Icon-only link navigates from normal product work into the shared-shell activity page and retains an accessible name |
| Activity metrics and tabs | `system-activity.html` | Running, queued, attention, completed counts; All/Active/Needs attention/Completed filters; desktop table cells fill each dynamic row height |
| Activity detail panel | `system-activity.html` | Running, queued, dead-letter, and completed histories with relevant actions |
| Retention dialog | `system-activity.html` | 30/90/180/365-day choices and Save confirmation |

## Interaction And State Contract

| Trigger | Before | After | Visible result |
| --- | --- | --- | --- |
| Open `browse.html` | No folder query | Root state | Operations and Finance folders display in the selected list/grid view |
| Click folder item | Root state | `?folder=operations` or `?folder=finance` | Breadcrumb and content become the selected folder’s spreadsheets |
| Click Acme Inc. breadcrumb | Folder state | Root state | Both folders return to view |
| Click New file | Folder state | Blank sheet route | Untitled File opens with 0 records, 1,000 rows, and no named columns in the selected folder |
| Click spreadsheet item | Folder state | Table route | The existing spreadsheet editor opens with the chosen folder and table context |
| Click Files or Views tab | Open folder | `tab=files` or `tab=views` query state | Files shows spreadsheet files; Views shows saved views from tables in that folder |
| Click folder saved view | Views tab | New browser tab | The source table opens with the selected `view` query and representative row filtering |
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
| File → Export | Spreadsheet state | Export provision | A confirmation toast identifies the current sheet or selected saved-view export scope; no file is written |
| File → Views | Spreadsheet state | Views dialog | Personal and Shared saved views display as new-tab links; a new file instead shows No saved views and a Create new view action |
| Click saved view in dialog | Views dialog | New browser tab | `table.html?…&view=<id>` opens and filters representative rows while the source tab remains open |
| File → New view | Spreadsheet state | Create dialog | The creation form opens directly without first showing the list |
| Create new view from Views | Views dialog | Create dialog | The list dialog closes before the creation dialog opens |
| Create private/shared view | Create dialog | View stored in wireframe memory | Owner can create either access level; editor can create only Private and sees the owner requirement; the new view appears when the list reopens |
| Open table with `view` query | Unfiltered table route | Saved-view context | Representative rows filter and the view name appears in the breadcrumb and document title without adding a control bar |
| Reorder a shared row | Existing order | Optimistic new order | Committed rank broadcasts in real time when transport is available; rank compaction may queue without reverting the visible move |
| Filter activity | All jobs | Selected group | Only matching operations render and the selected tab updates |
| Open activity row | Activity list | Detail open | Target, status, fields, history, errors, and allowed actions reflect the selected job |
| Review and retry dead letter | Dead-letter detail | Queued retry | Job becomes queued, history gains Retry queued, and a toast confirms |
| Save retention | Retention dialog | Dialog closed | Selected duration updates in the page action and a toast confirms |
| Click System activity | Browse or table state | System activity page | Shared-shell activity opens without requiring `workflows.html` |
| Click Customer orders in activity | Activity state | Table state | Returns to `table.html?folder=operations&table=customer-orders` with File-menu Views and New view available |

## Library Plan

- `lib/base/tokens.css`, `base/reset.css`, and `base/base.css`: copied from r004 unchanged to preserve the accepted grayscale tokens and base controls.
- `lib/icons.css` and `icons.js`: adapted from r004; add a Lucide-guided folder icon for the explorer.
- `lib/app.css`: adapted from r004. Remove its layout dependency on the sidebar, add the full-width application shell, explorer list/grid layout, folder Files/Views tabs, folder saved-view rows, and responsive rules.
- `lib/app.js`: adapted from r004. Preserve the spreadsheet/import behavior and add focused explorer routes, folder tab query state, tab-aware search/count state, view-toggle, and blank-file behavior. Teach the shared folder resolver to accept either legacy `department` or new `folder` query keys for review continuity.
- `lib/integrations.css`: created for r007; adds folder view-tab/list styling, saved-view list/create dialogs, active-view breadcrumb context, icon-only utilities, and shared-shell System activity layouts without redefining base tokens.
- `lib/integrations.js`: created for r007; owns File-menu saved-view dialogs, role-aware publication, new-tab view links, representative query filtering, activity filtering/detail, dead-letter actions, retention, and toasts.

## Page Build Plan

### `pages/browse.html`

- Title: `Acme Inc. files` at root; `<folder> · Acme Inc.` within a folder.
- Imports: base tokens, reset, base, icon CSS, app CSS, icon JS, and app JS through document-relative links.
- Initial state: root list view with Operations and Finance folders, an Acme Inc. root crumb, and no page heading/description.
- Hooks: `data-file-explorer`, `data-explorer-view`, `data-explorer-tab`, `data-explorer-search`, `data-explorer-new-file`, folder/table/view rows, and tab-aware count/empty-state targets.

### `pages/table.html`

- Title: chosen spreadsheet name.
- Layout: full-width top bar, focused folder breadcrumb with inline-renamable spreadsheet name and optional active-view context, the existing r004 menu/format surface, and spreadsheet canvas. No persistent saved-view bar appears between menu and formatting controls.
- Initial state: Customer orders within Operations; the direct new-file query opens an empty Untitled File with 0 records and no named columns.
- Hooks: retain all existing grid, formatting, context-menu, error, and query-state hooks; add File-menu export/views/new-view actions, saved-view list/empty/create dialog hooks, active-view context, and the icon-only System activity utility.
- Query hooks: `dialog=views` opens the list; `dialog=create` opens New view; `role=editor` disables Shared; `view=ready`, `view=follow-ups`, and `view=unpaid` filter representative records and label the tab context.

### `pages/import.html`

- Keep the existing values-only import flow with folder-aware return navigation.
- Use document-relative links back to the selected folder with a default Operations fallback.

### `pages/system-activity.html`

- Title: `System activity · Acme Inc.`.
- Initial state: one running import, one queued row-order maintenance job, one dead letter, and recent completed work.
- Query hook: `job=import-q3` opens dead-letter detail.
- Navigation: Acme Inc. returns to the explorer; Customer orders opens the integrated table surface.

### `workflows.html`

- Preserve the four existing file-first workflow starts.
- Route both saved-view starts into query states of `table.html`; route activity starts into `system-activity.html`.

## Functional Acceptance Checks

- `specs.md` matches the four rendered screens plus `workflows.html` and remains within 500 lines.
- `browse.html` root shows only Operations and Finance folders, with no left panel.
- The explorer removes the extra title/description and New table action; an open folder exposes Files and Views tabs with tab-appropriate counts.
- The root has no creation action; opening a folder reveals a New file action that opens an empty `Untitled File` in that folder.
- The blank New file route has 0 records, 1,000 logical rows, and 0 named columns; the existing header interaction creates initial Text columns.
- Each folder Files tab shows only its configured spreadsheets, with both functional list and grid views; its Views tab shows only views attached to files in that folder.
- Search filters the current root/folder/tab item set and reaches the scoped empty state.
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
- r007 contains the complete r006 browse, table, import, activity, shared-library, and workflow behavior that remains in use.
- From `browse.html`, a user can open Operations → Views and open a saved view in a new tab without using `workflows.html`.
- From `browse.html` or `table.html`, a user can open System activity; from System activity, Customer orders returns to the integrated table.
- File includes Export after Import, then Views and New view after Make a copy and a divider.
- File → Views lists Personal and Shared saved views, uses new-tab links, shows an empty state for Untitled File, and swaps to creation through its CTA.
- File → New view opens creation directly; owner/editor access state, representative query filtering, and dialog dismissal work inside `table.html`.
- The Browse and Table System activity utilities are icon-only but remain keyboard-focusable and accessible by name.
- System activity filtering, equal-height desktop row cells, queued row-order maintenance, dead-letter retry/acknowledge, and retention work.
- W-015 records permissive string entry and best-effort formatting without implying a strict parser or storage-type change.

## Review Boundary

This is an approved clickable wireframe revision, not a production
implementation. Folder organization, view state, saved-view publication,
real-time events, background jobs, blank-file opening, and import completion
are simulated for review. No PostgreSQL view or hidden rank column is installed,
no worker runs, and no production implementation is authorized. Its accepted
reusable decisions may be promoted to the Context KB and Spec 00002.
