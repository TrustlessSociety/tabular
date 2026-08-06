# Task 00003: Implement Identity, Sessions, Authority, And Catalog

## Task Summary

Create provider-neutral identity/session security, PostgreSQL-role authority,
and caller-filtered catalog discovery as feature-owned Ingest plugins.

Status: `verified`; depends on verified Task 00002.

## Implementation Steps

1. Create registered `plugins/identity/plugin.ts` and `plugins/catalog/plugin.ts`.
2. Put request/session handlers in `events/` or `pages/` and shared server-only
   security/catalog logic in each owning plugin's `helpers/`.
3. Normalize a verified provider subject into an application identity, then
   resolve the current allowlisted PostgreSQL role without trusting raw claims.
4. Implement opaque rotated server-side sessions, idle/absolute expiry,
   revocation, role remapping, logout, and production cookie policy.
5. Enforce exact trusted origin plus a session-bound synchronizer CSRF token for
   browser mutations; keep non-browser transport identity independent.
6. Implement deny-default application capability checks followed by native
   PostgreSQL grants, RLS, constraints, and triggers as final authority.
7. Discover caller-visible connections/databases/schemas/tables/read-only views
   with stable identity, drift reconciliation, and redacted metadata.

## Verification Steps

1. Run authentication, session rotation/expiry/revocation, cookie, origin,
   CSRF, logout, and role-remapping tests.
2. Run allow/deny matrices across application policy, grants, column privileges,
   forced RLS, constraints, and caller-filtered catalog results.
3. Test rename/drop/replacement drift, two-connection races, redaction, invalid
   identifiers, and pool-role cleanup after every outcome.
4. Verify no cookie, provider claim, page handler, or MCP-shaped caller can grant
   a PostgreSQL role directly.

## Acceptance Steps

None. User-visible sign-in and denial presentation are accepted in later UI tasks.

## Implementation Notes

Started 2026-08-01 after Task 00002 passed its clean install, PGlite,
PostgreSQL 18.4, P-002 regression, built migrator, and two independent final
reviews. Reconciled the complete task detail with current Context, Frozen Spec
00003's identity/security decisions, and P-001's explicitly limited session and
provider-double evidence. A provider test double may prove the adapter but
cannot close a live-provider target claim.

Implemented registered `tabular.identity` and `tabular.catalog` services in the
declared `database -> identity -> catalog -> app` bootstrap order. The identity
plugin owns an abstract provider adapter whose protected brand is runtime
asserted, provider/issuer-scoped application identities, operator-only
OID-pinned role allowlisting/mapping, opaque hashed browser sessions, fixed
absolute and sliding-idle expiry, rotation/revocation, logout, and bounded
multi-tab synchronizer-token hashes. No production test-login route or caller
role field exists; the test adapter remains under `plugins/identity/tests/`.

Browser mutations require a canonical configured origin and one matching
session-bound CSRF token. Production cookie options are `__Host-`, Secure,
HttpOnly, SameSite Strict, Path `/`, no Domain, bounded lifetime, and explicit
option-preserving expiry. Session resume issues a fresh bounded tab token over a
private no-store response without invalidating other resumed tabs. Logout
validates and revokes server state before queueing cookie expiry. The root
Ingest adapter now bounds all request bodies and maps oversized bodies to a
sanitized 413 response.

All identity operations use a common identity-first lock order before mapping,
allowed-role, and session locks. Application capability denial occurs before
pool checkout. The same authority transaction locks and rechecks the live
identity/session/mapping, verifies database and role OIDs plus unsafe role
attributes, performs quoted `SET LOCAL ROLE`, and repeats effective-role
OID/name/safety verification before the callback. PostgreSQL grants, column
privileges, forced RLS, constraints, and triggers remain final authority.

Catalog reconciliation takes a complete base-authority snapshot under a
database-scoped advisory transaction lock, persists stable schema/relation/
column identities, records rename/change/missing/replaced drift, and retries
bounded serialization, uniqueness, or deadlock outcomes. Caller discovery then
runs under the resolved role and returns only the registered connection/current
database, USAGE-visible schemas, SELECT-visible tables/read-only views, and
SELECT-visible columns. Role/ACL/policy/view-definition/connection-secret and
hidden-object metadata never enters the response.

## Verification Notes

Passed 2026-08-01.

- `npm run verify` passed type checking; 26/26 source and PGlite-labelled tests;
  the Reactus/server build; two copied SQL migration assets; artifact,
  direct-library, forbidden-package, and browser-import checks; the built
  runtime; and all web/migrator/worker entrypoint checks.
- Pure tests passed provider-brand enforcement, raw assertion/claim rejection,
  opaque token hashing, exact-origin negatives, timing-safe token comparison,
  production/development cookie policy, deny-default capabilities, plugin
  ordering, and malformed configuration/body limits. PGlite passed the ordered
  `0001` plus `0002` migrations, re-entry, failed-DDL rollback, drift/ahead
  history, and transaction-control rejection; it is not role/catalog evidence.
- `npm run test:postgres:identity-catalog` (then named
  `npm run test:postgres:task00003`) passed against the guarded loopback,
  no-volume `postgres:18` target running PostgreSQL 18.4. It covered the real
  Ingest HTTP session/resume/rotate/logout path, rejected logout without cookie
  mutation, multi-tab CSRF recovery, fixed absolute expiry, rotation and replay,
  idle expiry, logout, provider/identity revocation, role remap and OID drift,
  unsafe-role rejection, and hashed-at-rest session/CSRF records.
- The PostgreSQL authority matrix passed application denial before checkout,
  post-`SET ROLE` OID/name/safety verification, column-grant denial, caller-row
  forced RLS, check and trigger SQLSTATEs, callback rollback, clean role reset,
  and zero checked-out clients after every outcome.
- Caller catalog verification passed schema/object/column filtering, hidden
  metadata redaction, table and read-only view classification, stable schema/
  table/view/column IDs over rename/type/view-definition drift, and a new ID plus
  `replaced` tombstone on drop/recreate.
- Two-connection races passed concurrent catalog reconciliation with one stable
  identity, exactly one winner for same-session rotation, and an in-flight
  old-role action completing before a remap invalidated the session. Bounded
  reconciliation retry and the common identity-first lock order left the pool
  clean.
- The current Task 00002 PostgreSQL 18 regression passed after the shared
  migration/transaction changes. The original P-002 regression passed from an
  isolated copy in its own disposable PostgreSQL 18 container without modifying
  Frozen proof files.
- `git diff --check` passed. Three independent final reviews initially found
  provider branding, absolute expiry, logout ordering, CSRF resume, role TOCTOU,
  reconciliation ordering/concurrency, and lock-order gaps. Each received a
  focused regression; all three final verdicts are PASS with no blocker.

Open target validations remain explicit: live provider signature/issuer/
audience/key rotation, account and organization policy, provider logout and
revocation delivery, MFA, production HTTPS/reverse proxy/browser cookie
enforcement, actual deployment roles/credentials, load/pool sizing, and full
MCP transport identity. The provider double and local PostgreSQL target do not
close those claims.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
