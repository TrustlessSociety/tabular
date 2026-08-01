# Task 00004: Build The Capability, Draft, And Action Kernel

## Task Summary

Build the transport-independent domain kernel for authorized reads, mutations,
drafts, concurrency, history, and audit while keeping web and MCP mapping separate.

Status: `open`; depends on Task 00003.

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

Not started. A lib event may expose same-process composition but is not durable
delivery or authorization.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Not required because this task has no meaningful user-facing UI output.
