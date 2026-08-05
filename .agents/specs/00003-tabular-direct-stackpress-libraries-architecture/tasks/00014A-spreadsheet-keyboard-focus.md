# Task 00014A: Restore Spreadsheet Keyboard Focus

## Task Summary

Correct the final human-review keyboard path so the visibly active cell also
owns keyboard focus from initial load through navigation, editing, cancellation,
and live row or column refreshes.

Status: `verified`; required corrective side quest of
[Task 00014](00014-release-readiness.md).

## Rejection That Opened This Side Quest

The final human review found that the table displayed A2 as selected while the
page body retained focus. Arrow keys, Enter, Backspace, and Delete therefore
appeared unavailable until the reviewer clicked a cell. Keyboard cancellation
also returned focus to the page body instead of the selected cell.

The accepted behavior already exists in the
[grid and column contract](../../../context/tabular-grid-and-column-spec.md):
arrow keys move the active cell, Enter enters edit mode, and Backspace/Delete
clear selected values without shifting neighboring cells.

## Implementation Steps

1. Add an adapter-owned `focusActive()` operation that focuses the stable
   logical cell and recovers a detached virtual row before focusing it.
2. Give the initial selected cell focus after the React grid reaches its stable
   ready state, without stealing focus from another control.
3. Restore focus after keyboard Enter/Escape closes a cell editor.
4. Preserve grid focus when live row or column replacement recreates mounted
   cells.
5. Expand the accessible grid instructions to name Enter, F2, printable-key
   editing, and Backspace/Delete clearing.

## Verification Steps

1. Run focused grid-adapter and workbench component tests.
2. Run TypeScript type checking and rebuild the Reactus client.
3. Run the complete fast test suite.
4. In the in-app Browser, begin without clicking a cell and exercise all four
   arrow keys, Enter edit/commit, Backspace, Delete, and continued navigation.
5. Restore any temporary cleared values and confirm no browser warning or error
   remains.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review.

## Implementation Notes

Completed 2026-08-04.

- `GridCanvas` now hands focus to the initial cell after its ready-state render,
  restores focus after keyboard editor close, and documents the full keyboard
  path for assistive technology.
- `TabulatorGridAdapter` now owns explicit active-cell focus, including
  virtual-row recovery and focus preservation across row/column replacement.
- Focused coverage was added to the adapter and static workbench suites.

## Verification Notes

Passed 2026-08-04.

- Focused grid/workbench tests passed 13/13.
- `npm run typecheck` passed and Reactus built three production artifacts.
- `npm test` passed 230/230.
- Fresh in-app Browser review started with A2 focused without a click. Right,
  Down, Left, and Up moved through B2, B3, A3, and A2.
- Enter opened C2's raw editor, Enter committed it, focus returned to C2, and
  Right immediately continued to D2.
- Backspace on D2 and Delete on D3 cleared the required Title cells, surfaced
  the expected `#VALUE!` validation state, and retained grid focus. Escape
  restored both original values; the table returned to `Saved · Live` with no
  active draft.
- Browser warning/error inspection was empty. `git diff --check` passed.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed. The running local-review environment contains the verified correction
and remains available at `http://127.0.0.1:3000`.
