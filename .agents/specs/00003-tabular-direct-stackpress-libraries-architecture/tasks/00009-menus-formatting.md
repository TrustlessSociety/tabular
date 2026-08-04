# Task 00009: Implement Menus And Formatting

## Task Summary

Implement the accepted application menus, formatting toolbar, palettes, context
menus, and command routing as coherent user-facing controls over shared actions.

Status: `verified`; depends on verified Task 00008.

## Implementation Steps

1. Create and register `plugins/commands/plugin.ts` with the needed
   `components/`, `events/`, `views/`, and `helpers/`; reuse shared UI and grid
   components instead of duplicating menu infrastructure.
2. Implement File, Edit, View, and Format menus with accurate enabled, disabled,
   selected, mixed, destructive, and permission-aware states.
3. Implement the formatting toolbar and accepted cell appearance controls,
   palettes, reset behavior, persistence, and mixed-selection feedback.
4. Implement cell, range, row, column, explorer, and relevant relation context
   menus, all routed through the same typed command/action registry.
5. Implement shortcuts, roving focus, submenu behavior, dismissal, focus return,
   and collision-safe positioning for desktop and narrow layouts.
6. Ensure commands expose accurate availability and never bypass backend
   capability checks or browser-side draft state.

## Verification Steps

1. Test command registration, enablement, checked/mixed states, action routing,
   shortcut collisions, focus return, and permission changes.
2. Test formatting application, persistence, range behavior, reset, undo/redo,
   and rendering through the grid adapter.
3. Run component and keyboard interaction tests, accessibility checks, type
   checks, and the production client build.

## Acceptance Steps

1. At desktop width, open every File, Edit, View, and Format menu and exercise
   representative enabled, disabled, checked, mixed, and destructive commands.
2. Format individual cells and ranges using the toolbar and palettes, then
   verify persistence, reset, and undo/redo from a user's perspective.
3. Open the applicable context menus for cells, ranges, rows, columns, explorer
   entries, and relations; confirm they invoke the same outcomes as main menus.
4. Complete the menu and formatting flows with keyboard only, then repeat
   primary flows at 390x844 and inspect overlay positioning and focus return.
5. Compare with the wireframes and record screenshots plus accessibility,
   console, runtime, or overflow errors.

## Implementation Notes

Completed 2026-08-02 after Task 00008 passed full verification. The registered
commands plugin provides the exact File/Edit/View/Format hierarchy, shared
toolbar and context-menu routing, presentation history/persistence, typed
formatting patches, keyboard navigation, and permission-aware command states.
Schema configuration, table-level DML, and selected-cell DML use separate
authority signals. Grid copy and paste keyboard requests route through the same
range serializer and clipboard fallback as menu/context commands. Popovers are
anchored to their active trigger using measured, viewport-clamped geometry.

## Verification Notes

Passed. The final `npm run verify` completed with 86/86 tests, typecheck,
production build, 3 Reactus artifacts, 6 SQL assets, architecture, built
runtime, and entrypoint verification all passing. Focused command/grid/UI
review passed 24/24. Expected warnings only: the existing npm user `python`
configuration warning and Node `module.register()` deprecation warning.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Passed in the Codex in-app browser against isolated PostgreSQL 18 owner and
reader sessions at 1440x900 and 390x844. Menus, keyboard traversal, shared
range copy, typography/palettes/borders/alignment/wrapping, mixed states,
undo/redo/clear/persistence, all accepted context targets, exact permission
reasons, destructive confirmation, focus return, and narrow overlays passed.
The final More popover measured x=118..382 at 390px width; browser logs had no
warnings or errors. Evidence is recorded in
`output/playwright/task-00009/acceptance.md` and `acceptance-result.json`.
Browser, fixture, proxy, temp sessions, ports, and PostgreSQL container were
cleaned up. Three bounded source audits ended in `PASS`.
