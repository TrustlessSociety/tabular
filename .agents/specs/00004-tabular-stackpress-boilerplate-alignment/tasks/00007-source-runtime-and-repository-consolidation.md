# Task 00007: Source Runtime And Repository Consolidation

## Task Summary

Apply the user-approved repository consolidation after the verified Stackpress
alignment sprint. Run the server directly from TypeScript through `tsx`, move
application source beneath `src/`, place runtime entrypoints beneath
`scripts/runtime/`, and centralize test and acceptance material beneath
`tests/` without moving `proofs/` or `wireframes/`.

Status: `implemented, browser acceptance pending`; user-authorized post-Freeze
restructuring task.

## Implementation Steps

1. Move `bootstrap/`, `config/`, and `plugins/` beneath `src/` and update every
   import, plugin registration, build alias, verifier, and documentation path.
2. Move executable process entrypoints beneath `scripts/runtime/` while keeping
   build, development, and packaging scripts grouped by their actual role.
3. Replace compiled-server execution with `tsx` source execution, retain
   `tsc --noEmit`, preserve the Reactus artifact build, and update the release
   package to ship only the required source-runtime surface.
4. Move application, plugin, PostgreSQL, verification, local-review, browser,
   and release-acceptance code and evidence beneath `tests/`. Keep proof-local
   tests self-contained beneath `proofs/`.
5. Remove obsolete `dist/`, server compilation configuration, and the
   unneeded `output/branding` artifact after replacement paths verify.
6. Preserve PostgreSQL, security, process authority, artifact integrity,
   public routes, and user-visible behavior.

## Verification Process

1. Run TypeScript type checking and all unit/component/contract tests from the
   consolidated test layout.
2. Run architecture, secrets, CSS, Reactus artifact, runtime, entrypoint, and
   release-static verification from their new locations.
3. Assemble and inspect the source-runtime production package after a
   production-only dependency install.
4. Recheck the documented local-review web, worker, and migrator processes on
   PostgreSQL 18 without relying on `dist/`.
5. Recheck the supplied Product data acceptance URL in a connected browser.

## Acceptance Criteria

The existing Product data page remains visually and interactively unchanged at
the user-provided acceptance URL after the source-runtime cutover.

## Implementation Notes

Implemented 2026-08-11 after the user approved the reviewed consolidation
plan.

- Moved `bootstrap/`, `config/`, and all feature plugins to `src/` and updated
  module imports, Reactus entry aliases, UnoCSS discovery, plugin registration,
  architecture checks, and documentation.
- Moved runtime process entrypoints to `scripts/runtime/`. `start`, `worker`,
  `migrate`, `doctor`, `preflight`, and seed commands now execute those files
  through the production `tsx` dependency; `tsc` remains no-emit validation.
- Moved application tests, feature tests, PostgreSQL integration suites,
  verification scripts, regression tooling, release acceptance, local-review
  coordination, and prior acceptance evidence beneath `tests/`.
- Updated release packaging to ship `src/`, `scripts/runtime/`, public/docs
  files, and Reactus artifacts without server JavaScript emit. Removed the
  obsolete server-build and local-review compilation configurations.
- Removed `dist/` after the isolated source package passed, removed
  `output/branding`, and preserved `proofs/` and `wireframes/` at root.
- Cut the existing PostgreSQL 18 review stack over in place. The live web,
  worker, and migrator process records now name the source runtime files, and
  the original disposable database remains intact.

## Verification Notes

Passed 2026-08-11:

- `npm run typecheck`
- `npm run verify` (270 tests passed, 272 assertions, 2 environment skips;
  architecture, secrets, CSS, artifacts, source runtime, source entrypoints,
  and release-static checks passed)
- `npm run package:release`, production-only `npm ci --omit=dev
  --ignore-scripts`, a packaged source-runtime health/readiness probe, and
  `npm run package:release:finalize`
- Live `http://100.113.115.44:3000/healthz` and `/readyz` returned 200 after
  cutover. The supplied protected Product data URL returned the expected 303
  to sign-in without a browser session.
- The Agent Workspace validator no longer reports any path broken by this
  consolidation. Its remaining five errors are pre-existing placeholder links
  inside installed skill documentation; its existing line-count warnings are
  unchanged.

## Acceptance Notes

Fresh visual/interactive acceptance remains pending because no in-app or
extension browser instance was connected when the browser check was attempted.
The source-runtime acceptance service remains live at the supplied URL for the
user's human review.
