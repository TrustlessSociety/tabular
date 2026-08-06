# Task 00007: Implement Explorer And Table Settings

## Task Summary

Implement the user-facing explorer, Files and Views navigation, table creation,
search, rename, and settings surfaces backed by the established plugins.

Status: `verified`; depends on verified Task 00006.

## Implementation Steps

1. Create and register `plugins/explorer/plugin.ts` with only the needed
   `components/`, `events/`, `pages/`, `views/`, and `helpers/` directories.
2. Implement the accepted connection, database, schema-folder, file, and saved
   view hierarchy with Files/Views switching and stable catalog identifiers.
3. Implement explorer search, list/grid presentation, expanded state, empty,
   loading, error, and permission-aware states.
4. Implement New and Import entry points plus blank `Untitled` file creation,
   inline rename, duplicate-name handling, and display/physical-name clarity.
5. Implement table settings and supporting side panels from the wireframes,
   routing mutations through capability actions rather than direct fetches.
6. Preserve route, selection, and panel context across reloads where accepted,
   and make narrow layouts navigable without hiding critical actions.

## Verification Steps

1. Test hierarchy mapping, search/filter behavior, persisted expansion, Files/
   Views switching, and stable selection after catalog refresh.
2. Test blank creation, rename success and conflict, permission denial, loading,
   empty, and backend failure states through the event boundary.
3. Run page/component tests, route tests, type checks, and the production client
   build for the explorer and table-settings surfaces.

## Acceptance Steps

1. Start the application, sign in, and navigate the full explorer hierarchy as
   a user at desktop width.
2. Switch between Files and Views, search the explorer, change list/grid state,
   create a blank `Untitled` file, rename it, and open its table settings.
3. Confirm loading, empty, duplicate-name, permission, and recoverable error
   states are understandable and preserve the user's context.
4. Repeat primary navigation, creation, rename, and settings flows at 390x844.
5. Compare shape and behavior with the relevant wireframes; record desktop and
   narrow screenshots plus console/runtime errors.

## Implementation Notes

Started 2026-08-02 after Task 00006 passed full verification, current desktop
and narrow browser acceptance, and three independent specialist reviews.
Explorer UI belongs to this feature plugin; canonical catalog and DDL behavior
remain in the earlier backend plugins.

Implemented the registered Explorer feature plugin, authenticated product routes,
live Catalog and Files discovery, Files/Views query navigation, scoped search,
list/grid state, temporary Tabular saved-view projection, blank-file planning,
inline rename, table settings, protected event handling, and responsive desktop/
narrow states. Native PostgreSQL views remain read-only Files; accepted Tabular
saved views remain temporary metadata until Task 00010 owns persistence.

Browser GETs resume durable sessions before discovery. Explorer event POSTs
require exact origin, session cookie, and synchronizer token, rebind submitted
stable IDs to the live snapshot, and return only non-secret planning state. Rename
and settings require server-derived source authority plus selected destination
authority; the temporary settings surface does not claim physical DDL execution.

## Verification Notes

- Focused Node 22.14.0 Explorer, app, UI, grid, and runtime suite: 26 passed,
  0 failed.
- `npm run verify`: passed with 56 tests, 3 verified Reactus artifacts, 4 copied/
  verified SQL assets, a server-free browser dependency graph, built-runtime
  health/readiness/shutdown checks, and web/migrator/worker entrypoint checks.
- Mixed-authority regression checks passed for rename and settings: source denied/
  destination allowed and source allowed/destination denied both fail closed;
  only source and destination allowed succeeds.
- Authenticated PostgreSQL 18 browser acceptance passed at 1440x900 and 390x844.
  It covered unauthenticated 401, owner/reader role separation, hierarchy, stable
  IDs, Files/Views reload state, saved-view breadcrumb/title/application, search,
  loading/error/empty recovery, existing-file folder settings, Files planning,
  blank 1,000x12 grid, rename conflict/success, focus behavior, denial after
  following a file, modal bounds, DOM sanity, and zero console/page-error signals.
- Evidence: `output/playwright/task-00007/acceptance.md`, credential-free
  `acceptance-proof.mjs`, redacted `acceptance-result.json`, and refreshed desktop/
  narrow screenshots.
- Disposable browser, review server, temporary scripts, and PostgreSQL container
  were closed/removed after proof completion.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Passed 2026-08-02. All Acceptance Steps were executed with recorded screenshot,
request-metadata, focus, responsive-layout, and runtime-signal evidence. Three
independent same-task specialist reviews passed the final slice: product/
architecture, authenticated proof/authority, and keyboard/grid accessibility.
