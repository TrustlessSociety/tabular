# Task 00014F: Production Iconography

## Task Summary

Replace platform-dependent font glyphs and improvised text badges with the
shared Lucide-informed SVG vocabulary defined by the production icon inventory.

Status: `verified`; user-directed visual cleanup side quest of
[Task 00014](00014-release-readiness.md).

## User Direction That Opened This Side Quest

The user requested an itemized production icon inventory, supplied correction
screenshots for Borders and alignment anatomy, then explicitly requested that
the production iconography be updated from that inventory.

## Implementation Steps

1. Expand the shared dependency-free `Icon` component into the canonical
   action, navigation, status, source, and formatting SVG vocabulary.
2. Replace spreadsheet toolbar font glyphs with SVGs while preserving command,
   enabled, mixed, pressed, tooltip, focus, and popover behavior.
3. Recreate Borders as a dotted-guide component with ten exact solid-edge masks
   and recreate horizontal and vertical alignment from the correction images.
4. Keep text, fill, and border color rails plus border line styles as dynamic
   samples rather than fixed icon assets.
5. Replace Saved Views, import, result, warning, activity-kind, and loading
   marks with their distinct semantic SVGs; keep provider and format names as
   visible text rather than improvised logos.
6. Preserve typographic `fx`, numbered progress, breadcrumb punctuation, CSS
   status dots, timeline nodes, and invalid-cell corners where the inventory
   classifies them as notation or state tokens instead of action icons.

## Verification Steps

1. Add focused static-render coverage for the shared vocabulary, toolbar marks,
   exact Borders masks, Saved Views, import states, and Activity states.
2. Run TypeScript type checking and the focused command, UI, Saved Views,
   import, and Activity component tests.
3. Run the complete fast suite, clean production build, and normal static
   architecture, secrets, artifact, runtime, entrypoint, and release checks.
4. Load the normal signed-in production build in the in-app Browser at desktop
   and narrow widths; inspect toolbar, Borders, horizontal/vertical alignment,
   import, Saved Views, and Activity states for clipping, console errors, and
   semantic state regressions.
5. Run the Agent Workspace validator after updating the inventory and task
   records.

## Acceptance Criteria

None at task level. This cleanup remains part of the pending final human review.

## Implementation Notes

Started and verified 2026-08-05.

- The shared icon component now owns reusable `currentColor` SVGs on the
  canonical 24 by 24 view box with a 2px default stroke.
- Formatting actions no longer depend on platform font rendering. Dynamic text,
  fill, and border rails remain separate samples, and the selected state remains
  on the button container.
- Border horizontal and vertical choices now select only the center rule; outer
  lines remain dotted guides. Horizontal alignment uses five rules, and vertical
  alignment uses arrows pointing inward toward the relevant reference rule.
- Import source cards use a neutral spreadsheet-file mark with visible CSV,
  XLSX, or Google Sheets copy. Database, warning, success, cancellation,
  operation, export, loader, Saved Views close, and More actions are distinct.

## Verification Notes

Passed 2026-08-05.

- TypeScript type checking and all 26 focused command, UI, Saved Views, import,
  and Activity component tests passed.
- `npm run verify` passed all 251 tests, the production Reactus/server builds,
  architecture and secret checks, artifact verification, runtime/entrypoint
  checks, and release-static verification.
- The signed-in production build passed desktop and 390px Browser review for
  the toolbar, exact Borders masks, horizontal and vertical alignment,
  narrow More formatting panel, Saved Views, Import, and Activity surfaces.
  The inspected surfaces did not clip or overflow horizontally, and the
  browser produced no warning or error logs.
- Explorer, Activity, Import, and the workbench retain explicit
  `prefers-reduced-motion` fallbacks for animated loaders, status pulses,
  transitions, and scroll behavior.
- The Agent Workspace validator passed with its existing advisory warnings;
  scoped `git diff --check` passed.

## Human Acceptance

None at task level. Explicit final human acceptance remains pending.

## Agent Acceptance

Passed. The signed-in desktop and narrow production Browser review confirmed
the accepted inventory anatomy and semantic distinctions without interaction
regressions.
