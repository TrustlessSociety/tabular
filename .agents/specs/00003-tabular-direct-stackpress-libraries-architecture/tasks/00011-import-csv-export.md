# Task 00011: Implement Import And CSV Export

## Task Summary

Implement the recoverable import workflow for CSV, XLSX, and Google Sheets exact
values, plus permission-aware CSV export from the current table or saved view.

Status: `open`; depends on Task 00010.

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

Not started. Provider-specific parsing stays behind this plugin; committed data
still flows through the shared capability and worker boundaries.

## Verification Notes

Not run. Live Google verification requires configured sandbox credentials.

## Human Acceptance

None. Per-task human acceptance is waived; the user performs one final review.

## Agent Acceptance

Pending. The implementing agent must execute the Acceptance Steps and record
`passed`, `failed`, or a specific external-credential blocker with evidence.
