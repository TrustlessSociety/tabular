# Task 00014B: Correct Context Menus And Header Formatting

## Task Summary

Correct the final human-review command paths for whole-header-row selection,
header WYSIWYG presentation, target-aware context-menu availability, relation
configuration, and transient sorting.

Status: `verified`; required corrective side quest of
[Task 00014](00014-release-readiness.md).

## Rejection That Opened This Side Quest

The final human review found that the whole named-header row could not be
selected or opened with a context menu. Header fill, horizontal/vertical
alignment, and wrapping were also masked or ignored while the selected header
was rendered. Additional context cases exposed enabled row moves that could
only no-op, sorting that replaced the sheet with a setup error, and a saved
relation whose eligible key was not preselected in Column settings.

The accepted behavior already exists in the
[command-surface contract](../../../context/tabular-command-surface-spec.md)
and [grid contract](../../../context/tabular-grid-and-column-spec.md): commands
must act on the visible selection, report accurate availability, and preserve
the selected target while a menu or presentation control acts on it.

## Implementation Steps

1. Add a distinct whole-header-row selection and a target-appropriate context
   menu without treating the header row as PostgreSQL record data.
2. Apply and render every accepted presentation axis across named headers,
   including fill, horizontal/vertical alignment, and wrapping.
3. Disable row moves at committed boundaries and for non-committed retained
   rows instead of allowing silent no-ops.
4. Disable sort for unnamed logical columns and repair the persisted-column
   sort request so valid sorts keep the spreadsheet available.
5. Preselect the eligible target key that matches an existing relation's
   saved target column identities.

## Verification Steps

1. Run focused command, grid-adapter, relation-panel, route, and workbench
   tests.
2. Run TypeScript type checking and rebuild the Reactus client.
3. Run the complete fast test suite and workspace validation.
4. In the in-app Browser, exercise cell, relation, row, column, explorer, and
   whole-header-row context menus across normal, blank, boundary, retained,
   destructive-confirmation, and keyboard-focus cases.
5. Apply every WYSIWYG axis to one named header and the whole named-header row,
   then clear or restore all temporary presentation changes.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review.

## Implementation Notes

Completed 2026-08-04.

- Added a distinct whole-header-row selection that selects all visible column
  presentation points without exposing the header row as record data. The
  corner header is pointer- and keyboard-focusable, reports `1:1` / `All
  headers`, and opens a header-row menu with Copy and Clear header formatting.
- Made semantic header presentation render all accepted axes: font, size,
  emphasis, text/fill color, borders, horizontal and vertical alignment, and
  wrapping. Inline presentation fill is no longer masked by selected-header
  CSS.
- Made row-move and column-sort availability target-aware. First/last
  committed rows and retained non-committed rows now explain why a move is
  unavailable; unnamed logical columns explain why sorting is unavailable.
- Repaired PostgreSQL sorting by distinguishing collatable native types from
  values that merely use the text value codec. UUID stable keys no longer
  receive an invalid `COLLATE` clause.
- Made shared row moves reassign the existing exact rank slots instead of
  generating edge midpoints that could jump across sparse retained rows.
  Legacy null or fractional ranks rebalance once, and visible boundary order
  follows the current committed rows rather than the original snapshot.
- Restored an existing relation's saved target constraint by exact target
  column identity matching without overwriting a later manual choice.

## Verification Notes

Passed 2026-08-04.

- TypeScript type checking passed on Node 22.14.0.
- The focused capability, command, adapter, selection, relation-panel, and
  workbench suite passed 40/40 tests.
- The complete fast suite passed 236/236 tests.
- The focused PostgreSQL 18 durable realtime/saved-view/shared-row-order
  integration test passed, including exact-rank reassignment after rebalance.
- A clean normal build produced and verified three Reactus artifacts and all
  eleven SQL assets.
- Architecture, secret-content, built-runtime, entrypoint, and static-release
  verification all passed.
- `git diff --check` and the project `.agents` workspace validator passed.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed 2026-08-04 in the signed-in in-app Browser against the normal disposable
PostgreSQL 18 local-review environment.

- Cell, relation, row, column, explorer, and whole-header-row context menus all
  opened with the expected target-specific entries.
- The first committed row disabled Move row up; a retained invalid row disabled
  both move directions with the committed-row explanation; a named column
  enabled sorting; and an unnamed column disabled sorting with the naming
  explanation.
- Moving the first committed Product Data row down swapped rows 2 and 3 without
  crossing retained row 4; moving it up restored both display order and exact
  `000000000000000001000000` / `000000000000000002000000` PostgreSQL ranks.
- Title sorting completed and kept the spreadsheet live. The resulting order
  began `iPhone X2`, `iPhoneTX`, and the web process recorded no request
  failure.
- The existing Customer relation opened Column settings with Customers and
  Customer ID already selected.
- All WYSIWYG axes applied visibly and simultaneously to the whole header row:
  Georgia, 14px, bold, royal-blue text, light-yellow fill, all borders, right
  alignment, bottom alignment, and wrapping. A separate Title-header check
  applied fill/right/bottom/wrap without affecting Image. Undo restored every
  temporary presentation change.
- Explorer Table settings opened through its context menu. Escape/keyboard
  header-menu focus behavior remained intact. Product Data was restored for
  continued human review with retained invalid rows 4 and 7 still present.
