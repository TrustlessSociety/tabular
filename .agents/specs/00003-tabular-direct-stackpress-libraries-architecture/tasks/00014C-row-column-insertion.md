# Task 00014C: Correct Row And Column Insertion

## Task Summary

Correct the final human-review insertion paths so a newly inserted empty row is
editable without immediately becoming an invalid retained draft, and so the
column context menu can create a PostgreSQL column on the requested side of the
selected column.

Status: `verified`; required corrective side quest of
[Task 00014](00014-release-readiness.md).

## Rejection That Opened This Side Quest

The final Browser review found that Insert row above immediately projected
required-field errors for an untouched blank row. The same review found Insert
column left and Insert column right visible but hard-disabled as deferred even
though the existing Column settings and PostgreSQL DDL workflow can create a
column.

## Implementation Steps

1. Keep inserted blank rows as inert, tab-local drafts until the user enters a
   value; do not persist or validate an untouched blank row.
2. Preserve above/below placement with a bounded hidden row rank and focus the
   first editable cell in the inserted row.
3. Enable left/right column commands when schema authority and a persisted
   column target exist.
4. After the existing confirmed PostgreSQL column-create workflow refreshes the
   schema, place the new stable column on the requested side and persist that
   browser-session column order.
5. Discard only fully blank insertion artifacts during reload or explicit
   cancellation; preserve partially filled retained rows and their errors.

## Verification Steps

1. Add focused row-rank, insertion-order, command-state, and workbench tests.
2. Run TypeScript type checking, the complete fast suite, clean build, and the
   normal architecture/runtime/release validators.
3. Exercise row-above and row-below insertion in the signed-in in-app Browser;
   confirm untouched rows have no error summary and first input begins normal
   validation.
4. Exercise both column-side context commands and confirm each opens the New
   column workflow with the requested placement retained for schema refresh.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review.

## Implementation Notes

Completed 2026-08-04.

- Row-above and row-below now create a ranked, tab-local insert draft that is
  visible and focused but does not project or persist required-field errors
  until the user enters a real value.
- The first non-blank edit enters the existing retained validation/save path;
  clearing the last user-entered value removes the empty draft and its errors.
- Column-left and column-right are no longer deferred. Each command requires a
  persisted header target, opens the existing PostgreSQL column-create flow
  with its requested side visible, and carries that side through live schema
  refresh into session column order.
- Reload discarded the three fully blank reproduction artifacts while
  preserving both partially filled retained rows and their exact issues.

## Verification Notes

Passed 2026-08-04:

- TypeScript typecheck passed.
- Focused command, editing, row-rank, and column-placement tests passed: 21/21.
- Complete fast suite passed: 240/240.
- Clean production build and artifact verification passed.
- Architecture, secrets, built-runtime, entrypoint, and release-static
  validators passed.
- The guarded normal local-review stack restarted from the production build.
- Signed-in in-app Browser acceptance passed on Product Data: both row sides
  inserted an error-free blank row at the requested boundary; first input
  began ordinary required-field validation; Backspace removed the test row;
  both column-side commands were enabled and opened the correctly oriented New
  column workflow. Final reload showed two preserved non-empty error rows and
  zero blank-artifact error rows.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed 2026-08-04.
