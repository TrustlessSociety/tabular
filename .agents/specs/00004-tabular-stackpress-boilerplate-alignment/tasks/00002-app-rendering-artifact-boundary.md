# Task 00002: App rendering and artifact boundary

## Summary

Move Reactus, Provider projection, and verified static delivery into `plugins/app`.

## Implementation Steps

1. Adopt the P-002 browser projection and artifact patterns.
2. Add development containment and production manifest validation.
3. Remove Vite from production request handling.

## Verification

Run P-002 regression, hydration-denylist, traversal/tamper, production-build,
and artifact checks.

## Acceptance Criteria

Review a signed-out shell at desktop and 390-by-844.

## Implementation Notes

Implemented on top of Task 00001's process-safe configuration foundation.

- `plugins/app/plugin.ts` now owns the web-only Reactus renderer and artifact-manifest loading. Build mode keeps the Task 00001 singleton `config/reactus.ts` entry and build-only placeholder compatibility; `plugins/ui` and the singleton entry were intentionally left for Task 00003.
- `plugins/app/helpers/projection.ts` defines the browser-only D-008 contract and explicitly copies only public identity, shell, language, route, presentation capability, CSRF, request method/path, response status, and immutable data. `plugins/app/components/Provider.tsx` exposes the request/response/session/language/data hooks. Rendering no longer spreads server page/controller data into Reactus props.
- `plugins/app/helpers/assets.ts` provides development public-root resolution with realpath containment and rejects absolute paths, parent traversal, symlink escapes, directories, and non-files. Production serves only exact manifest routes after typed-root, size, and SHA-256 verification.
- `bootstrap/build.ts` records intentional public static files with destination, route, size, and hash; page artifacts cannot be public routes. Production request handling has no Vite dependency or fallback.
- Identity stylesheet lookup is deferred to request time so app-owned manifest loading completes before identity requests need the stylesheet artifact.

## Verification Notes

PowerShell verification results:

- `npm run typecheck` - PASS, exit 0.
- `npm run verify:architecture` - PASS, exit 0; direct focused imports, server-free browser graph, and feature-owned routes verified.
- `npm run verify:secrets` - PASS, exit 0.
- `npm test` - PASS, exit 0; 260 passed, 0 failed, 2 skipped.
- `npm run build` - PASS, exit 0; 3 Reactus artifacts and 11 SQL assets built and verified.
- `npm run verify:artifacts` - PASS, exit 0.
- `npm run verify:runtime` - PASS, exit 0; built health/readiness, manifest-allowlisted assets, and idempotent shutdown verified.
- `npm run verify:entrypoints` - PASS, exit 0.
- `npm run test:postgres:production-boundary` - BLOCKED, exit 1; the required disposable fixture authorization was absent (`TABULAR_TEST_POSTGRES_DISPOSABLE` expected `task00002-disposable`). No database fixture was created or cleaned up.
- `python .agents/scripts/validate-agent-workspace.py` - exit 1 with the known pre-existing missing skill-reference targets in `chrisai-chatting` and `chrisai-designing`; the warning/error set was not worsened by Task 00002.

Deterministic coverage added for every D-008 forbidden field, development traversal and symlink escape, exact public-route lookup, page-route rejection, and changed-size/same-size hash tampering.

## Acceptance Notes

Later reviewer: run the web entrypoint and inspect `http://127.0.0.1:3000/auth/login` (or the emitted origin plus `/auth/login`) while signed out at desktop width and 390-by-844. Check the login shell, Tabular identity, CSS/static asset loading, spacing and controls, absence of horizontal overflow, and absence of browser console errors. Visiting `/` while signed out should redirect to `/auth/login`.

This agent did not capture browser evidence. Task 00003 must complete the signed-in data handoff when it converts the remaining page/view surface; this task deliberately did not perform that Wave C/D work.
