# Tabular Implementation Boundaries

## Status

Accepted from Spec 00002 Rounds 2 and 3, the approved r007 design closure,
Frozen Spec 00003 on 2026-08-01, and verified Spec 00003 implementation-review
corrections promoted on 2026-08-04. These are durable boundaries for
implementation planning; production work still requires an accepted task plan.

## Direct application composition

- Compose `@stackpress/ingest`, `@stackpress/inquire` with its PGlite/PostgreSQL
  adapters, `reactus`, and `@stackpress/lib` directly. Do not install the
  umbrella `stackpress` package, add `schema.idea`, or use built-in auth, API,
  session, or admin features.
- The application owns bootstrap, configuration, routes, readiness, errors,
  shutdown, identity, authorization adapters, repositories, migrations, web,
  MCP, administration, and durable operations. Ingest owns HTTP mechanics;
  Reactus owns rendering/build outputs; Inquire owns SQL/transaction mechanics;
  lib events are same-process primitives only.
- Use Ingest's plugin loader: register project-local `plugins/*/plugin.ts` in
  `package.json.plugins` and call `server.bootstrap()`. Keep root configuration
  and bootstrap explicit. Feature plugins own only the `components/`, `events/`,
  `pages/`, `views/`, and `helpers/` folders they need; browser-facing imports
  remain browser-safe and no plugin becomes a generic dumping ground.
- The first server target is Node HTTP. Package Reactus built pages, clients,
  and assets; run web, worker, and one-shot migrator as separate observable
  entrypoints with separate authority and pool ownership.
- Reactus hydration props contain allowlisted shell-bootstrap values only.
  Mutable user or database strings travel through authenticated JSON actions.

## Runtime object lane

- PostgreSQL remains canonical for user tables, views, constraints, grants, and
  row-level security.
- Fixed Tabular control records use versioned SQL migrations, handwritten
  TypeScript contracts, and handwritten repositories. Dynamic user tables and
  views are discovered through the catalog and must not generate a model/client
  per object.
- Catalog reconciliation owns stable object identity and schema drift. Display
  names and positions are not durable database identity.

## Authority and migrations

- The first slice authenticates an existing safe PostgreSQL `LOGIN` role through
  a short-lived ordinary connection, binds verified database/role identities to
  an application identity, and resolves only current roles the web authority may
  safely assume. Never read or retain a password hash. A future provider subject
  maps into the same boundary; provider claims and cookie content never grant a
  database role directly.
- Browser sessions use opaque rotated identifiers with server-side subject,
  role mapping, CSRF secret, creation/activity/expiry, and revocation state.
  Production cookies require HTTPS, `Secure`, `HttpOnly`, a deliberate
  `SameSite` policy, bounded scope/lifetime, exact-origin validation, and a
  session-bound synchronizer token for mutations.
- A shared named capability is an ownership boundary, not authorization. Page
  and MCP adapters keep independent caller identity, validation, output mapping,
  and deny-default checks before PostgreSQL applies final authority.
- User-table ownership belongs to a non-login business role. Transactional
  system migrations, hidden-field promotion, and owner-approved shared-view
  publication use a separate non-caller migrator.
- Migration versions and their DDL commit in one transaction. Failed versions
  leave neither schema changes nor version records; applied versions are
  idempotent on re-entry. PostgreSQL migration application is serialized with a
  transaction-scoped advisory lock and deployment-only migrator authority.
- Each authority-scoped PostgreSQL transaction owns one checked-out client,
  applies only allowlisted transaction-local role/settings, rolls back on every
  error, and resets and verifies pooled state before release. Destroy the client
  when cleanup or verification fails.
- An owner-installed hidden JSON column must be collision-safe. Never adopt,
  overwrite, or change a user column that happens to have the proposed hidden
  name. Remove promoted JSON only after the real-column transaction succeeds.

## Browser and action state

- Browser selection, edit, validation, and undo keys include file identity and
  stable row/column identity; coordinates alone are insufficient.
- Valid single-cell edits serialize and save on blur through the same durable
  action boundary. Invalid or incomplete attempts remain actor-owned drafts;
  there is no separate manual Commit path for ordinary valid edits.
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
- The visibly active cell owns focus after stable grid readiness, keyboard
  editor close/cancel, and live row/column replacement unless focus is
  intentionally in another control. Cell, named-header, whole-column, row, and
  whole-header-row selection remain distinct logical targets.
- Persisted named columns are the only column-drag sources. Every visible
  header, including a tab-local inserted blank, is an exact left/right drop
  target. A blank remains non-draggable until it becomes a real PostgreSQL
  column.
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
behavior. Spec 00003 proved the role-cleanup, migration-lock, concurrent-write,
OID-identity, and durable-worker mechanisms on PostgreSQL 18.4; production must
still recheck its actual server, pool, live identity, multi-process services,
load, deployment, backup, and rollback targets.

Re-audit the direct dependency graph during implementation. Never expose Vite's
development server as a production surface.

Browser release acceptance starts signed out at the ordinary application
origin, signs in through the visible PostgreSQL login form, and exercises public
product routes. A fixture-only URL, `TestIdentityProvider`, `__acceptance`,
direct service call, injected cookie, or stale browser artifact cannot prove a
human-accessible path. Review setup/reset may target only an explicitly
disposable loopback PostgreSQL environment with bounded cleanup.

Evidence labels must remain honest: executable, prior-evidence, guide,
target-validation, and visible-gap findings are not interchangeable.
