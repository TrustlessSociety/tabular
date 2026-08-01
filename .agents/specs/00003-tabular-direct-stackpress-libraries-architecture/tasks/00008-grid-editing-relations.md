# Task 00008: Implement Grid Editing And Relations

## Task Summary

Deliver the principal table-editing experience, including draft state, keyboard
workflows, clipboard operations, schema settings, constraints, and relations.

Status: `open`; depends on Task 00007.

## Implementation Steps

1. Extend the grid plugin with the needed `components/`, `events/`, `pages/`,
   `views/`, and `helpers/`; reuse file and capability services for mutations.
2. Implement cell and range editing, row insertion/deletion, draft indicators,
   commit/cancel, optimistic feedback, validation, and actionable error states.
3. Implement keyboard navigation, multi-range selection, copy, paste, fill,
   undo, and redo through the typed action kernel and journal.
4. Implement column creation and settings for name, type, format, defaults,
   constraints, generated/read-only state, and owner-confirmed schema changes.
5. Implement select and relation editors, same-database cross-schema targets,
   eligible/composite key handling, lookup display, and restricted states.
6. Surface advanced or destructive actions with clear impact and confirmation;
   preserve edits and user context when a backend operation fails.

## Verification Steps

1. Test edit, validation, commit, cancel, optimistic rollback, row operations,
   clipboard, fill, undo, and redo at the action and adapter boundaries.
2. Test keyboard paths, range semantics, selection preservation, and behavior
   across sort, filter, scroll, rerender, and concurrent server changes.
3. Test column settings, constraints, generated/read-only columns, relation
   eligibility, cross-schema and composite keys, and permission failures.
4. Run component/integration tests, type checks, and the production client build.

## Acceptance Steps

1. Load a populated table at desktop width and edit cells and ranges using both
   pointer and keyboard workflows; commit and cancel draft changes.
2. Copy/paste and fill a range, add/delete a row, and use undo/redo while
   confirming selection, focus, and feedback remain understandable.
3. Create and alter representative text, number, select, constrained, generated,
   and relation columns, including a same-database cross-schema relation.
4. Trigger validation, permission, relation-eligibility, and server-failure
   states and confirm recovery does not silently discard draft work.
5. Repeat primary editing and column-settings flows at 390x844; compare with the
   wireframes and record screenshots plus console/runtime errors.

## Implementation Notes

Not started. UI events invoke typed capability actions; they do not recreate DDL
or authorization policy in browser code.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Pending. The implementing agent must execute the Acceptance Steps and record
`passed` or `failed` with screenshot and browser evidence.
