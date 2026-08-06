# Task 00014D: Restore Direct Spreadsheet Insertion Parity

## Task Summary

Correct the final human-review regressions in header emphasis, row-above rank
allocation, and direct blank-column insertion.

Status: `verified`; required corrective side quest of
[Task 00014](00014-release-readiness.md).

## Rejection That Opened This Side Quest

The next final Browser review found that Bold and Unbold still had no visible
effect on a named column header, Insert row above failed at row 6 even though
Insert row below worked, and Insert column left/right opened the Column
settings panel instead of inserting a blank spreadsheet column immediately.

## Implementation Steps

1. Give named header cells an ordinary visible weight and project explicit
   bold and unbold presentation values onto the semantic header label.
2. Allocate a bounded row rank when only one adjacent visible row has a hidden
   rank, preserving the requested above/below boundary without requiring a
   reload.
3. Insert a tab-local blank column immediately beside the selected column and
   focus its header without opening schema configuration.
4. If the user later names or types into that blank column, promote it through
   the existing PostgreSQL column-create boundary while preserving its side.
5. Discard untouched tab-local insertion artifacts on reload.

## Verification Steps

1. Add focused header-presentation, one-sided row-rank, and immediate blank
   column projection tests.
2. Run TypeScript type checking, the complete fast suite, clean production
   build, and the normal architecture, secrets, runtime, entrypoint, and
   release-static validators.
3. In the signed-in in-app Browser, toggle Bold and Unbold on the Title header,
   insert a row above row 6, and insert columns on both sides of Title.
4. Confirm the row remains untouched and error-free, both column commands open
   no dialog, and reload removes only the temporary insertion artifacts.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review.

## Implementation Notes

Completed 2026-08-04.

- The semantic header label now defaults to weight 400. Header presentation
  applies weight 700 for Bold and weight 400 for explicit Unbold, so the visual
  result matches the toolbar state.
- Row rank allocation now handles either a ranked predecessor or ranked
  successor by deriving a safe one-sided interval before taking its midpoint.
- Insert column left/right projects an adjacent tab-local blank column and
  selects its header immediately. It no longer opens Column settings.
- Naming or typing into an inserted blank retains the existing governed
  PostgreSQL DDL path and preserves the requested left/right placement after
  schema refresh.

## Verification Notes

Passed 2026-08-04:

- TypeScript typecheck passed.
- Focused header, row-rank, blank-column, presentation, command, and workbench
  tests passed: 25/25.
- Complete fast suite passed: 244/244.
- Clean production build and artifact verification passed.
- Architecture, secrets, built-runtime, entrypoint, and release-static
  validators passed.
- The guarded normal local-review stack restarted from the production build.
- Signed-in in-app Browser acceptance passed on Product Data: the Title header
  changed from weight 400 to 700 and back to 400 while `aria-pressed` changed
  from false to true and back to false; Insert row above on row 6 selected A6
  and showed no row error; column-left inserted a blank D before Title with no
  dialog; column-right inserted a blank E after Title with no dialog.
- Final reload removed the temporary row and columns and left the review page
  on the canonical Product Data table with no open dialog.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed 2026-08-04.
