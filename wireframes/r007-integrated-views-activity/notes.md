# Review Notes

## Round 1 — 2026-08-01 — Integrated views and activity

### Changed

- Created r007 as a new major revision copied forward from the complete r006
  rendered baseline before changing the navigation model.
- Integrated saved-view selection, representative filtering, dirty/save state,
  and private/shared creation directly into `pages/table.html` above the real
  spreadsheet grid.
- Added a shared-shell System activity utility to both `pages/browse.html` and
  `pages/table.html`.
- Reframed `pages/system-activity.html` inside the same Acme Inc. shell and added
  a direct Customer orders return link to the integrated spreadsheet.
- Updated both saved-view workflow cards to open table query states instead of
  an isolated Saved views page.
- Kept W-015 as the approved loose-string policy: URL and Phone accept string
  values, while formatters make a best-effort presentation without rewriting
  the stored text.

### Feedback and annotation applied

- Applied Annotation 1: the new wireframes are now reachable from the main app
  instead of only from `workflows.html`.
- Applied the request to keep the wireframe shape close to product truth by
  making a saved view a state of the spreadsheet rather than a separate app.
- Applied the wireframe revision guideline for material navigation changes by
  creating r007 rather than silently changing the reviewed r006 artifact.
- Kept the KB and Spec 00002 unchanged until this revision is explicitly
  approved.

### Browser verification

- Verified the primary product path: Browse → Operations → Customer orders →
  saved-view selector.
- Verified `Ready to ship` filters the real preview grid from four representative
  records to the one Ready record.
- Verified owner shared-view creation and editor denial for shared publication.
- Verified Browse → System activity, Table → System activity, and System
  activity → Customer orders navigation.
- Verified Active filtering, queued Row order maintenance detail, dead-letter
  Review and retry, and retention-period editing.
- Rechecked copied spreadsheet Table settings and import Preview values.
- Checked the workflow index and all four page families at 1280 x 800 and
  390 x 844. Every route kept document width equal to viewport width; the
  spreadsheet grid retains its intended internal horizontal scrolling.
- Browser console warnings and errors: none.

### Review now

- Confirm the view bar belongs directly above the spreadsheet formatting bar
  and keeps enough of the sheet visible.
- Confirm Personal and Shared saved views are understandable inside the current
  view selector.
- Confirm System activity belongs in the top utility area of Browse and Table,
  with Customer orders as the representative affected-table return link.
- Confirm the narrow layout is truthful: utility names collapse to icons while
  the saved-view summary and spreadsheet canvas use contained horizontal
  scrolling.

### Simulated or deferred behavior

- Saved-view persistence/publication, permissions, row-order events, job
  execution, retry, acknowledgement, and retention remain browser-only state.
- No PostgreSQL view or collision-safe hidden rank column is installed, no
  real-time transport runs, and no worker processes jobs.
- The sample saved-view filters affect the four rendered preview records only;
  they do not query PostgreSQL.

### Open questions

- Should shared views be created directly, as shown, or should every view start
  private and require a distinct Publish action?
- Should System activity remain discoverable for all users with permission-
  filtered contents, or disappear entirely for users without operator access?
- Should acknowledging a dead letter remove it from Needs attention or retain
  an acknowledged state there?

### Approval path

If r007 Round 1 is approved, promote W-015 plus the accepted saved-view,
system-activity, and reorder-persistence decisions into the Context KB and Spec
00002, then refresh the feature-proof matrix and gap check. If changes are
requested, continue with Round 2 inside this r007 folder before promotion.

## Round 2 — 2026-08-01 — Folder tabs and File-menu views

### Changed

- Replaced the open-folder Files heading with functional Files and Views tabs.
  Views lists the saved views attached to files in that folder and opens each
  selected view in a new browser tab.
- Removed the persistent saved-view bar from the spreadsheet so the formatting
  toolbar follows the File/Edit/View/Format menu directly.
- Added Export after Import in File. Added Views and New view after Make a copy
  and a divider, followed by the existing Version history and Table settings
  group.
- Added a Views dialog with Personal and Shared lists. Its links open query-
  driven filtered tables in new tabs; Create new view swaps into the existing
  creation dialog.
- Added the No saved views state to Untitled File with an inline Create new
  view action.
- Removed the visible System activity label from Browse and Table. The history
  icon remains a focusable link with an accessible name and tooltip.
- Rewrapped each System activity operation cell so all desktop cells fill the
  dynamic height of their table row.

### Feedback and browser comments applied

- Comment 1: changed the selected folder’s Files heading into Files and Views
  tabs.
- Comment 2: made the first activity-table column use the same dynamic row
  height as every other column.
- Comment 3: removed the visible System activity label while preserving the
  icon link and accessible name.
- Comment 4: removed the saved-view controls bar from the spreadsheet.
- Comment 5: added File → Export, Views, and New view; added list/empty dialog
  states; made saved-view links open new tabs; and added the dialog swap into
  creation.

### Browser verification

- Verified Operations Files and Views tabs, tab-aware counts, tab-aware search,
  and three Operations saved-view links.
- Verified a folder saved-view link opens a separate browser tab with the view
  query, filtered records, breadcrumb context, and view-specific document
  title.
- Verified File menu order and Export confirmation.
- Verified File → Views, Personal/Shared lists, new-tab links, File → New view,
  Views → Create new view dialog swap, owner/editor creation state, and a
  newly created personal view appearing when Views reopens.
- Verified Untitled File displays No saved views and an inline creation CTA.
- Measured every desktop System activity row: each cell height exactly matched
  its row height, including the 115px Row order maintenance row.
- Checked eight route/state families at 1280 x 800 and 390 x 844. All 16
  combinations kept document width equal to viewport width.
- Browser console warnings and errors: none.

### Browser-found fixes

- Updated the Views-tab search input’s accessible name along with its visible
  placeholder.
- Removed a stale narrow-width selector that hid the icon-only System activity
  link after its text label was removed.

### Review now

- Confirm Files and Views are the correct folder-level tabs and that view rows
  contain the right amount of table/access context.
- Confirm File-menu ownership is intuitive with Export, Views, and New view in
  the requested order.
- Confirm the Views list/empty states and create-dialog swap match the intended
  workflow.
- Confirm the compact active-view breadcrumb gives enough context in the new
  tab without reintroducing a persistent control bar.

### Simulated or deferred behavior

- New tabs use real browser links, but saved-view persistence, publication,
  export generation, permission checks, and PostgreSQL queries remain
  wireframe simulations.
- A created view is stored only in the source tab’s DOM for the current review
  session. Static example views remain available after reload.
- The representative view query filters only the four rendered Customer orders
  records.

### Open questions

- Should the folder Views tab eventually include a table filter when a folder
  has many saved views?
- The prior questions about direct shared creation, System activity visibility,
  and acknowledged dead-letter filtering remain open.

### Approval path

If r007 Round 2 is approved, promote W-015 plus the accepted Files/Views,
File-menu saved-view, System activity, and reorder-persistence decisions into
the Context KB and Spec 00002, then refresh the feature-proof matrix and gap
check. If changes are requested, continue with Round 3 inside this r007 folder.

### Approval — 2026-08-01

- The user approved r007 Review Round 2.
- Approved W-015 as permissive URL/Phone string entry with best-effort display
  formatting and no silent stored-value rewrite.
- Approved shared row order with real-time delivery when available, durable
  queued maintenance as fallback, and a collision-safe Tabular-hidden rank
  column rather than physical PostgreSQL row order.
- Approved folder Files/Views discovery, File-menu Views/New view ownership,
  new-tab saved-view opening, the no-views creation path, and removal of the
  persistent saved-view bar.
- Approved the reachable System activity surface, permission-filtered activity,
  active/attention/completed filtering, queued work, dead-letter recovery,
  retention, and equal-height desktop activity cells.
- This approval unlocks Context KB promotion and the Spec 00002 matrix/gap
  refresh. It does not authorize production scaffolding or implementation.
