# Browser QA

## Environment

- Date: 2026-07-27
- Entry point: `http://127.0.0.1:4174/workflows.html`
- Browser surface: Codex in-app browser
- Wide check: 1280 × 720
- Narrow check: 390 × 844

## Round 1 checks

### Static checks

- `lib/app.js` and `lib/icons.js` passed `node --check`.
- All five HTML files resolved their document-relative page and asset links.
- No root-relative links or trailing whitespace were found.
- `specs.md` remained within the Agent File line limit at 478 lines.

### Department hierarchy

- Operations and Finance rendered as direct peer departments with no visible Company or Departments wrapper.
- Operations exposed five direct tables: Customer orders, Inventory, Vendors, Stock movements, and Purchase requests.
- Finance exposed three direct tables: Invoices, Expenses, and Budgets.
- Database and schema names did not appear as navigation levels.
- Operations loaded as the default department with five table rows.
- `?department=finance` updated the heading, copy, active department, table count, action links, and visible table list.

### Department-scoped behavior

- Finance search for `bud` returned only Budgets and `1 table`.
- A missing-table query returned `0 tables` and displayed the empty state.
- Create-table rendered `Finance department`, `Managed by Finance`, and a Finance return route.
- Import rendered `Bring values into Finance` and preserved the Finance return route.
- The representative table route rendered `Finance > Invoices`, selected Invoices in the navigator, and changed the grid label to `Invoices records`.
- The workflow index rendered the department-first heading and `2 departments · 8 tables` summary.

### Responsive behavior

- At 1280 × 720, both department hierarchies remained visible with no document-level horizontal overflow.
- At 390 × 844, Finance rendered three tables without document-level horizontal overflow.
- The mobile navigator opened as an overlay and displayed both departments and their direct child tables.
- The temporary viewport override was reset after verification.

### Browser health

- No console warnings or errors were recorded across the reviewed routes.

Evidence:

- `operations-desktop.jpg`
- `finance-desktop.jpg`
- `finance-mobile.jpg`
- `department-navigation-mobile.jpg`

## Round 2 checks

### Static checks

- `lib/app.js` and `lib/icons.js` passed `node --check` after the navigation-state repair.
- No grid header retained a `.header-meta` element or visible Draft badge.
- No root-relative page or asset link and no trailing whitespace was introduced.
- `specs.md` remained within the Agent File line limit at 481 lines.

### Grid-label simplification

- At 1280 × 720, the rendered headers were exactly Order ID, Customer, Email, Status, Total, Paid, and Ordered at.
- The header metadata count was zero and the draft-row badge count was zero.
- The new-record row retained its editable fields, `New` ID value, accessible row label, and save action.
- The label-only header row remained vertically aligned and the page had no document-level horizontal overflow.

### Navigation-overlay repair

- The defect was traced to the shell state attribute also being registered as a click trigger, which caused bubbled clicks anywhere in the shell to open navigation.
- Clicking the Acacia Retail grid cell selected it while the shell stayed closed and the backdrop remained hidden with `display: none`.
- Clicking the Filter toolbar button also left the shell closed and backdrop hidden.
- Opening Configure column displayed the intended right panel without displaying the navigation backdrop.
- At 390 × 844, the dedicated menu button opened the navigator, made the backdrop visible, and moved the sidebar onscreen.
- Clicking the backdrop closed the navigator, and resizing an open navigator back to 1280 × 720 also reset the shell and backdrop to closed.

### Browser health

- No console warnings or errors were recorded during desktop grid, panel, mobile overlay, close, and resize checks.

Evidence:

- `table-round-2.jpg`
- `table-round-2-mobile-navigation.jpg`
