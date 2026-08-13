# Tabular

Tabular is a PostgreSQL-native spreadsheet application composed directly from
focused Stackpress libraries. The current production slice includes catalog
discovery, table and column lifecycles, typed grid editing, saved views, shared
row order, committed SSE synchronization, import/export, durable operations,
and a governed MCP surface.

## Supported local human review

The supported review path uses an explicitly disposable `postgres:18` Docker
container. Its database is published only on `127.0.0.1:55432`, stores data in
container tmpfs, and is rejected by cleanup if its image, disposable label,
loopback binding, or non-retained storage contract changes.

```sh
npm ci
npm run local-review:setup
npm run local-review:start
```

Open `http://127.0.0.1:3000` and sign in through the visible PostgreSQL login
form with username `tabular_reviewer` and password
`review-local-only-2026`. Setup provisions distinct
`tabular_review_web`, `tabular_review_worker`, and
`tabular_review_migrator` authorities, plus a safe
`tabular_review_member` authorization role. It migrates and seeds real
Operations and Finance schemas with representative rows and Tabular metadata.

The launch command supervises the checked-in TypeScript web, worker, and
continuous DDL migrator entrypoints through `tsx`. It writes owner-only process
state and logs beneath `.build/local-review`; no server JavaScript is emitted.

```sh
npm run local-review:shutdown
npm run local-review:start
npm run local-review:cleanup
```

Shutdown gracefully stops all three application processes and the PostgreSQL
container within bounded time; a later start resumes it. Cleanup permanently
destroys only the exact disposable container and generated local-review state.
It refuses retained storage or non-loopback PostgreSQL publishing.
## No-PostgreSQL development acceptance

For a development-only review without PostgreSQL, build the source checkout and
start the thin source entrypoint:

```sh
npm run build
npm run dev
```

When development has no `TABULAR_*_DATABASE_URL` value, `npm run dev` creates an
in-memory PGlite database, applies the real migrations, and invokes the same
`seedLocalDemo` helper used by `npm run seed:demo`. The database is recreated
when the process restarts. Open `http://127.0.0.1:3000` and sign in with:

```text
Username: tabular_reviewer
Password: review-local-only-2026
```

The review data includes Operations and Finance folders, representative files
and rows, the table grid, import/export, and System activity. After signing in,
review `/`, `/pages/browse.html`, `/pages/table.html`,
`/pages/import.html`, and `/pages/system-activity.html` (the browse/table
pages also accept the seeded folder/table query parameters used by the links).

This path is source-only and development-only. A configured development
PostgreSQL URL continues to use PostgreSQL; live, worker, and migrator
processes reject the development adapter, and production builds do not import
PGlite.
## Source checkout

Requirements: Node.js 22.14 or newer, npm 11, and PostgreSQL 18. Copy the values
from `.env.example` into your shell or process supervisor; the application does
not load dotenv files. Use three PostgreSQL login roles for web, migrator, and
worker authority, all targeting the same database.

```sh
npm ci
npm run build
npm run migrate
npm run seed:demo
npm start
```

Run `npm run worker` in a second process. When continuous confirmed DDL
consumption is assigned locally, run `npm run migrator:operations` in a third.

## Packaged release

`npm run package:release` creates `.build/release-package` with the production
TypeScript source runtime and built Reactus assets. Inside that package,
install only production dependencies; do not run a build because build tooling
and development-only scripts are intentionally absent:

```sh
npm ci --omit=dev --ignore-scripts
npm run preflight
npm run migrate
npm start
```

Run `npm run worker` as a second supervised package process. The release gate
finalizes `release-manifest.json` only after the production install, so its
hash list covers the shipped application, assets, configuration references,
documentation, and installed production dependency tree (excluding the
self-referential manifest file).

The demo seed is local-only, requires the explicit argument embedded in the
package script, refuses production, and installs idempotent Operations and
Finance data only when `TABULAR_DEMO_MEMBER_ROLE` names an existing safe
`NOLOGIN` role the migrator may set. It reconciles live PostgreSQL objects and
binds friendly file/column metadata without importing test or review-evidence
modules.

Use `/healthz` for process liveness and `/readyz` for readiness. Both web and
worker handle `SIGTERM` and `SIGINT` with bounded shutdown. See the
[operator runbook](docs/operator-runbook.md) for role provisioning, deployment,
diagnostics, backup/restore, recovery, and rollback procedures.

## Verification

`npm run verify` runs type, unit/component/contract, production-build,
architecture, runtime, and entrypoint checks. PostgreSQL integration suites are
separate because they require an explicitly disposable PostgreSQL 18 target;
the operator runbook lists every command and guard. `npm run verify:release`
assembles the isolated production package and final evidence manifest after the
guarded PostgreSQL matrix, process lifecycle, crash, physical restore, browser,
and native accessibility proofs are available.

Google sandbox credentials, hosting, secret storage, alert destinations,
backup ownership, and target RPO/RTO remain deployment inputs. Local fixtures
do not constitute those live production validations.
