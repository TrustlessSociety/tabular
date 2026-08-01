# Task 00001: Initialize The Direct-Library Application

## Task Summary

Create the production application shell with direct focused-library imports and
Ingest's package plugin loader. Establish the configuration, bootstrap, plugin
ownership, Reactus build, entrypoints, readiness, and shutdown contracts that
all later tasks inherit.

Status: `open`

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

Not started. Use the direct Ingest plugin contract; do not copy the scaffold
skill's umbrella `stackpress/server` import.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
