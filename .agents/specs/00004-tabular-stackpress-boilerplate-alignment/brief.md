# Brief

## Preserved User Direction

> I manually created a new proof `proofs/stackpress-boilerplate/` to show how I
> was expecting the code base to look like. Please review and strategize what
> the changes would be.
>
> Can we make a new spec for this work so it doesn't get lost?
>
> In the pages there needs to be only one export per file. Then each of those is
> lazy imported. When building, use only the registered entry so unrelated page
> code is not pulled into the build.

The user requested a separate durable spec after the initial read-only review,
then corrected the page-routing/build interpretation and the proof's former
umbrella import. This Proposed package records those corrections; it does not
yet authorize implementation.

## Objective

Restructure Tabular so its application composition, Reactus integration,
plugin-owned pages, development/build scripts, shared page provider, and CSS
tooling follow the small, lifecycle-driven shape demonstrated by the
user-provided boilerplate. Preserve current product behavior and every accepted
direct-library, security, PostgreSQL, process, artifact, and release boundary.

## Source Material And Provenance

- [User-provided Stackpress boilerplate proof](../../../proofs/stackpress-boilerplate/):
  source artifact reviewed locally on 2026-08-06, including the user's current
  working-tree corrections. It demonstrates dedicated build/development config,
  thin scripts, Ingest lifecycle resolution, an app-owned Reactus engine and
  Provider, plugin-owned route/view registration, registered-view build
  discovery, a database connection plugin, and UnoCSS integration.
- [Current implementation boundaries](../../context/tabular-implementation-boundaries.md):
  authoritative direct-package, application-ownership, hydration, process, and
  production validation constraints.
- Current source reviewed on 2026-08-06: `bootstrap/`, `config/`, `entrypoints/`,
  `plugins/`, `scripts/`, `tests/`, root package manifests, and `uno.config.ts`.
- The proof remains preserved in its existing root folder. It is linked rather
  than duplicated into `.agents/resources/` because the complete committed
  source artifact is already available in place.

## Scope

- Thin `bootstrap/application.ts` so it no longer imports every concrete plugin
  service or owns HTTP adaptation, Reactus, artifact loading, startup, and
  shutdown in one module.
- Remove the bootstrap-to-plugin-to-bootstrap type dependency cycle by placing
  narrow shared server, config, runtime, and view contracts in predictable
  application-owned modules.
- Make plugin entrypoints register deliberate `config`, `listen`, and `route`
  lifecycle handlers where those phases apply.
- Provide hardened `scripts/build.ts` and `scripts/develop.ts` entrypoints that
  bootstrap plugins and discover registered views.
- Split build, development, and live settings into dedicated `config/` modules
  consumed by those thin entrypoints.
- Move Reactus configuration, rendering, and the browser-safe shared Provider
  into `plugins/app`.
- Replace every multi-route `pages/routes.ts` aggregator with one default page
  handler export per file and register each handler through an anonymous dynamic
  import from its owning plugin.
- Pair every rendered page handler with one feature-owned view entry. Replace
  the single union-prop Reactus workbench with separate entries for explorer,
  grid/table, import, operations, authentication, and other rendered surfaces.
- Build the unique entries discovered through `server.views`; do not execute
  page handlers during build or seed Reactus with a global union entry.
- Retain the proof's shared Provider and client hooks behind a typed browser
  projection that never mirrors raw server request, session, or response
  controllers.
- Move Reactus/static request integration into `plugins/app`; use containment
  checks in development and exact verified-manifest lookup in production.
- Remove `plugins/ui` after moving grid-owned behavior into `plugins/grid` and
  genuinely shared primitives into `plugins/app/components`.
- Make UnoCSS the default for app-owned styling and migrate route by route.
  Move the only permitted conventional vendor, Tabulator, accessibility, or
  cascade-sensitive CSS into flat `public/styles/*.css` files.
- Split concentrated production modules only around centered responsibilities
  that improve findability, independent change, testing, or reuse.
- Preserve and update tests, architecture checks, artifact checks, clean-install
  dependency checks, PostgreSQL target validation, and browser acceptance.

## Non-Goals

- Changing accepted Tabular product behavior, terminology, routes, permissions,
  PostgreSQL authority, or user journeys.
- Reopening or rewriting Frozen Spec 00003.
- Restoring umbrella `stackpress`, `schema.idea`, generated stores, or built-in
  auth, API, session, or admin packages.
- Weakening direct-package ownership, browser serialization, verified artifact,
  bounded-static-path, dependency, or process-authority contracts while adopting
  the proof's structure.
- Replacing production PostgreSQL with the proof's PGlite store.
- Sending raw request headers or bodies, opaque session identifiers or tokens,
  server session maps, database/server config, raw error objects, or stacks to
  browser code. The Provider and its browser-safe projections remain in scope.
- Replacing all feature CSS with utilities in one change.
- Keeping conventional app-owned CSS in plugin/view folders or outside the
  accepted `public/styles/*.css` exception boundary.
- Splitting files merely to satisfy a numeric line target.
- Creating production tasks or editing application code before Freeze and task
  plan acceptance.

## Proposed Target Shape

```text
scripts/{build,develop,serve}.ts
config/{build,dev,live}.ts
public/styles/{reset,globals,tabulator,accessibility}.css
bootstrap/{application,request-adapter,web-runtime,artifacts,lifecycle,resources}.ts
plugins/
  app/
    plugin.ts
    types.ts
    view.ts
    components/Provider.tsx
    components/server/
  explorer/
    plugin.ts
    pages/index.ts
    views/index.tsx
  grid/
    plugin.ts
    pages/table.ts
    pages/grid-read.ts
    pages/grid-write.ts
    views/table.tsx
    components/workbench/
  import-export/
    plugin.ts
    pages/import.ts
    views/import.tsx
  operations/
    plugin.ts
    pages/activity.ts
    views/activity.tsx
```

Route names remain subject to the accepted public-route contract. The one-entry
page files, lazy plugin registrations, feature-owned view entries, and centered
dependency direction are required structure rather than illustrative layout.

## Proposed Sequence

1. Finish the process-safe lifecycle and UnoCSS research; prove the corrected
   lazy-page, multi-entry build, Provider projection, and static-delivery slice.
2. Freeze this spec and accept a separately authored implementation task plan.
3. Introduce dedicated build/development/live config and thin lifecycle scripts
   without changing the current production entrypoint yet.
4. Move Reactus setup, the Provider projection, and Reactus/static HTTP
   integration into `plugins/app` behind compatibility tests.
5. Convert each plugin's `pages/routes.ts` into one-default-export page files
   and register each with `server.import.<method>(..., () => import(...))`.
6. Pair rendered routes with their feature-owned `server.view` entries, split
   the union workbench, and make `server.views` the only Reactus build-entry
   discovery source.
7. Extend the artifact manifest across every built page/client/asset/static
   entry, retain containment and integrity checks, and remove the singleton
   Reactus config entry.
8. Move grid/shared code to centered owners, remove global `plugins/ui`, migrate
   each route to UnoCSS, and move permitted CSS exceptions to `public/styles/`.
9. Remove compatibility bridges, run the complete technical gates, and perform
   fresh desktop/mobile browser acceptance through the ordinary signed-out
   production-like path.

## Completion Criteria

- Bootstrap no longer imports every concrete feature service and plugins no
  longer depend on a monolithic composition-root type.
- Build and development bootstrap the registered plugin graph and discover all
  feature-owned Reactus views deterministically.
- Every `plugins/*/pages/*.ts` entry has one default export and an anonymous
  dynamic import; no static handler imports or route aggregators remain.
- Every rendered public route has one paired feature-owned view entry, and no
  view entry selects among unrelated product surfaces at runtime.
- Build output demonstrates separate entry dependency graphs and does not pull
  unrelated feature-page code through the former union workbench.
- Production startup continues to use built and verified artifacts without Vite
  development middleware.
- Provider hydration exposes only the typed browser projection in `decisions.md`;
  secret sentinels and prohibited keys are absent from rendered HTML.
- Development static lookup stays inside its public root; production serves
  exact manifest routes whose real path, size, and hash verify.
- `plugins/ui` is removed after every responsibility gains a centered owner.
- UnoCSS is declared, typechecked, built, and browser-reviewed for all app-owned
  styling; only D-011 exceptions remain as flat `public/styles/*.css` files.
- Targeted large-file splits have stable public contracts and focused tests.
- Full unit/integration, artifact, architecture, secrets, process, PostgreSQL,
  desktop, and 390-by-844 browser gates pass with fresh evidence.
- Reusable outcomes receive Context-promotion review at Freeze and closeout.
