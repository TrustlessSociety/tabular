# Browser QA Notes

## 2026-08-01 — r007 Review Round 1

### Routes checked

- `workflows.html`
- `pages/browse.html` root and `?folder=operations`
- `pages/table.html?folder=operations&table=customer-orders`
- `pages/table.html?folder=operations&table=customer-orders&role=editor&dialog=create`
- `pages/import.html?folder=operations`
- `pages/system-activity.html`

### Navigation checked

- Browse → Operations → Customer orders reaches the integrated spreadsheet and
  its always-visible saved-view controls without using the workflow index.
- Browse → System activity and Table → System activity both reach the shared-
  shell activity page.
- System activity → Customer orders returns to the integrated table route.
- Both saved-view workflow cards now start on `table.html` query states.

### Interactions checked

- Saved-view menu opens inside the spreadsheet; Ready to ship reduces four
  representative records to one Ready record and updates the summary.
- An owner can create a shared view; an editor sees Shared disabled with the
  owner requirement.
- Active activity filtering includes running and queued work.
- Row order maintenance opens a queued detail history.
- Review and retry changes the dead-letter example to Queued and appends Retry
  queued to its history.
- Retention changes from 90 to 180 days and confirms with a status toast.
- Copied File → Table settings still shows the folder and PostgreSQL table name.
- Copied Import → Preview values still shows inferred fields, values, and
  fidelity warnings.

### Responsive and console checks

- Checked `workflows.html`, browse root, Operations, table, import, and System
  activity at 1280 x 800 and 390 x 844.
- All 12 route/viewport combinations reported document width equal to viewport
  width.
- Spreadsheet and compact saved-view summaries retain contained horizontal
  scrolling at narrow width.
- Browser console warnings: 0.
- Browser console errors: 0.

### Browser-found fixes

- No additional rendered defects were found after the r007 integration pass.

## 2026-08-01 — r007 Review Round 2

### Routes and states checked

- `workflows.html`
- `pages/browse.html` root, Operations Files, and Operations Views
- `pages/table.html?folder=operations&table=customer-orders`
- Customer orders with `dialog=views`, `dialog=create`, `role=editor`, and
  `view=ready`
- Untitled File with `dialog=views`
- `pages/system-activity.html`

### Interactions checked

- Files and Views tabs navigate through query state, update selected state,
  counts, search label, and visible collection.
- My follow-ups opened a separate browser tab at `view=follow-ups`; the new tab
  had the expected title and representative Processing filter.
- File menu renders New, Open, Import, Export, Make a copy, divider, Views, New
  view, divider, Version history, and Table settings in that order.
- Export closes File and confirms the Current sheet CSV scope.
- File → Views shows Personal/Shared lists; Create new view swaps dialogs; File
  → New view opens creation directly.
- A personal Regional review view was created and appeared when Views reopened.
- Untitled File shows No saved views and an inline Create new view action.
- Ready to ship shows only the Ready preview record, adds active-view breadcrumb
  context, and does not render the removed saved-view bar.
- Activity Active filtering still includes running and queued work.

### Activity row geometry

- Import values: six 75px cells in a 75px row.
- Row order maintenance: six 115px cells in a 115px row.
- Dead letter import: six 75px cells in a 75px row.
- Publish shared view: six 95px cells in a 95px row.
- Export CSV: six 75px cells in a 75px row.

### Responsive and console checks

- Checked eight route/state families at 1280 x 800 and 390 x 844.
- All 16 route/viewport combinations reported document width equal to viewport
  width.
- Narrow Browse shows Files/Views tabs and the icon-only System activity link.
- Narrow Table preserves the sheet height and contained grid scrolling after
  removal of the saved-view bar.
- Narrow Views dialog remains readable without document overflow.
- Browser console warnings: 0.
- Browser console errors: 0.

### Browser-found fixes

- Synchronized the Views-tab search input’s accessible name with its visible
  placeholder.
- Removed the obsolete narrow label-hiding rule that also hid the new icon-only
  System activity link.
