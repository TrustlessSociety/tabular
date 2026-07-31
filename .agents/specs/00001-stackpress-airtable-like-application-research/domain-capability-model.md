# Domain And Stackpress Capability Model

Access date: 2026-07-24.

> Superseded direction: this file preserves the earlier generic-cell model.
> The current accepted target maps spreadsheets to real PostgreSQL tables.
> Load
> [PostgreSQL-Native Product Direction Findings](postgresql-native-product-direction-findings.md)
> before using this evidence.

This file completes R-006 and R-012 at the research level. The model is a
historical recommendation; use `proofs.md` for the completed current Proof
ledger.

## Semantic Model

| Concept | Required meaning | Important boundary |
| --- | --- | --- |
| Workspace | Tenant and membership boundary | Not a spreadsheet document |
| Workbook | Share, revision, import, recovery, and event boundary | Owns sheets; has a monotonic action sequence |
| Sheet | Ordered two-dimensional grid | Not a generated SQL table or department model |
| Row / Column | Stable identity plus separately mutable order | Display index is not identity |
| Cell | Sparse intersection with typed value, format, version, and provenance | Independently editable canonical unit |
| Formula | Original source, normalized form, compatibility state, cached/effective value, target result, and error | Not flattened into the value |
| Dependency | Directed formula/reference edge with affected-cell mapping | Versioned with formula semantics |
| Note | Cell-attached plain annotation | Distinct from a discussion |
| Comment thread / reply | Authored discussion, lifecycle state, source identity, placement evidence | May be unplaced after import |
| Saved view | Filter/sort/order/visibility/freeze/display metadata | Does not rewrite canonical cells |
| Action / revision | Atomic user intent, expected version, deltas, actor, and monotonic workbook sequence | Distinct from audit and schema revision |
| Audit event | Append-only security/operation evidence | Redacted; not user undo |
| Import job / source | Durable source identity, staging, report, commit, and provenance | One-time migration, not sync |
| Grant | Workspace/workbook capability assignment | Backend-enforced; filtered reads/publication |
| Outbox item | Post-commit notification/integration work | Never the canonical edit |
| Attachment reference | Safe metadata and object-store locator | Active attachment support is deferred |

The first spreadsheet slice should use formulas and sheet/cell references rather
than Airtable-style linked-record field types, lookups, or rollups. Those may be
added later only as explicit spreadsheet semantics or proved formula mappings.

## PostgreSQL Shape

Stable control and identity records may use generated Stackpress models where
their semantics are build-time known. The generic spreadsheet plane remains
application-owned PostgreSQL tables:

```text
workspace membership / role templates        generated control plane candidate

workbook, sheet, row_order, column_order      application data plane
cell, formula, dependency                     application data plane
note, comment_thread, comment_reply           application data plane
saved_view, workbook_grant                    application data plane
workbook_action, action_delta, audit_event    application data plane
import_job, import_stage, source_manifest     application data plane
outbox, snapshot, attachment_reference        application data plane
```

This reconciles the accepted generic-data constraint with Stackpress: Idea and
generated actions do not become the schema for user-authored sheets. P-001 must
still establish physical tables, indexes, cache thresholds, and revision cost.

## Command Boundary

Every mutation enters one application capability:

```text
actor + surface + capability + resource
+ commandId + idempotencyKey + expectedWorkbookRevision
+ validated payload
  -> permission and expanded-effect checks
  -> database transaction
  -> canonical records + action/delta + audit + outbox
  -> commit
  -> filtered invalidation/background work
```

Commands include workbook/sheet creation, cell/range edit, insert/delete/reorder,
format, formula, note/comment, view, grant, import, undo, and restore. Queries
include workspace/workbook lists, window reads, formula/reference data, comments,
history, import status, and admin audit. Each query applies resource filtering;
each command defines its atomicity and conflict contract.

## Stackpress Ownership

| Classification | Target responsibility | Evidence boundary |
| --- | --- | --- |
| Native Stackpress | Bootstrap/config, PostgreSQL adapter and transactions, session primitives, CSRF, named events, route/view rendering, trusted plugins, configured API/MCP adapters, generated admin for fixed models | Native capability does not imply target policy or spreadsheet behavior |
| Adapt Stackpress | Explicit deny-default session policy, workspace membership models, custom page handlers/views, window and batch events, caller context envelope, app-owned migration scripts | Application must supply authorization, payload, transaction, and response contracts |
| Application-owned | Generic workbook plane, formula engine, import pipeline, grid state, comments, revisions/undo, audit, outbox, jobs, snapshots, workbook grants, filtered realtime | No accepted Stackpress package owns these spreadsheet semantics |
| Framework gap requiring Proof or app abstraction | Cell-row scale, stable two-axis windowing, cross-surface auth parity, revision/recompute throughput, durable job adapter, browser snapshot minimization | Do not change Stackpress merely because the app needs an abstraction |

Accepted Stackpress context states that named events are an invocation protocol,
not automatic authorization or transactions; generated UI does not prove
accessibility; session access defaults to allow-all when empty; and generated
schema revisions are not record history. These are design constraints.

## Initial Architecture

```text
Custom React grid page
  -> page handler / typed application event
  -> capability + version + validation boundary
  -> PostgreSQL generic spreadsheet services
       -> canonical cell/action/audit/outbox transaction
       -> formula dependency/recompute service
       -> import and other durable jobs
  -> post-commit filtered invalidation
```

The page receives only a minimal browser-safe snapshot and then uses bounded
requests for grid data. SQL builders remain server-only. The application plugin
owns domain events and services; page/view code owns presentation; the database
adapter owns native PostgreSQL connection behavior.

## Invariants

1. PostgreSQL is canonical after cutover.
2. Stable IDs survive reorder, filtering, import, and future indexing.
3. No source formula, comment, unsupported feature, or import warning disappears
   silently.
4. Every write is capability-checked and version-aware.
5. Canonical state, action history, audit, and operator backups are distinct.
6. Side effects and realtime publication happen after commit.
7. Generated code is not the durable owner of user spreadsheet semantics.
8. Qdrant, public APIs, automation, anonymous sharing, and user code execution
   do not shape the first canonical schema.

## Historical Proof Dependencies

- P-001: physical PostgreSQL layout and workload thresholds;
- P-002: grid window/edit/clipboard/accessibility contract;
- P-003: formula semantics and engine/license boundary;
- P-004: conflicts, action history, undo, and reconstruction;
- P-005: deny-default cross-surface authorization;
- P-006: exact import/retry/report behavior.

R-020 later invalidated P-001, deferred P-003, added P-007, and reframed the
other candidates. P-002, P-004, P-005, P-006, and P-007 then passed their
bounded scopes. Use `proofs.md` for current dispositions.
