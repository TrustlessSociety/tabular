# Task 00009: Implement Menus And Formatting

## Task Summary

Implement the accepted application menus, formatting toolbar, palettes, context
menus, and command routing as coherent user-facing controls over shared actions.

Status: `open`; depends on Task 00008.

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

Not started. Commands provide a shared presentation-to-action boundary so menu,
toolbar, context-menu, and shortcut behavior cannot drift independently.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Pending. The implementing agent must execute the Acceptance Steps and record
`passed` or `failed` with screenshot and browser evidence.
