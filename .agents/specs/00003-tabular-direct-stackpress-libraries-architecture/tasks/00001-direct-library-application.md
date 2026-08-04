# Task 00001: Initialize The Direct-Library Application

## Task Summary

Create the production application shell with direct focused-library imports and
Ingest's package plugin loader. Establish the configuration, bootstrap, plugin
ownership, Reactus build, entrypoints, readiness, and shutdown contracts that
all later tasks inherit.

Status: `verified`

## Implementation Steps

1. Create the root package/toolchain with exact direct pins for Ingest, Inquire
   and its adapters, Reactus, lib, React, PGlite, `pg`, TypeScript, and test tools.
2. Add typed root `config/` modules for environment, server, database, Reactus,
   sessions, SSE, workers, and production validation without embedding secrets.
3. Add explicit `bootstrap/` modules that construct the Ingest `HttpServer`,
   load config, call `server.bootstrap()`, and expose bounded startup/shutdown.
4. Create `plugins/app/plugin.ts` using direct Ingest types and register it in
   the top-level `package.json.plugins` array before bootstrapping.
5. Document and enforce feature ownership: each plugin has `plugin.ts` and only
   the `components/`, `events/`, `pages/`, `views/`, `helpers/`, and plugin-local
   test files it actually needs. Keep browser-facing imports server-free.
6. Add web, migrate, and worker entrypoints; only web owns the HTTP listener.
7. Wire Reactus production page/client/asset builds and explicit asset serving.
8. Add health/readiness, structured error mapping, signals, in-flight draining,
   and cleanup for servers, pools, workers, and temporary resources.

## Verification Steps

1. Run clean dependency install, type check, unit tests, and production build.
2. Assert the lockfile/import graph excludes umbrella `stackpress`, Idea,
   generated stores, and built-in auth/API/session/admin packages.
3. Test plugin discovery, registration order, config availability, duplicate
   registration failure, bootstrap idempotency, and registered service lookup.
4. Start the built server, check health/readiness and Reactus assets, then stop it
   and confirm the port/process/resources are released.
5. Run the dependency audit and record every unresolved advisory disposition.

## Acceptance Steps

None. The starter/health surface is infrastructure, not meaningful product UI.

## Implementation Notes

Started 2026-08-01 after a read-only reconciliation of the Frozen spec,
accepted task tracker, current Context, P-001/P-002 production translations,
git state, and installed focused-package APIs. The root worktree had no
production application or unrelated changes. Use the direct Ingest plugin
contract; do not copy the scaffold skill's umbrella `stackpress/server` import.

Implemented the root direct-library application shell with exact dependency
pins, typed config, explicit bootstrap and resource ownership, extensionless
Ingest plugin discovery, and a stable duplicate-guarded `tabular.app` service.
Only the web entrypoint owns an HTTP listener; migrate is one-shot and worker is
a long-lived signal-bounded shell. Reactus emits a hashed allowlisted artifact
manifest, and runtime serving rechecks file size, digest, lexical confinement,
and real-path confinement. Health, readiness, structured error finalization,
in-flight draining, reverse-order resource cleanup, signal handling, and
working-directory-independent source/built paths are in place.

The focused Stackpress scaffold guidance influenced the minimal plugin shape
and browser/server separation. Frozen Spec 00003 overrode its generic umbrella
lifecycle examples: production code imports only the focused libraries and
uses top-level `package.json.plugins` plus `server.bootstrap()`.

## Verification Notes

Passed 2026-08-01.

- A clean `npm ci` installed the exact root lockfile successfully.
- `npm run verify` passed type checking; 13/13 source tests; the Reactus and
  server production build; artifact verification; the direct-library and
  forbidden-package/import audit; a built server health/readiness, error
  sanitization, manifest-asset, idempotent-shutdown, and port-release smoke;
  and built web/migrate/worker entrypoint checks from a non-project working
  directory.
- Error tests include a later ordinary-priority listener that attempts to
  restore retained error text. The final low-priority sanitizer preserves typed
  exposed 4xx errors and hides unexpected messages and stacks.
- `git diff --check` passed. The installed `.agents` validator passed with only
  pre-existing preferred-line-count warnings in Context and historical spec
  files.
- `npm audit --offline --json` and `npm audit --offline --omit=dev --json`
  reported zero cached advisories. These are explicitly not live-registry
  evidence: a networked audit was unavailable because policy prevented sending
  this private package's dependency metadata to the public npm endpoint.
- The lock still contains dev-only `esbuild@0.27.7` through `tsx@4.21.0` and
  `vite@7.3.6`. Prior proof evidence identifies low-severity
  `GHSA-g7r4-m6w7-qqqr`, fixed upstream in esbuild 0.28.1. Disposition: accepted
  as contained for this task because no Vite/esbuild development server is
  exposed and production runs the built Reactus/Ingest output; re-run a live
  full and production audit and upgrade when the pinned toolchain supports the
  fixed release, no later than Task 00014.
- Node 26.2.0 emitted `tsx`'s `module.register()` deprecation warning, and npm
  emitted a host user-config `python` warning. Neither originated from the
  application runtime and neither failed the gate.
- The shared shutdown deadline bounds orchestration but cannot cancel a close
  promise already executing. Later PostgreSQL pool and worker owners must add
  real force/destroy behavior and target-specific tests.
- No PostgreSQL 18 connectivity, pool, role, migration, or cleanup claim is
  made by Task 00001; those gates begin in Task 00002.

Independent final review found no remaining blocking code issue and recommended
PASS after this evidence was recorded.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
