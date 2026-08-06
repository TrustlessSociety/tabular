# Task 00014G: Formatting Popover Density

## Task Summary

Apply the user's final-review corrections to the Borders and alignment
popovers without changing their commands, state, or accessible names.

Status: `verified`; user-directed visual correction side quest of
[Task 00014F](00014F-production-iconography.md).

## User Direction That Opened This Side Quest

The user reviewed the verified iconography in the production Browser and asked
for these exact refinements:

1. Rename the visible `Borders` heading to `Border visible`.
2. Remove the decorative leading graphics from `Border color` and
   `Border style`, and make both labels bold.
3. Place the native border-color picker below its label.
4. Remove the excess right-side width from the three-choice alignment popovers.

## Implementation Steps

1. Simplify the Borders markup into bold section labels followed by their
   controls, preserving accessible color and style choice names.
2. Remove the now-unused local border-control graphics and styles.
3. Give horizontal, vertical, and wrapping popovers a three-column intrinsic
   width while retaining the five-column Borders grid.
4. Reconcile the command-surface Context and icon inventory with the accepted
   correction.

## Verification Steps

1. Run TypeScript type checking and focused command component tests.
2. Run the complete verifier and Agent Workspace validator.
3. Restart the normal local-review production build and inspect Borders plus
   horizontal and vertical alignment at desktop and narrow widths.
4. Confirm no clipping, horizontal overflow, or browser warning/error logs.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review.

## Implementation Notes

Started and verified 2026-08-05.

- The Borders popover now uses the visible `Border visible` heading followed
  by bold text-only `Border color` and `Border style` sections.
- The native current-color picker and preset swatches share the control row
  directly below `Border color`; the removed label graphics and CSS are no
  longer present.
- Horizontal, vertical, and wrapping popovers use intrinsic three-column grids
  without changing the five-column Borders placement grid or the More surface.

## Verification Notes

Passed 2026-08-05.

- TypeScript type checking and all 6 focused command component tests passed.
- `npm run verify` passed all 251 tests, architecture/secrets checks, production
  Reactus/server builds, artifact verification, runtime/entrypoint checks, and
  release-static verification.
- The normal signed-in production build passed desktop and 390px Browser
  review. Borders remained 264px wide without overflow; both standalone
  alignment popovers measured 166px with three 46px columns and equal 11px
  side insets. The 390px More panel stayed within the viewport.
- Browser and local-review process logs contained no warnings or errors.
- The Agent Workspace validator passed with existing advisory warnings, and
  scoped `git diff --check` passed.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed. The production Browser confirmed the accepted label hierarchy, control
placement, compact alignment widths, and responsive containment.
