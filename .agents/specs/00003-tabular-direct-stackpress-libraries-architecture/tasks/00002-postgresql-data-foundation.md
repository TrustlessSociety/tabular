# Task 00002: Install The Handwritten PostgreSQL Data Foundation

## Task Summary

Implement the handwritten system schema, migration/repository boundary, safe
PostgreSQL pool lifecycle, and separate PGlite/PostgreSQL test targets without
Idea or generated stores.

Status: `verified`; depends on verified Task 00001.

## Implementation Steps

1. Create `plugins/database/plugin.ts` and register database configuration,
   pools, repositories, and migrator services through Ingest bootstrap.
2. Put database-only reusable code in `plugins/database/helpers/`; keep ordered
   SQL migrations and migration metadata inside the owning plugin.
3. Define handwritten TypeScript contracts/repositories for fixed `tabular.*`
   records and catalog-driven access for dynamic tables/views.
4. Implement transactional migration history, advisory transaction locking,
   idempotent re-entry, and deployment-only migrator authority.
5. Implement checked-out-client ownership, allowlisted transaction-local roles
   and settings, rollback, reset/verification, and destroy-on-cleanup-failure.
6. Implement safe dynamic identifier validation and PostgreSQL OID plus
   connection-scope identity for live objects.
7. Provide PGlite-focused unit helpers and an isolated PostgreSQL 18 integration
   harness with explicit evidence labels and cleanup.

## Verification Steps

1. Run repository/migration unit tests through Inquire/PGlite.
2. On PostgreSQL 18, verify clean install, concurrent migrators, idempotent
   re-entry, failed-DDL rollback, and no divergent version record.
3. Exercise success, denial, exception, cancellation, retry, pool reuse, and
   cleanup failure without role/setting leakage.
4. Exercise expected-version races and rename/drop/recreate OID identity.
5. Re-run the P-002 PostgreSQL boundary regression and close all resources.

## Acceptance Steps

None. Database contracts and integration results are technical evidence.

## Implementation Notes

Started 2026-08-01 after Task 00001 passed its full gate and independent final
review. Reconciled the complete task detail with current Context, Frozen Spec
00003 decisions and sprint output, and the P-002 PostgreSQL 18 proof and
production translation. The migration entrypoint is separate from caller
transactions and must never run from a page request. PGlite and PostgreSQL 18
evidence will remain separately labeled.

Implemented `plugins/database/plugin.ts` ahead of the app plugin with the stable
`tabular.database` service. The service owns process-scoped web, migrator, or
worker authority and refuses to open a different process's pool. It exposes a
narrow handwritten executor/repository boundary, guarded pool checkout,
authority-scoped transactions, the one-shot migration runner, and catalog/OID
lookup whose connection scope is read from the same live client.

The ordered `0001-foundation.sql` asset and migration manifest are copied
byte-for-byte into the production build. The migrator uses a Tabular-namespaced
transaction-scoped advisory lock, one transaction per version, immutable
name/checksum history, database-ahead/prefix detection, DDL/version atomicity,
and exact PostgreSQL 18 schema/ledger adoption checks. The ledger contract
matches owner, relation kind, all columns, types, nullability, defaults, and all
nine named PG18 constraints including the full SHA-256 check; foreign or
malformed structures fail closed.

One concrete checked-out `pg` client owns each transaction. Tabular manually
owns begin/commit/rollback, allowlisted role and transaction-local settings,
reset and baseline verification, primary-plus-cleanup error preservation, and
`release(error)` destruction whenever client reuse is not proved safe. Managed
pools reject new checkout during close and force-destroy checked-out clients at
their bound. Web readiness now requires both connectivity and an exact current
migration history. The migrator exits nonzero when invoked without authority.

PGlite remains a fresh-per-test repository/migration helper only. No identity,
session, persistent catalog policy, drafts, jobs/outbox, generated store/client,
or later-task table was introduced.

## Verification Notes

Passed 2026-08-01.

- `npm ci` completed a clean exact-lock installation with 105 packages.
- `npm run verify` passed type checking; 19/19 source and PGlite-labelled unit
  tests; production Reactus/server builds; byte-identical SQL-asset checks;
  direct-library/forbidden-package and browser-import audits; the built runtime;
  and web/migrator/worker entrypoint checks. The no-authority migrator case now
  fails closed with exit status 1 and never owns an HTTP listener.
- The PGlite-labelled cases passed clean install, idempotent re-entry,
  handwritten ledger repository reads, failed-DDL rollback, checksum drift,
  ahead history, transaction-control rejection, and safe identifier quoting.
  PGlite is not claimed as role, pool, advisory-lock concurrency, cancellation,
  OID, or PostgreSQL-server evidence.
- `npm run test:postgres:foundation` (then named `npm run test:postgres`) passed
  against an explicitly authorized, loopback,
  no-volume `postgres:18` target running PostgreSQL 18.4. The harness refuses
  any database other than the named disposable `tabular_task00002` target and
  aggregates cleanup failures rather than suppressing them.
- PostgreSQL 18 coverage passed server-version assertion; foreign/malformed
  schema refusal; exact ledger defaults/constraints; clean and concurrent
  migrations; idempotency; failed-DDL rollback and corrected retry; drift and
  ahead-state rejection; separate caller denial; allowlisted role/RLS results;
  callback rollback; SQLSTATE `57014` statement-timeout cancellation and pool
  recovery; preflight and cleanup failure destruction; application-name,
  role, and timeout reset; pool reuse; expected-version races; and live-bound
  OID identity across rename and drop/recreate. Web readiness included the
  registered PostgreSQL pool and exact migration state, then bounded shutdown
  closed it.
- The built migrator ran from `/private/tmp`, applied `0001`, then re-entered
  with `applied: []`, proving working-directory independence and idempotency.
- `npm run test:postgres:production-boundary` (then named
  `npm run test:postgres:p002`) reran the original P-002 PostgreSQL 18 regression
  from an isolated `.build` copy. It passed without modifying the Frozen proof files.
- `git diff --check` passed. The installed `.agents` validator passed with only
  the same pre-existing preferred-line-count warnings.
- Two independent final reviews initially found transaction reuse, OID scope,
  harness isolation/cleanup, readiness/migrator, and ledger-adoption gaps. Each
  received a focused regression and both final verdicts are PASS with no
  remaining Task 00002 blocker.
- The exact disposable container `tabular-task00002-pg18` was stopped and
  auto-removed after verification; it had no retained volume.

Remaining target validations are honestly deferred: production credential and
role inventory, actual deployment connection IDs, request-driven backend
cancellation beyond server statement timeouts, load/pool sizing, backup,
restore, and disaster recovery. Later tasks must not relabel this evidence.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
