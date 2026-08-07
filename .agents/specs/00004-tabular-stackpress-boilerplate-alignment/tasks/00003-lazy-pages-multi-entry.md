# Task 00003: Lazy pages and multi-entry conversion

## Summary

Replace route aggregators and the union workbench with lazy page handlers and
feature-owned Reactus view entries.

## Implementation Steps

1. Convert each page to one default export and anonymous dynamic registration.
2. Pair each rendered route with one feature view.
3. Build only unique `server.views` entries.

## Verification

Run page import/build graph, route/view-data, no-eager-handler, and focused
browser route checks.

## Acceptance Criteria

Review explorer, grid, import, and operations routes at desktop and 390-by-844.

## Implementation Notes

Implemented on top of the completed Wave A and Wave B boundaries. Every file
remaining under a plugin `pages/` directory is one default-exported application
action. Plugin roots register those modules through anonymous
`server.import.get/post(..., () => import('./pages/...'))` calls; no plugin
entrypoint statically imports a page handler.

Created page entries:

- `plugins/app/pages/healthz.ts`, `readyz.ts`, `client.ts`, `assets.ts`, `favicon.ts`, `not-found.ts`
- `plugins/catalog/pages/catalog.ts`
- `plugins/explorer/pages/index.ts`, `browse.ts`, `events-explorer.ts`
- `plugins/files/pages/events-files.ts`
- `plugins/grid/pages/table.ts`, `events-grid-get.ts`, `events-grid-relation.ts`, `events-grid-post.ts`
- `plugins/identity/pages/login-get.ts`, `login-post.ts`, `account.ts`, `session-get.ts`, `session-rotate.ts`, `logout.ts`
- `plugins/import-export/pages/import.ts`, `events-import-google-callback.ts`, `events-import-export-get.ts`, `events-import-export-post.ts`
- `plugins/operations/pages/system-activity.ts`, `events-operations-get.ts`, `events-operations-post.ts`
- `plugins/realtime/pages/events.ts`
- `plugins/saved-views/pages/events-saved-views-get.ts`, `events-saved-views-post.ts`

Moved non-entry modules to helpers: import/export raw upload, operations page
contracts, operations presenter, and the shared route-validation helpers.
Deleted all plugin `pages/routes.ts` aggregators and removed
`plugins/ui/views/workbench.tsx`. The former workbench implementation now
lives as the grid-owned `plugins/grid/views/table.tsx` entry, while explorer,
import/export, identity, and operations each have their own Reactus wrapper.

Registered view entries are:

- `@/plugins/explorer/views/index`
- `@/plugins/grid/views/table`
- `@/plugins/identity/views/login`
- `@/plugins/identity/views/account`
- `@/plugins/import-export/views/import`
- `@/plugins/operations/views/activity`

Rendered handlers prepare their payload with `res.data.set()`. The app view
engine reads that Nest value with `res.data.get()`, builds the typed D-008
Provider projection, and renders the route’s registered feature entry. The
signed-in account handoff now projects only the allowlisted display identity
and CSRF value; mutable database data remains behind authenticated actions.

`bootstrap/build.ts` now discovers the unique entries directly from
`server.views`, calls `engine.set()` once per entry, and never resolves or
executes a lazy page handler. The build profile still resolves only `config`
and `route`; it no longer uses a singleton Reactus entry or a placeholder
artifact.

## Verification Notes

PowerShell verification results:

- `npm run typecheck` - PASS, exit 0.
- `npm run verify:architecture` - PASS, exit 0; one-default-export pages, no aggregators, no eager page imports, feature-owned views, no singleton Reactus entry, and no UI workbench composition root verified.
- `npm run verify:secrets` - PASS, exit 0.
- `npm test` - PASS, exit 0; 264 tests passed, 2 symlink tests skipped because this environment does not permit symlink creation.
- `npm run build` - PASS, exit 0; 18 Reactus artifacts and 11 server SQL assets built and verified.
- `npm run verify:artifacts` - PASS, exit 0; 18 Reactus artifacts and 11 SQL assets verified.
- `npm run verify:runtime` - PASS, exit 0; built runtime health/readiness, login-owned client and CSS manifest artifacts, error sanitization, and shutdown/port release verified.
- `npm run verify:entrypoints` - PASS, exit 0; web, migrator, worker, and production-authority boundaries verified.
- `Push-Location proofs/tabular-boilerplate-alignment; npm test; Pop-Location` - PASS, exit 0; P-002 regression passed 3/3.
- `python .agents/scripts/validate-agent-workspace.py` - exit 1; the known pre-existing missing targets in `chrisai-chatting` and `chrisai-designing` remain, along with existing line-count warnings. Task 00003 did not add a new validator error or worsen that set.

The local PostgreSQL service is not running, so `test:postgres:*` gates were
not executable in this environment and are not claimed as passed.

## Acceptance Notes

No browser evidence was captured by this implementation agent. Later reviewer:

1. Build and start the development server from the repository root with
   `npm run build` followed by `npm run dev`. Use the origin printed by the web
   entrypoint (normally `http://127.0.0.1:3000`).
2. At desktop width, review `/`, `/pages/browse.html?folder=operations`,
   `/pages/table.html?folder=operations&table=customer-orders`,
   `/pages/import.html?folder=operations`, and
   `/pages/system-activity.html` after signing in with the available test
   PostgreSQL identity.
3. Repeat the same route review at exactly 390x844. Check navigation between
   files, table, import, and activity, CSS/static asset loading, absence of
   horizontal overflow, form/action behavior, and browser console errors.
4. When signed out, confirm `/` and the protected page routes redirect to
   `/auth/login`; confirm `/auth/login` remains usable at both viewport sizes.
