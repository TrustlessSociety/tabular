# Task 00014J: Repair Border Styles And Retain Session Custom Colors

## Task Summary

Make dashed, dotted, and double cell borders render as their selected styles,
and retain user-chosen custom colors in a shared page-session row across text,
background/fill, and border color popovers.

Status: `verified`; user-directed visual correction side quest of
[Task 00014H](00014H-color-palettes-border-accordion.md).

## User Direction That Opened This Side Quest

Dashed, dotted, and double Border styles must work. When a custom color is
chosen in any color popover, add it immediately to the right of the circular
plus control so it can be reused. Custom colors do not need to persist between
users or page refreshes.

## Implementation Steps

1. Project solid, medium, thick, dashed, dotted, and double border styles onto
   the selected border edges without changing cell geometry.
2. Keep one deduplicated in-memory custom-color list in the formatting toolbar
   and render it after the plus control in every color surface.
3. Keep custom colors page-local; do not add storage or server persistence.
4. Update the command-surface and grid-adapter Context and focused coverage.

## Verification Steps

1. Run TypeScript type checking and focused command/grid tests.
2. Run the complete verifier and Agent Workspace validator.
3. Restart the local-review production build and inspect every repaired Border
   style plus shared custom-color reuse at desktop and narrow widths, with clean
   Browser and process logs.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review.

## Implementation Notes

Started and verified 2026-08-05.

- Border presentation now uses edge-specific background layers rather than a
  solid-only inset shadow. Solid, medium, thick, dashed, dotted, and double
  styles retain their selected edge placement without changing cell geometry.
- The formatting toolbar owns one deduplicated custom-color array. Text,
  background/fill, and Border palettes render it after the circular plus
  control and dispatch the same existing color commands when reused.
- Native color input uses its `input` event, so the session swatch is added as
  the native picker changes. No browser storage, server write, or user-level
  persistence was added.

## Verification Notes

Passed 2026-08-05.

- TypeScript type checking and all 22 focused command/grid tests passed.
- `npm run verify` passed all 255 tests, architecture/secrets checks, production
  Reactus/server builds, artifact verification, runtime/entrypoint checks, and
  release-static verification.
- The production Browser proved dashed, dotted, and double styles on the active
  cell as distinct edge patterns; `#123456` appeared directly after the plus
  control in text, fill, and Border palettes and was reusable for fill.
- The 390px More surface exposed the shared swatch in text and fill sections
  with equal client/scroll widths and no document overflow. Reload removed the
  custom swatch, confirming the requested page-session lifetime.
- Browser and local-review logs contained no warnings or errors. The Agent
  Workspace validator passed with existing advisory warnings, and scoped
  `git diff --check` passed.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed. Production desktop and narrow Browser review confirmed the repaired
Border styles and shared, refresh-local custom-color behavior.
