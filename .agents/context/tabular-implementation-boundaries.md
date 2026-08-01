# Tabular Implementation Boundaries

## Status

Accepted from Spec 00002 Rounds 2 and 3 plus the approved r007 design closure
on 2026-08-01. These are durable boundaries for later implementation planning;
they do not authorize a production scaffold, migration, or task inventory.

## Runtime object lane

- PostgreSQL remains canonical for user tables, views, constraints, grants, and
  row-level security.
- Fixed Tabular control records may use generated Stackpress stores. Dynamic
  user tables and views are discovered through the catalog and must not generate
  a Stackpress model/client per object.
- Catalog reconciliation owns stable object identity and schema drift. Display
  names and positions are not durable database identity.

## Authority and migrations

- A shared named capability is an ownership boundary, not authorization. Page
  and MCP adapters keep independent caller identity, validation, output mapping,
  and deny-default checks before PostgreSQL applies final authority.
- User-table ownership belongs to a non-login business role. Transactional
  system migrations, hidden-field promotion, and owner-approved shared-view
  publication use a separate non-caller migrator.
- Migration versions and their DDL commit in one transaction. Failed versions
  leave neither schema changes nor version records; applied versions are
  idempotent on re-entry.
- An owner-installed hidden JSON column must be collision-safe. Never adopt,
  overwrite, or change a user column that happens to have the proposed hidden
  name. Remove promoted JSON only after the real-column transaction succeeds.

## Browser and action state

- Browser selection, edit, validation, and undo keys include file identity and
  stable row/column identity; coordinates alone are insufficient.
- Presentation state is distinct from PostgreSQL field metadata and canonical
  row mutations. Unsaved column order/visibility, filters, sorting, and cell
  presentation are current-tab state; private/shared saved views are their
  explicit persistence and collaboration boundaries.
- Shared row order is table-level presentation state. Store it through an
  owner-installed, collision-safe hidden rank column, publish committed moves
  in real time when available, and queue idempotent rank maintenance or
  delivery when inline work cannot finish. Never infer it from PostgreSQL
  physical row order or hardcode a conflicting `__tabular_row` name.
- Reads, authorized CSV exports, and published saved views share one allowlisted
  filter/sort query compiler. Page and MCP surfaces do not accept arbitrary SQL
  or DDL-shaped input.
- Durable operations use an action journal plus post-commit outbox. Enqueue and
  delivery are idempotent; workers claim safely, cap retries, preserve visible
  dead letters, and do not claim exactly-once external delivery.
- Saved views are reachable from folder Views discovery and File → Views/New
  view. System activity is reachable from the explorer/table shell and exposes
  only caller-authorized records/actions; retention remains administrator-only.

## Grid renderer and logical selection

- Pin `tabulator-tables` 6.5.0 behind a Tabular-owned adapter for the first
  production slice. Renderer APIs must not leak into domain actions.
- Stable row and column identities are the selection authority. The adapter
  projects cell/range/row/column selection into mounted cells and restores it
  after virtual unmounts, data reloads, and column-order changes.
- Begin with vertical virtualization and ordinary internal horizontal
  scrolling. Do not depend on Tabulator's experimental horizontal virtual DOM
  until a measured column-scale requirement and focused target validation exist.
- Range mutations carry current-file-validated row IDs, column IDs, and cell
  count into one PGlite/PostgreSQL action envelope. Canonical multi-cell changes
  execute as one atomic batch rather than a sequence of browser edits.
- Expose logical grid totals and mounted row/column indices. Browser-tree ARIA
  evidence guides architecture but never substitutes for the production
  browser and native-assistive-technology matrix.

## Production rechecks

PGlite establishes local programming patterns, not production PostgreSQL
behavior. Recheck target server/version, connection-pool role cleanup,
authenticated identity, multi-process and external-DDL races, workers and live
services, native assistive technology, deployment, backup, and rollback.

Evidence labels must remain honest: executable, prior-evidence, guide,
target-validation, and visible-gap findings are not interchangeable.
