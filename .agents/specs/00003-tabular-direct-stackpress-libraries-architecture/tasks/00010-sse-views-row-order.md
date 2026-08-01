# Task 00010: Implement SSE, Saved Views, And Row Order

## Task Summary

Keep signed-in users synchronized with authenticated Server-Sent Events while
adding durable saved views and shared row ordering over PostgreSQL state.

Status: `open`; depends on Task 00009 passing the Browser gate.

## Implementation Steps

1. Create and register `plugins/realtime/plugin.ts` and
   `plugins/saved-views/plugin.ts` with only the needed `events/`, `pages/`,
   `views/`, `components/`, and `helpers/` directories.
2. Implement an authenticated SSE endpoint over `@stackpress/ingest`, scoped by
   user authority and resource visibility, with heartbeat and clean shutdown.
3. Publish committed change records through a durable PostgreSQL outbox; use
   `LISTEN/NOTIFY` only as a wake-up hint, never as the event source of truth.
4. Implement monotonic cursors, `Last-Event-ID` resume, ordered replay,
   duplicate tolerance, gap recovery, reconnect backoff, and backpressure.
5. Revalidate authorization during connection lifetime and terminate or narrow
   delivery when session, membership, or resource access changes.
6. Implement personal/shared saved views for columns, sort, filter, format, and
   view metadata with permission-aware create, update, duplicate, and delete.
7. Implement shared row ordering using the owned rank field, including insert,
   move, rebalance, concurrency, and stable ordering in saved views.

## Verification Steps

1. Test outbox atomicity, ordered cursor replay, duplicate delivery, cursor
   gaps, disconnect/reconnect, slow consumers, heartbeat, and clean shutdown.
2. Test two server instances to prove PostgreSQL-backed delivery works without
   process-local event authority or mandatory sticky sessions.
3. Test authentication, authorization revocation, cross-resource isolation, and
   that SSE payloads disclose only currently permitted data.
4. Test saved-view ownership/sharing and row insert/move/rebalance under
   concurrency, reconnect, filtering, and sorting.
5. Run integration tests against PostgreSQL 18, type checks, and client/server
   production builds.

## Acceptance Steps

1. Open the same permitted table in two independent signed-in browser sessions.
2. In one session, edit data, reorder rows, and create/update a saved view;
   confirm the other session updates without a manual refresh.
3. Disconnect one session, make multiple changes, reconnect it, and confirm it
   catches up once in the correct order without losing selection unexpectedly.
4. Revoke access or expire the session and confirm updates stop without leaking
   later events; verify the UI explains the required recovery.
5. Repeat representative saved-view and reconnect flows at 390x844 and record
   screenshots, network evidence, and console/runtime errors.

## Implementation Notes

Not started. SSE is the accepted one-way synchronization transport; PostgreSQL
outbox state, not an in-memory broadcaster, is authoritative.

## Verification Notes

Not run.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Pending. The implementing agent must execute the Acceptance Steps and record
`passed` or `failed` with browser, network, and screenshot evidence.
