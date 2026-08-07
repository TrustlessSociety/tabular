# Boilerplate Alignment Sprint Proposal

## State

- Spec authority: Frozen 2026-08-06.
- Implementation plan: accepted 2026-08-06.
- Scope: restructure application composition without changing product behavior or
  relaxing PostgreSQL, security, process, artifact, or release boundaries.

## Sequencing Rules

1. Each wave preserves a working production path before its predecessor is removed.
2. Build never opens listeners, pools, workers, or migrators.
3. Routes use one lazy default page handler and one feature-owned view; Reactus
   builds only unique registered `server.views` entries.
4. Provider hydration and static delivery use the P-002 allowlist and verified
   manifest patterns. Vite is development-only.
5. Every wave runs typecheck, focused tests, architecture/secrets checks, build,
   artifact verification, and relevant runtime/entrypoint checks. Manifest work
   also requires a clean install; data/process work adds its PostgreSQL matrix.

## Wave A — Lifecycle and Configuration Foundation

### 00001 - Separate process-safe configuration and entrypoints

- Output: dedicated build, development, live, worker, migrator, doctor, and
  preflight configuration; thin scripts with explicit lifecycle resolution.
- Verification: phase matrix, focused lifecycle tests, clean build, runtime and
  entrypoint checks.
- Acceptance criteria: none.

## Wave B — Application Rendering and Artifact Boundary

### 00002 - Move Reactus, Provider, and static delivery into `plugins/app`

- Output: app-owned Reactus setup, typed browser projection, development
  containment, production manifest/hash/size validation, and no Vite production path.
- Verification: P-002 regression, hydration denylist, traversal/tamper tests,
  production build, and artifact checks.
- Acceptance criteria: signed-out shell at desktop and 390-by-844.

## Wave C — Lazy Pages and Multi-entry Conversion

### 00003 - Replace route aggregators and the union workbench

- Output: one-default-export page modules, anonymous lazy registrations, paired
  feature views, and registered-view-only Reactus build discovery.
- Verification: page import/build graph and route/view-data tests; no handler
  execution during build; focused browser route checks.
- Acceptance criteria: explorer, grid, import, and operations walkthroughs at
  desktop and 390-by-844.

## Wave D — Centered UI Ownership and Styling

### 00004 - Remove `plugins/ui` and migrate route-by-route to UnoCSS

- Output: grid-owned workbench behavior, app-owned shared primitives, deleted
  `plugins/ui`, UnoCSS app styles, and only flat `public/styles/*.css` exceptions.
- Verification: ownership/import audit, component/grid tests, CSS inventory,
  build, architecture checks, and visual overflow/console review.
- Acceptance criteria: grid and command-surface review at desktop and 390-by-844.

## Wave E — Compatibility Removal and Release Recheck

### 00005 - Remove bridges and close the restructure

- Output: obsolete config/build entries removed; runbook and release evidence
  updated; maintainability pass around changed composition boundaries.
- Verification: full unit/integration suite, clean install/build, artifact and
  runtime checks, relevant PostgreSQL matrix, fresh browser review, and distinct
  production-target evidence for every production claim.
- Acceptance criteria: signed-out ordinary-origin end-to-end review at desktop
  and 390-by-844.

## Post-acceptance Addition

### 00006 - Development-only PGlite acceptance substrate

Added after the accepted sprint by explicit user authorization. It gives the
source-run development web application a disposable PGlite backend and does not
relax the PostgreSQL, process, artifact, or release boundaries of Waves A to C.

## Accepted Gate

The user accepted this sprint on 2026-08-06.

Progress as of 2026-08-07: Tasks 00001, 00002, 00003, 00004, and the added
Task 00006 are verified. Task 00005 is the only open task and is unblocked now
that Wave D is verified. Task 00004's browser-agent acceptance review remains
outstanding.
