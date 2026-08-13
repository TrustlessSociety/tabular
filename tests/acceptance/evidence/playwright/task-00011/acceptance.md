# Task 00011 Browser Acceptance

Result: **passed with one external-credential blocker**.

## CSV import and recovery

- Exercised the accepted `Choose source` -> `Preview values` -> `Import` flow at
  1280x900 and 390x844.
- Preserved exact source tokens including `001` and the ordinary text value
  `=SUM(A1)`.
- A malformed partial row remained visible for review, showed the exact row-width
  warning, did not claim values were ready, and could not advance to import.
- Changing `name` from Text to Decimal produced an inline attributable three-value
  error, marked and focused the responsible field, and recovered after restoring
  Text.
- Back navigation retained the staged source and corrected mapping.
- The isolated worker exposed the confirmed progress state, then committed all
  three rows atomically.
- A read-only folder member received an explicit permission denial before any
  import destination was created.
- Cancellation before commit produced `Import canceled`, purged the staging
  payload, and `Start a new import` returned to a genuinely fresh source step.
- The recoverable failpoint produced `Import rolled back`; retry returned the same
  reviewed operation to Ready and committed exactly one row without duplication.

## XLSX import

- Uploaded a two-worksheet workbook and visibly selected `Current` from a retained
  worksheet control.
- Previewed two rows with `cached value` and `42` as ordinary values; formula text
  never appeared in the preview or committed result.
- Values-only notices remained visible before confirmation and the worker committed
  both rows atomically.

## CSV export

- The fixture created a private saved view through the production saved-view
  service, then invoked the production server-authorized CSV export path.
- The retained export contains the requested column order, Amount descending sort,
  saved-view filtering, UTF-8 BOM, CRLF, and three deterministic data rows.
- `=SUM(A1)` was neutralized to `'=SUM(A1)`; `export-result.json` records 3 rows,
  4 columns, 1 sanitized cell, and the saved-view identity/version.
- The PostgreSQL 18 integration gate independently covers current-grid export,
  deterministic bytes, null/empty behavior, filtering, sorting, and stale view
  rejection.
- A focused post-repair browser rerun created and loaded a named private view;
  the workbench breadcrumb identified the view, live rows rendered, and the
  console contained 0 warnings/errors.

## Responsive and runtime observations

- The primary import flow passed at 390x844 with
  `document.documentElement.scrollWidth === 390` at source, preview, review,
  progress, and result.
- Browser console warnings: 0.
- Browser console errors: 0.
- Retained evidence uses visually checked viewport captures rather than tall-page
  full-page captures.

## Google Sheets live acceptance

Blocked by missing external sandbox configuration:

- `TABULAR_GOOGLE_CLIENT_ID`
- `TABULAR_GOOGLE_CLIENT_SECRET`
- `TABULAR_GOOGLE_REDIRECT_URI`
- `TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY`

No mock was substituted. The live source is disabled with that exact explanation.
No live-provider claim is made. The PostgreSQL 18 lifecycle gate covers one-time
state consumption, cross-session rejection, encrypted server-side persistence,
refresh, local revocation, displayed-value staging, and rejecting revoked worker
authority before provider access. Provider-boundary tests separately cover exact
read-only scopes, PKCE, revision pinning, formula exclusion, denial, rate
limiting, and source-change failure without substituting for live acceptance.

## Evidence

- `permission-denied-desktop.png`
- `malformed-csv-desktop.png`
- `csv-preview-desktop.png`
- `mapping-error-focused-desktop.png`
- `ready-to-import-desktop.png`
- `csv-import-progress-desktop.png`
- `csv-import-complete-desktop.png`
- `csv-import-canceled-desktop.png`
- `import-rolled-back-desktop.png`
- `import-retry-complete-desktop.png`
- `xlsx-sheet-selector-desktop.png`
- `xlsx-current-selector-desktop.png`
- `xlsx-current-preview-desktop.png`
- `xlsx-ready-desktop.png`
- `xlsx-import-complete-desktop.png`
- `choose-source-390.png`
- `csv-preview-390.png`
- `csv-ready-390.png`
- `csv-import-complete-390.png`
- `filtered-sorted-saved-view.csv`
- `export-result.json`
- `acceptance-result.json`
