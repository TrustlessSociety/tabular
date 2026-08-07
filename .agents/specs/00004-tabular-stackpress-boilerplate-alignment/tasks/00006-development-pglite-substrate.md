# Task 00006: Development-only PGlite substrate

## Summary

Add a development/acceptance-only PGlite database backend so the Tabular web
application can run from source without PostgreSQL or a database connection
string. Preserve PostgreSQL as the canonical live and production authority.

This task is user-authorized work added after the Frozen Spec 00004 review
baseline. It builds on the completed Tasks 00001, 00002, and 00003 and reverts
none of their process, artifact, or lazy-page boundaries.

## Implementation Steps

1. Add a source-only PGlite runtime that dynamically imports
   `@electric-sql/pglite` and `@stackpress/inquire-pglite/Connection` only after
   the development, URL-less web gate is selected.
2. Run the real database migrations and reuse `seedLocalDemo` for disposable
   Operations and Finance review data.
3. Inject the development database executor and login verifier only into the
   development web application; keep PostgreSQL pool, worker, migrator, live,
   and production paths unchanged and fail closed when an invalid adapter is
   supplied.
4. Add deterministic production/migrator refusal coverage and architecture
   assertions for the development-only dynamic import boundary.
5. Document startup, credentials, route review, and the production authority
   boundary.

## Verification

Run the repository gates in PowerShell:

```text
npm run typecheck
npm run verify:architecture
npm run verify:secrets
npm test
npm run build
npm run verify:artifacts
npm run verify:runtime
npm run verify:entrypoints
```

Also start `npm run dev` with every `TABULAR_*_DATABASE_URL` removed, sign in,
and fetch the root, browse, table, import, and system-activity routes. The
PostgreSQL integration gates remain separate and require a disposable local
PostgreSQL 18 target.

## Acceptance Criteria

- `npm run dev` starts a working development server without PostgreSQL or a
  database URL after the normal source build.
- Real migrations and the existing demo seed provide visible Operations and
  Finance content to an authenticated reviewer.
- Sign-in works with `tabular_reviewer` /
  `review-local-only-2026`, and the required data-backed routes return real
  HTML with real seeded content.
- Production, live, worker, and migrator configurations cannot select PGlite.
- PGlite packages remain development dependencies and are absent from the
  production import graph.

## Implementation Notes

Implemented with the Wave A lifecycle/config split and the Wave B/C app,
artifact, lazy-page, and feature-owned Reactus boundaries intact.

`plugins/database/helpers/service.ts` now accepts a development backend only
for a URL-less web service and routes web transactions through its executor;
PostgreSQL pool behavior remains the existing path. A dedicated transaction
helper preserves role, isolation, settings, rollback, and finalize semantics
without importing PGlite.

`scripts/develop.ts` is a thin source entrypoint. It loads the development
config, selects PGlite only when no web URL exists, and injects the backend and
login verifier into `startWeb`. `scripts/develop-pglite.ts` is outside the
compiled production server and uses dynamic imports for both PGlite packages.
It creates safe disposable roles, runs `loadMigrations()` through
`runMigrations()`, and calls `seedLocalDemo()` rather than maintaining a second
seed implementation.

`createApplication()` rejects development adapters outside a development web
process. The database service independently rejects non-web and URL-backed
injection. The architecture verifier excludes only the two source development
scripts from the production graph and asserts their dynamic-import gate; it
continues to require both PGlite packages to remain development dependencies.
The identity service uses the injected verifier only for this development path;
its PostgreSQL login provider remains canonical when a web URL is configured.

## Verification Notes

PowerShell verification results:

- `npm run typecheck` - PASS, exit 0.
- `npm run verify:architecture` - PASS, exit 0; production dependencies remain
  PostgreSQL-only, both PGlite packages remain `testOnlyDependencies`, forbidden
  packages are absent, and the source-only dynamic gate is reported.
- `npm run verify:secrets` - PASS, exit 0.
- `npm test` - PASS, exit 0; 266 tests passed, 2 symlink tests skipped because
  this environment does not permit symlink creation.
- `npm run build` - PASS, exit 0; 18 Reactus artifacts and 11 SQL assets built.
- `npm run verify:artifacts` - PASS, exit 0; 18 Reactus artifacts and 11 SQL
  assets verified.
- `npm run verify:runtime` - PASS, exit 0; built health/readiness, manifest
  asset lookup, error sanitization, and shutdown/port release checks passed.
- `npm run verify:entrypoints` - PASS, exit 0; web, migrator, worker, and
  production-authority boundaries passed.
- Focused `tests/development-pglite-boundary.test.ts` - PASS, exit 0; both
  production and non-web adapter refusal tests passed.
- Disposable PGlite factory smoke - PASS, exit 0; roles were created, all real
  migrations ran, and `seedLocalDemo` completed.

Clean-environment end-to-end evidence used an isolated `127.0.0.1:3100` source
server with `TABULAR_*_DATABASE_URL` variables removed:

```json
{"databaseUrlVariablesPresent":0,"loginStatus":303,"routes":[{"path":"/","status":200,"bytes":9089,"contentMatch":true},{"path":"/pages/browse.html","status":200,"bytes":9106,"contentMatch":true},{"path":"/pages/browse.html?folder=operations","status":200,"bytes":9943,"contentMatch":true},{"path":"/pages/table.html?folder=operations&table=customer-orders","status":200,"bytes":15637,"contentMatch":true},{"path":"/pages/import.html?folder=operations","status":200,"bytes":9963,"contentMatch":true},{"path":"/pages/system-activity.html","status":200,"bytes":5643,"contentMatch":true}]}
```

The server log identified `database:"pglite-development"`; the route bodies
contained the expected Tabular/Operations, Customer orders, Priority warehouse
transfer, Import, and System activity content. The server was stopped after the
check.

`python .agents/scripts/validate-agent-workspace.py` - exit 1. It reports the
same five pre-existing missing-reference errors in `chrisai-chatting` and
`chrisai-designing`, plus existing Agent File line-count warnings. No new
Task 00006 validator error was introduced.

The `test:postgres:*` gates were not run because no local PostgreSQL server is
available; they are not claimed as passed.
## Acceptance Notes

The reviewer starts with `npm run build` followed by `npm run dev`, opens
`http://127.0.0.1:3000`, and signs in with the documented credentials. The
review routes are `/`, `/pages/browse.html`, `/pages/table.html`,
`/pages/import.html`, and `/pages/system-activity.html`.