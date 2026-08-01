# Task 00006: Build The Reactus UI And Grid Adapter

## Task Summary

Create the browser application shell, shared UI primitives, and a typed Tabulator
6.5 adapter that later feature plugins can use without leaking grid-library state
into domain behavior.

Status: `open`; depends on Tasks 00001-00005 passing the Foundation gate.

## Implementation Steps

1. Create and register the needed `plugins/ui/plugin.ts` and
   `plugins/grid/plugin.ts` entrypoints; create only the applicable
   `components/`, `pages/`, `views/`, and `helpers/` directories.
2. Build the Reactus application shell, navigation regions, overlays, feedback
   states, tokens, and reusable controls required by the accepted wireframes.
3. Wrap Tabulator 6.5 behind a typed adapter for rows, columns, editing,
   selection, navigation, virtualization, sizing, formatting, and teardown.
4. Preserve logical cell, range, row, and column selections across rerenders,
   sorting, filtering, and virtualized viewport changes.
5. Implement keyboard and focus foundations, accessible names, ARIA state, and
   visible focus without depending on mouse-only interaction.
6. Implement accepted responsive behavior for desktop and narrow viewports,
   including safe overlays and horizontal grid overflow.
7. Keep browser bundles free of Node-only modules and keep feature data access
   behind typed events or helpers instead of importing server internals.

## Verification Steps

1. Run unit and component tests for the shell, controls, overlays, focus
   movement, selection state, and responsive variants.
2. Test the grid adapter's mount, update, virtualization, selection restore,
   sorting/filtering interaction, and teardown behavior.
3. Run type checks and the production client build; verify no server-only
   dependency enters the browser bundle.
4. Run accessibility checks for names, roles, states, keyboard paths, and focus
   visibility on representative shell and grid states.

## Acceptance Steps

1. Start the application and load the shell and grid review surfaces as a user.
2. At desktop width, exercise cell, range, row, and column selection; scroll a
   virtualized grid and confirm the logical selection remains stable.
3. Exercise keyboard focus, disabled and mixed states, menus, dialogs, and
   overlays without relying on the mouse.
4. Repeat the review at a 390x844 viewport and confirm usable layout, safe
   overflow, and no clipped primary actions.
5. Record screenshots for desktop and narrow states and record any browser
   console, uncaught runtime, accessibility, or horizontal-page-overflow errors.

## Implementation Notes

Not started. The adapter owns Tabulator integration; feature plugins consume its
typed interface rather than reaching into Tabulator instances directly.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Pending. The implementing agent must execute the Acceptance Steps and record
`passed` or `failed` with screenshot and browser evidence.
