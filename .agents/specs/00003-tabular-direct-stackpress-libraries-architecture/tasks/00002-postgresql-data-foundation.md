# Task 00002: Install The Handwritten PostgreSQL Data Foundation

## Task Summary

Implement the handwritten system schema, migration/repository boundary, safe
PostgreSQL pool lifecycle, and separate PGlite/PostgreSQL test targets without
Idea or generated stores.

Status: `open`; depends on Task 00001.

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

Not started. The migration entrypoint is separate from caller transactions and
must never run from a page request.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
