# Tabular Task 00014 Corrective Human Review Package

State: **agent-verified; human acceptance pending**.

Task 00014's reopened corrective implementation and agent verification are
complete. The original final release gate passed at
`2026-08-03T05:09:03.837Z`. The latest corrective pass passed the current
230-check verification gate and all ten PostgreSQL 18 suites, corrected the
executable browser journey for autosave-on-blur, and then passed that fresh
public-origin journey three consecutive times after a rebuilt restart on
2026-08-04. This package presents the current result for human review; it does
not mark the review accepted or the overall implementation completed.

## Live review handoff

- URL: `http://127.0.0.1:3000`
- PostgreSQL username: `tabular_reviewer`
- Password: `review-local-only-2026`
- Database: `tabular_review` on loopback PostgreSQL 18 port `55432`
- Start or resume: `npm run local-review:start`
- Stop application processes and retain the tmpfs database:
  `npm run local-review:shutdown`
- Permanently destroy the disposable local-review database and processes:
  `npm run local-review:cleanup`

The web, worker, and continuous migrator processes are running. The setup is
explicitly local, loopback-only, and disposable. `local-review:shutdown`
retains the database for restart; `local-review:cleanup` is destructive.

## Current outcome

| Review area | Result | Primary evidence |
| --- | --- | --- |
| Complete technical gate | 10/10 command groups passed | [`manifest.json`](manifest.json) |
| Latest unit, component, contract, and local integration suite | 229/229 passed | `npm run verify` and Task 00014 verification ledger |
| PostgreSQL 18 integration matrix | 10/10 suites passed | [`logs/postgresql18-matrix.log`](logs/postgresql18-matrix.log) |
| Current public-origin browser acceptance | Passed 3 consecutive fresh repetitions | [`browser-acceptance.json`](browser-acceptance.json) |
| Native Safari and VoiceOver | Passed | [`native-safari-voiceover.json`](native-safari-voiceover.json) |
| Multi-instance runtime | Passed | [`multi-instance-runtime.json`](multi-instance-runtime.json) |
| Crash recovery and physical restore | Passed | [`postgresql-crash-recovery.json`](postgresql-crash-recovery.json), [`physical-backup-restore.json`](physical-backup-restore.json) |
| Production and full dependency audits | 0 vulnerabilities | [`logs/production-audit.log`](logs/production-audit.log), [`logs/full-audit.log`](logs/full-audit.log) |
| Isolated production package | 3,961 files verified | `../../../.build/release-package/release-manifest.json` |

## Corrective work closed

- Added ordinary PostgreSQL-native login, generic denial, bounded attempt
  protection, session resume/rotation, simultaneous sessions, signed-in
  identity, and visible logout without storing PostgreSQL passwords.
- Added guarded, reproducible PostgreSQL 18 local setup/start/shutdown/cleanup
  with safe human, web, worker, and migrator authorities and representative
  Operations/Finance data.
- Removed review-only runtime entry, session injection, fabricated Explorer
  data, unknown-file fallbacks, and production review-fixture imports.
- Made the release browser command start at the signed-out ordinary origin and
  use visible controls in three independent browser contexts.
- Corrected Safari login origin handling, embedded URL credential replacement,
  two-session preservation, hidden shared-row ranks, build-safe review process
  state, and database-relative worker retry scheduling.
- Corrected System activity so internal targets are resolved under verified
  base authority while mapped members retain no access to the `tabular`
  control schema.
- Corrected existing-row recommit for generated-hidden-key tables by retaining
  the stable hidden key in the locked PostgreSQL update projection; added an
  insert-then-update PostgreSQL 18 regression for that exact table shape.
- Corrected header drag ownership so named columns move both before and after a
  target without the grid's competing mover, and made named header clicks show
  a strong selected-column state that enables and applies WYSIWYG formatting.
- Removed the invalid per-column Tabulator `movable` option and retained neutral
  grouped two-decimal Price formatting without a currency symbol.
- Removed the bottom draft/Commit guardrail for valid edits and made changed
  cells save automatically on blur through a serialized PostgreSQL action path;
  invalid values remain recoverable as retained drafts.
- Separated body-cell, named-header, and whole-column selection so the axes,
  active outline, and full-column fill match familiar spreadsheet states without
  stray selected cells. Named-header selection now enables header-only WYSIWYG
  formatting.
- Kept cells beneath unnamed coordinates unstructured: blank-display Tabular
  metadata addresses the coordinate, hidden JSON stores its value, and a hidden
  24-digit row rank preserves skipped logical positions without manufacturing
  empty PostgreSQL target rows.
- Replaced the single global draft handle with independent row-scoped queues;
  adjacent G19 and D20 drafts now reload at their exact positions, and validation
  marks only each actually missing or invalid field.
- Made clearing the last user-entered value from a failed new row remove the
  whole empty row, its retained errors, and its persistent draft.
- Kept untouched required insert errors on the row number while non-empty
  invalid values render `#VALUE!` or `#ERROR!`; formula/editor state retains the
  raw input, and Backspace restores an emptied draft row across reload.
- Updated the executable release browser journey to prove autosave-on-blur
  instead of waiting for the removed Commit control. The guarded local-review
  commands now compile their coordinator with `tsc` and run through plain Node,
  so launch, shutdown, and cleanup avoid the deprecated loader hook.
- Serialized every Files-service catalog reconciliation through the shared
  retry queue, closing a PostgreSQL `40001` first-load race under concurrent
  Explorer requests; a three-way PostgreSQL integration regression now covers it.
- Reproved package lifecycle, restart, PostgreSQL crash recovery, physical
  backup/restore, durable jobs/outbox, RLS, multi-instance SSE, worker fencing,
  and dependency integrity.

## Human review checklist

1. Open the URL signed out and sign in with the local credentials above.
2. Confirm the root Explorer shows Finance, Operations, and Public from the
   configured PostgreSQL target.
3. Open Operations > Product Data, edit two cells, and leave each cell. Confirm
   each changed value saves without a Commit bar, then navigate away and back to
   confirm both updates persist.
4. Click a body cell, the named Title header, and the C coordinate in turn.
   Confirm the active-cell, header-only, and full-column states match the three
   supplied spreadsheet references and never leave another body cell selected.
5. With the named Title header selected, toggle Bold or Italic and confirm the
   named header changes while the body cells do not. Price should read
   `50,000.00` and `60,000.00` with no currency symbol.
6. In Product Data, confirm rows 19 and 20 are ordinary blank rows with no
   `#ERROR!` or `#VALUE!` cell tokens. Enter a temporary value beneath a blank
   header and confirm the raw value remains visible while validation appears on
   the row number.
7. Reopen that cell and Backspace its value, or select its row number and press
   Backspace. Confirm the last value, retained row error, and draft disappear;
   reload and confirm the row remains in its initial blank state.
8. Open Operations > Customer orders and review typed data, formatting, and the
   persisted row order `ord-4002`, `ord-4001`, `ord-4003`.
9. Select Product Data A4 and confirm `#VALUE!` is visible while the formula bar
   and reopened editor retain `a`; correct or clear only when ready.
10. Open table settings and inspect the representative field and relation
   configuration.
11. Open the Views tab and load the shared `Task 00014 review` view.
12. Create or rename a disposable file and read the PostgreSQL/migrator
   confirmation before applying it.
13. Import a small CSV and confirm leading-zero text remains exact; export the
   authorized Customer orders rows.
14. Open System activity and inspect the authorized durable jobs and live state.
15. Repeat the folder/table/import path at 390 x 844 or a narrow browser window
   and confirm there is no page-level horizontal overflow.
16. Open Account, rotate the current session if desired, then log out and
   confirm the signed-out login page returns.
17. Decide whether the product matches the accepted wireframes, uses the
    accepted Ingest/direct-library architecture, remains feature-owned under
    `plugins/*`, and generally works end to end.

## Evidence boundaries and external inputs

- The working tree was intentionally preserved and remains unstaged and
  uncommitted. The manifest records `cleanCheckoutProof: false` and
  `isolatedProductionPackage: true`; no branch, stage, commit, push, or PR was
  created.
- The PNG files in this directory were generated on 2026-08-02 behind the
  withdrawn fixture-backed entry. They remain historical feature-behavior
  references and are not current corrective acceptance proof. The browser JSON
  ledger includes the fresh 2026-08-04 current-build reruns; the native Safari
  and VoiceOver JSON ledger records the 2026-08-03 normal-login review and was
  not rerun for the later grid-only sparse-draft correction.
- Live Google OAuth credentials, hosting and TLS, secret-manager and alert
  destinations, backup ownership, and accepted deployment RPO/RTO remain
  external deployment inputs. No mock was substituted for a live-provider
  claim.
- Values under blank coordinates intentionally remain in hidden JSON metadata;
  naming a real structured column remains an explicit header/settings action.

## Final review decision

An affirmative human review may advance the overall implementation state to
`completed`. Until the user explicitly accepts, human acceptance remains
pending even though Task 00014 is agent-verified.
