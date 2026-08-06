# Task 00014I: Remove Conditional Formatting Row

## Task Summary

Remove the deferred Conditional formatting row from the background/fill color
popover without changing the accepted shared palette or formatting commands.

Status: `verified`; user-directed visual correction side quest of
[Task 00014H](00014H-color-palettes-border-accordion.md).

## User Direction That Opened This Side Quest

Remove Conditional formatting from the background color popover.

## Implementation Steps

1. Remove the disabled Conditional formatting row from the shared toolbar
   rendering path used by the standalone and narrow More surfaces.
2. Update the command-surface Context and focused component coverage.

## Verification Steps

1. Run TypeScript type checking and focused command component tests.
2. Run the complete verifier and Agent Workspace validator.
3. Restart the local-review production build and inspect standalone and narrow
   background color surfaces with clean Browser and process logs.

## Acceptance Criteria

None at task level. This correction remains part of the pending final human
review.

## Implementation Notes

Started and verified 2026-08-05.

- The disabled Conditional formatting button was removed from `renderPalette`.
- Because standalone Fill color and narrow More use the same renderer, both
  surfaces now end at the native Custom color control.
- The shared 80-color main grid, eight Standard colors, Reset, Custom input,
  and all existing color commands remain unchanged.

## Verification Notes

Passed 2026-08-05.

- TypeScript type checking and all 8 focused command component tests passed.
- `npm run verify` passed all 253 tests, architecture/secrets checks, production
  Reactus/server builds, artifact verification, runtime/entrypoint checks, and
  release-static verification.
- The production Browser confirmed no Conditional formatting copy or disabled
  button in the 239px standalone Fill color popover or 390px More surface.
  Both retained 80 main colors, eight Standard colors, Custom, and no
  horizontal overflow.
- Browser and local-review logs contained no warnings or errors. The Agent
  Workspace validator passed with existing line-count advisory warnings, and
  scoped `git diff --check` passed.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed. The production Browser confirmed the row is absent from both rendering
paths without changing palette content or responsive containment.
