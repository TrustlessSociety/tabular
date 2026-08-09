# Task 00004: Centered UI ownership and UnoCSS

## Summary

Remove `plugins/ui`, move behavior to centered owners, and migrate app styles
route by route to UnoCSS.

## Implementation Steps

1. Move grid behavior to `plugins/grid` and primitives to `plugins/app`.
2. Delete `plugins/ui` after imports are migrated.
3. Keep only allowed flat `public/styles/*.css` exceptions.

## Implementation Notes

- Completed D-010 ownership migration. `plugins/ui/components/icon.tsx` and
  `emphasis-button.tsx` now live at `plugins/app/components/`; the selection
  inspector and all table behavior helpers (`column-insertion`, `draft-errors`,
  `draft-persistence`, and `spreadsheet-rows`) now live at `plugins/grid`.
- Moved the covered column-insertion, draft-persistence, spreadsheet-row, and
  workbench tests with their implementations. `plugins/ui` is deleted; its
  plugin registration, service lookup, architecture allowance, and stale test
  expectations are gone. The historical icon inventory link was repaired to
  the app-owned icon so the workspace validator did not gain a new error.
- Kept the D-008 Provider projection and Wave B Reactus containment intact.
  UnoCSS is wired through `virtual:uno.css` in the Reactus build; production
  still serves verified artifacts through the app boundary and does not use
  Vite at runtime.
- Moved route styles out of plugin/view folders. Heads now load route-scoped
  flat files under `public/styles/`, and `/styles/**` uses the same exact,
  manifest-allowlisted static delivery seam as other public assets.
- CSS inventory: `base.css` is the accessibility/reset/token layer;
  `health.css` is the standalone health document reset; `explorer.css` is the
  responsive explorer shell; `commands.css` is the positioned menu/palette
  interaction surface; `grid.css` is the workbench/grid selection and panel
  cascade; `identity.css` is the auth/account form state surface;
  `import.css` is the nested wizard/table/validation cascade;
  `activity.css` is the responsive operation/recovery/dialog cascade;
  `saved-views.css` is the fixed overlay/dialog interaction cascade; and
  `tabulator.css` is the unchanged vendor Tabulator exception. The inventory
  is enforced by `npm run verify:css`; no plugin-local CSS remains.

## Verification Notes

All required commands were run with PowerShell on the final workspace:

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run typecheck` | 0 | Passed. |
| `npm run verify:architecture` | 0 | Passed; `plugins/ui` absent and feature-owned routes remain registered. |
| `npm run verify:secrets` | 0 | Passed; 255 candidate files, 6 patterns, expected exclusions. |
| `npm test` | 0 | 265 passed, 2 environment-skipped, 0 failed. |
| `npm run build` | 0 | Passed; 28 Reactus artifacts and 11 SQL assets. |
| `npm run verify:artifacts` | 0 | Passed; 28 Reactus artifacts and 11 SQL assets verified. |
| `npm run verify:runtime` | 0 | Passed; built runtime, manifest assets, shutdown, and port release. |
| `npm run verify:entrypoints` | 0 | Passed; web, migrate, worker, and production-authority checks. |
| `Push-Location proofs/tabular-boilerplate-alignment; npm test; Pop-Location` | 0 | P-002 proof suite 3/3 passed. |
| `npm run verify:css` | 0 | Passed; 10 flat public styles with recorded justifications. |
| ownership/import audit | 0 | No `plugins/ui` directory, module imports, UI service, or plugin-local CSS. |
| `git diff --check` | 0 | Passed; Git emitted only its normal LF-to-CRLF warnings. |

No local PostgreSQL server exists in this environment, so no
`test:postgres:*` gate was run or represented as passed.

The Agent Workspace validator exited 1 with exactly the known five
pre-existing missing reference targets: three `chrisai-chatting` placeholder
`response.html` targets and two `chrisai-designing` review/notes targets. The
old `plugins/ui` icon reference was repaired to `plugins/app/components/icon.tsx`,
so Task 00004 did not worsen the validator error set. Existing line-count
warnings remain unchanged.

PGlite route evidence from `npm run dev`:

- URL-less seeded development started successfully with `database:
  pglite-development`; sign-in used `tabular_reviewer` /
  `review-local-only-2026` and `Origin: http://127.0.0.1:3000`.
- `/` returned 200 and 9,274 UTF-8 bytes (reference 9,089; delta +185).
- `/pages/browse.html?folder=operations` returned 200 and 10,128 bytes
  (reference 9,943; delta +185).
- `/pages/table.html?folder=operations&table=customer-orders` returned 200 and
  16,080 bytes (reference 15,637; delta +443).
- `/pages/import.html?folder=operations` returned 200 and 10,230 bytes
  (reference 9,963; delta +267).
- `/pages/system-activity.html` returned 200 and 5,906 bytes (reference 5,643;
  delta +263).
- Every linked `/styles/`, `/assets/`, and `/client/` resource returned 200;
  the direct route probe found zero stylesheet/asset 404s. The dev process was
  stopped afterward and port 3000 was released.

The in-app browser visual connector could not initialize: its host runtime
failed before tab discovery with Windows `EPERM` while resolving the browser
runtime path. Therefore no screenshot or browser-console claim is made here.

## Acceptance Notes

Browser acceptance run 2026-08-08 against the development PGlite substrate and
re-run 2026-08-09 against real PostgreSQL 18 through the documented
`local-review` flow, with identical results. Driver was the repository's own
harness,
`scripts/release/browser-acceptance.mjs`, on real headless
Chrome/150.0.7871.189 with fresh contexts, no session injection, and no direct
service calls. Verdict: **PARTIAL - not accepted.**

Covered by real browser interaction:

- `desktop:explorer-to-live-postgresql-grid` - signed in through the visible
  login form at 1280x800, walked the Explorer to
  `/pages/table.html?folder=operations&table=customer-orders`, and the grid
  reached `.grid-stage[data-grid-ready="true"]` with seeded Operations content.
- `two-session:visible-edit-and-live-sse-sync` - a visible grid edit in one
  session propagated to a second session over SSE, so grid interaction and
  hydration survive the Wave D ownership move.
- `narrow:390x844-folder` - at exactly 390x844 the Explorer and import surfaces
  rendered with `document.scrollWidth <= window.innerWidth`, so there is no
  document-level horizontal overflow at the mobile width.
- Asset delivery observed directly on `/auth/login`: the UnoCSS bundle
  `/assets/login-0pLFePTh.css`, the flat exceptions `/styles/base.css` and
  `/styles/identity.css`, and the hydration client `/client/login-1CSXh7FO.js`
  all returned real bytes with no 404 and an empty browser console.

Not covered, so the acceptance criteria are not met:

- The command surface was not exercised at either width. File, Edit, Format,
  Data, View, and Help menus, submenu/palette anchoring, keyboard focus,
  disabled/read-only states, and viewport clamping remain unreviewed.
- The grid route itself was not opened at 390x844; the narrow journey covers
  the Explorer and import surfaces only.
- Column/table settings panels, the saved-view overlay, and draft/error
  presentation were not opened.
- No screenshots were captured and no per-route console/contrast/clipping
  review was performed at either width.

The Paseo in-app browser was not usable for this review: tabs were created but
never painted, so no screenshot or React interaction was possible. That is a
tooling limitation, not an application defect.

## Verification

Run ownership/import audit, component/grid tests, CSS inventory, build,
architecture checks, and visual overflow/console review.

## Acceptance Criteria

Review grid and command-surface states at desktop and 390-by-844.
