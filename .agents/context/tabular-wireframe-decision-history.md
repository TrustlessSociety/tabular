# Tabular Wireframe Decision History

## Purpose

This history preserves the reviewed decision trail that produced the current
creative baseline. It is not an archive of HTML, screenshots, assets, or
browser artifacts. Use it to prevent a future rebuild from reintroducing
rejected hierarchy, duplicate actions, non-spreadsheet editors, incorrect error
states, or partial create/import flows.

## Post-r005 product-policy override

The [PostgreSQL-native product contract](tabular-product-contract.md), accepted
on 2026-07-31, supersedes r005's visual-only-folder and simulated-scope
assumptions. The active hierarchy is `server/connection → database → schema
folder → table/view file`; Operations and Finance are example schemas inside
one database. Preserve the reviewed visual and interaction language while
applying the product contract for persistence, authority, MCP, history,
operations, and exclusions.

## Baseline progression

| Revision | Lasting contribution | Superseded structure |
| --- | --- | --- |
| r001 PostgreSQL-native core | Direct PostgreSQL-table model, column axes, persistent drafts, values-only import, compact columns x records metric | Database/schema-led primary browse and focused create-table builder. |
| r002 Department table navigation | Operations and Finance peer organization with tables beneath them; technical identity secondary | Singleton Company/Departments level and technical navigation. |
| r003 Spreadsheet table canvas | A–Z sheet, 1,000 logical rows, typed editors, spreadsheet errors, inline headers, reordering, Add Rows | New/Save record controls, record toolbar, nested input cards, header metadata copy. |
| r004 Spreadsheet command surface | File/Edit/View/Format, WYSIWYG toolbar, choice popovers, contextual menus | Header overflow buttons, toolbar Display format control, cycling-format buttons. |
| r005 Spreadsheet file explorer | Folder-first Acme Inc. explorer, no persistent sidebar, direct blank file, folder Import, table settings and relation templates | Department/sidebar shell, create-table route, import-to-existing-file idea, Drive-like feature breadth. |
| r006 Saved views and activity draft | First saved-view, shared-order, and operations-state surfaces | Isolated pages and incomplete copy-forward integration. |
| r007 Integrated views and activity | Files/Views discovery, File-menu saved views, shared row-order policy, reachable System activity, and permissive URL/Phone policy | Persistent saved-view bar, isolated workflow-only entry points, and visible System activity utility label. |

## r001 — PostgreSQL-native core

### Round 1: initial model

- A user-facing table creates a real PostgreSQL table; headers create columns
  and semantic field choice safely infers storage.
- Browser review covered browse, creation, column configuration, persistent
  incomplete grid drafts, direct record handling, and values-only import.
- Field type, PostgreSQL storage, display Format, and constraints were kept
  independent. PostgreSQL detail used progressive disclosure instead of
  dominating normal entry.
- Incomplete records remain drafts until required values pass validation.
- One-time import has source, preview, warning, progress, and success states.
- Formulas, rich workbook support, sharing, roles, comments, export, audit,
  recovery, APIs, automation, and PostgreSQL administration were deferred.

### Round 2: terminology and browse density

- Product-facing language was normalized to **Tables** in the old browse
  context; PostgreSQL is secondary rather than a badge on the primary list.
- Duplicate Import Values and New actions were removed from the top bar.
- Metrics became compact columns x records, for example 7 x 248, with accessible
  wording that reveals the order.
- This terminology decision survives as the rule that primary UI uses plain
  user concepts while technical PostgreSQL details are secondary.

## r002 — department-to-table hierarchy

### Round 1: peer organization

- Rejected Company and Departments wrappers because each visible level needs at
  least two meaningful peer examples.
- Operations and Finance became direct peers, each with multiple tables.
- Database/schema/collection were removed as navigation layers; schema.table
  remained subdued metadata.
- The selected department carried into old create/import/table routes.

### Round 2: grid simplification and overlay correction

- Removed the visible Draft badge from the new-row state.
- Removed all type, relation, storage, and constraint text below grid headers.
- Repaired a bug where ordinary clicks could open a blank navigation overlay.
  Only the explicit mobile nav trigger may open a backdrop; desktop keeps it
  closed.
- The old persistent left navigator is later superseded by r005, but label-only
  headers and no-unwanted-overlay behavior remain current.

## r003 — spreadsheet table canvas

| Round | Accepted decision |
| --- | --- |
| 1 | Replaced record form flow with A–Z coordinates, field-name row, row numbers, four sample records, blank editable rows, 1,000 logical row capacity, and bottom Add Rows. Read cells use output formats; no New record or Save record buttons. Named-header double-click configures a field. |
| 2 | Removed All records / Filter / Sort / Fields toolbar. Renamed Advanced PostgreSQL details to Advanced. Added type-matched editors: Select, Price, Switch, Date and time. |
| 3 | Editors use the currently configured Field and stay full-cell/edge-to-edge; empty header naming becomes an inline single-name input and defaults to Text. This round's persisted-editor detail is superseded by Round 5 Enter behavior. |
| 4 | Invalid committed values become spreadsheet tokens (#VALUE! or #ERROR!), raw value remains for correction, and a titled Error popover has no Fix action. Price becomes one unclipped full-cell input with an internal currency prefix. |
| 5 | Enter commits and restores output; Tab/click-away commit and Escape cancels. Unselected error cells have no border. Red row number plus Row not added popover explains PostgreSQL rejection. |
| 6 | Unnamed cells always use Text inputs and preserve leading zeros. Row errors become bullet points by failing column. Backspace/Delete clear, copy, and 100-step undo/redo were added. |
| 7 | Rows/columns can drag and use Alt+arrow alternatives. Error token, marker, left border, and title use error red, while reordering remains presentation-only. |
| 8 | Trailing unnamed columns may drag first; after drop every unnamed interior gap before the last named column is invalid. Only one field-header cell shows each gap error. Removed Columns from navigation. |
| 9 | Missing-column errors use a compact 16px title and a popover top-aligned to the invalid header. |
| 10 | The missing-column marker is an explicit small top-right triangle. |
| 11 | Restored sticky field-header positioning so an invalid header stays in the header row and cannot overlap the first record row. |
| 12 | Column-error popovers no longer auto-open after reorder. Selection/focus opens immediately; hover waits one second; active error stacking wins over adjacent headers. |
| 13 | Cell #ERROR! text is black regular rather than red/bold. Invalid unnamed headers show black #ERROR! on normal gray header fill with a red corner marker. |

### Current r003 rules to preserve

- Spreadsheet output at rest; typed edge-to-edge editor only while editing.
- Enter, Tab, click-away commit; Escape cancels.
- No buttons that represent each row as a saveable record form.
- Active errors are visible through spreadsheet conventions, not inline form
  copy. Red is used for the marker/popover hierarchy, not the at-rest error
  token text.
- Row-level rejection is distinct from a cell validation error.
- Reorder before validating interior header gaps. Do not block dragging empty
  trailing columns.
- No automatic error popover after layout changes.

## r004 — spreadsheet command surface

| Round | Accepted decision |
| --- | --- |
| Research pass | Added spreadsheet menus, formatting controls, and target-specific context menus without changing the r003 canvas. Formatting is presentation metadata, not PostgreSQL schema. |
| 1 | Added File/Edit/View/Format menu bar; selection-aware WYSIWYG toolbar; row, column, and cell menus; in-memory format history; view commands; guarded destructive confirmation. Removed top-bar Import. |
| 2 | Fixed context-menu layout shift. Replaced cycling color/border/alignment actions with choice popovers. Undo/Redo accurately disable when no history. Removed column-header overflow buttons; use right-click plus double-click configuration. |
| 3 | File became New, Open, Import, Make a copy, Version history/Changes, and Table settings. View gained Freeze. Format gained Sheets-like hierarchy. Size became minus/value/plus and Display format was removed from toolbar. Palette, border, alignment, and contextual actions were refined. |
| 4 | Main palette swatches reduced to 20px and Standard swatches to 22px. Border and alignment choice grids became icon-only with accessible labels. Conditional formatting and Alternating colors removed from Format; conditional formatting retained only in Fill palette. |
| 5 | Border picker corrected to a two-row spreadsheet placement grid with dotted guide edges, plus distinct border-color and border-style controls. |
| 6 | Border-placement glyphs reduced to 20px while retaining a 46px hit area. |

### Current r004 rules to preserve

- Menus and context menus float over, never move, grid geometry.
- Toolbar order and popover details are in the command-surface KB document.
- There is no visible column header action button.
- The only persistent primary menus are File, Edit, View, and Format. Do not
  add a broader Sheets-style menu set until explicitly scoped.
- Keep format controls visually familiar but do not misrepresent deferred
  theme, rotation, merge, conditional formatting, or persistence features.

## r005 — folder-first file explorer

| Round | Accepted decision |
| --- | --- |
| 1 | Replaced persistent left panel with a focused full-width shell. Browse became a folder-first explorer for Operations and Finance with scoped search plus list/grid view. Spreadsheet opens without sidebar. |
| 2 | Removed browse heading, explanatory copy, and root New table action. Acme Inc. became the compact root mark/crumb. Folder contents are Files and use file counts. Removed Files from spreadsheet breadcrumb. File title became inline renameable. |
| 3 | Added folder-only New file and Table settings panel. This temporary first New file route used a builder but is superseded by Round 10. Table settings became distinct from selected-column configuration. |
| 4 | Added Advanced lower_case PostgreSQL column name separate from spreadsheet label and migration warning. |
| 5 | Relation can target files across Operations and Finance. Established two independent templates: Field Relation picker label and Format Related record saved-cell label. |
| 6 | Reordered Relation form around Field then File then picker template then Format. File is searchable across all current files. Select editing shows a visible option menu. |
| 7 | Finalized exact relation order: Column name, Field Relation, File, relation-picker Display format, Format Related record, saved-cell Display format directly below Format. |
| 8 | Slimmed the old New file builder and added lower_case PostgreSQL table name to Table settings; its builder surface is later removed. |
| 9 | Removed remaining new-file column setup and card/chrome to avoid a partial configuration model; detailed configuration belongs in the sheet. |
| 10 | Removed create-table page entirely. New file, File New, and workflow routes open blank Untitled File directly. PostgreSQL table name derives from title until explicitly overridden. |
| 11 | Added Import beside New file in an open folder only. Root has neither action. No import-to-existing-file behavior was added. |
| 12 | Simplified import page by removing eyebrow/page title. Final step uses File name, Table name, Folder in that exact order. |
| 13 | Refined import spacing: balanced intro-copy vertical space, symmetric source-summary separation, and top margin before final PostgreSQL-source alert. |

### Current r005 rules to preserve

- Operations and Finance are schema folders inside the same database. Their
  files may relate across schemas through native PostgreSQL foreign keys.
- The root is deliberately minimal; folder actions are contextual.
- New is direct blank spreadsheet; Import is a separate new-file workflow.
- Import into an existing file is rejected/superseded.
- New-file column setup belongs in the grid and column panel only.
- File display name, folder, and PostgreSQL table identity are table-level
  concepts; column details belong in Column settings.
- Google Drive is only a restrained structural reference, never a visual or
  feature-copy instruction.

## r006 and r007 — saved views, ordering, and operations

### r006: gap-led surface draft

- Added visible saved-view and System activity concepts to answer Spec 00002's
  D-007 and D-010 gaps.
- Its isolated screens and incomplete copy-forward were not the final product
  graph. r007 supersedes those navigation choices.

### r007 Round 1: integrate with the main app

- Copied the complete r006 baseline before changing navigation.
- Attached saved views to the real spreadsheet, made System activity reachable
  from Browse and Table, and linked activity back to the affected file.
- Accepted URL and Phone as loose string fields with best-effort formatters and
  no silent stored-value rewrite.
- Accepted shared row order with real-time delivery when available, durable
  queued maintenance fallback, and a collision-safe hidden rank field rather
  than physical PostgreSQL row order.

### r007 Round 2: folder tabs and File-menu ownership

- Replaced the open-folder Files heading with Files and Views tabs. Saved views
  open their source tables in new browser tabs.
- Removed the persistent saved-view bar. File now owns Export, Views, and New
  view; Views provides Personal/Shared lists, a no-views state, and a creation
  dialog swap.
- Kept active-view context compact in the breadcrumb/title and kept the
  spreadsheet toolbar directly below the menubar.
- Made the Browse/Table System activity utility icon-only with an accessible
  name. System activity retained filters, job details, retry,
  acknowledgement, retention, and equal-height desktop cells.
- Approved defaults: owners/owning-role members may create Shared views
  directly; System activity stays discoverable with permission-filtered
  contents; acknowledged dead letters retain their audit record.

## Review and evidence boundary

The history draws from accepted review notes and browser feedback. Some later
rounds recorded static checks when the local in-app Browser URL policy blocked
a live route. Treat those rounds as approved creative decisions, but do not
claim production verification, persistence, or PostgreSQL mutation.

## Rebuild checklist

Before calling a reconstruction complete, verify all of the following:

- No persistent sidebar, create-table route, duplicate create/import actions, or
  table-screen Import top-bar button.
- The sample database shows Operations and Finance schema folders; schema views
  show Files/Views tabs plus authorized New file and Import actions.
- New file is blank Untitled File and derives its table name from title.
- Column settings contains separate Field, Format, constraints, Advanced, and
  the exact two-template Relation sequence.
- Input/output/edit/error/reorder behavior matches r003 current rules.
- File/Edit/View/Format and tool popovers match r004 current rules.
- File includes Export, Views, and New view in the accepted order and does not
  restore a persistent saved-view bar.
- Saved views are reachable from folder discovery and the source table; System
  activity is reachable from Browse and Table.
- Import creates a new file only and ends with File name, Table name, Folder.
- No Drive product surface or unsupported spreadsheet capability is added.
