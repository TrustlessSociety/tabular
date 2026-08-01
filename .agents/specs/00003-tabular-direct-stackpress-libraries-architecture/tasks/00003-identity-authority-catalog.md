# Task 00003: Implement Identity, Sessions, Authority, And Catalog

## Task Summary

Create provider-neutral identity/session security, PostgreSQL-role authority,
and caller-filtered catalog discovery as feature-owned Ingest plugins.

Status: `open`; depends on Task 00002.

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

Not started. A provider test double may prove the adapter but cannot close a
live-provider target claim.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
