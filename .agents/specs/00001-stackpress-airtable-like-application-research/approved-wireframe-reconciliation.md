# Approved Wireframe Reconciliation
## Status
**Accepted product-direction and creative UX evidence.** The reviewed
wireframes settle the visible first-use workflow and interaction contract below.
They do not authorize implementation, migrations, external integrations, or a
production-readiness claim. Spec 00001 Froze on 2026-07-31 after later
product-policy decisions superseded the r005 hierarchy and resolved its open
scope boundaries.

The source record is the approved r001–r005 Tabular wireframe series, through
r005 Round 13. The durable reconstruction detail is in the Tabular context
knowledge base:

- [`../../context/tabular-creative-spec.md`](../../context/tabular-creative-spec.md)
- [`../../context/tabular-grid-and-column-spec.md`](../../context/tabular-grid-and-column-spec.md)
- [`../../context/tabular-command-surface-spec.md`](../../context/tabular-command-surface-spec.md)
- [`../../context/tabular-files-import-and-settings-spec.md`](../../context/tabular-files-import-and-settings-spec.md)
- [`../../context/tabular-wireframe-decision-history.md`](../../context/tabular-wireframe-decision-history.md)

Use the knowledge-base documents for exact screen, control, state, and copy
rules. This record makes their effect on the open research ledger explicit; it
does not copy image assets or replace the underlying research evidence.

## Reconciled first-use workflow

The familiar file-first treatment is retained inside the accepted PostgreSQL
hierarchy:

```text
server/connection
  └─ database
       ├─ Operations schema folder
       │    └─ table/view files
       └─ Finance schema folder
            └─ table/view files
```

- **Folders** are familiar visual treatment for PostgreSQL schemas.
- A **file** is the familiar spreadsheet object a person opens. In a live
  product it maps to one real PostgreSQL table or view.
- Database and schema identity are visible in navigation; exact storage,
  constraints, and migration details remain progressively disclosed.
- Opening a database shows authorized schema folders in list or grid view.
  Opening a schema shows its Files with the same view choices and scoped search.
- `New file` and `Import` are adjacent authorized actions only inside an open
  schema folder.

### File creation and identity

`New file` opens a blank `Untitled File` spreadsheet immediately. It does not
visit a partial table-builder screen. The blank grid begins with zero records,
1,000 logical rows, and no named columns; people name columns and configure
them from the actual sheet surface.

The file title is inline renameable. Until a person explicitly overrides it in
Table settings, the PostgreSQL table name is derived from the title in
`lower_case_with_underscores`. Table settings keeps these separate:

1. Display name;
2. Folder; and
3. PostgreSQL table name.

The wireframe proves the interaction and terminology only. Applying Table
settings does not prove or authorize a live rename, DDL migration, or rollback
experience.

### Grid contract

The approved visual grid has an A–Z coordinate band, a named-column header
band, numbered rows, representative populated records, blank logical rows to a
capacity of 1,000, and a bottom `Add Rows` control. At rest, cells render their
output format rather than their editing control. Double-clicking opens the
field-appropriate editor; Enter, Tab, or click-away commits, and Escape
cancels.

The review also settles these presentation details:

- input editors are edge-to-edge and remain visible until commit/cancel;
- select, relation, switch, price, and date/time values use typed editing
  affordances rather than a one-size-fits-all text editor;
- errors use a black regular-weight `#ERROR!` token and a red corner marker;
- an error popup appears immediately on selection/focus or after a one-second
  hover delay, not automatically just because the error exists;
- an invalid row has a red row number and a row-level popup with a bullet for
  each blocking column error;
- blank headers that obstruct a layout are flagged after the relevant action,
  with a header-level error rather than automatic interruption; and
- menus, panels, and popovers float over the grid without changing its
  geometry.

These are UX requirements for a later implementation acceptance pass. They do
not replace G-009's virtual-window, ARIA, clipboard, keyboard, or native
assistive-technology requirements.

### Column configuration and relations

The wireframes make D-011 concrete: **Field**, **Format**, **constraints**, and
**Advanced PostgreSQL settings** are independent configuration axes. User-facing
column labels remain separate from their lower_case PostgreSQL column names.

For a relation, the exact top-to-bottom form is:

1. **Column name**;
2. **Field: Relation**;
3. **File** — a searchable picker of all eligible table files, grouped by
   Operations and Finance;
4. **Display format** directly under File — a template for options while a
   user is picking a related record, for example `{first_name} {last_name}`;
5. **Format: Related record**; and
6. **Display format** directly under Format — a separate template for the
   saved cell at rest.

The two templates are deliberately independent. Folders do not prevent a
relation: the wireframe models them as same-database organization, not physical
database boundaries. This does **not** settle whether a production target can
federate remote databases, how a foreign key is migrated, or its deletion and
integrity policy.

### Commands, formatting, and contextual actions

The spreadsheet uses a familiar File / Edit / View / Format menu bar, a compact
WYSIWYG toolbar, and right-click menus for cell, row, and column targets.
Formatting controls are presentation-only; they must not silently change the
raw stored value, field, format registry choice, PostgreSQL storage type, or
constraints. Menus, color/border/align popovers, and context menus remain
overlay surfaces, with keyboard and focus behavior as defined by the grid and
command-surface knowledge-base records.

File → Table settings opens the table-level right panel. Column configuration
continues to open the column-level right panel. The two panels are mutually
exclusive rather than layered together.

### Import boundary

Import is one folder-level action that **always creates a new file and table**.
There is no import-into-an-existing-file route. The visible wizard is:

1. choose a one-time CSV, XLSX, or Google Sheets source;
2. preview inferred values and warnings; then
3. review the new object's identity in this order: **File name**, **Table
   name**, **Folder**.

The workflow is values-only: formulas, formatting, comments, notes, and other
workbook behavior are not recreated. This aligns with D-007/D-008, but does not
supersede their required parser, provenance, retry, recovery, source-auth, and
exact-value evidence.

## Gap-ledger effect

| Gap | What the approved wireframes add | Final disposition |
| --- | --- | --- |
| G-001 — first product slice | Direct PostgreSQL-backed spreadsheet editor; New file goes to a blank sheet; import is separate. | Q-016 accepted the complete first slice and exclusions. |
| G-004 — field, format, and relation semantics | Independent axes, searchable relation picker, and display templates. | Native same-database foreign keys and generated columns accepted; spreadsheet formulas deferred. |
| G-005 — saved views | Presentation controls remain outside PostgreSQL storage. | Private/shared ownership and security-invoker PostgreSQL publication accepted. |
| G-009 — grid interaction | Visible canvas, edit lifecycle, errors, keyboard menus, and non-reflow overlays. | P-002 proved the bounded contract; native VoiceOver remains implementation acceptance. |
| G-010 — import and integrations | One-time new-table CSV/XLSX/Google Sheets import; no existing-file import. | Exact-value import, CSV export, governed MCP, and deferred surfaces accepted. |
| G-018 — pages and flows | Explorer, spreadsheet, Table settings, Column settings, and Import. | Hierarchy, provisioning, roles, history/recovery ownership, and saved views accepted. |

## Superseded visual assumptions

The following are no longer current UI direction, even though their historical
research value is retained:

- r005's visual-only folder hierarchy is superseded. The active front door is
  server/connection → database → schema folder → table/view file.
- A standalone create-table builder is not part of the first-use flow. Direct
  blank-sheet creation is.
- Importing values into an existing file is explicitly absent.
- Schema folders must not imply separate databases or a singleton
  company/department hierarchy.
- A row-detail drawer remains outside the accepted first slice. Saved views are
  accepted product scope even though r005 did not fully design their surface.

## Implementation validation still required

The product-policy boundaries are settled, but clickable wireframes do not
prove production behavior. A later implementation spec must verify:

- import OAuth/service authentication, source extraction, typed staging,
  idempotent commit, warning adjudication, retry/abandon, and provenance;
- PostgreSQL 18 connection pools, transactional DDL/data, schema drift, grants,
  RLS, constraints, relation actions, saved views, drafts, conflicts, journal,
  jobs/outbox, unstructured JSON, and governed MCP;
- the accepted field/format registry and generated-column boundary; and
- production accessibility, performance, browser matrix, and native
  assistive-technology verification.

## Follow-on rule

A later implementation spec must cite this reconciliation and the
PostgreSQL-native product contract. It may use the approved visual flows as
acceptance targets, but it must not treat a clickable wireframe as proof of
PostgreSQL behavior or production readiness.
