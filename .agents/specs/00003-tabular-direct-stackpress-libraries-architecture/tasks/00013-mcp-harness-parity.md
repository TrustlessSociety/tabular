# Task 00013: Implement MCP And Harness Parity

## Task Summary

Expose permitted Tabular capabilities to the MCP/harness boundary while proving
they share application actions, authorization, transactions, and audit behavior.

Status: `open`; depends on Task 00012.

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

Not started. MCP is another transport over shared capabilities, not a parallel
business-logic or authorization system.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
