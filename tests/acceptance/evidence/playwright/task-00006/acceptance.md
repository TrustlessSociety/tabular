# Task 00006 browser acceptance evidence

Agent acceptance: `passed`

Reviewed 2026-08-02 03:46-04:00 PST against the current uncommitted workspace
source and rebuilt Reactus artifacts at `http://127.0.0.1:3066/`. The desktop
and narrow screenshots plus the menubar keyboard path were refreshed at 03:59
after the final source change.

## Automated verification

- `npm run verify`: passed on Node 22.14.0.
- Tests: 47 passed, 0 failed. The focused grid/UI suite passed 12 of 12 checks,
  including bounded mounted-row projection, disconnected-cell scrolling and
  focus restoration, constant-time range coverage over 10,000 rows, in-place
  column replacement with selection preservation, band-selection focus
  continuity, and a real mixed-emphasis state.
- Production build: 3 Reactus artifacts and 4 server SQL assets verified.
- Architecture: passed; the transitive browser graph is server-free.
- Built runtime: health, readiness, manifest-allowlisted assets, and idempotent
  shutdown passed.
- Entrypoints: web, migrator, and worker checks passed.
- Non-failing command noise: npm reported the existing unknown `python` user
  configuration warning. The browser emitted no console warning or error.

## Desktop acceptance — 1440x900

Artifact: [desktop-1440x900.png](desktop-1440x900.png)

- Initial logical selection was `status:4` (`D4`). Undo, Redo, and Clear were
  disabled; Bold exposed `aria-pressed="false"`; grid totals were
  `aria-rowcount="421"` and `aria-colcount="13"`.
- Document and viewport widths were both 1440 px. The grid viewport was 1440 px
  wide with 1774 px of internal scrollable content, so horizontal overflow stayed
  inside the grid.
- Pointer range selection produced `order_id:2 to total:3`; Shift+ArrowRight
  extended it to `order_id:2 to owner:3`.
- A keyboard range `status:4 to order_date:4` exposed Bold as
  `aria-pressed="mixed"`. Keyboard activation left that mixed state intact and
  announced `Bold has mixed values in this selection`.
- Shift+Space selected `Row 4` while the focused `status:4` gridcell remained
  the roving tab stop. ArrowDown resumed from that point at `status:5`.
  Control+Space then selected `Column status` while preserving focus at
  `status:5`; Tab resumed at `order_date:5`.
- The stable `status:4` selection survived sort plus a Pending filter even while
  its row was hidden. Pending exposed `aria-pressed="true"` and enabled Clear;
  Clear removed all pressed states and disabled itself again.
- Editing row 4 Customer saved `Orchard Works Ltd` and announced
  `Saved customer, row 4`.
- The menubar exposed one roving page tab stop: File was `tabIndex=0` while
  Edit, View, and Format were `-1`. Tab from File left the composite for Bold;
  ArrowRight moved both focus and the sole tab stop to Edit; ArrowDown opened
  Edit on Undo; Escape closed it and restored focus to Edit. The earlier action
  path also used ArrowDown plus Enter to activate Redo and restore Edit focus.
- The modal dialog opened with `aria-modal="true"` and focus on Close. Shift+Tab
  wrapped to Done, Tab wrapped to Close, and Escape closed it and restored focus
  to Selection.
- At `scrollTop=7200`, only 64 rows were mounted. The logical `customer:4`
  selection remained stable while its cell was unmounted. Mounted rows 210-273
  exposed row indices 211-274; every mounted data cell exposed both row and
  column indices, with zero missing or incorrect indices. Returning to the top
  restored exactly one selected cell and preserved the edited value.
- A real recycled-row boundary check started with row 32 as the last mounted
  row, activated its status cell without scrolling it into view, then pressed
  ArrowDown. The grid scrolled to `scrollTop=718`, mounted row 33, and restored
  DOM focus and the sole roving tab stop to connected cell `status:33`.
- DOM sanity: one grid, 13 column headers, no duplicate IDs, no unnamed buttons
  or links, and exactly one selected gridcell after restoration.

## Narrow acceptance — 390x844

Artifacts:

- [narrow-390x844.png](narrow-390x844.png)
- [narrow-390x844-selection-overlay.png](narrow-390x844-selection-overlay.png)

- `documentElement` and body widths were both 390 px; the grid retained 1774 px
  of internal horizontal content inside a 390 px viewport.
- No primary toolbar or header action crossed the viewport bounds.
- The rightmost Format menu was clamped to left 149.83 px, right 359.83 px, and
  bottom 174 px.
- The selection dialog stayed inside the viewport at left 24 px, right 390 px,
  top 0, and bottom 844 px. Close and Done were fully visible and keyboard focus
  started on Close.

## Runtime signals

- Browser console: 0 messages, 0 errors, 0 warnings.
- Uncaught runtime errors: none.
- Document-level horizontal overflow errors: none at either reviewed viewport.
- Accessibility/name/state/focus-path errors found by the recorded checks: none.
