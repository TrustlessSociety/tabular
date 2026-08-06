# Task 00014E: Preserve Inserted Column Drag And Delete Boundaries

## Task Summary

Correct dragging and deletion after blank columns are inserted on either side,
so every visible header remains an exact drop boundary and every temporary
blank can be removed directly.

Status: `verified`; required corrective side quest of
[Task 00014](00014-release-readiness.md).

## Rejection That Opened This Side Quest

The next final Browser review found that after inserting blank columns around
column D, dragging D before blank C did not work and dragging D before named B
also landed in C.

The following review found that blank C and blank E could not be deleted
because Delete column was still globally deferred.

A later final review found redundant down chevrons on the top menus and common
formatting controls. It also found Full screen, Theme, Rotation, Smart chips,
and Merge cells exposed as permanently disabled menu items even though their
behavior remains deferred.

The next spreadsheet-layout review found that the blank header corner was
rendering a synthetic row 1, which displaced the first value row and formula
coordinate to row 2.

## Implementation Steps

1. Keep persisted named columns as the only draggable sources.
2. Treat every visible header, including a tab-local blank column, as an exact
   left/right drop target.
3. Re-anchor tab-local blank columns from the complete emitted visual order
   after a move instead of reapplying their original insertion side.
4. Preserve the stable named-column order in browser-session storage.
5. Enable Delete column only for a tab-local blank insertion and remove it
   immediately without PostgreSQL DDL.
6. Re-anchor any surviving blank after removal and keep deletion of a real
   PostgreSQL column disabled until the confirmed DDL workflow exists.
7. Remove redundant down chevrons from File, Edit, View, Format, Text color,
   Fill color, Horizontal alignment, Vertical alignment, and Wrapping without
   removing their disclosure behavior or accessible expanded state.
8. Remove the five unimplemented View and Format placeholders from the visible
   menus while retaining their inert internal command identities.
9. Leave the header corner visibly blank and start value-row labels, formula
   coordinates, command context, and accessible row names at row 1 while
   preserving the corner as the whole-header-row selection target.

## Verification Steps

1. Add focused adapter coverage proving a named column can drop on the left
   edge of an inserted blank header.
2. Add ordering coverage for moving a named column before the adjacent blank
   and before an earlier named column while retaining both inserted blanks.
3. Run TypeScript type checking, the complete fast suite, clean production
   build, and the normal architecture, secrets, runtime, entrypoint, and
   release-static validators.
4. Recreate the two blank columns in the signed-in in-app Browser and perform
   the two exact pointer drags from the rejection.
5. Delete blank C and blank E independently, confirm the surviving blank keeps
   its position, and confirm a real column remains protected.
6. Assert the exact visible View and Format registries and caret-free rendered
   markup for every requested control.
7. Rebuild the local-review stack and verify both menus and all five formatting
   popovers in the signed-in in-app Browser.
8. Verify that the first value cell is A1, its row label is 1, the corner has no
   visible text, and activating the blank corner still selects all headers.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review.

## Implementation Notes

Implemented 2026-08-04.

- The adapter now attaches drop handling to blank headers while keeping them
  non-draggable until they become real PostgreSQL columns.
- Pointer fallback target resolution includes blank headers instead of
  collapsing their positions onto the nearest named column.
- The workbench derives new blank-column anchors from the complete visual
  order, preventing inserted blanks from snapping back around their original
  anchor after a named-column move.
- Delete column is actionable only for a tracked tab-local blank insertion.
  Removing it recalculates the remaining blank anchors and selects the adjacent
  header.
- Real PostgreSQL columns remain protected with an explicit confirmed-DDL
  requirement.
- The top-level menu triggers and the five named formatting controls no longer
  render redundant down chevrons; their menu or dialog semantics are unchanged.
- Full screen, Theme, Rotation, Smart chips, and Merge cells no longer appear
  in the visible menus because they have no accepted implementation. Their
  deferred command identities remain inert for future implementation work.
- Spreadsheet row numbering now has one shared zero-to-one conversion for
  visible value rows. The header corner remains an accessible selection target
  named Header row but no longer owns a visible or formula coordinate.

## Verification Notes

Passed 2026-08-04:

- TypeScript typecheck passed.
- Focused adapter, column-order, and workbench tests passed: 20/20.
- Focused blank-column deletion command, menu, ordering, and workbench tests
  passed: 17/17.
- Complete fast suite passed: 247/247.
- Clean production build and artifact verification passed.
- Architecture, secrets, built-runtime, entrypoint, and release-static
  validators passed.
- The guarded normal local-review stack restarted from the production build.
- Signed-in in-app Browser setup passed: blank C and blank E were inserted on
  both sides of D SRP with no dialog, D remained draggable, and both adjacent
  blank headers remained non-draggable drop boundaries.
- Signed-in in-app Browser deletion acceptance passed: deleting C removed C
  and retained the other blank beside SRP; deleting E removed E and retained C;
  both commands were enabled with no confirmation dialog. Delete column stayed
  disabled on real D SRP with the confirmed PostgreSQL DDL reason.
- Final reload removed the remaining temporary blank and left the canonical
  Product Data table with no dialog or context menu open.
- Caret and menu cleanup focused component, registry, and workbench tests
  passed: 11/11.
- Complete fast suite still passed: 247/247 after the cleanup.
- A fresh clean production build and all architecture, secrets, built-runtime,
  entrypoint, and release-static validators passed.
- Signed-in in-app Browser verification passed: File, Edit, View, Format, Text
  color, Fill color, Horizontal alignment, Vertical alignment, and Wrap render
  without a down chevron; View exposes only Show, Freeze, and Zoom; Format
  exposes only Number, Text, Alignment, Wrapping, Font size, and Clear
  formatting; all five caret-free toolbar popovers still open correctly.
- Spreadsheet-numbering focused grid and workbench tests passed: 23/23; the
  complete fast suite passed: 249/249.
- The clean production build and architecture, secrets, built-runtime,
  entrypoint, and release-static validators passed after the numbering change.
- Signed-in in-app Browser verification passed: the corner is blank, the first
  value row is Row 1, the first value cell reports A1, and activating the blank
  corner reports Headers and All headers without introducing a numbered row.
- Exact pointer-driven Browser drag acceptance passed 2026-08-05 in the
  signed-in in-app Browser. Starting from `A ID, B Image, C blank, D SRP,
  E blank`, dragging D SRP before blank C produced `A ID, B Image, C SRP,
  D blank, E blank`; dragging that named SRP column before named B Image then
  produced `A ID, B SRP, C Image, D blank, E blank`.
- The named-column order was restored through the same pointer-driven path.
  Reload removed both temporary blanks and left `A ID, B Image, C SRP,
  D Title, E Detail, F Column F` with no dialog or context menu open.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed 2026-08-05 through the exact pointer-driven Browser drag sequence.
