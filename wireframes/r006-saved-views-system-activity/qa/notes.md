# Browser QA Notes

## 2026-08-01 — r006 Review Round 2

### Routes checked

- `workflows.html`
- `pages/browse.html` root and `?folder=operations`
- `pages/table.html?new=1&folder=operations&table=untitled-file`
- `pages/table.html?folder=operations&table=customer-orders`
- `pages/import.html?folder=operations`
- `pages/saved-views.html` owner and `?role=editor&dialog=create`
- `pages/system-activity.html` and `?job=import-q3`

### Interactions checked

- Eight workflow cards and nine links render and navigate.
- Explorer opens Operations, switches to Grid, filters by search, and renders
  the no-match empty state.
- New file renders Untitled File with 0 records and 1,000 logical rows.
- Spreadsheet File menu opens Table settings with PostgreSQL table identity.
- Import advances from Choose source to Preview values.
- Saved view creates a personal view; editor Shared access is disabled with an
  owner requirement; Operations returns to the copied explorer.
- Activity Active filter shows running and queued work; row-order maintenance
  opens queued detail; dead letter changes to queued after Review and retry;
  Acme Inc. returns to the copied explorer.

### Responsive and console checks

- Checked all seven page families at 1280 x 800 and 390 x 844.
- Every route reported document width equal to viewport width.
- Spreadsheet grids retain internal horizontal scrolling.
- Browser console warnings: 0.
- Browser console errors: 0.

### Browser-found fixes

- Removed review/copy-forward language from the visible workflow header.
- Changed the copied explorer search initializer to resolve the top-bar search
  input from the document rather than incorrectly scoping it to the content
  section.
