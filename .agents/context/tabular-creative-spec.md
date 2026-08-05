# Tabular Creative Foundation and Screen Map

## Status and design intent

**Accepted creative baseline:** r007 Round 2, user approved on 2026-08-01, with
user-directed Spec 00003 implementation-review corrections promoted on
2026-08-04. Use this document for visual and interaction reconstruction. The
[PostgreSQL-native product contract](tabular-product-contract.md), accepted on
2026-07-31, supersedes r005 product-policy assumptions including hierarchy,
authority, persistence, interfaces, and first-slice scope.

Tabular is a familiar spreadsheet application that works directly with real
PostgreSQL tables. The interface leads with files, folders, cells, and familiar
spreadsheet commands. PostgreSQL remains present where it changes a decision,
such as Table settings, Advanced column settings, validation, and relations.

## Product model

| Familiar concept | Tabular meaning | Important boundary |
| --- | --- | --- |
| Configured connection name | Server/connection root; `Acme Inc.` is a historical sample only | Database and schema levels remain visible beneath it. |
| Folder | A PostgreSQL schema shown with familiar folder treatment: Operations or Finance | Canonical schema boundary inside one database. |
| File | A user-named spreadsheet people open from the explorer | Maps to one PostgreSQL table. |
| Table | The PostgreSQL-backed data object behind a file | Use as a familiar domain term where needed; do not use "spreadsheet" and "table" interchangeably in the same UI sentence. |
| Column | A named sheet field and PostgreSQL column | Has separate label, Field, Format, constraints, and Advanced storage settings. |
| Row | A spreadsheet line that can be blank, draft, valid, or rejected | A completed valid row becomes a PostgreSQL record. |
| Cell presentation | The output users see at rest | Does not change raw data or PostgreSQL storage. |

### Required peer examples

The visible folder hierarchy has at least two peers at every displayed level:

- **Operations:** Customer orders, Inventory, Vendors, Stock movements, Purchase requests.
- **Finance:** Invoices, Expenses, Budgets.

Show the accepted `server/connection → database → schema folder → table/view
file` hierarchy without adding a singleton Company or Departments wrapper.
Technical paths such as `operations.customer_orders` remain useful secondary
metadata after the visible database/schema context is established.

## Visual language

This is a compact grayscale wireframe, not a branded Google clone.

| Element | Direction |
| --- | --- |
| Type | Neutral Arial/Arial-like sans serif. Main UI controls and data use approximately 14px; labels and metadata are smaller; page-scale headings are used sparingly. |
| Color | White surfaces, very light gray canvas/header fills, charcoal text, thin neutral-gray dividers, modest blue active/focus treatment, and red only for validation/error meaning. |
| Geometry | Small radii, compact 32–40px controls, one-pixel rules, low-elevation menus and panels. Avoid pill-heavy product chrome except compact output badges. |
| Density | Spreadsheet-like: controls and rows are tight but not cramped. Avoid descriptive marketing copy and duplicated actions. |
| Icons | Use a consistent compact Lucide-style line icon set. Toolbar and choice-grid icons must have text alternatives/tooltips even when no visible label is shown. |
| Focus | Use a clear blue cell/control outline. An error cell has no border unless it is selected. |
| Errors | Error corners, popover accent border, and titles are red. Spreadsheet error token text itself is black regular weight. |

### Spacing and responsive behavior

- The spreadsheet grid owns horizontal overflow; do not make the page itself
  horizontally scroll.
- Desktop keeps the full command surface available above the grid. At smaller
  widths, retain File/Edit/View/Format and core typography controls, move lower
  priority formatting into a More surface, and keep the canvas scrollable.
- Explorer search may wrap below its identity row on narrow widths; cards become
  one column.
- Folder Files/Views tabs may scroll or wrap within their own compact region;
  they may not create document-level overflow.
- Focused panels and menus must float over content. Opening a menu or panel may
  not reflow, push, or displace grid headers or columns.
- Import intro copy has matching vertical breathing room above and below; the
  chosen-source summary and the final PostgreSQL-source alert each have a clear
  matching top separation.

## Application shell

### Explorer shell

- Full-width top bar: compact configured connection name at left, a restrained
  `Search files` field, icon-only System activity link with an accessible name,
  and account action at right.
- There is no persistent left navigation panel, Drive-style global navigation,
  owner/storage metadata, or root-level create/import action.
- Content starts with the configured connection/database breadcrumb, then the
  root folder count or an open folder's Files/Views tabs, list/grid toggle, and
  one content region.

### Spreadsheet shell

- Full-width top bar: configured connection name is a route to the explorer;
  breadcrumb contains database, current folder, and current file name. Do not
  insert a generic `Files` crumb.
- The current file name is inline renameable. Click to edit; Enter or click-away
  commits; Escape cancels. An accepted rename updates the display name and
  physical PostgreSQL relation through the governed DDL/reconciliation boundary
  without exposing an internal migrator confirmation.
- Under the top bar: File/Edit/View/Format menubar, then WYSIWYG toolbar, then
  the coordinate band and sheet canvas. Do not insert a persistent saved-view
  bar between the menubar and toolbar.
- The top bar carries the same icon-only System activity link as the explorer.
- A right panel is contextual: column configuration or Table settings, never a
  persistent navigator.

## Current routes and screen inventory

| Route/state | User goal | Required visible state |
| --- | --- | --- |
| `pages/browse.html` | Start at the organization root | Operations and Finance folders; list/grid toggle; scoped search; no page heading, explanatory paragraph, New file, or Import. |
| `pages/browse.html?folder=operations` | Find a file or saved view inside a folder | Configured connection/database › Operations, Files/Views tabs with scoped counts/search, list/grid toggle, and adjacent `New file` + `Import` actions. |
| `pages/browse.html?folder=finance` | Find a Finance file | Equivalent Finance folder view, its files, and the same folder-only actions. |
| `pages/table.html?folder=operations&table=customer-orders` | Work in an existing file | Focused spreadsheet with Customer orders data, command surface, canvas, and contextual panel. |
| Open-folder New file dialog | Name a new blank file | **Create a blank spreadsheet**, required File name, inferred PostgreSQL table preview, Cancel, and Create file. |
| Reconciled normal table route after create | Start entering columns and values | Entered file name, 0 records, 1,000 logical rows, no named columns, durable hidden row identity, and an immediately editable first row. |
| `pages/table.html?folder=operations&table=customer-orders&dialog=views` | Open or create a table view | File-menu Views dialog grouped by Personal/Shared, or a No saved views creation state. |
| `pages/table.html?folder=operations&table=customer-orders&view=ready` | Work in a saved view | New browser tab, compact active-view breadcrumb/title, saved filtering/presentation, and no persistent view bar. |
| `pages/import.html?folder=operations` | Create one new file by importing values | Folder-aware values-only import wizard. |
| `pages/system-activity.html` | Monitor and recover background operations | Summary cards; All/Active/Needs attention/Completed filters; job detail; dead-letter actions; administrator retention. |

`create-table.html` is deliberately not a current route. One bounded file-name
dialog creates the governed PostgreSQL table, then the reconciled normal route
opens directly into the blank spreadsheet so column configuration happens in
the actual grid instead of a partial schema builder.

## Screen reconstruction rules

### Explorer root and folder contents

Root shows exactly two folder items: Operations and Finance. Folder items show
a folder icon, name, concise file count, and edited-time information. Do not
repeat a secondary count on the same folder card.

Within a folder, use **Files** and **Views** tabs, not Spreadsheets or Tables.
Each file item shows a table icon, display name, technical `schema.table` path
as secondary metadata, a compact `columns x records` value (for example,
`7 x 248`), edited time, and an open affordance. Each view item shows its name,
source file, access, updated time, and open-new-tab affordance. List view uses
dividers; grid view uses restrained cards. The same data and actions must work
in either mode. Search only filters the selected collection and produces a
scoped no-results message. The Views tab lists Tabular saved views; native
PostgreSQL views remain read-only files in Files.

### Spreadsheet canvas at rest

- First band: A–Z spreadsheet coordinate letters, including blank future
  columns. It may be scrolled horizontally with the data columns.
- Second band: semantic field names. Named headers are label-only; field/storage
  copy does not appear underneath them. Current example: Order ID, Customer,
  Email, Status, Total, Paid, Ordered at.
- First sticky column: a visibly blank header corner followed by value-row labels
  beginning at 1. The corner remains the whole-header-row selection target but
  owns no value-row or formula coordinate.
- Body values render through their output formats, not their input controls:
  status may be a compact badge, default Price comma-grouped with two decimals
  and no symbol, boolean as Yes/No, relation as its saved display template, and
  date-time in compact human-readable form.
- Bottom: row-count number input, `Add Rows` button, logical capacity label,
  and status line such as record/row/named-column totals.

### Contextual panels

Panels slide/float from the right without altering canvas geometry. Each has a
clear title, close control, scrollable body, and sticky Cancel/Apply changes
footer where appropriate. Opening a column panel hides Table settings and vice
versa. Details belong in panels, not in the grid header.

### Saved-view dialogs

File → Views opens a centered Personal/Shared list. File → New view opens
creation directly; the list's Create new view action swaps dialogs. A table
without views shows an explicit empty state and creation CTA. Saved-view links
open new tabs. Owners/owning-role members may create Shared views; other users
remain limited to Private. The current view is identified in compact breadcrumb
and document-title context rather than a persistent grid control bar.

### System activity

System activity uses the same full-width shell. Summary cards and filters lead
to an operation list and overlay detail panel. It represents running imports,
queued shared-row-order maintenance, dead letters, shared-view publication,
CSV export, retry/acknowledgement, and administrator retention. Activity cells
fill their dynamic row height on desktop; narrow layouts stack without
document-level overflow.

## Accessibility and interaction baseline

- The canvas is an accessible grid with clear active-cell, range, row,
  named-header, whole-column, and whole-header-row states. Row and column
  headers have matching semantics; the initial active cell owns keyboard focus
  without requiring a pointer click.
- All visual-only icon choices expose accessible names and keyboard focus.
- Menus use menubar/menu semantics, keep focus management predictable, close
  with Escape/click-away, restore focus to the trigger, and clamp to the
  viewport.
- Right-click target selection occurs before its menu opens. Shift+F10 or the
  Menu key opens the correct menu for the active cell, relation, row, named
  header, whole column, whole header row, or explorer target.
- Hover-only error explanations wait one second; selection/focus opens them
  immediately. No validation popover opens automatically after a reorder.

## Wireframe-artifact omissions

- The r007 artifact demonstrates saved-view discovery/creation, a CSV export
  entry, shared-row-order activity, and operations recovery as simulated UI.
  It does not prove persistence, PostgreSQL views, rank-column installation,
  real-time transport, workers, or export generation.
- Formula evaluation, charts, pivots, comments, automation, public APIs, and
  broad PostgreSQL administration remain outside the accepted wireframe.
- No Drive sharing, activity, trash, storage, owners, stars, nested folders,
  batch selection, drag-to-move, or uploads.
- No production claim for persistence, migrations, transactions, permissions,
  relation integrity, source parsing, import connection, or recovery.

For detailed behavior, use the linked KB documents rather than inferring it
from this overview.
