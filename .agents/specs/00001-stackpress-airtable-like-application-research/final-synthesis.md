# Final Research Synthesis

Status: Accepted research closeout.

Access date: 2026-07-31.

## Outcome

The target is a production-oriented internal, spreadsheet-friendly PostgreSQL
application built with Stackpress. It follows Mathesar's broad product posture:
real PostgreSQL objects remain canonical, while Tabular adds a friendlier grid,
semantic fields and formats, persistent drafts, saved views, imports,
unstructured cells, governed MCP, and application operations.

The initial Airtable-like generic workbook/sheet/cell architecture is rejected.
Creating a file creates or exposes a real table; named headers are columns;
completed rows are records; PostgreSQL generated columns provide native
same-row computed values; relations are foreign keys.

## Accepted Architecture

```text
Internal identity
  → mapped PostgreSQL role
  → shared capability and effective-role boundary
      → Tabular web UI
      → governed MCP plus harness

Existing PostgreSQL database
  → native schemas, tables/views, columns, rows, keys, constraints, grants, RLS
  → optional owner-installed per-row Tabular jsonb for unstructured cells
  → versioned Tabular system schema
      metadata, saved views, drafts, action journal, jobs, outbox
```

Each database has its own connection pool and Tabular system schema. Dynamic
runtime tables do not generate Stackpress Idea models or clients. Application
code uses catalog introspection, schema-qualified SQL, explicit DDL, and
transactional writes.

## Accepted Product Boundary

- Explorer: `server/connection → database → schema folder → table/view file`.
- Grid: bounded two-axis virtualization, logical selection, typed editors,
  accessible keyboard/focus behavior, rich clipboard, atomic batch actions.
- Fields/formats: the accepted low-friction semantic registry with storage,
  editor, output format, and constraints kept independent.
- Drafts: incomplete rows remain in the Tabular schema until PostgreSQL accepts
  a real insert or update.
- Unstructured cells: a versioned, UI-hidden per-row PostgreSQL `jsonb` column
  keyed by stable Tabular column identities; explicit promotion creates a real
  column.
- Concurrency/history: expected versions, visible conflicts, atomic paste,
  durable action journal, and 100-step current-session undo/redo.
- Import: one-time exact-value CSV/XLSX/Google Sheets import into a new table,
  with provenance, preview, warnings, retry, recovery, and abandon.
- Export: authorized current-grid CSV only.
- Views: private Tabular saved views by default; owner-published shared views;
  explicit security-invoker PostgreSQL view publication when compatible.
- Interfaces: web UI and governed MCP/harness, including the versioned
  `get_frontend_contract` meta tool.
- Operations: PostgreSQL-backed jobs/outbox, idempotency, retries, dead letters,
  operator-selected retention/objectives, structured logs, metrics, and admin
  state.

## Native Authority Boundary

PostgreSQL roles, memberships, ownership, grants, column privileges, and RLS
are authoritative. Tabular adds no fixed database-role bundles and cannot widen
access. Schema/table/column/grant/revoke actions execute only with effective
native authority. Internal authenticated staff are the first audience; public
or anonymous access is deferred.

PostgreSQL operators retain server, database, role, extension, default
privilege, backup, restore, PITR, RPO, RTO, and PostgreSQL/pgAudit retention
responsibilities.

## Proof Disposition

| Proof | Final disposition |
| --- | --- |
| P-001 generic cell store | Invalidated by the real-table direction |
| P-002 grid/query/edit contract | Proved within its database, browser, and accessibility-tree limits |
| P-003 formula compatibility | Deferred to a later formula spec |
| P-004 concurrency/revision boundary | Proved |
| P-005 cross-surface authorization | Proved |
| P-006 import transaction/recovery | Proved |
| P-007 native tables/metadata/drafts | Proved within its PGlite/PostgreSQL 17.5 limit |

Implementation must still verify PostgreSQL 18 server pools, external DDL
races, large-schema/grid performance, and native VoiceOver behavior. The Proofs
do not authorize production code.

## Retained And Rejected Patterns

| Pattern | Disposition |
| --- | --- |
| Real PostgreSQL tables plus separate UI metadata | Adopt |
| Native roles/grants/RLS and effective-role execution | Adopt |
| Stable metadata IDs reconciled against live catalogs | Adopt |
| Saved views separate from canonical rows | Adopt |
| Persistent draft patches and transactional promotion | Adopt |
| Windowed grid and logical selection | Adopt |
| Command/action envelope plus post-commit outbox | Adopt |
| Per-row bounded JSON for unstructured cells | Adopt |
| Generic canonical cell/EAV store | Reject |
| Generated model/client per runtime table | Reject |
| Permanent metadata-sidecar user-data plane | Reject |
| Fixed Tabular database-role bundles | Reject |
| Arbitrary SQL/DDL MCP | Reject for first slice |
| User-authored in-process extensions | Reject for first slice |

## Deferred Work

Separate later specs own formula compatibility; rich content and attachments;
broader export/interchange; frontend generation and delivery; durable replayable
history and targeted restore; public/integration/automation surfaces; and
Qdrant/vector indexing.

## Handoff

The research, applicable Proofs, product-policy grill, context-promotion review,
and replacement discovery handoff are complete. The Frozen package authorizes
a later implementation-spec planning pass, not implementation itself.

Scaffolding remains blocked until the user supplies app name, package name,
brand name, and development port and approves the separate implementation spec.
