# Task 00012: Implement Workers And Activity

## Task Summary

Implement durable background job execution and the user-visible activity center
for long-running imports, exports, schema work, and recoverable failures.

Status: `verified`; depends on verified Task 00011.

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

Started 2026-08-02 after Task 00011 passed the full verifier, PostgreSQL 18
integration gate, npm audit, browser acceptance, and final backend,
contract/security, and UI specialist audits. PostgreSQL holds durable job state;
SSE reports it to clients but does not replace the worker queue or outbox.

Verified 2026-08-02. The operations plugin now owns durable jobs, immutable
attempts, idempotency tombstones, retention, and operation outbox records. The
worker uses typed handlers, `SKIP LOCKED` claims, fenced leases, heartbeat,
bounded retry with jitter, cancellation, graceful shutdown, crash recovery, and
secret-safe structured logging. Import and migrator-owned DDL work enqueue
atomically; a distinct migrator consumer preserves the production authority
boundary. The activity service, routes, Reactus view, and SSE reader expose only
identity-authorized redacted state with contiguous durable cursor replay,
separate acknowledgement, result links, and operator-only retention.

Final repairs clamp operation replay to the repository's 500-event bound,
advance across invisible shared-cursor rows without disclosure, load result
metadata through the identity-scoped detail query, contain scheduled pump and
heartbeat rejections, abort lost-heartbeat handlers, and recheck drain state
after claiming so shutdown never starts newly returned work.

## Verification Notes

Passed 2026-08-02. The complete verifier passed type checking, the full unit and
integration-style test suite, Reactus and server production builds, artifact
validation, architecture validation, built-runtime checks, and web/migrator/
worker entrypoint checks. The clean PostgreSQL 18 operations gate passed 1/1,
including competing workers, lease reclaim and fencing, retry/dead-letter,
idempotent effects, cancellation and shutdown, retention, result links, SSE
visibility/cursors, and distinct production database users. `npm audit
--omit=dev` reported zero vulnerabilities and `git diff --check` passed.

Fresh backend, contract/security, and UI specialists reported no actionable
P1/P2 findings after the final worker, detail-query, SSE-bound, phone-evidence,
and idempotency-evidence repairs.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Passed 2026-08-02. See `output/playwright/task-00012/acceptance.md` and its
machine-readable result. The real routes and SSE client passed at 1280x800 and
390x844 for queued/running/progress/completed, result navigation,
dead-letter/retry, acknowledgement, cancellation, reconnect/replay, isolation,
retention, and responsive behavior. The retry committed exactly one durable
idempotent effect, replay caught up from stored cursors without refresh, and the
browser recorded no console errors, warnings, or unexpected 5xx responses.
