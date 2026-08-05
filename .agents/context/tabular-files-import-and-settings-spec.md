# Tabular File Explorer, New File, Import, and Table Settings

## Scope

This document rebuilds the r005 file-level visual experience: list/grid modes,
direct blank-file creation, one values-only import flow that creates a new
file, and table-level settings. Reconcile it with the
[product contract](tabular-product-contract.md): the current hierarchy is
`server/connection → database → schema folder → table/view file`, and r005's
folder treatment is the visual pattern for a schema.

## File explorer

### Root

The configured PostgreSQL connection is the explorer root. Database and schema
levels use the same restrained list/grid language. New file and Import appear
only inside an authorized schema folder, not at connection or database level.

Required visible structure:

1. Full-width top bar: configured connection name, Search files input, icon-only
   System activity link with an accessible name, and account action.
2. Compact connection → database breadcrumb.
3. Folders label with an appropriate count at database scope.
4. List and grid view toggle.
5. Current database collection containing example Operations and Finance
   schema folders.

Each folder item/card has a folder icon, name, concise file count, and edited
time. Do not render a second duplicate count inside the same folder card. There
is no Drive-like sidebar, storage meter, owner column, activity, shared area,
trash, starred feature, or global navigation.

### Folder contents

Opening Operations or Finance shows the configured connection, database, and
folder path. It still has no large page heading or explanatory paragraph.

The content heading becomes two tabs: **Files** and **Views**. Files uses a file
count, for example “5 files”; Views uses a view count. Never call either
collection “spreadsheets.” The folder header adds exactly two actions, placed
together at the upper right:

1. **New file**
2. **Import**

These actions are visible only inside an open folder. They are not a replacement
for each other:

- New file asks for the file name, shows the inferred PostgreSQL table name,
  creates the governed table, and then opens its empty spreadsheet.
- Import opens the values-only import wizard and creates a new file from a
  source. It never imports values into an existing file.

File items may show:

- Table icon.
- User-facing file name.
- Muted technical schema/table identity.
- Compact columns x records metric; columns are first, for example 7 x 248.
- Edited time.
- Open chevron/affordance.

List view uses low-contrast divider-separated rows. Grid view uses compact
cards. Both surface identical content, navigations, and actions. The chosen
view is page-session state only until a product preference model is approved.

### Folder saved views

Views lists saved views attached to files in the current folder. Each row/card
shows the view name, source file, Personal or Shared access, updated time, and
an open-new-tab affordance. Opening a view creates a new browser tab for the
source table and applies its saved query/presentation state.

The **Views** tab means Tabular saved views. A native PostgreSQL view remains a
read-only file in **Files** because it is a canonical database object, not
Tabular presentation metadata.

The Views tab is discovery, not an alternate table editor. View creation stays
inside the source table's File menu. A folder with no matching views uses a
scoped empty state; a high-volume table filter may be added later but is not a
first-slice requirement.

### Search and navigation

- Search filters the items in the currently visible root, folder, or selected
  Files/Views tab; it does not infer a global Drive search.
- An empty state explains that no current items match.
- Clicking the configured connection root breadcrumb returns to the root
  collection.
- The folder breadcrumb from a spreadsheet returns to its folder's Files
  listing.
- A file item opens that file's spreadsheet route with folder/table identity.
- A view item opens its source spreadsheet and saved-view state in a new tab.

## New file

New file uses one bounded file-identity dialog followed by the direct
spreadsheet route. It is not a schema/field creation wizard.

### Entry and initial state

From an authorized open folder, **New file** opens **Create a blank
spreadsheet**. The dialog contains one required **File name** input, a live
read-only **PostgreSQL table** preview, Cancel, and **Create file**. Lowercase
letters and underscores are inferred automatically; a collision receives a
bounded numeric suffix.

After the governed create action succeeds, Tabular opens the reconciled normal
table route. The initial sheet has:

- The entered display name and inferred PostgreSQL table identity.
- The folder from which New file was chosen.
- Zero existing records and one thousand logical rows.
- No named columns, plus collision-safe hidden stable row identity and rank
  support installed through the authorized migrator boundary.
- An immediately editable first logical row. Naming a blank header creates a
  PostgreSQL column; typing beneath an ordinary unnamed trailing coordinate
  retains unstructured data under stable Tabular metadata.

Do not route New file through `create-table.html`, an identity card, raw SQL
preview, pre-made field presets, Add column setup, or a compact schema builder.
Do not expose the internal migrator or require a second owner-confirmation
dialog after the user chooses Create file.

### File name and PostgreSQL table name

The visible file name is editable in the spreadsheet breadcrumb and Table
settings. For a new file, PostgreSQL table name derives from the submitted file
name before creation:

| Display name | Derived PostgreSQL name |
| --- | --- |
| Customer Orders | customer_orders |
| Q3 orders | q3_orders |

Normalize by lowercasing, using underscores for word boundaries, and removing
unsupported punctuation. A later accepted file rename applies the display-name
and physical-relation plan through the governed DDL boundary without exposing a
second migrator confirmation. It must fail visibly and atomically rather than
leaving metadata and PostgreSQL identity divergent.

## Table settings

### Entry and panel behavior

File → Table settings opens a table-level right panel, replacing any
column-configuration panel. The panel is titled **Table settings**, has a close
action, scrollable body, and Cancel / Apply changes footer.

It must show only table-level controls:

1. **Display name** — helper: shown in Files and at the top of this spreadsheet.
2. **Folder** — current folder selector.
3. **PostgreSQL table name** — lower_case input/helper; distinct from Display
   name and derived from it only for a blank file with no explicit override.

Do **not** include the removed Table details block, record count block,
column count block, or a selected-column configuration within Table settings.

Apply plans and executes authorized table-level changes through the governed
DDL boundary, then closes only after the reconciled identity is available. The
panel does not expose migrator credentials or pretend a failed/pending physical
change succeeded.

## Import: one workflow, one destination

### Boundary

There is only one import model in the accepted creative direction:

> Import creates a new file and its PostgreSQL-backed table in a selected folder.

There is no import-to-existing-file workflow, no append/replace dialogue, no
column overlay, and no table-screen quick import action. The folder Import
button and File → Import route both start the same new-file flow with a known
folder context where available.

### Shell

Import uses the focused full-width configured-connection top bar and a folder
context label. The page carries a compact breadcrumb such as:

    Files › Operations › Import values

Remove the import eyebrow and the large page title. Retain concise explanatory
copy about reviewing source, inferred fields, and value fidelity before
creating a table in the folder; give this copy balanced top and bottom
breathing room.

A left step rail or equivalent stepper has exactly:

1. Choose source
2. Preview values
3. Import

The main panel holds the active step and a bottom action row.

### Step 1: Choose source

Use a panel titled **Choose a source** with the brief explanation that this is a
one-time cutover and Tabular will not keep the source synchronized.

Source choices are:

| Source | Purpose |
| --- | --- |
| CSV | Upload a comma-separated source while preserving source tokens. |
| XLSX | Import cached values from an Excel workbook. |
| Google Sheets | Connect once and import the latest calculated values. |

After source selection, show a selected-source summary with a small file icon,
example file name Q3-orders.csv, 248 rows, 6 columns, 38 KB, and Choose file
action. Its top margin must equal its bottom margin relative to surrounding
content.

Show a neutral warning: **Values only.** Formulas, formatting, comments, notes,
and workbook behavior are not recreated. This does not promise live
synchronization, spreadsheet formula support, or rich workbook fidelity.

The step action is Preview values; Cancel returns to the active folder.

### Step 2: Preview values

Preview the sampled source values, inferred fields, mapping choices, and
warnings before any import action. The creative requirement is reviewability:
users can go Back and revise source/mapping. Unsupported fidelity is described
as warning/provenance rather than silently presented as complete support.

The sample Q3-orders file maps six fields and maintains a separate warning
count. Exact parser, type inference, formula storage, source connection,
transaction, and retry design remain out of scope.

### Step 3: Import identity and confirmation

Use a panel titled **Ready to import**. Explain that Tabular will create one
table and commit the imported values-only records. The identity controls appear
in this exact order:

1. **File name** — familiar name shown in the folder and spreadsheet title,
   for example Q3 orders.
2. **Table name** — lower_case PostgreSQL-backed table identifier, for example
   q3_orders.
3. **Folder** — target folder, for example Operations.

Do not label the Folder control Department.

Below the identity controls, show an **Import summary** table such as:

| Item | Example | State |
| --- | --- | --- |
| Records | 248 exact-value rows | Ready |
| Columns | 6 mapped fields | Ready |
| Warnings | 5 attributable items | Reviewable |

Below that, use a neutral PostgreSQL-source alert such as:
“The Operations folder will include this table. Advanced data source:
public.q3_orders.” Add clear top spacing before this alert.

Bottom actions: Back and Import values. Import values shows progress then routes
to the new file; it does not change an existing spreadsheet.

## Visual and terminology rules

- Primary UI says folder, file, source, values, and table where necessary.
- PostgreSQL table name/source is secondary or advanced, including in the final
  confirmation alert.
- Avoid duplicated headings: no Browse heading, folder title, import title, or
  New-file builder title where breadcrumb and content already establish context.
- Buttons use restrained grayscale styling with New file/Import adjacent only in
  a folder. Import is not promoted as a primary spreadsheet-header action.
- Keep exact one-time values-only language; do not say import syncs a source.

## Production boundary

The [product contract](tabular-product-contract.md) now governs schema-folder
membership, table creation, import commit, migrations, saved-view persistence,
authority, ownership, sorting, undo, recovery ownership, and cross-schema
relations. The accepted wireframe is a detailed interaction target, not
evidence that its simulated actions already happen against PostgreSQL.
