# Task 00012 Browser Acceptance

Status: **passed** on 2026-08-02.

The activity center was exercised through the real web routes and SSE client at
1280x800 and 390x844 against a disposable PostgreSQL 18 database. The fixture
used separate web, worker, migrator, operator, and member authorities; the
worker ran as a distinct child process with deterministic gates only in the
acceptance harness.

## Accepted flows

- Shell: the page rendered all four metrics, all four filters, a live connection,
  the authorized-operation count, and the operator-only retention control.
- Lifecycle: at both 1280x800 and 390x844, a single import operation moved from
  queued to running, reported 42%, and completed at the same durable operation
  ID.
- Result: the completed import exposed `Open authorized result`; direct browser
  navigation to `/pages/table.html?folder=workspace&table=result_file` succeeded
  under independent table authorization.
- Retry: at both widths, a retryable failure exhausted into dead-letter with
  failure detail, history, acknowledge, and retry actions. The first attempt
  committed an idempotency-keyed fixture effect before failing. `Review and
  retry` kept the same ID and succeeded on attempt two; the PostgreSQL effect
  table still contained exactly one committed row.
- Acknowledge: a separate dead-letter became `Acknowledged dead letter`, stayed
  available, cleared unread state, and persisted after reload.
- Cancel: at both widths, a running job recorded `Cancellation requested` and
  `Operation cancelled`; its action disappeared after the terminal transition.
- Replay: at both widths, the proxy deliberately interrupted only the operations
  SSE stream. The page visibly entered `Reconnecting`; a job completed while
  disconnected; reconnect requests resumed from the last applied cursor and
  caught up without a manual refresh or recovery panel. Desktop replay used
  cursor 5 through high-water 8; phone replay used cursor 16 through 19.
- Isolation: the operator did not see the member-owned job. Direct cross-user
  detail and cancel requests both returned 404. The member saw only its own job.
- Retention: the operator applied 180 days and it persisted after reload. The
  member had no retention control and a forged retention request returned 403.
- Responsive: at 390x844, the table header computed to `display:none`, activity
  rows to `display:grid`, the detail panel to 390px, and horizontal overflow to
  zero. Desktop horizontal overflow was also zero.

## Runtime evidence

The browser reported no console errors or warnings and no unexpected 5xx
responses. The only 5xx responses were the fixture-controlled 503s used to
interrupt SSE for reconnect/replay acceptance.

Screenshots:

- `activity-queued-desktop.png`
- `activity-progress-desktop.png`
- `activity-complete-desktop.png`
- `activity-dead-letter-desktop.png`
- `activity-cancelled-desktop.png`
- `activity-reconnecting-desktop.png`
- `activity-detail-390.png`
- `activity-queued-390.png`
- `activity-progress-390.png`
- `activity-complete-390.png`
- `activity-dead-letter-390.png`
- `activity-cancelled-390.png`
- `activity-reconnecting-390.png`
- `activity-result-390.png`

Machine-readable details are in `acceptance-result.json`.
