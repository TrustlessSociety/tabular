# Task 00007: Implement Explorer And Table Settings

## Task Summary

Implement the user-facing explorer, Files and Views navigation, table creation,
search, rename, and settings surfaces backed by the established plugins.

Status: `open`; depends on Task 00006.

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

Not started. Explorer UI belongs to this feature plugin; canonical catalog and
DDL behavior remain in the earlier backend plugins.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Pending. The implementing agent must execute the Acceptance Steps and record
`passed` or `failed` with screenshot and browser evidence.
