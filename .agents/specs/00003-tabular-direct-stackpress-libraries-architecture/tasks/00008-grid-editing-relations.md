# Task 00008: Implement Grid Editing And Relations

## Task Summary

Deliver the principal table-editing experience, including draft state, keyboard
workflows, clipboard operations, schema settings, constraints, and relations.

Status: `verified`; depends on verified Task 00007.

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

Started 2026-08-02 after Task 00007 passed full verification, authenticated
browser acceptance, disposable-proof cleanup, and three independent specialist
reviews. UI events invoke typed capability actions; they do not recreate DDL or
authorization policy in browser code.

Implemented live PostgreSQL-backed editing for all ten accepted field types,
persistent correctable drafts, exact cell/range/row mutations, copy/paste/fill,
bounded journal undo/redo, insert/delete, column create/configure, composite
cross-schema relations, generated/read-only behavior, selection/focus recovery,
and narrow layouts. DDL remains owner-confirmed and separately applied by the
migrator; browser routes remain session/origin/CSRF protected.

Reviewer follow-up hardened the slice further: persistent draft writes serialize
behind one current handle; invalid insertion projects only explicitly failing
cells; history updates preserve unrelated later work through incarnation and
touched-cell preconditions; permission failures retain their owning-role reason;
and relation options hydrate existing out-of-page references while typed search
remains remote, bounded, and RLS-scoped.

## Verification Notes

- `npm run verify`: passed with 70 tests, type checking, production Reactus and
  server builds, artifact and architecture guards, built-runtime checks, and all
  web/migrator/worker entrypoint checks.
- Focused PostgreSQL 18 suites passed for Task 00004 history/concurrency
  regression coverage and Task 00008 native grid editing.
- Fresh-browser acceptance passed against a freshly reset PostgreSQL 18.4
  fixture at 1440x900 and 390x844. It covered all ten field editors/formatters,
  persistent invalid and network drafts, range and row workflows, schema DDL,
  composite relations, remote relation search beyond the first 50 options,
  RLS exclusion, generated values, permission denial, focus, blank headers,
  narrow overflow, DOM sanity, authenticated transport, and zero unexpected
  browser/runtime signals.
- Error explanations passed viewport bounds, mutual-exclusion, and topmost-layer
  checks. The final database audit retained three rows, exact decimal values,
  zero active drafts, two promoted drafts, one abandoned draft, all six applied
  DDL requests, and the expected live composite foreign key.
- Evidence: `output/playwright/task-00008/acceptance.md`, credential-free
  `acceptance-proof.mjs`, redacted `acceptance-result.json`, and retained desktop/
  narrow screenshots.
- `git diff --check`, retained-proof syntax validation, and acceptance-result
  JSON parsing passed. Three independent same-task re-reviews returned `PASS`.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Passed 2026-08-02. All Acceptance Steps were executed with recorded browser,
screenshot, authenticated-request, PostgreSQL, focus, responsive-layout, DOM,
and runtime-signal evidence. Three independent specialist re-reviews passed the
final slice: proof/history semantics, adapter/UI/authority safety, and holistic
Task 00008 architecture.
