# Tabular Operator Runbook

## Supported release boundary

Tabular requires Node.js 22.14 or newer, npm 11, and PostgreSQL 18. The web,
migrator, and worker processes use distinct PostgreSQL login roles against one
database. Human authentication uses existing safe PostgreSQL `LOGIN` roles.
Their live database and role OIDs plus current memberships resolve to
separately managed `NOLOGIN` authorization roles. The web pool assumes those
roles only inside bounded transactions and resets session state before
returning a connection.

This repository proves the application and database contracts. A deployment
owner must still select and validate hosting and TLS termination, secret
management, Google OAuth credentials, alert destinations, backup ownership,
and target RPO/RTO before declaring a production environment ready.

## Disposable local human review

Docker, Node.js 22.14 or newer, npm 11, and ports `3000` and `55432` on
loopback must be available. Run the supported workflow from the repository
root:

```sh
npm ci
npm run local-review:setup
npm run local-review:start
```

Setup resets only the fixed container
`tabular-task00014-review-pg18` after proving its `postgres:18` image, exact
Task 00014 disposable label, `127.0.0.1:55432` publishing, and tmpfs data
directory. It refuses a same-named retained or non-loopback container. It then
creates database `tabular_review` and these roles:

| Role | Login | Purpose |
| --- | --- | --- |
| `tabular_review_web` | yes | Browser/MCP session and bounded `SET ROLE` work |
| `tabular_review_worker` | yes | Durable background operations |
| `tabular_review_migrator` | yes | Migrations and continuous confirmed DDL |
| `tabular_review_member` | no | Safe business-data ownership and authorization |
| `tabular_reviewer` | yes | Ordinary human PostgreSQL authentication |

The human review credentials are exactly:

```text
URL: http://127.0.0.1:3000
Username: tabular_reviewer
Password: review-local-only-2026
```

Setup runs migrations and the production demo-seed helper. The seed creates
member-owned `operations` and `finance` peer schemas, four representative
files with cross-schema relations, twelve rows, and reconciled file/column
metadata. Rerunning the seed preserves changed rows and metadata; a changed or
foreign-owned contract is refused.

`npm run local-review:start` supervises these exact compiled commands and
records their validated PIDs and owner-only logs beneath `.build/local-review`:

```sh
node dist/entrypoints/web.js --host 127.0.0.1 --port 3000
node dist/entrypoints/worker.js
node dist/entrypoints/migrate.js --consume-operations
```

Use the supervisor command for supported review instead of launching those
three commands manually. It waits for web readiness, worker readiness, and the
continuous DDL migrator before returning. Because it runs compiled Node
entrypoints, the supported development launch does not use `tsx` or emit the
Node `module.register()` loader deprecation.

For a bounded shutdown that preserves the stopped disposable container for a
restart, and for permanent cleanup, run:

```sh
npm run local-review:shutdown
npm run local-review:start
npm run local-review:cleanup
```

Shutdown sends `SIGTERM` only when each stored PID still names its recorded
compiled entrypoint, waits twelve seconds, refuses force-kill on timeout, and
then gives PostgreSQL ten seconds to stop. Cleanup repeats the same process
guard, revalidates the exact image/label/loopback/tmpfs container contract, and
permanently removes the container plus `.build/local-review`. The tmpfs data
cannot be recovered. Cleanup refuses retained storage and non-loopback targets.

Human review from start to finish:

1. Run setup and start exactly as shown; begin at the signed-out normal URL.
2. Sign in through the visible form with the disposable PostgreSQL credentials.
3. Confirm Operations and Finance folders, seeded files, real row counts, and
   visible signed-in identity.
4. Exercise file creation/rename, columns/relations, edits/validation,
   formatting, saved views, row order, import/export, and System activity.
5. Use a second signed-in browser session for synchronization and reconnect.
6. Review desktop and `390x844`, then sign out and confirm the cookie/session
   is unusable; restart with shutdown/start and resume the review.
7. Run cleanup only when the disposable environment is no longer needed.

## Install and configure

For a source checkout, install the exact lockfile with `npm ci` and create the
compiled server and Reactus assets with `npm run build`. To assemble the
production artifact, run `npm run package:release` from that source checkout.

For an already assembled `.build/release-package`, install and execute it in
place:

```sh
npm ci --omit=dev --ignore-scripts
npm run preflight
```

Do not run `npm run build` inside the package: TypeScript source, tests, and
build tooling are intentionally excluded. The release pipeline finalizes the
package manifest after this production-only install so every shipped file
except the self-referential manifest is hashed.

Then configure the selected deployment:

1. Export configuration from `.env.example` through the shell, supervisor, or
   secret manager. Tabular intentionally does not load dotenv files.
2. Use canonical HTTPS `TABULAR_PUBLIC_ORIGIN` in production. The trusted
   reverse proxy must terminate TLS and overwrite forwarded headers; Tabular
   validates browser mutation origins against this explicit public origin and
   does not derive trust from forwarded headers.
3. Set one non-secret `TABULAR_DATABASE_CONNECTION_ID` per database target.
4. Put database passwords, Google client secret, and the 32-byte Google token
   encryption key only in the selected secret manager. Rotate them under the
   deployment owner's incident procedure; never place them in logs or source.

Production startup fails closed when HTTPS, database coordinates, or separate
database usernames are missing or invalid. Google Sheets remains visibly
unavailable unless all four Google settings are valid; CSV and XLSX stay
available independently.

## PostgreSQL authority bootstrap

Provision three least-privilege login roles outside the application:

- `tabular_migrator`: owns the `tabular` system schema and application-created
  data objects; applies migrations and confirmed DDL jobs.
- `tabular_web`: connects for browser and MCP requests and receives only the
  system-object privileges required by migrations.
- `tabular_worker`: claims durable operation jobs and completes import and
  retention work without owning an HTTP listener.

Create authorization/member roles as `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS`, grant them only applicable data-schema/table/column
privileges, and grant the web login explicit `SET` membership without ambient
inheritance. Human users remain safe PostgreSQL `LOGIN` roles whose current
memberships intersect the roles the web authority may safely assume. Apply RLS
policies on protected tables. PostgreSQL administrators own role creation,
passwords, disabling, and all account lifecycle actions; Tabular never stores
or reads password hashes.
The PostgreSQL integration harnesses are executable provisioning examples; do
not copy their disposable passwords or role names into production.

## Migrate and seed

Run the built migrator once per release:

```sh
npm run migrate
```

Migrations are ordered, checksummed, transaction-scoped, and protected by a
PostgreSQL advisory lock. The migrator refuses a foreign-owned system schema or
ledger and fails when the database history is ahead of or differs from the
application.

For a non-production smoke target only, run:

```sh
npm run seed:demo
```

The idempotent seed creates representative Operations and Finance tables,
inserts twelve rows without overwriting edits, reconciles their catalog OIDs,
and installs friendly file/column metadata. It refuses production, unsafe
member roles, changed object contracts, and foreign ownership. Set
`TABULAR_DEMO_MEMBER_ROLE` only to an existing safe `NOLOGIN` role the migrator
may set. Production data must be provisioned through accepted product actions
or an independently reviewed migration, not this seed.

## Start, probe, and stop

Start web and worker as independent supervised processes, plus continuous DDL
consumption when the deployment assigns that authority:

```sh
npm start
npm run worker
npm run migrator:operations
```

Never expose the migrator or worker as HTTP services.

Probe `GET /healthz` for liveness and `GET /readyz` for dependency readiness.
Route traffic only while readiness returns 200. Logs are newline-delimited JSON
with `timestamp`, `level`, `event`, `instanceId`, and `processKind`; index those
fields and retain the full record according to local privacy policy. Run
`npm run doctor` with only the selected scope credential for migration version,
PostgreSQL version/OID, operation backlog, dead letters, and outbox high-water
diagnostics. Alert at minimum on:

- repeated `*_shutdown_failed`, startup, migration, or readiness failures;
- sustained operation retry/dead-letter growth and lease-expiry diagnostics;
- SSE reconnect/gap-refresh spikes or capacity responses observed by the
  selected ingress and client telemetry;
- PostgreSQL saturation, long transactions, lock waits, replica lag, and disk
  or WAL pressure;
- backup failure or restore-verification failure.

Send `SIGTERM` for deployment shutdown. Web stops accepting requests, drains
in-flight requests and MCP calls, closes SSE connections and PostgreSQL pools,
then releases the listener. Worker and continuous migrator stop claiming work,
finish or release bounded leases, and close their pools. The supervisor may
force termination only after the configured shutdown deadline plus a small
platform margin.

## Backup and restore

The deployment owner sets the backup schedule, encryption, retention, RPO, and
RTO. Tabular's catalog and authority records deliberately bind to PostgreSQL
database, role, schema, and relation OIDs. A logical `pg_dump`/`pg_restore`
recreates some of those identities and is therefore an extraction aid, not a
certified full-application recovery path.

Use a WAL-consistent physical PostgreSQL 18 cluster backup or a managed-service
snapshot/PITR mechanism documented to preserve system catalog identities. A
self-managed baseline can use `pg_basebackup` with a dedicated replication
credential:

```sh
pg_basebackup --dbname="$POSTGRES_REPLICATION_URL" --format=plain --wal-method=stream --checkpoint=fast --pgdata=/backup/tabular-base
```

Restore that base backup with the same PostgreSQL major version into an isolated
cluster, replay the required WAL through the recovery target, and start it on
private coordinates. Preserve the original role and database catalogs; do not
create replacement application roles or a fresh destination database around
the restored data directory.

Point temporary, isolated web/migrator/worker processes at the restored target;
run `npm run migrate`, verify `/readyz`, inspect migration checksum history,
database/role/relation OIDs, row counts, capability/RLS behavior, pending jobs,
outbox cursors, and an authorized read/edit/reconnect journey. Promote the
restored target only after the deployment owner accepts this validation.
Regularly execute and time this restore drill; a backup file alone is not
recovery evidence.

## Release, rollback, and incident recovery

Use expand/contract-compatible migrations. Deploy migrator first, then web and
worker instances, and drain old processes. Confirm health/readiness, error rate,
job backlog, and SSE reconnect behavior before increasing traffic.

For an application-only regression, drain traffic and roll web/worker artifacts
  back to the last compatible build; do not edit the migration ledger. If a
  committed schema/data change is incompatible or corrupt, stop writers,
  preserve forensic logs and a fresh backup, restore the last verified physical
  backup into an isolated cluster, apply only compatible forward migrations,
  validate it as above, and then switch traffic. Document lost writes against
  the declared RPO.

For a stuck job, use its opaque activity ID and redacted diagnostics. Do not
change job rows by hand. Resolve the underlying permission/provider/availability
failure and allow lease recovery or use the authorized retry/cancel action. A
dead letter remains an audit record. For SSE incidents, reconnect from the last
event ID; when retention created a gap, clients must take an authorized snapshot
rather than trusting `NOTIFY` delivery.

## Release evidence commands

Run `npm run verify`, `npm run audit:production`, and `npm run verify:release`.
Use `npm run test:postgres:all` when you need the complete guarded PostgreSQL 18
suite outside the release-readiness command.
The guarded `npm run test:release:resilience` drill force-restarts only the
declared Task 00014 disposable PostgreSQL container, takes a physical base
backup into its dedicated disposable volume, restores that cluster on an
isolated port, verifies catalog identities and application state, and removes
the temporary restore container and volume. Never point its release guard or
admin URL at retained data.
For each PostgreSQL suite, set `TABULAR_TEST_POSTGRES_URL` to its exact disposable
database name and set `TABULAR_TEST_POSTGRES_DISPOSABLE` to the suite's required
guard, then run the corresponding domain-named `test:postgres:*` script. Never
run a guarded suite against retained data. The final release package records exact commands,
PostgreSQL version, browser/viewport results, screenshots, logs, and known live
deployment inputs.
