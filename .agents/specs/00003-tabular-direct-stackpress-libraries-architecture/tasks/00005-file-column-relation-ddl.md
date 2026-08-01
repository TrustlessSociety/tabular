# Task 00005: Implement File, Column, Relation, And DDL Lifecycles

## Task Summary

Implement the PostgreSQL-backed file/table, column, relationship, hidden-field,
and owner-confirmed DDL workflows consumed by later UI plugins.

Status: `open`; depends on Task 00004.

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

Not started. PostgreSQL is canonical; Tabular metadata never substitutes for
live catalog identity or database constraints.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
