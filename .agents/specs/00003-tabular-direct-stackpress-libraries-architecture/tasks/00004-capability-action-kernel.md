# Task 00004: Build The Capability, Draft, And Action Kernel

## Task Summary

Build the transport-independent domain kernel for authorized reads, mutations,
drafts, concurrency, history, and audit while keeping web and MCP mapping separate.

Status: `verified`; depends on verified Task 00003.

## Implementation Steps

1. Create and register `plugins/capability/plugin.ts` as the owner of the named
   `tabular.capability` service and typed action/result/error contracts.
2. Keep domain workflows in `events/` and reusable validation/query/action code
   in `helpers/`; do not place transport response shaping in the kernel.
3. Implement parameterized reads, expected-version mutations, authority/version
   rechecks, and one transaction per canonical action.
4. Implement persistent incomplete-row drafts with file/row/column identity,
   typed JSON patches, validation state, actor/session, and schema version.
5. Implement atomic range actions using validated row/column IDs and cell count.
6. Implement an action journal and bounded 100-step current-session undo/redo
   that preserves later work and rechecks current authority.
7. Define independent web and MCP adapters that translate into the same action
   contracts without sharing identity or output policy.

## Verification Steps

1. Run action-contract and repository tests for success, invalid input, denial,
   conflict, retry, rollback, and redacted journal output.
2. Test draft create/update/expiry/promotion, schema drift, and failed promotion.
3. Test range atomicity, stale identity, mixed validity, and rollback of every cell.
4. Test undo/redo ownership, bounded history, later-work preservation, and
   authority/version changes between original action and reversal.
5. Run web/MCP-shaped parity tests while proving adapter separation.

## Acceptance Steps

None. The domain kernel has no standalone user-facing UI.

## Implementation Notes

Started 2026-08-01 after Task 00003 passed its full local/PGlite/build gate,
PostgreSQL 18.4 identity/authority/catalog and concurrency suite, Task 00002 and
P-002 regressions, and three independent final reviews. Task 00004 must reuse
the settled identity-first authority transaction and PostgreSQL-final policy;
it may not let web or MCP payloads choose roles, physical identifiers, or SQL.
A lib event may expose same-process composition but is not durable delivery or
authorization.

Implemented 2026-08-01 as the registered `tabular.capability` plugin with closed
typed contracts, independent web and MCP-shaped adapters, actor-owned durable
drafts, atomic range mutations, redacted durable action metadata, and bounded
expiring reversal state. One canonical action now spans base preparation,
mapped-role target work, base finalization, and one commit, so a finalizer
failure rolls back target work.

The controlled PostgreSQL target uses Task 00003 stable catalog IDs and resolves
live physical metadata on every action. The current mutable slice deliberately
requires one non-deferrable validated PK/UNIQUE text row key plus explicit row
incarnation and monotonically advancing version controls. It refuses unsafe or
unmapped targets; broader/composite relation mapping remains Task 00005 work.
Ordinary inherited tables are addressed through `ONLY`, while partitioned
tables retain partition traversal. Locked authorization rechecks relation,
column, codec, and qualifying key identities before data access.

Undo/redo stores no row values in durable journal output. Its bounded transient
state carries opaque full-version and incarnation tokens: insert reversal uses
strict versions, while update reversal combines incarnation identity with
changed-cell preconditions so unrelated later work survives but same-key row
replacement is denied.

## Verification Notes

Passed 2026-08-01.

- `npm run verify`: passed 32/32 unit and contract tests, Reactus and server
  production builds, artifact verification, architecture guards, built runtime
  health/readiness/assets/shutdown, and web/migrate/worker entrypoint checks.
- `TABULAR_TEST_POSTGRES_DISPOSABLE=task00004-disposable
  TABULAR_TEST_POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:55434/tabular_task00004
  npm run test:postgres:capability-actions` (then named
  `npm run test:postgres:task00004`): passed on PostgreSQL 18 in 12.0 seconds.
- PostgreSQL coverage includes success/denial/conflict/retry/rollback and
  redaction, typed value fidelity, non-ISO `DateStyle`, fresh-adapter stable
  versions, DDL relation/column/key races, unsafe unique-key and inheritance
  shapes, web/MCP parity, draft lifecycle/schema drift, atomic ranges,
  idempotency, bounded global cleanup, session ownership, authority revocation,
  later-work preservation, insert redo collisions, and update same-key
  incarnation replacement.
- Three independent specialist re-reviews returned `PASS`: proof coverage,
  adapter/authority safety, and holistic Task 00004 architecture.
- The first sandboxed verifier attempts were blocked by local `tsx` IPC policy;
  the same commands passed with the approved local runtime permission. Node's
  `module.register()` and the user's legacy npm `python` setting emitted
  non-failing deprecation warnings.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
