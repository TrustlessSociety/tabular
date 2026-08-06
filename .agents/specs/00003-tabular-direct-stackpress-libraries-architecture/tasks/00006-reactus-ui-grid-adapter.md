# Task 00006: Build The Reactus UI And Grid Adapter

## Task Summary

Create the browser application shell, shared UI primitives, and a typed Tabulator
6.5 adapter that later feature plugins can use without leaking grid-library state
into domain behavior.

Status: `verified`; depends on verified Tasks 00001-00005.

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

Started 2026-08-01 after Tasks 00001-00005 passed the Foundation gate, including
the full repository verifier, PostgreSQL 18 Task 00005 suite, PostgreSQL 18
Tasks 00002-00004 regressions, and three Task 00005 specialist reviews.

Implemented feature-owned `ui` and `grid` plugins, a compact Reactus workbench,
shared controls and overlays, and a typed Tabulator 6.5 adapter. The adapter owns
mount/update/teardown, in-place row and column replacement, editing, sorting,
filtering, logical cell/range/row/column selection, keyboard navigation,
virtual-row focus restoration, and bounded DOM projection. Feature code consumes
typed contracts rather than Tabulator components. Precomputed row/column index
maps keep range coverage independent of total logical row count while mounted
projection remains bounded to virtualized rows.

The shell implements the accepted responsive desktop and 390x844 layouts with
internal grid overflow, safe menus/dialogs, accessible names and state, one
roving menubar tab stop, visible grid focus, disabled controls, and a real mixed
Bold state derived from range or whole-band selection.

## Verification Notes

Passed 2026-08-02.

- `npm run verify` passed on Node 22.14.0: typecheck, 47 tests, production
  Reactus/server build, 3 Reactus artifacts, 4 SQL assets, architecture and
  server-free browser graph, built runtime, and web/migrator/worker entrypoints.
- The focused grid/UI suite passed 12/12, including in-place column replacement,
  selection preservation, band focus continuity, disconnected virtual-row
  scroll/focus restoration, bounded mounted projection, a 10,000-row
  constant-lookup range check, mixed emphasis, and the menubar tab-stop split.
- Browser acceptance passed at 1440x900 and 390x844. The durable record is
  `output/playwright/task-00006/acceptance.md`; screenshots are
  `output/playwright/task-00006/desktop-1440x900.png`,
  `output/playwright/task-00006/narrow-390x844.png`, and
  `output/playwright/task-00006/narrow-390x844-selection-overlay.png`.
- Current browser proof records cell/range/row/column selection, stable logical
  selection through sorting/filtering/virtualization, editing, keyboard menus,
  dialog focus trapping, disabled and mixed states, a recycled-row boundary,
  responsive internal overflow, and zero console, runtime, accessibility-name,
  or document-overflow signals.
- Three independent Task 00006 specialist reviews passed after the last source
  and evidence changes.
- Non-failing command noise was limited to npm's existing unknown `python`
  configuration warning. The focused `tsx` command required the approved
  outside-sandbox run because the managed sandbox denied its local IPC socket.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Passed 2026-08-02. All Acceptance Steps were exercised against the built
application, current screenshots and browser results are recorded in
`output/playwright/task-00006/acceptance.md`, and all three independent
specialist reviews returned PASS.
