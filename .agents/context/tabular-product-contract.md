# Tabular PostgreSQL-Native Product Contract

## Status

Accepted reusable product truth from Frozen research Spec 00001, 2026-07-31,
plus user-directed and verified Spec 00003 implementation-review corrections
promoted on 2026-08-04. Use this contract before the creative reconstruction
documents. It supersedes their older generic-spreadsheet, visual-only-folder,
role-bundle, formula, history, recovery, and extension assumptions.

## Product

Tabular is a production-oriented internal company application that makes real
PostgreSQL data feel like a spreadsheet. It centralizes operational data for
staff and governed AI access through the web UI and MCP plus a harness.

PostgreSQL is canonical wherever it has a native concept. Tabular adds only
spreadsheet interaction and application-owned behavior PostgreSQL does not
express. Mathesar is a conceptual baseline, not an implementation dependency.

## Hierarchy And Vocabulary

Primary navigation maps:

```text
server/connection → database → schema folder → table/view file
```

A file maps to a PostgreSQL table or view. A named header maps to a column; a
completed valid row maps to a record; a relation maps to a foreign key. A schema
folder is not merely a visual collection. Operations and Finance are example
peer schemas inside one database. Relations may cross schemas in that database,
but never cross database boundaries.

## Canonical And Application-Owned Data

PostgreSQL owns databases, schemas, tables, views, columns, rows, generated
columns, keys, constraints, foreign keys, roles, memberships, grants,
ownership, and RLS.

A versioned Tabular system schema in each database owns friendly labels,
field/editor and output-format metadata, saved views, persistent drafts, import
provenance, action journal, jobs, and outbox. Metadata binds to scoped live
objects through stable Tabular identities and catalog reconciliation; OIDs are
introspection hints rather than durable identity.

Permanent unstructured cells do not use a sidecar user-data table. An explicit
owner-authorized migration installs one collision-safe, Tabular-UI-hidden,
versioned `jsonb` column on each participating target table. Stable Tabular
column IDs key values inside it. Direct PostgreSQL clients can see this normal
column.

Unstructured cells support display, edit, copy, and export. They do not gain
structured sort, filter, relation, or constraint semantics until the user names
and transactionally promotes them into a real PostgreSQL column. A failed
promotion leaves the JSON values intact.

Typing beneath an ordinary trailing unnamed spreadsheet coordinate creates a
stable unnamed Tabular column-metadata record; it never infers a display name or
creates a physical PostgreSQL column. The entered value is retained in the
actor-owned row draft and, when that row is promotable, is stored under the
stable column ID in the target's Tabular-hidden `jsonb` field.

An explicit Insert column left/right command is different structural intent. It
creates a tab-local blank beside the selected persisted column; naming or typing
into that explicit insertion promotes it through the governed PostgreSQL
column-create boundary while preserving its requested side.

A newly created editable file installs a collision-safe, Tabular-UI-hidden
stable row identity through the governed owner/migrator boundary before the
blank spreadsheet opens. This lets its first logical row become a durable
record without inventing a visible primary key. It does not silently make an
existing keyless table writable; that table still needs an explicit authorized
stable-identity migration.

## Authority

For the first slice, an existing safe PostgreSQL `LOGIN` role is the human
identity registry. Tabular verifies its credentials through a short-lived
ordinary PostgreSQL connection, never reads or stores the password hash, binds
the verified database/role identities to a durable application session, and
re-resolves current role membership. PostgreSQL administrators own account
lifecycle; Tabular adds no password registry or self-sign-up. A future external
identity provider must map into this same application-identity boundary rather
than granting a role from claims or cookie content.

Actual memberships, grants, ownership, column privileges, and RLS are
authoritative. Tabular defines no fixed database-role bundles and never uses
owner, superuser, or `BYPASSRLS` authority to widen a caller.

Target `SELECT` implies ordinary Tabular metadata, the actor's own drafts, and
redacted activity currently visible to that actor. Sensitive records require
additional authority. Outside guests, anonymous users, and public links are
excluded from the first slice.

Administrators register existing servers and databases. Each database has a
separate pool and Tabular system schema. Native schema, table, column,
grant/revoke, and relation actions execute only when the effective role has the
required authority. Cluster, database, role, extension, and default-privilege
administration remain operator-owned.

## Grid, Draft, And Collaboration Contract

- Use bounded vertical virtualization with ordinary internal horizontal
  scrolling and logical selection independent of mounted DOM cells. Horizontal
  virtual DOM remains a measured later optimization, not a first-slice
  dependency.
- Use typed edge-to-edge editors, output formats at rest, stable row/column
  identities, accessible grid semantics, and deterministic keyboard focus. The
  visibly active cell owns focus after stable load, editor close, cancellation,
  and mounted-row/column replacement unless another control intentionally owns
  it.
- Keep body-cell, named-header, whole-column, row, and whole-header-row
  selections logically and visually distinct. Header presentation never turns
  a header into PostgreSQL record data.
- Treat paste, fill, clear, and multi-cell edit as one atomic domain action.
- Keep incomplete new rows and pending invalid values as persistent drafts;
  PostgreSQL constraints, triggers, grants, and RLS make the final decision.
- Save valid changed cells automatically on blur through the durable action
  boundary; retain only invalid or incomplete values as correctable drafts. Do
  not expose a manual Commit guardrail for ordinary valid edits.
- An explicitly inserted blank row is inert and tab-local until its first
  non-blank edit. It creates no stored draft or required-field error merely by
  being inserted, and clearing its last entered value removes the empty
  artifact.
- The first changed cell in a logical blank row creates a persistent draft with
  that row's Tabular-hidden rank. A draft at logical row 20 must reload at row
  20; rows 1 through 19 remain visual blank positions and must not become empty
  PostgreSQL records. Promotion inserts exactly one target record and carries
  the retained rank into the hidden shared-rank field.
- Use expected-version writes and explicit stale-conflict resolution; never
  silently overwrite.
- Provide 100-step current-session undo/redo for the actor's own actions with
  current authority and version rechecks.
- Keep durable replayable history, cross-user undo, CRDT collaboration,
  presence cursors, and targeted restore outside the first slice.
- Tables without a stable primary or composite key are read-only for existing
  row edits unless an owner approves a separate stable-identity migration.
- Row reordering is shared Tabular presentation state, not physical PostgreSQL
  row order. Publish committed moves to connected clients in real time when
  available and use durable queued maintenance when rank compaction or delivery
  cannot complete inline.
- An owner-authorized installation may store shared row position in a
  collision-safe, Tabular-UI-hidden rank column. `__tabular_row` is a logical
  name hint, not a physical-name guarantee; never adopt or overwrite a user
  column that already uses that name.

## Fields, Formats, Views, And Relations

Storage type, semantic field/editor, output format, and constraints are
independent axes. Use the accepted low-friction field/format registry; raw HTML,
FRUI `eval` formulas, rich content, attachments, and deeply nested field types
are not first-slice defaults.

Tabular validators are application metadata and input rules, not native
PostgreSQL constraints. Saving, changing, reordering, or removing validators
does not scan or mutate accepted rows and does not add target-table `CHECK`
constraints. Existing stored values that violate active validators render as
`#VALUE!` while their PostgreSQL values remain unchanged. Future invalid
Tabular inputs do not enter the database and remain correctable drafts. Direct
SQL can bypass this validator layer; violating values are surfaced when
Tabular reads them. Required, Unique, foreign keys, storage types/typmods, and
separately managed PostgreSQL constraints remain distinct native behavior.

URL and Phone fields accept entered values as strings without strict
application-level rejection. Best-effort formatters may improve their display
or link behavior but must not silently rewrite the stored string. Native
PostgreSQL constraints and triggers remain authoritative and may still reject a
value.

The default Price presentation is currency-neutral: comma-grouped with exactly
two decimal places and no hard-coded symbol. A currency symbol belongs to an
explicit configured output format, not the semantic field alone.

PostgreSQL generated columns support native deterministic same-row computed
values. Spreadsheet formula definitions, evaluation, compatibility, and
formula-aware paste belong to a later spec.

Saved views are Tabular metadata. Any current target `SELECT` holder may own a
private saved view. Only the table owner or an owning-role member may publish a
shared view. Explicit PostgreSQL view publication requires an SQL-compatible
definition, destination-schema authority, source privileges, and
security-invoker behavior.

Column order, visibility, filters, sorting, and cell presentation may be saved
in a private or shared view. Unsaved changes remain current-tab state. A shared
view is the explicit collaboration boundary for those presentation settings;
it does not change physical PostgreSQL column order.

Relations use native foreign keys between eligible ordinary or partitioned
tables in one database, including across schemas. Primary/unique and composite
keys, dependencies, grants/RLS, and existing referential actions remain
authoritative. New relations default to `NO ACTION`.

## Import, Export, Interfaces, And Operations

Import is one-time, new-table-only CSV, XLSX, or Google Sheets exact-value
ingestion. Formula cells become source-calculated/cached ordinary values.
Formatting, comments, notes, hyperlinks as active behavior, charts, macros, and
other workbook behavior are not recreated. Use preview, warnings, typed
staging, idempotent retry, source recheck, one transactional commit, recovery,
and pre-commit abandon.

First-slice export is CSV with headers for the current authorized grid result.
Broader formats belong to a later **Tabular Export and Interchange** spec.

The first interfaces are the Tabular web UI and governed MCP/harness over the
same capability and effective-role boundary. MCP provides bounded discovery and
reads plus explicitly harness-allowlisted structured mutations; it exposes no
arbitrary SQL/DDL by default.

MCP includes a versioned, caller-authorized `get_frontend_contract` tool. It
describes authorized PostgreSQL structure, Tabular presentation metadata,
supported filter/sort operators and limits, allowlisted operations, required
inputs, and expected-version rules. Metadata never grants authority.

The system schema holds a durable journal for Tabular-originated writes and
PostgreSQL-backed jobs/outbox with idempotency, safe claiming, capped retries,
visible dead letters, and administrator-selected retention. Operators configure
objectives and thresholds and receive logs, metrics, and admin state. There is
no contractual first-slice SLA.

The first-slice UI exposes permission-filtered System activity from the normal
explorer and table shells. It includes running/queued/attention/completed
filters, operation detail, dead-letter review/retry/acknowledgement, and
administrator-only retention controls. Acknowledgement preserves the auditable
record; it never deletes the failed operation history.

PostgreSQL operators own backup, restore, PITR, RPO, RTO, and PostgreSQL/pgAudit
retention. Tabular has no first-slice restore UI or recovery-objective policy.

## Deferred Surfaces

Public/general API, webhooks, automation, user code/plugins, marketplace, CLI,
desktop, public sharing, frontend generation/build/hosting/deployment,
Qdrant/vector indexing, non-CSV export, rich content/attachments, formula
compatibility, replayable history, targeted restore, and cross-database
relations require later approved specs.
