# Task 00011: Implement Import And CSV Export

## Task Summary

Implement the recoverable import workflow for CSV, XLSX, and Google Sheets exact
values, plus permission-aware CSV export from the current table or saved view.

Status: `verified`; depends on verified Task 00010.

## Implementation Steps

1. Create and register `plugins/import-export/plugin.ts` with the needed
   `components/`, `events/`, `pages/`, `views/`, and `helpers/` directories.
2. Implement the accepted three-step import UI for source selection, preview and
   mapping, then confirmation/progress/result with recoverable back navigation.
3. Implement streamed CSV and XLSX parsing with bounded memory, encoding and
   delimiter handling, exact source values, type inference suggestions, and
   explicit user-controlled mapping.
4. Implement Google Sheets import through the accepted OAuth/API boundary,
   reading exact cell values and preserving source provenance without formulas.
5. Stage imports before mutation, validate permissions and mappings, report row
   errors, and support deterministic fingerprints, safe retry, and cancellation.
6. Commit import results through capability actions and the worker boundary so
   partial failures cannot silently duplicate or corrupt rows.
7. Implement CSV export for the permitted current table or saved view, honoring
   visible columns, filters, order, formats, encoding, and formula-injection
   protection.

## Verification Steps

1. Test CSV encodings, delimiters, quoting, embedded newlines, large inputs,
   malformed rows, formula-injection cases, and deterministic export.
2. Test XLSX types and exact displayed values, multi-sheet selection, date/
   number ambiguity, empty ranges, unsupported constructs, and large inputs.
3. Test Google OAuth/API failures, permissions, exact values, rate limiting, and
   revoked access against a live sandbox when credentials are available.
4. Test staging, inference, mapping, fingerprint retry, cancellation, partial
   failure, idempotency, and rollback through PostgreSQL 18 integration tests.
5. Run component tests, type checks, and client/server production builds.

## Acceptance Steps

1. Import representative CSV and XLSX files through all three UI steps, inspect
   the preview, change mappings, return to earlier steps, and finish the import.
2. If sandbox credentials are configured, import a Google Sheet and verify exact
   values; otherwise record the missing-credential blocker without substituting
   a mock for live provider acceptance.
3. Trigger malformed input, mapping errors, permission denial, cancellation,
   retry, and partial-row failures; confirm recovery and results are clear.
4. Export a filtered, sorted saved view to CSV and inspect values, columns,
   ordering, encoding, and spreadsheet-formula safety.
5. Repeat the primary import flow at 390x844; compare with the wireframes and
   record screenshots, downloaded artifacts, and console/runtime errors.

## Implementation Notes

Started 2026-08-02 after Task 00010 passed its full verifier, PostgreSQL 18
regression gates, two-session/two-instance browser acceptance, cleanup, and
final backend, contract/security, and UI specialist `PASS` audits.
Provider-specific parsing stays behind this plugin; committed data still flows
through the shared capability and worker boundaries.

Implemented bounded CSV/XLSX parsing, explicit type mapping, staged and
fingerprinted imports, atomic capability-backed worker commits, cancellation,
retry, rollback, expired-staging cleanup, and permission-aware formatted CSV
export. Google authorization uses one-time state, encrypted server-side token
persistence, revision pinning, worker authority rechecks, refresh, and local
revocation. Default grid reads, transient sorts, saved views, and exports share
the authorized read compiler; saved views are resolved server-side from only an
opaque identifier and exact version before filtering, sorting, and the row
window are applied.

## Verification Notes

- `npm run verify`: passed, 152/152 tests plus typecheck, production client/
  server/worker builds, artifact, architecture, runtime, and entrypoint gates.
- PostgreSQL 18 Task 00011 integration gate: passed, including atomic import
  recovery, OAuth lifecycle, expired-staging cleanup, and saved-view/grid/CSV
  parity for a matching row beyond the default 1,000-row window.
- `npm audit --omit=dev`: passed with 0 vulnerabilities; `git diff --check` is
  clean.
- Final backend, contract/security, and UI specialist audits: `PASS`.
- Browser acceptance: passed with retained evidence in
  `output/playwright/task-00011/`; a focused post-repair rerun loaded a named
  server-resolved view with live rows and 0 console warnings/errors.
- Live Google verification remains blocked by missing external sandbox
  credentials; no mock or live-provider claim was substituted.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Passed for CSV, XLSX, malformed input, mapping recovery, permission denial,
cancellation, rollback/retry, saved-view CSV export, and the 390x844 primary
flow. Live Google acceptance is blocked only by the four sandbox variables
recorded in `output/playwright/task-00011/acceptance.md`; the source is visibly
disabled, no mock was substituted, and automated lifecycle coverage is kept
separate from live-provider acceptance.
