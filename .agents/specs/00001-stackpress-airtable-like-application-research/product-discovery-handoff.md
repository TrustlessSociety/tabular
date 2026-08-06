# Product Discovery Handoff

Status: Accepted product boundary; implementation-spec ready; scaffold values
remain user-owned.

Access date: 2026-07-31.

This is the current `stackpress-app-discovery` handoff. It supersedes the
earlier generic workbook/sheet/cell brief and does not authorize scaffolding,
schema authoring, plugin work, or production implementation.

## App Summary And Project Shape

Tabular is a production-oriented internal product that gives company staff a
spreadsheet-friendly interface over real PostgreSQL databases. It is a
friendlier Mathesar-like hybrid: PostgreSQL remains canonical wherever it has a
native concept, while Tabular owns spreadsheet interaction and application
metadata that PostgreSQL does not express.

The product centralizes company data so staff and governed AI clients can use
the same authorized data through the web UI or MCP plus a harness. It is not
Airtable parity, a public collaboration service, a general PostgreSQL
administration console, or a department-specific generated application.

## Audience

- Authenticated internal company staff who browse, create, import, configure,
  view, and edit authorized data.
- Table owners and owning-role members who publish shared views or authorize
  schema changes.
- Tabular administrators who register infrastructure, map identities to
  existing PostgreSQL roles, and operate application metadata and jobs.
- PostgreSQL operators who retain control of servers, databases, roles,
  extensions, backup, restore, PITR, RPO, RTO, and audit retention.

Outside guests, anonymous users, and public links are excluded.

## Canonical Domain

PostgreSQL owns server/connection, database, schema, table, view, column, row,
constraint, generated column, key, foreign key, role, membership, grant,
ownership, and RLS semantics.

Tabular owns friendly labels, field/editor choices, output formats, saved-view
presentation, persistent drafts, import provenance, action journal, jobs,
outbox, and stable metadata identities. It does not generate a Stackpress Idea
model or client for each runtime table.

Permanent unstructured cells use an explicitly installed, owner-authorized,
Tabular-UI-hidden `jsonb` column on each target row. Stable Tabular column IDs
key the values. Unstructured cells support display, edit, copy, and export but
not structured sort, filter, relation, or constraint semantics until
transactionally promoted into a real PostgreSQL column.

## Complete First Slice

1. Register existing PostgreSQL servers and databases; create a separate pool
   and versioned Tabular system schema in each database.
2. Map internal identities to existing PostgreSQL roles and execute through
   their effective native authority.
3. Browse `server/connection → database → schema folder → table/view file`.
4. Open and introspect existing tables and views without converting them into a
   proprietary data model.
5. Create schemas, tables, columns, generated columns, grants, revokes, and
   native foreign-key relations only when the effective role has authority.
6. Provide the approved file-first spreadsheet grid, typed editing,
   virtualization, keyboard/accessibility contract, clipboard, atomic paste,
   filtering, sorting, and saved views.
7. Keep incomplete new rows and pending edits as persistent drafts; promote
   only through PostgreSQL validation, constraints, triggers, grants, and RLS.
8. Use expected-version writes, visible conflicts, atomic multi-cell actions,
   and 100-step current-session undo/redo.
9. Import exact values from CSV, XLSX, or Google Sheets into a new table through
   preview, warnings, staging, retry, recovery, and abandon.
10. Export the current authorized grid result as CSV.
11. Maintain Tabular metadata, drafts, action journal, and PostgreSQL-backed
    jobs/outbox in the system schema with operator-selected retention.
12. Expose the web UI and governed MCP/harness over the same capability layer.
13. Provide a versioned, caller-authorized `get_frontend_contract` MCP tool
    describing PostgreSQL structure, Tabular presentation, supported query
    operators, limits, allowlisted operations, and concurrency requirements.

## Main Flows

### Browse And Open

Select connection → database → schema folder → authorized table/view file →
load introspected structure, authorized rows, Tabular metadata, and saved view.

### Create And Configure

Open a schema folder → New file → blank grid → name headers → create Text
columns → configure field, format, constraints, advanced PostgreSQL details, or
relations → commit only authorized DDL.

### Edit And Draft

Select or paste cells → edit through the semantic field → validate locally →
save a persistent draft when incomplete → recheck authority and expected
version → execute one PostgreSQL transaction → journal after success or display
cell/row errors after rejection.

### Use Unstructured Cells

Enter values outside defined columns → store them in the target row's installed
Tabular `jsonb` column → render through stable metadata identities → optionally
name and transactionally promote one into a real PostgreSQL column.

### Import And Export

Choose CSV/XLSX/Google Sheets → extract exact typed values and provenance →
preview blockers/warnings → commit one new table or abandon → open the file.
Export only the currently authorized grid result as CSV.

### MCP And Frontend Contract

Discover authorized resources → request the frontend contract → use governed
read tools → perform only explicitly harness-allowlisted structured mutations
through the same validation, concurrency, and journal path as the web UI.

## Auth And Roles

Actual PostgreSQL roles, memberships, grants, ownership, column privileges, and
RLS are canonical. Tabular defines no fixed database-role bundles and never
uses owner, superuser, or `BYPASSRLS` authority to widen a caller.

Target `SELECT` implies ordinary Tabular metadata, the actor's own drafts, and
redacted activity currently visible to that actor. Sensitive metadata requires
additional authority. Internal authentication is required on every surface.

## Admin And Operator Responsibilities

Tabular administrators register existing infrastructure, map identities,
manage application metadata migrations, configure job objectives and retention,
and inspect logs, metrics, job state, failures, and dead letters.

PostgreSQL operators exclusively own cluster/database/role/extension/default
privilege administration, backup, restore, PITR, recovery objectives, and
PostgreSQL/pgAudit retention.

## Custom Runtime And Page Signals

Application-owned runtime work includes catalog introspection, safe dynamic SQL
and DDL, schema-drift reconciliation, field/format registries, the accessible
grid, drafts, unstructured JSON cells, constraint-to-cell translation, saved
views, import jobs, action journal, concurrency, outbox, and governed MCP.

Handwritten surfaces are the hierarchy explorer, focused spreadsheet, Table
settings, Column settings, import wizard/report, saved-view controls, job/admin
state, and MCP adapters. Generated Stackpress surfaces apply only to fixed,
safe control records. Trusted deploy-time Stackpress plugins remain reviewed
application code.

## Explicit Exclusions

- Import-to-existing-table, ongoing Google Sheets sync, spreadsheet formula
  evaluation, and rich workbook behavior.
- Non-CSV export; broader formats belong to **Tabular Export and Interchange**.
- Rich content, attachments, replayable/cross-user history, real-time CRDT
  collaboration, targeted restore, and cross-database relations.
- Public/general API, webhooks, automation, user code/plugins, marketplace,
  CLI, desktop, anonymous/public sharing, and arbitrary SQL/DDL MCP.
- Frontend code generation/build/hosting/deployment, Qdrant, embeddings, and
  vector search.

## Scaffold Values And Gate

`Tabular` is the accepted project vocabulary, but the scaffold app name,
package name, brand name, and development port remain explicit user-owned
choices under G-020. The repository folder name is not approval.

The research and discovery boundary is complete. Before any scaffold:

1. create and approve a separate implementation spec;
2. collect the four scaffold values;
3. route implementation through the Stackpress coordinator, scaffold, Idea,
   plugin, page/view, and verification skills as applicable.
