# Task 00005: Implement File, Column, Relation, And DDL Lifecycles

## Task Summary

Implement the PostgreSQL-backed file/table, column, relationship, hidden-field,
and owner-confirmed DDL workflows consumed by later UI plugins.

Status: `verified`; depends on verified Task 00004.

## Implementation Steps

1. Create and register `plugins/files/plugin.ts`; keep DDL workflows in
   `events/` and identifiers, metadata, drift, and migration helpers in `helpers/`.
2. Implement blank file/table creation within the accepted connection/database/
   schema-folder hierarchy and preserve display versus physical names.
3. Implement table/column metadata, constraints, defaults, generated columns,
   storage types, formats, and explicit owner-confirmed schema changes.
4. Implement same-database native foreign keys, including cross-schema targets,
   eligibility rules, stable/composite keys, and read-only cases.
5. Implement collision-safe Tabular-hidden JSON and shared-rank fields; never
   adopt or overwrite a coincidentally named user column.
6. Implement transactional JSON-to-column promotion and retain JSON on failure.
7. Route migrator-only work through the Task 00002 service rather than granting
   elevated authority to a request transaction.

## Verification Steps

1. Test safe/unsafe names, collisions, permission denials, concurrent changes,
   and display-name independence.
2. Test constraint/default/generated-column and foreign-key success/failure,
   including cross-schema, composite, absent-key, and read-only cases.
3. Test hidden-field installation, collision refusal, shared-rank ownership,
   successful promotion, forced rollback, and JSON retention.
4. Verify DDL/version records remain transactional and caller roles are never
   widened or reused as migrator authority.

## Acceptance Steps

None. Visible file and column behavior is exercised in Tasks 00007 and 00008.

## Implementation Notes

Started 2026-08-01 after Task 00004 passed the full repository verifier, its
PostgreSQL 18 capability/draft/range/reversal suite, and three independent
specialist reviews. PostgreSQL is canonical; Tabular metadata never substitutes
for live catalog identity or database constraints. Request-authorized
transactions must remain distinct from migrator-only owner DDL authority, and
Task 00005 must preserve the stable catalog and action-kernel boundaries already
proved by Tasks 00003 and 00004.

Completed the `tabular.files` plugin with structured plan/confirm/apply DDL,
short-lived confirmations and immutable replay, locked identity/mapping/role
generations, final live native-role rechecks, deterministic owner switching in
the migrator process, full transactional reconciliation, metadata versions, and
managed-constraint cleanup. Blank files, independent display/physical names,
the accepted field/format/config registries, defaults, generated text columns,
required/unique constraints, file/column drops, composite cross-schema foreign
keys, caller-filtered descriptions, native read-only classification, and stable
promoted logical column identities are implemented.

Tabular-owned JSON and shared-rank fields use collision-safe versioned physical
names and current catalog bindings. JSON promotion, metadata transition, native
DDL, catalog acceptance, dynamic version records, and request application are
one transaction; PostgreSQL drift, metadata races, forced RLS, conversion
failures, finalizer failures, and injected promotion failpoints roll back without
losing JSON. File and column lifecycle cleanup includes source and target managed
constraint references, including self-referential relations and stale ledgers
after canonical external constraint removal.

## Verification Notes

Passed on 2026-08-01:

- `npm run verify`: typecheck, 35/35 focused tests, production Reactus/server
  build, artifact integrity, architecture, runtime, and entrypoint verification.
- PostgreSQL 18 Task 00005 integration: guarded disposable database; blank DDL,
  explicit/derived/concurrent collisions, display independence, metadata races,
  default/required/unique/generated success and failure, drop cleanup and
  `RESTRICT` rollback/retry, exact composite cross-schema foreign-key ordering,
  permission and target-kind denial, caller/schema/column redaction, native
  identity negatives, hidden-field drift/replacement refusal, stable promoted
  relation identities, every promotion failpoint, forced-RLS rollback, JSON
  retention, DDL/version atomicity, confirmation expiry/replay, and revoked
  applied-result replay.
- PostgreSQL 18 regression suites for Tasks 00002, 00003, and 00004 passed on
  separate guarded disposable databases after the final Task 00005 changes.
- Three independent final specialist reviews passed: architecture/visibility,
  proof coverage, and authority/transaction/lifecycle integrity.

The sandboxed verifier's first `tsx` attempt could not create its local IPC
socket (`EPERM`); the approved outside-sandbox rerun passed. npm also reported
the existing non-fatal unknown `python` user-config warning and Node reported
the existing `module.register()` deprecation warning.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
