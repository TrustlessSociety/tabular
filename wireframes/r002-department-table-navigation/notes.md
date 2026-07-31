# Wireframe Review Notes

## Round 1 — 2026-07-27 — Department-first table hierarchy

### Changed

- Created a new major revision from `r001-postgres-native-core` because the primary navigation model changed materially.
- Removed Company, a visible Departments wrapper, databases, schemas, and collections from the primary navigation hierarchy.
- Made `Operations` and `Finance` direct peer departments.
- Placed five Operations tables and three Finance tables directly beneath their responsible department.
- Added a query-linked Finance browse state that changes the active department, heading, table count, primary actions, and visible table list.
- Kept `schema.table` identity as secondary or advanced PostgreSQL information rather than a navigation level.
- Carried the selected department into create-table, import, and representative table-grid routes.

### Feedback applied

- Direct feedback rejected singleton Company and Departments levels.
- Direct feedback established that each visible hierarchy level should have at least two peer examples.
- The accepted review model is department to tables, with Operations and Finance as department peers and multiple tables beneath each.

### Review now

- Whether Operations and Finance read immediately as peer departments rather than technical database objects.
- Whether tables appear directly owned or managed by the selected department.
- Whether removing `public` and `reporting` from the navigation resolves the non-technical mapping problem.
- Whether the subdued `schema.table` metadata in table rows is still too technical for the primary browse screen.

### Simulated or deferred behavior

- Department membership, ownership, permissions, table assignment, and cross-department sharing remain illustrative and are not production policy.
- Finance table destinations reuse the representative table-grid structure; the revision proves hierarchy and navigation, not a complete Finance dataset.
- Database, schema, grants, roles, and PostgreSQL administration remain outside the primary navigation and are not redefined by this wireframe.

### Open questions

- Should `schema.table` identity remain under each table name, or move entirely into an advanced details surface?
- Should departments always stay expanded in the left navigator, or collapse once the hierarchy is accepted?

### Approval path

If Round 1 is approved, `r002-department-table-navigation` becomes the forward hierarchy baseline and the next step is the next requested wireframe feedback round. Approval does not Freeze the research spec, settle permissions, authorize implementation, or advance to creative design.

## Round 2 — 2026-07-27 — Simplified grid labels and navigation-overlay repair

### Changed

- Removed the visible Draft badge from the persistent new-record row while retaining its editable state and accessible row label.
- Removed field type, relationship, storage, and constraint copy beneath every grid column label.
- Kept technical column details inside the configuration panel instead of repeating them in the grid header.
- Separated the mobile-navigation trigger from the shell's open-state attribute so ordinary page clicks cannot activate the backdrop.
- Initialized navigation closed, restricted backdrop display to the mobile breakpoint, and close it whenever the viewport returns to desktop width.

### Feedback applied

- Browser Comment 1: remove the Draft label.
- Browser Comment 2: remove all text beneath column labels.
- Browser Comment 3: repair the empty overlay that appeared after normal clicks.

### Review now

- Whether the label-only headers have the right visual density and remain easy to scan.
- Whether the unlabeled new-record row still reads clearly through its inputs and `New` ID cell.
- Whether ordinary grid and toolbar clicks now remain unobstructed while the mobile navigation overlay still opens intentionally.

### Simulated or deferred behavior

- Record creation, column configuration, cell editing, and mobile navigation remain browser-only wireframe simulations.
- Field types, storage, relations, and constraints remain illustrative controls in the configuration panel; no database metadata is changed.

### Open questions

- Should the bottom status bar continue to use the phrase `Draft saved locally`, or should that status be simplified in a later round?
- Is the remaining `New` value in the first draft-row data cell useful, or should the entire new-record row rely on input styling alone?

### Approval path

If Round 2 is approved, the next step is the next requested wireframe feedback round in `r002-department-table-navigation`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.
