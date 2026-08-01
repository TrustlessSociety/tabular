# Task 00012: Implement Workers And Activity

## Task Summary

Implement durable background job execution and the user-visible activity center
for long-running imports, exports, schema work, and recoverable failures.

Status: `open`; depends on Task 00011.

## Implementation Steps

1. Create and register `plugins/operations/plugin.ts` with the needed
   `components/`, `events/`, `pages/`, `views/`, and `helpers/` directories.
2. Implement a PostgreSQL-backed job/outbox model for queued, running,
   succeeded, failed, retrying, cancelled, and dead-letter states.
3. Implement the worker bootstrap, safe claiming, leases, heartbeat, retries,
   idempotency keys, cancellation, shutdown, and crash recovery.
4. Route applicable import, export, DDL, promotion, and maintenance work through
   typed job handlers without granting the web process migrator authority.
5. Publish progress and terminal changes through the Task 00010 SSE path with
   durable cursor semantics and permission-filtered payloads.
6. Implement the activity UI with status, progress, timestamps, result links,
   failure detail, retry/cancel actions, unread state, empty state, and recovery.
7. Add retention and diagnostic metadata sufficient for operations without
   persisting secrets or disallowed imported content.

## Verification Steps

1. Test competing workers, leases, heartbeat expiry, process crash, duplicate
   delivery, idempotent retry, cancellation races, and graceful shutdown.
2. Test state transitions, retry limits, dead-letter behavior, retention, and
   web-versus-worker authority separation against PostgreSQL 18.
3. Test progress delivery through reconnect and replay, authorization changes,
   and cross-user/resource isolation.
4. Run activity component tests, integration tests, type checks, and production
   client/server/worker builds.

## Acceptance Steps

1. Start a long-running import or equivalent operation and observe queued,
   running, progress, and completed states in the activity UI.
2. Trigger a recoverable failure, inspect its explanation, retry it, and confirm
   the succeeding result does not duplicate committed work.
3. Cancel a cancellable job, reconnect the browser during another job, and
   confirm activity state catches up without a manual refresh.
4. Confirm users cannot view or act on another user's unauthorized operations.
5. Repeat primary activity flows at 390x844 and record screenshots, SSE/network
   evidence, and console/runtime errors.

## Implementation Notes

Not started. PostgreSQL holds durable job state; SSE reports it to clients but
does not replace the worker queue or outbox.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Pending. The implementing agent must execute the Acceptance Steps and record
`passed` or `failed` with browser, job-state, and screenshot evidence.
