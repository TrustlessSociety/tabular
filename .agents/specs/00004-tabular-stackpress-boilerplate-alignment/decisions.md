# Decisions And Gaps

## Accepted And Inherited Decisions

### D-001: Preserve this work in a separate spec

Create Proposed Spec 00004 for the boilerplate-alignment review and future
implementation contract. Do not reopen or rewrite Frozen Spec 00003.

Evidence: explicit user request on 2026-08-06.

### D-002: Keep the focused direct-package architecture

Continue composing `@stackpress/ingest`, `@stackpress/inquire` and its explicit
adapters, `reactus`, and `@stackpress/lib` directly. Do not add umbrella
`stackpress`, Idea, generated stores, or built-in auth/API/session/admin.

Source: Accepted Context and Frozen Spec 00003.

### D-003: Preserve application-owned production boundaries

Tabular continues to own identity, durable sessions, CSRF, authorization,
repositories, migrations, routes, artifacts, readiness, shutdown, web/MCP
mapping, workers, and operations. PostgreSQL remains canonical. Vite remains a
development/build tool only, and hydration remains allowlisted.

Source: Accepted Context and Frozen Spec 00003.

### D-004: Treat the boilerplate as source-shape guidance

The proof's lifecycle, ownership, file placement, route/view registration,
per-entry build discovery, Provider, configuration, and UnoCSS patterns are
mandatory structural direction. Sample behavior and PGlite data do not replace
Tabular's accepted product and PostgreSQL contracts.

Evidence: explicit user correction on 2026-08-06.

### D-005: Use direct focused imports throughout the proof translation

The proof's former `stackpress/server` type import was a proof mistake and has
been corrected to `@stackpress/ingest/Server`. There is no longer a conflict to
classify or reject. Tabular continues using the focused package imports from
D-002.

Evidence: revised proof and explicit user correction on 2026-08-06.

### D-006: Give every server page entry one lazy handler module

Each registered file under `plugins/*/pages/` has one export: the default page
handler for that server entry. Plugin registration binds the HTTP method and
path to an anonymous dynamic import, for example:

```ts
server.import.get('/pages/table.html', () => import('./pages/table.js'));
```

Do not retain multi-route `pages/routes.ts` aggregators or statically import
page handlers from plugin entrypoints. A rendered route pairs the lazy handler
with exactly one feature-owned view entry:

```ts
server.view.get('/pages/table.html', '@/plugins/grid/views/table');
```

The handler prepares response/view data; the paired view is the independently
buildable Reactus entry. API/event routes under `pages/` use the same
one-entry-per-handler rule without a view registration when no HTML renders.

Evidence: explicit user routing correction on 2026-08-06 and verified Ingest
`ImportRouter`/`ViewRouter` behavior.

### D-007: Build only registered view entries

Build mode bootstraps enough lifecycle to populate route and view registries,
then iterates `server.views` and calls `engine.set(view.entry)` once per unique
view entry. It does not execute the lazy page handlers, eagerly import every
page module, or seed Reactus with one global union entry. At request time, only
the matching server handler import executes. Each rendered route therefore has
its own page-handler boundary and feature-owned Reactus dependency graph.

The current `config/reactus.ts` singleton `entry` and the surface-switching
`plugins/ui/views/workbench.tsx` composition root must be removed as part of the
transition.

Evidence: explicit user build correction, the proof's registered-view loop,
and installed Ingest router behavior.

### D-008: Preserve the Provider API with a browser projection

The shared Provider and its request, response, session, language, and data hooks
are part of the target architecture. The server must populate them through an
explicit browser projection rather than serialize server controller objects.

The projection may contain public application identity/version; public locale,
language, brand, theme, and shell config; method/path and allowlisted route
state; display identity and presentation-only capability flags; an explicit
session-bound CSRF value; response code/status; and immutable shell props.

It must not contain `Cookie`, `Authorization`, arbitrary request headers, raw
request/form bodies, opaque session identifiers/tokens, the server session map,
PostgreSQL connection/password/pool data, server-only config, raw response
headers, internal errors/stacks, or mutable rows that belong behind authenticated
actions.

This is a serialization boundary, not a rejection of the proof's Provider. The
browser may use hydrated identity or capability values to shape presentation,
but every server action still authenticates and authorizes independently.

Evidence: accepted by the user on 2026-08-06.

### D-009: Keep app-owned static routing with verified containment

The app plugin owns Reactus HTTP integration and static delivery as shown by the
proof, with different development and production checks:

- Development resolves against the public root and rejects absolute paths,
  parent/symlink escapes, directories, and files outside the real root.
- Build records every intentional public route with destination, size, and hash.
- Production uses exact manifest lookup, typed-root containment, size, and hash.
- Page modules are never public static routes; unregistered paths return 404.

The proof's fallback is therefore retained as an app-plugin responsibility but
hardened at the URL-to-filesystem and build-to-runtime trust boundaries.

### D-010: Remove `plugins/ui` after ownership migration

Remove `plugins/ui` after moving table workbench, selection, insertion, drafts,
and spreadsheet-row behavior into `plugins/grid`, and shared browser primitives
such as icons and emphasis buttons into `plugins/app/components`. Do not retain
`plugins/ui` as a global page, build entry, theme shell, or compatibility owner.

Frozen Spec 00003 remains accurate historical evidence; do not rewrite it as
though the earlier implementation already used this structure.

Evidence: accepted user recommendation on 2026-08-06.

### D-011: Make UnoCSS the app-owned styling default

Use UnoCSS utilities for all app-owned styles and migrate one route at a time so
each page remains independently reviewable. Conventional CSS is allowed only
for vendor, Tabulator, accessibility, or genuinely cascade-sensitive behavior,
and every such file must live under flat `public/styles/*.css` ownership rather
than inside a plugin or view folder. Each route's `Head` loads only the public
exception styles that route needs.

Evidence: explicit user decision on 2026-08-06.

## Resolved Gaps

- G-002 is resolved by D-010: remove `plugins/ui` after ownership migration.
- G-004 is resolved by accepted D-008: retain only browser-safe projections.
- G-005 is resolved by D-011: UnoCSS by default; CSS exceptions in
  `public/styles/*.css` only.

## Open Gap Ledger

### G-003: What lifecycle runs in each process?

- Status: Accepted implementation-time gate. Builds avoid database, worker, and
  network side effects; every affected task verifies its permitted phases.

### G-007: What automated gates apply to each wave?

- Status: Accepted implementation-time gate. The sprint defines default tests,
  builds, architecture/secrets, artifact, runtime, clean-install, and relevant
  PostgreSQL gates.

### G-008: What fresh acceptance closes implementation?

- Status: Accepted implementation-time gate. Closeout needs fresh signed-out
  desktop/390-by-844 browser evidence and separate production-target evidence.

## Freeze Authorization

The user explicitly directed this spec to Freeze on 2026-08-06. G-003, G-007,
and G-008 are accepted as implementation-time gates rather than unresolved
design authority. They do not permit a change to D-004 through D-011, the
PostgreSQL/security Context boundaries, or the P-002 slice limits.

- G-003: each affected task must define and verify its permitted lifecycle phases.
- G-007: the proposed sprint supplies the default gate matrix; each task records
  its focused gates before work starts.
- G-008: closeout requires fresh signed-out desktop and 390-by-844 browser
  evidence, plus separate production-target evidence for any claim made.

## Change Contract

| Area | Required strategy |
| --- | --- |
| Configuration | Dedicated build, development, and live config modules |
| Lifecycle | Thin scripts bootstrap plugins and resolve only process-safe phases |
| Server pages | One default handler export per file; anonymous dynamic import per entry |
| Rendered routes | Pair each lazy page handler with one feature-owned view entry |
| Reactus build | Discover unique entries from `server.views`; no global union entry |
| Provider | Preserve hooks and shape through accepted D-008 browser projection |
| Static delivery | App-owned in development; manifest-bound and integrity-verified in production |
| Styling | UnoCSS for app-owned styles; D-011 CSS exceptions only in `public/styles/*.css` |
| Persistence | Preserve PostgreSQL production authority; use PGlite only where already allowed |
| Plugin topology | Apply centered ownership and remove `plugins/ui` through D-010 |
