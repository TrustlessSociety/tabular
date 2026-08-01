# Review Notes

## Round 1 — 2026-08-01 — Saved views and system activity

### Changed

- Created a new major revision from the accepted r005 full-width Tabular shell.
- Added a spreadsheet-integrated saved-view selector with Personal and Shared
  groups, view switching, dirty/save state, a create dialog, private/shared
  access choice, and a non-owner publication denial.
- Added a System activity screen with summary metrics, filters, job progress,
  detail history, dead-letter retry/acknowledge, and administrator retention.
- Added a queued Row order maintenance operation so the proposed real-time row
  move plus queued rank-compaction fallback can be reviewed in product context.
- Renamed the combined running/queued activity filter to Active after browser
  review showed that Running was too narrow for the work it contained.

### Browser verification

- Verified owner saved-view creation, shared saved-view switching, filtered row
  count, and editor denial for shared publication.
- Verified queued Row order maintenance detail, dead-letter Review and retry,
  and retention-period editing.
- Verified the Saved views and System activity screens at 1280 x 800 and
  390 x 844 with no document-level horizontal overflow.
- Verified the browser console contained no warnings or errors.

### Feedback and annotations applied

- Applied the request to create another wireframe revision for D-007 saved-view
  controls and D-010 jobs/dead-letter/admin state.
- Applied the preference for real-time reorder visibility with queued fallback.
- Translated the suggested hidden row column into a proposed collision-safe
  hidden rank such as `__tabular_row_v1`; the installed name must never collide
  with a user column.
- Kept KB and Spec 00002 unchanged until this revision is approved, per the
  user's clarification.

### Review now

- Whether the view selector belongs directly above the spreadsheet grid and
  whether Personal/Shared grouping is understandable.
- Whether create-time Private/Shared choice is preferable to publishing through
  a later separate action.
- Whether System activity is the right location and name for running jobs,
  queued maintenance, failures, and retention.
- Whether dead-letter actions should be Review and retry plus Acknowledge.
- Whether the queued Row order maintenance entry communicates the acceptable
  fallback without making ordinary reorder feel delayed.

### Simulated or deferred behavior

- Saved views, publication, role checks, jobs, retry, acknowledgement,
  retention, real-time broadcast, and row-order maintenance are in-memory
  wireframe behavior only.
- No PostgreSQL view is published, no hidden rank column is installed, and no
  worker or outbox event runs.
- URL/phone validation remains a separate unresolved product-policy question.

### Open questions

- Should a shared view be created directly, or should every view begin private
  and require a distinct Publish action?
- Should System activity be globally available to all users with filtered
  visibility, or appear only to operators/administrators?
- Should acknowledgement hide a dead letter from Needs attention or retain it
  there with an acknowledged state?

### Approval path

If Round 1 is approved, the next step is to promote the accepted saved-view,
system-activity, and reorder-persistence decisions into the Tabular Context KB
and Spec 00002, then refresh the gap check. If changes are requested, revise
this r006 folder and present Round 2 before any KB/spec promotion.

## Round 2 — 2026-08-01 — Complete r005 copy-forward

### Changed

- Rebuilt r006 from the complete rendered r005 baseline before applying the
  saved-view and System activity additions.
- Copied the r005 `lib/` surface plus `browse.html`, `table.html`, and
  `import.html` into r006 without replacing their established behavior.
- Replaced the reduced four-card r006 workflow index with the copied r005
  index, then added the four new saved-view/activity starting points for a
  total of eight.
- Kept the Saved views and System activity pages introduced in Round 1 and
  connected them back to the copied Acme Inc. file explorer hierarchy.
- Removed copy-forward/review terminology from the visible workflow header
  after browser inspection; that context remains only in this notes file.
- Repaired the copied explorer search initializer after browser testing showed
  it looked for the top-bar input inside the file-explorer content section;
  search now filters the active folder and reaches its empty state.
- Recorded W-015 as loosely accepted URL and Phone string values with
  best-effort formatters. Formatting may improve presentation, while the
  stored string remains canonical and owner-installed PostgreSQL constraints
  remain authoritative.

### Feedback applied

- Applied the correction that r006 must begin as a copy of the last revision,
  not as a replacement containing only the new pages.
- Preserved the prior accepted file-first workflows and layered the new D-007
  and D-010 surfaces alongside them.
- Preserved the proposed real-time row-order broadcast with durable queued
  rank maintenance from Round 1.

### Browser verification

- Verified all eight workflow cards and all nine links, including the copied
  alternate cell-error start.
- Verified copied r005 behavior: root and folder browsing, list/grid state,
  repaired search and empty state, blank Untitled File, spreadsheet Table
  settings, and import Preview values.
- Verified added behavior: owner saved-view creation, editor shared-view
  denial, Operations return navigation, Active job filtering, queued row-order
  maintenance detail, dead-letter Review and retry, and Acme Inc. return
  navigation.
- Checked `workflows.html`, browse, new-file, table, import, Saved views, and
  System activity at 1280 x 800 and 390 x 844. Every route kept document width
  equal to viewport width; spreadsheet grids retain their intended internal
  horizontal scrolling.
- Browser console warnings and errors: none.

### Review now

- Confirm the first four workflow cards still represent the complete r005
  browse, new-file, spreadsheet, and import baseline.
- Confirm the four added cards feel like extensions of that product rather
  than a separate wireframe package.
- Confirm Saved views returns to Operations and System activity returns to the
  Acme Inc. file explorer as expected.
- Confirm the W-015 wording matches the intended loose string-entry and
  best-effort formatter policy.

### Simulated or deferred behavior

- The copied r005 behaviors and all Round 1 saved-view/activity behaviors are
  still browser-only simulations.
- No URL/phone storage migration, formatter implementation, PostgreSQL view,
  hidden rank column, real-time transport, worker, or retention job runs.
- KB and Spec 00002 promotion remains deferred until this corrected r006 round
  is explicitly approved.

### Open questions

- Should the Saved views feature ultimately be incorporated directly into the
  primary `table.html` screen, or remain a distinct review route until
  implementation planning resolves its component boundary?
- The Round 1 questions about distinct Publish action, System activity
  visibility, and acknowledged dead-letter filtering remain open.

### Approval path

If Round 2 is approved, promote W-015 plus the accepted saved-view,
system-activity, and reorder-persistence decisions into the Context KB and Spec
00002, then refresh the feature matrix and gap check. If changes are requested,
continue with Round 3 inside this corrected r006 folder.
