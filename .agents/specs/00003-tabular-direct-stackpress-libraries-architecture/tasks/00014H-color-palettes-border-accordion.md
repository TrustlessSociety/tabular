# Task 00014H: Color Palettes And Border Accordion

## Task Summary

Apply the user's final-review color and Border interaction corrections without
changing the underlying presentation command or persistence boundaries.

Status: `verified`; user-directed visual correction side quest of
[Task 00014G](00014G-formatting-popover-density.md).

## User Direction That Opened This Side Quest

1. Use the supplied color choices, in their exact visible row order, for text,
   background/fill, and border colors.
2. Present Border visible, Border color, and Border style as an accordion.
3. Open Border visible initially.

## Implementation Steps

1. Replace the separate compact color presets with one shared ordered palette
   component used by text, fill, and Border color.
2. Preserve Reset, Standard, and native Custom color affordances while routing
   each selection through the existing dynamic formatting commands.
3. Convert the three Border groups into a single-open accordion whose initial
   section is Border visible.
4. Reconcile the command-surface Context and production icon inventory.

## Verification Steps

1. Run TypeScript type checking and focused command component tests.
2. Run the complete verifier and Agent Workspace validator.
3. Restart the normal local-review production build and inspect all three color
   surfaces plus the Border accordion at desktop and narrow widths.
4. Confirm exact color order, selection behavior, containment, and clean logs.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review.

## Implementation Notes

Started and verified 2026-08-05.

- Text, fill/background, and Border color now render from the same immutable
  eight-by-ten main palette and eight-color Standard row.
- Reset remains command-specific, while the native Custom color input routes
  arbitrary selections through the existing dynamic color command IDs.
- Borders now uses one accordion with Border visible expanded initially and
  exactly one placement, color, or style panel mounted at a time.
- The standalone color popovers remain 239px wide; the Border surface remains
  264px wide and retains the existing ten placement and six line-style choices.

## Verification Notes

Passed 2026-08-05.

- TypeScript type checking and all 8 focused command component tests passed.
- `npm run verify` passed all 253 tests, architecture/secrets checks, production
  Reactus/server builds, artifact verification, runtime/entrypoint checks, and
  release-static verification.
- The signed-in production Browser confirmed 80 main and eight Standard colors
  in exact order for text, background, and border. The Border accordion began
  with only Border visible expanded, then changed to color and style with one
  panel mounted throughout.
- Desktop and 390px review showed no document or popover horizontal overflow;
  the narrow More surface retained intentional bounded vertical scrolling.
- Browser and local-review logs contained no warnings or errors. The Agent
  Workspace validator passed with existing line-count advisory warnings, and
  scoped `git diff --check` passed.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed. The production Browser confirmed exact palette order, single-open
accordion behavior, responsive containment, and clean runtime output.
