# Tabular PostgreSQL-Native Product Contract

## Status

Accepted reusable product truth from Frozen research Spec 00001, 2026-07-31.
Use this contract before the creative reconstruction documents. It supersedes
their older generic-spreadsheet, visual-only-folder, role-bundle, formula,
history, recovery, and extension assumptions.

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

## Authority

Internal authenticated users map to existing PostgreSQL roles. Actual
memberships, grants, ownership, column privileges, and RLS are authoritative.
Tabular defines no fixed database-role bundles and never uses owner, superuser,
or `BYPASSRLS` authority to widen a caller.

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

- Use a bounded two-axis virtualized grid with logical selection independent of
  mounted DOM cells.
- Use typed edge-to-edge editors, output formats at rest, stable row/column
  identities, accessible grid semantics, and deterministic keyboard focus.
- Treat paste, fill, clear, and multi-cell edit as one atomic domain action.
- Keep incomplete new rows and pending invalid values as persistent drafts;
  PostgreSQL constraints, triggers, grants, and RLS make the final decision.
- Use expected-version writes and explicit stale-conflict resolution; never
  silently overwrite.
- Provide 100-step current-session undo/redo for the actor's own actions with
  current authority and version rechecks.
- Keep durable replayable history, cross-user undo, CRDT collaboration,
  presence cursors, and targeted restore outside the first slice.
- Tables without a stable primary or composite key are read-only for existing
  row edits unless an owner approves a separate stable-identity migration.

## Fields, Formats, Views, And Relations

Storage type, semantic field/editor, output format, and constraints are
independent axes. Use the accepted low-friction field/format registry; raw HTML,
FRUI `eval` formulas, rich content, attachments, and deeply nested field types
are not first-slice defaults.

PostgreSQL generated columns support native deterministic same-row computed
values. Spreadsheet formula definitions, evaluation, compatibility, and
formula-aware paste belong to a later spec.

Saved views are Tabular metadata. Any current target `SELECT` holder may own a
private saved view. Only the table owner or an owning-role member may publish a
shared view. Explicit PostgreSQL view publication requires an SQL-compatible
definition, destination-schema authority, source privileges, and
security-invoker behavior.

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

PostgreSQL operators own backup, restore, PITR, RPO, RTO, and PostgreSQL/pgAudit
retention. Tabular has no first-slice restore UI or recovery-objective policy.

## Deferred Surfaces

Public/general API, webhooks, automation, user code/plugins, marketplace, CLI,
desktop, public sharing, frontend generation/build/hosting/deployment,
Qdrant/vector indexing, non-CSV export, rich content/attachments, formula
compatibility, replayable history, targeted restore, and cross-database
relations require later approved specs.
