# Task 00010 Browser Acceptance

Result: **passed**.

Authenticated realtime, saved-view, and shared-row-order behavior was exercised
against a task-scoped PostgreSQL 18 database through two independent signed-in
sessions and two server instances. Representative narrow flows were repeated in
the Codex in-app browser at 390x844.

## Evidence

- An edit and a shared-row reorder committed in one browser session appeared in
  the other session without a manual refresh. The receiver retained its logical
  selection while accepting the refreshed PostgreSQL state.
- Shared and personal saved views covered create, update, duplicate, discovery,
  apply, and delete permissions. The second session discovered shared changes
  without receiving private-view events.
- Disconnect/reconnect replay applied multiple missed changes once and in cursor
  order. An explicit `Last-Event-ID` replay resumed at event 11 with the expected
  `row-order.changed` delivery, followed by heartbeat traffic rather than a
  fabricated cursor.
- Session/access revocation stopped subsequent delivery, disclosed no later row
  data, and changed the UI to the required recovery state.
- A final lifecycle recheck applied an ascending amount sort. The grid stayed
  rendered, ordered 900/1,200/2,400/3,600/4,800, preserved the logical D:D
  selection across the Tabulator remount, and changed row-move authority from
  true to false. The authority-enabled mount retained `movableRows` and its row
  header handle configuration; the sorted mount removed both.
- The nested Delete saved view confirmation focused Cancel on open, cycled Tab
  only through Cancel and Delete view, restored the originating Delete menuitem
  on Escape, removed every background `inert` marker on close, blocked backdrop
  dismissal, and visually suppressed the underlying actions popover while
  active.
- The 390x844 confirmation remained bounded and readable. Final browser logs
  contained no warnings or errors.

## Verification

- Focused realtime/grid/saved-view/UI suite: 21/21 passed.
- Full `npm run verify`: 105/105 tests passed.
- PostgreSQL 18 regressions for Tasks 00002, 00003, 00004, 00005, 00008, and
  00010: 1/1 passed for each task.
- Typecheck, production build, 3 Reactus artifacts, 7 SQL assets, architecture,
  built runtime, and entrypoint verification passed.
- Final independent backend, contract/security, and UI specialist audits all
  returned `PASS` with no remaining Task 00010 finding.
- Expected warnings only: npm's existing user `python` config warning and
  Node's existing `module.register()` deprecation warning.

## Screenshots

- `live-table-390x844.png`
- `saved-views-390x844.png`
- `create-view-390x844.png`
- `delete-confirmation-390x844.png`

## Cleanup

Cleanup passed: browser tabs were finalized, the temporary viewport was reset,
both local server instances and their proxy stopped, temporary fixture files
were deleted, ports 4010/4011/4020/4021 were released, and the disposable
PostgreSQL container was removed.
