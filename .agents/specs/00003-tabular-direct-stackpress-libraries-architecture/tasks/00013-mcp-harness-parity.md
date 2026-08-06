# Task 00013: Implement MCP And Harness Parity

## Task Summary

Expose permitted Tabular capabilities to the MCP/harness boundary while proving
they share application actions, authorization, transactions, and audit behavior.

Status: `verified`; depends on verified Task 00012.

## Implementation Steps

1. Create and register `plugins/mcp/plugin.ts` with only the needed `events/`
   and `helpers/`; do not create UI directories for this backend-only plugin.
2. Define explicit MCP tools/resources for the accepted read and mutation
   capabilities, using stable schemas, bounded results, and safe errors.
3. Route every MCP mutation through the Task 00004 action kernel and every read
   through the same repositories and authority rules as browser events.
4. Preserve caller identity, request scope, PostgreSQL role selection, CSRF/
   transport distinctions, transactions, journaling, and audit correlation.
5. Implement the repeatable harness scenarios used to compare browser-event and
   MCP outcomes, errors, permissions, side effects, and cleanup.
6. Prevent MCP access to hidden metadata, migrator authority, unrestricted SQL,
   cross-tenant data, or internal diagnostics not explicitly accepted.

## Verification Steps

1. Run contract tests for each tool/resource schema, bounds, success response,
   validation error, authorization denial, and safe error surface.
2. Run parity tests proving browser events and MCP calls produce equivalent
   domain results, journal entries, outbox records, and rollback behavior.
3. Test concurrent calls, cancellation, timeouts, pooled-role cleanup, session
   isolation, cross-tenant denial, and absence of migrator privilege.
4. Run type checks, server production build, harness suite, and PostgreSQL 18
   integration tests from clean state.

## Acceptance Steps

None. This task has no meaningful user-facing UI output; Task 00014 covers the
application-wide user experience.

## Implementation Notes

Started 2026-08-02 after Task 00012 passed its complete verifier, clean
PostgreSQL 18 operations gate, npm audit, browser acceptance, and final backend,
contract/security, and UI specialist audits. MCP remains another transport over
shared capabilities, not a parallel business-logic or authorization system.

Completed a backend-only `plugins/mcp` service registered after realtime and
before the application catch-all. It exposes only the accepted bounded tools and
frontend-contract resource through a concrete provider-neutral credential
adapter, branded caller identity, the existing web pool, the caller's effective
PostgreSQL role, shared capability actions, repeatable-read repositories, and
safe transport-specific envelopes. It exposes no raw SQL, DDL, role selection,
migrator authority, cookie/CSRF controls, or diagnostics.

The implementation also hardened the shared PostgreSQL transaction and catalog
read boundaries. Abort-aware checkout and real `pg_cancel_backend` cancellation
now drain or destroy unsafe clients before release. MCP reads apply database-side
result preflights on the same repeatable snapshot as payload retrieval. Ranked
tables derive authoritative versions from all caller-visible values inside
PostgreSQL without materializing omitted values, and choose a quoted internal
version alias that cannot collide with any live physical column.

## Verification Notes

- `npm run verify` passed: TypeScript, 193 tests, Reactus production build (three
  artifacts), server build (nine SQL assets), artifact integrity, dependency and
  plugin architecture, built runtime, and web/migrate/worker entrypoint checks.
- The disposable PostgreSQL 18.4 harness passed 1/1 from clean migrations. It
  proved web/MCP result, journal, outbox, rollback, validation, conflict, RLS,
  cross-identity, replay, history, cancellation, deadline, shutdown, and clean
  pool parity. It additionally proved database-side rejection of oversized
  query/record/draft reads, ranked narrow-query-to-patch versions, both former
  internal-alias collision names, no migrator escalation, and zero effects for
  rolled-back work.
- Focused capability/catalog/MCP tests passed 15/15. `npm audit --omit=dev`
  reported zero vulnerabilities and `git diff --check` passed.
- Final backend/transaction, contract/security, and parity/frontend specialist
  audits each reported no actionable P1/P2 finding on the current worktree.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output. The
three required specialist audits passed with no actionable P1/P2 findings.
