# Feature-To-Proof Matrix

## Coverage Rule

This inventory is based on the current Context reconstruction, not raw HTML
inference. Every row is indivisible for closeout: all listed sub-items need
fresh evidence or an explicit unavailable, deferred, failed, or superseded
disposition. `P-001` is the browser guidebook; `P-002` is the Stackpress/data
guidebook. `D-*` rows are accepted product-contract requirements that lack a
complete wireframe surface but must be reconciled before implementation.

## Explorer, Shell, And File Identity

| ID | Required feature or state | P-001 chapter | P-002 backing chapter |
| --- | --- | --- | --- |
| W-001 | Connection -> database -> schema-folder -> table/view-file hierarchy; Operations and Finance as peer schemas | Explorer | Catalog and authority |
| W-002 | Restrained full-width explorer shell; Acme Inc. root; database/schema breadcrumbs; no persistent sidebar or Drive-like global areas | Explorer | Authorized discovery |
| W-003 | Root and folder list/grid modes; identical content/actions; folder/file counts; edited time; technical path; columns x records; open affordance | Explorer | Catalog and metadata reads |
| W-004 | Scoped Search files filtering and current-collection no-results state | Explorer | Bounded authorized query |
| W-005 | New file and Import adjacent only in an authorized open schema folder; absent at connection/database levels | Explorer | Capability and effective-role checks |
| W-006 | Spreadsheet breadcrumb; folder return; Acme Inc. explorer route; no redundant Files crumb | Shell | Route and identity contract |
| W-007 | Responsive explorer wrapping and one-column cards without document overflow | Responsive | No data claim |
| W-008 | Direct blank Untitled File; zero records; 1,000 logical rows; no named columns; no create-table builder | New file | Authorized table/draft lifecycle |
| W-009 | Inline display-name edit; Enter/click-away commit; Escape cancel; display rename does not silently rename PostgreSQL | File identity | Metadata and DDL separation |
| W-010 | Derived lower_case table name; explicit Table-settings override survives later display-name edits | File identity | Identifier normalization and metadata |
| W-011 | Table settings panel with Display name, Folder, PostgreSQL table name; close/Cancel/Apply; mutually exclusive with Column settings | Panels | Metadata and authorized move/rename disposition |

## Grid, Editing, Validation, And Reordering

| ID | Required feature or state | P-001 chapter | P-002 backing chapter |
| --- | --- | --- | --- |
| W-012 | A-Z coordinate band; label-only field headers; numbered sticky rows; bounded window over 1,000 logical rows; Add Rows and status counts | Grid | Windowed query and logical capacity |
| W-013 | Cell, range, row, and column selection; Shift extension; selection remains visible while overlays act | Grid | Selection/action target contract |
| W-014 | Arrow navigation; Enter/F2/printable edit; Delete clear; copy; undo/redo; Alt reorder; Shift+F10 target menu | Grid | Atomic action envelope |
| W-015 | Edge-to-edge typed editors for Text, Number, Email, URL, Phone, Relation, Select, Price, Switch, Date/time; permissive URL/Phone strings with best-effort non-mutating formatters; visible Select choices; searchable relation picker; unclipped currency prefix; accessible switch | Fields | Field registry and validation |
| W-016 | Raw edit state; Enter/Tab/click-away commit; Escape cancel; output Format at rest; invalid raw value retained for correction | Editing | Draft/commit/validation transaction |
| W-017 | Unnamed columns default Text; preserve leading zeroes; inline header naming only; named header opens settings | Columns | Text-column creation and stable metadata |
| W-018 | Plain, linked/clipped, related-record, badge, currency, Yes/No, and date/time output examples without changing raw value | Formats | Format metadata separated from storage |
| W-019 | Positive Add Rows capacity change; record/logical-row/named-column status; adding capacity creates no record | Grid | No-write capacity contract |
| W-020 | Cut/copy/paste/clear without shifting cell alignment; atomic multi-cell action where supported; clipboard type boundary explicit | Actions | Transactional batch mutation |
| W-021 | 100-step current-session undo/redo; disabled fresh state; value/error/row validity restored together; permission/version recheck | Actions | Journal, version, and authority recheck |
| W-022 | Cell #VALUE!/#ERROR! at rest; black token; red corner; raw value retained; immediate focus and delayed-hover Error popover; no Fix action | Validation | Error translation and draft state |
| W-023 | Rejected/incomplete row marker; Row not added popover; one bullet per failing column; no invalid target-table insert | Validation | Persistent draft and PostgreSQL rejection |
| W-024 | Post-reorder unnamed interior-gap errors; header-only marker/token; focus/delayed-hover popover; no automatic opening; independent correction | Reordering | Layout metadata validation |
| W-025 | Drag and Alt+arrow row/column reorder; trailing empty columns movable; configuration and values move together; shared hidden-rank row order with real-time/queued delivery; column order owned by current tab or saved view; no physical PostgreSQL-order claim | Reordering | Presentation ownership disposition |

## Column Configuration And Relations

| ID | Required feature or state | P-001 chapter | P-002 backing chapter |
| --- | --- | --- | --- |
| W-026 | Independent label, Field/editor, output Format, constraints, and Advanced PostgreSQL axes | Columns | Metadata registry and DDL boundary |
| W-027 | Named-header double-click and Configure column open one right panel; close/Cancel/Apply; body scroll and stable grid geometry | Columns | Temporary versus committed metadata |
| W-028 | Standard panel order and field-specific settings; changing Field refreshes current output/editor without stale styling | Columns | Registry validation and migration plan |
| W-029 | Select option registry; visible edit-time choice menu; Processing, Ready, Shipped, Cancelled example | Fields | Option metadata and value validation |
| W-030 | Required and Unique values as validity constraints, not formatting | Columns | Native constraint and draft mapping |
| W-031 | Advanced label; separate normalized PostgreSQL column name; storage/default details; cast/rename/review warning | Columns | Safe identifier, DDL, rollback boundary |
| W-032 | Relation form exact order; authorized same-database cross-schema File picker; picker Display format; Related record Format; independent saved-cell Display format | Relations | Native FK, eligibility, templates, NO ACTION |

## Menus, Toolbar, Formatting, And Context Actions

| ID | Required feature or state | P-001 chapter | P-002 backing chapter |
| --- | --- | --- | --- |
| W-033 | Exactly File/Edit/View/Format; one floating menu; pointer and full keyboard navigation; Escape/click-away/focus restore; viewport clamp | Menus | No data claim except invoked actions |
| W-034 | File: New, Open, Import, Make a copy, Version history/Changes, Table settings; representative/deferred states honest; no duplicate header actions | Menus | Route/action/deferred dispositions |
| W-035 | Edit: Undo, Redo, Cut, Copy, Paste, Clear, Select all, Find; fresh disabled states; no shift-left/up deletion | Menus | Action envelope and no-alignment-break rule |
| W-036 | View: Show, Freeze row/column choices, Zoom choices, Full screen; view-only ownership explicit | Menus | Session/persistence disposition |
| W-037 | Format hierarchy for Theme, Number, Text, Alignment, Wrapping, Rotation, Smart chips, Font size, Merge, Clear formatting; deferred items unavailable; conditional formatting only in Fill route | Menus | Presentation metadata/no schema mutation |
| W-038 | Toolbar exact order; active/mixed/disabled feedback; narrow More behavior; no Display format control | Toolbar | Selection presentation state |
| W-039 | Minus/value/plus font size and 10/12/14/16/18 choices; undoable presentation action | Toolbar | Presentation action history |
| W-040 | Text/fill palettes with Reset, main/Standard grids, Custom, checked/accessibility state; Fill may show representative conditional route | Toolbar | Presentation metadata disposition |
| W-041 | Two-row ten-choice icon-only border placement; guide edges; color; six visual styles; 46px target and compact glyph | Toolbar | Presentation metadata disposition |
| W-042 | Icon-only horizontal and vertical alignment choices; wrap/clip/overflow; tooltips/labels; selection awareness | Toolbar | Presentation metadata disposition |
| W-043 | Cell menu: cut/copy/paste, edit, clear, represented row insertion, compatible presentation actions | Context actions | Targeted atomic actions |
| W-044 | Row menu: value actions, insert above/below, clear, move, resize, separated confirmed delete | Context actions | Row mutation/confirmation contract |
| W-045 | Column menu exact action groups: value actions, insert, rename/configure, sort, clear, move, resize, confirmed delete | Context actions | DDL/query/presentation action routing |
| W-046 | Menus/popovers/panels never shift headers, rows, or columns; ordinary click opens no unrelated overlay | Overlays | No data claim |

## Import, Responsive Behavior, And Accessibility

| ID | Required feature or state | P-001 chapter | P-002 backing chapter |
| --- | --- | --- | --- |
| W-047 | Focused folder-aware import shell; no large duplicate heading; three steps: Choose source, Preview values, Import | Import | Import job state machine |
| W-048 | CSV/XLSX/Google Sheets choices; one-time language; selected source summary, size/rows/columns, Choose file | Import | Source adapter and fingerprint contract |
| W-049 | Values-only warning; formula/format/comment/note/workbook behavior not recreated | Import | Exact-value extraction and provenance |
| W-050 | Preview sample, inferred fields, mappings, warnings, Back/revise path, no commit before review | Import | Typed staging and adjudication |
| W-051 | Ready-to-import identity order: File name, Table name, Folder; summary table; spaced PostgreSQL-source alert | Import | Transactional identity and target schema |
| W-052 | Import progress then new-file route; no existing-file mutation; Cancel/abandon and retry outcomes visible | Import | Idempotent commit/recovery/abandon |
| W-053 | Desktop and narrow shell/grid/import behavior; grid owns horizontal scroll; no document-level overflow | Responsive | Bounded payload/query |
| W-054 | Accessible grid row/column counts and indices; deterministic active focus; logical selection independent of mounted DOM | Accessibility | Stable query and identity contract |
| W-055 | Accessible names/tooltips for icon-only controls; menubar/menu semantics; target-correct keyboard context menus | Accessibility | Capability/action parity |
| W-056 | Error/tool/menu/submenu/context overlays stack and clamp; hover delay; focus restoration; no geometry regression | Accessibility | No data claim |
| W-057 | Compact grayscale visual language; neutral type and dividers; modest blue focus; red only for validation hierarchy; low-elevation small-radius controls | Integrated review | No data claim |
| W-058 | Negative guardrails remain absent: persistent sidebar, create-table route, record-form save controls, header overflow buttons, duplicate New/Import/Save, global Drive features, unsupported formula/rich-workbook claims | Integrated review | Route/capability absence audit |

## Product-Contract Features Without Complete Wireframe Surfaces

| ID | Required implementation-discovery feature | P-001 disposition | P-002 chapter |
| --- | --- | --- | --- |
| D-001 | Existing server/database registration, separate database boundary, catalog introspection, tables and read-only views | Minimal discovery states | Catalog/system schema |
| D-002 | Versioned Tabular system schema for metadata, drafts, saved views, journal, jobs, outbox, provenance | Visible states where applicable | System schema and migrations |
| D-003 | Stable object identities and schema-drift reconciliation; OIDs not durable identity | Error/reload states | Catalog reconciliation |
| D-004 | Owner-installed hidden per-row JSON column; unstructured edit/copy/export; transactional real-column promotion | Grid states | Unstructured promotion |
| D-005 | Existing roles, memberships, grants, ownership, column privileges, RLS, redacted activity; no fixed role bundles or authority widening | Denied/filtered states | Identity and capabilities |
| D-006 | Stable-key editability; absent-key existing rows read-only; expected-version conflicts | Read-only/conflict states | Query and concurrency |
| D-007 | Private/shared saved views, filters/sorts/presentation, folder Files/Views discovery, File-menu list/create/empty states, new-tab opening, owner publication, security-invoker PostgreSQL view boundary | Accepted r007 saved-view design | Saved views |
| D-008 | Native generated columns and same-database foreign keys; composite keys and referential dependencies | Field/relation states | DDL and relations |
| D-009 | Current-authorized-result CSV export with headers | Export visible route/state | Export capability |
| D-010 | Durable journal, post-commit outbox, idempotent jobs, safe claiming, capped retry, permission-filtered System activity, visible dead letters/retry/acknowledgement, administrator retention | Accepted r007 activity design | Jobs/outbox/admin |
| D-011 | Governed MCP/harness parity and versioned caller-authorized `get_frontend_contract`; no arbitrary SQL/DDL | No full MCP UI required | MCP adapters and capability parity |
| D-012 | Explicit PGlite-to-production translation for PostgreSQL server pools, role reset, network identity, external DDL races, scale, operations, and native assistive technology | Review report | Production translation ledger |

## Post-Proof Atomic Closeout

`Demonstrated` means executable and/or rendered evidence met the row's difficult
contract. `Guide` means the boundary and production ownership are sufficiently
explicit for later implementation. `Blocking` means one or more listed
sub-items would still require guessing. `Target validation` means architecture
is clear but must be re-proved on the production target.

| ID | Disposition | Evidence or unresolved sub-item |
| --- | --- | --- |
| W-001 | Demonstrated | Explorer hierarchy + catalog discovery |
| W-002 | Demonstrated | Desktop explorer review |
| W-003 | Guide | List/grid source, shared file query, counts |
| W-004 | Guide | Scoped search/no-result implementation |
| W-005 | Demonstrated | Root/folder action visibility review |
| W-006 | Demonstrated | Sheet breadcrumb and route review |
| W-007 | Demonstrated | Responsive CSS; no document overflow |
| W-008 | Guide | Transactional blank file + 1,000 logical rows |
| W-009 | Guide | Inline rename lifecycle and identity separation |
| W-010 | Demonstrated | Identifier/override service checks |
| W-011 | Guide | Table panel and exclusive overlay ownership |
| W-012 | Demonstrated | Two-band grid, 40-row window, logical capacity |
| W-013 | Demonstrated | R-003 stable-ID cell/range/row/column selection, Shift-compatible renderer behavior, and virtual-window projection |
| W-014 | Guide | Keyboard edit/nav/reorder/context action boundaries |
| W-015 | Guide + accepted policy | Field/editor states demonstrated; r007 accepts loose URL/Phone strings, best-effort non-mutating formatters, and authoritative PostgreSQL rejection |
| W-016 | Demonstrated | Raw invalid value retained; canonical row unchanged |
| W-017 | Guide | Text-first future columns and header naming |
| W-018 | Guide | Independent rest-state format mapping |
| W-019 | Demonstrated | Add Rows changes capacity only |
| W-020 | Demonstrated with prior evidence | R-003 persists one aligned PGlite target plan; Frozen P-002 proves one atomic canonical batch transaction |
| W-021 | Demonstrated with prior evidence | P-001 100-step bound and disabled states + Frozen P-004 authority/version undo |
| W-022 | Demonstrated | Error token, popover, raw draft, status message |
| W-023 | Guide | Persistent incomplete-row draft and error list |
| W-024 | Guide | Interior-gap detection and error ownership |
| W-025 | Guide + accepted policy/design | Shared row rank uses real-time delivery with queued maintenance; column/presentation order persists only through private/shared saved-view ownership |
| W-026 | Demonstrated | Independent field/format/constraint/advanced axes |
| W-027 | Demonstrated | Right panel rendered without grid shift |
| W-028 | Guide | Field-specific refresh and migration separation |
| W-029 | Guide | Select registry and visible choices |
| W-030 | Demonstrated with prior evidence | P-001 controls + Frozen P-007 transactional constraint/DDL rollback |
| W-031 | Guide | Normalized identity and migration warning |
| W-032 | Demonstrated | Dual relation templates + native FK |
| W-033 | Demonstrated | Floating pointer/keyboard menu and clamp |
| W-034 | Guide | Representative/deferred commands are honest |
| W-035 | Guide | Exact inventory and disabled states rendered; clipboard/select/find production bindings remain explicit adapter work |
| W-036 | Demonstrated | Show, exact Freeze choices, Zoom choices, and Full screen hierarchy rendered |
| W-037 | Guide | Nested Format hierarchy rendered; deferred items remain honestly unavailable |
| W-038 | Demonstrated | R-003 renders active, disabled, and mixed range toolbar state; narrow More state retained |
| W-039 | Demonstrated | Minus/value/plus, exact size choices, and bounded presentation history |
| W-040 | Demonstrated | Reset, Main, Standard, Custom, checked state, and Fill conditional route rendered |
| W-041 | Demonstrated | Two-row ten-placement border grid, 46px targets, color, and six styles rendered |
| W-042 | Guide | Named alignment/wrapping choices |
| W-043 | Guide | Target-specific cell menu boundary |
| W-044 | Guide | Row groups and destructive confirmation boundary |
| W-045 | Guide | Column groups, move/configure, confirmation boundary |
| W-046 | Demonstrated | Error/panel/context overlays preserve grid geometry |
| W-047 | Demonstrated | Three-step folder-aware import shell |
| W-048 | Guide | Source choices/fingerprint; live adapters deferred |
| W-049 | Demonstrated | Values-only fidelity warning |
| W-050 | Demonstrated | Preview, inference, warning, Back path |
| W-051 | Demonstrated | Identity order and summary |
| W-052 | Demonstrated with prior evidence | P-001 visible progress/failure/retry/changed-source/abandon + Frozen P-006 recovery transaction |
| W-053 | Demonstrated | 390px review; internal-only grid overflow |
| W-054 | Demonstrated with target validation | R-003 retains 2,697 logical cells with an unmounted anchor, after renderer reset, and at 390px; native AT remains a production recheck |
| W-055 | Demonstrated | Names, semantics, mouse/keyboard target menu |
| W-056 | Demonstrated | Error/menu/panel clamp and focus behavior |
| W-057 | Demonstrated | Grayscale integrated visual review |
| W-058 | Guide | Negative capability/route inventory preserved |
| D-001 | Guide | Catalog lane and read-only identity policy |
| D-002 | Demonstrated | Transactional v1-to-v2 migration, forced rollback, and idempotent re-entry |
| D-003 | Demonstrated with prior evidence | P-002 stable ID/rename drift + Frozen P-007 rename/drop/type reconciliation |
| D-004 | Demonstrated | Collision-safe hidden JSON install, edit/copy/export, failed rollback, and promotion |
| D-005 | Guide with target validation | Owning-role publication, deny-default, grants/RLS, redaction; production identity recheck |
| D-006 | Demonstrated with prior evidence | Single/no-key and expected-version checks + Frozen P-007 composite-key proof |
| D-007 | Guide + accepted visible design | Compiler/publication/security-invoker backing plus r007 Files/Views discovery, File-menu lists/empty/create, new-tab state, and owner/editor denial |
| D-008 | Demonstrated with prior evidence | Generated/cross-schema FK fixture + Frozen P-007 composite/dependency proof |
| D-009 | Demonstrated | CSV uses the same caller-authorized filtered/sorted query as the grid read |
| D-010 | Guide + accepted visible design | Job/outbox backing plus r007 permission-filtered metrics/tabs, queued work, detail, dead-letter retry/acknowledgement, and retention |
| D-011 | Guide with target validation | Structured Page/MCP parity and arbitrary SQL/DDL denial; production identity remains a recheck |
| D-012 | Target validation | Eight explicit PGlite-to-production rechecks |
