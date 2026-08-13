# Task 00014K: Repair Grid Default And Visual Regressions

## Task Summary

Restore the accepted A–Z spreadsheet canvas, quiet blank-file presentation,
neutral grid styling, and field-default timing found during final human review.

Status: `started`; user-directed visual and interaction correction side quest
of [Task 00014](00014-release-readiness.md).

## User Direction That Opened This Side Quest

The Product data review found four regressions: named column headers were too
dark, body row dividers no longer matched the header-band divider, a blue blank
header message obscured the grid, and the default canvas stopped at L instead
of Z. Changing a column to Switch also rendered empty cells as `No`, while a
configured default appeared before the user exited an empty cell editor.

## Implementation Steps

1. Restore twenty-six default spreadsheet coordinates, A through Z.
2. Remove the blue blank-grid guidance banner while retaining inline editing
   and validation affordances.
3. Use the intended light neutral header fill and one shared divider token for
   the coordinate/header boundary and body grid lines.
4. Keep null Switch and Boolean cells visually blank.
5. Keep configured defaults out of untouched cells and apply a known literal
   default only when an editor commits with no value.
6. Preserve PostgreSQL schema-default authority for external writes while
   preventing the grid projection from pre-filling untouched logical cells.

## Verification Steps

1. Add focused grid adapter, editing, default-projection, and A–Z regression
   coverage.
2. Run the focused grid tests and TypeScript type checking.
3. Run the production build and static artifact verification.
4. Recheck Product data at the running human-review URL for all four supplied
   screenshots and interactions.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review at the user-provided Product data URL.

## Implementation Notes

Started and technically completed 2026-08-11 from explicit user direction
during final human review.

- Blank spreadsheet padding now projects twenty-six coordinates through Z.
- The blank-grid guidance banner and its blue alert styling were removed.
- Workbench-owned header selectors now outrank the later vendor stylesheet and
  use the intended light neutral fill. Body row and cell dividers use the same
  `--rule` token as the coordinate/header boundary.
- Null Boolean and Switch cells render empty instead of `No`. A blank Switch
  editor emits an empty exit token so a configured literal default can be
  applied without treating the untouched state as false.
- PostgreSQL literal defaults are projected without lossy numeric coercion.
  New-row staging leaves them null until their own editor exits empty; clearing
  through Delete still clears rather than immediately reapplying the default.
- Known grid defaults use explicit nulls for untouched nullable fields during
  a Tabular insert, so omission cannot invoke them early. Unrecognized native
  PostgreSQL expressions remain server-owned for external and grid writes.

## Verification Notes

Technical verification passed 2026-08-11:

- TypeScript type checking and all 36 focused grid/default tests passed.
- `npm run verify` passed: 272 tests total, 270 passed, and two environment
  symlink checks skipped; architecture, secrets, CSS inventory, clean Reactus
  and server builds, artifact integrity, runtime, entrypoint, and release-static
  checks all passed.
- The existing port-3000 listener remained on the same process after the clean
  build, `/healthz` returned 200, and the running server exposed the rebuilt
  grid stylesheet with the removed banner rule and shared divider rule.
- Live visual/interaction verification is still pending because no controllable
  Browser session is exposed to this chat. The user continues human review at
  `http://100.113.115.44:3000/pages/table.html?folder=operations&table=product-data`.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Pending.
