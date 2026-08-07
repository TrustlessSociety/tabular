# Proofs

## Status

The user-provided boilerplate is recorded as guide evidence, not as a Frozen
production Proof. One Tabular-specific composition Proof is proposed and is a
Freeze blocker unless the user accepts a documented fallback or deferral.

## P-001: User-Provided Stackpress Boilerplate Shape

- Status: Guide evidence; preserved source artifact.
- Path: [`proofs/stackpress-boilerplate/`](../../../proofs/stackpress-boilerplate/)
- Question: What codebase shape did the user expect Tabular to resemble?
- Demonstrated signal:
  - thin `scripts/build.ts` and `scripts/develop.ts` composition entrypoints;
  - dedicated build and development config modules;
  - Ingest plugin bootstrap followed by explicit lifecycle resolution;
  - app-owned Reactus setup and route-to-view integration;
  - a shared React Provider and server-context hook surface;
  - plugin-owned route/view registration;
  - view discovery through `server.views` during build;
  - a small database connection plugin; and
  - UnoCSS/Vite integration with global/reset styles.
- Evidence checked and refreshed 2026-08-06:
  - all proof source and manifests, including the user's current corrections;
  - current ignored build outputs;
  - TypeScript check using the parent workspace installation; and
  - external-import versus manifest comparison.
- Limits:
  - It is a generic shape guide, not a Tabular product implementation.
  - Its corrected server type uses `@stackpress/ingest/Server`; the former
    umbrella import is no longer a limitation. Some other type-level direct
    imports remain undeclared, so isolated installation is not established.
  - Its Provider architecture is required direction, but its current serializer
    includes arbitrary headers, request/session maps, request data, and a
    token-bearing session shape. Tabular must project only D-008 fields before
    those props enter server rendering and client hydration.
  - Its PGlite store does not prove production PostgreSQL, role, pool, migration,
    worker, or process behavior.
  - Its app-owned static fallback converts request paths to filesystem paths and
    serves any existing match. Tabular must retain that ownership shape while
    applying D-009 containment in development and exact verified-manifest lookup
    in production.
  - Its ignored build output predates the latest source update.
- Disposition: retain as source-shape guidance; do not promote its generic
  security, storage, or artifact patterns into Context.
- Affected decisions/gaps: D-004 through D-011 and G-003.

## P-002: Tabular Boilerplate-Aligned Composition Slice

- Status: Proved 2026-08-06 within its stated slice boundaries; a narrow proof
  was created at
  `proofs/tabular-boilerplate-alignment/`.
- Proposed prototype path: `proofs/tabular-boilerplate-alignment/`
- Gap questions and decisions: G-003, G-007, G-008, D-008, and D-011.
- Hypothesis: Tabular can bootstrap focused packages through explicit lifecycle
  phases, discover multiple plugin-owned Reactus views, apply UnoCSS, and serve
  verified production artifacts while preserving safe hydration and avoiding
  database/worker/listener side effects during build.
- Expected proof signal:
  1. An isolated exact manifest installs without undeclared or umbrella
     dependencies.
  2. At least two `pages/*.ts` modules each expose one default handler and are
     registered through separate anonymous dynamic imports.
  3. Build mode bootstraps plugins and discovers at least two feature-owned view
     entries without executing those lazy handlers or opening a listener,
     database pool, worker, or migrator.
  4. Development mode renders both entries with current UnoCSS output through a
     development-only Vite surface.
  5. App-owned styling uses UnoCSS; conventional CSS appears only for D-011
     exceptions in flat `public/styles/*.css` files, and each route loads only
     the exception files it needs.
  6. Production mode serves built, hashed, containment-verified artifacts with
     no Vite middleware.
  7. Dynamic route data reaches the correct view through documented Ingest
     ordering and a narrow typed page contract.
  8. Serialized hydration preserves the Provider hooks but contains none of the
     prohibited header, request-body, opaque-session, server-config, credential,
     raw-error, mutable-row, or stack fields.
  9. Development traversal/symlink attempts fail, while production serves only
     exact manifest routes and detects changed size or content hash.
  10. Existing route behavior, lifecycle draining, error mapping, and process
     authority remain testable through explicit boundaries.
- Failure signal:
  - view discovery requires production side effects;
  - route/view ordering cannot safely carry dynamic props;
  - page handlers are statically imported, share aggregator exports, or execute
    during build;
  - one view entry imports unrelated product surfaces;
  - app-owned styling remains as conventional plugin/view CSS, or CSS exceptions
    live outside `public/styles/*.css`;
  - Reactus multi-entry or UnoCSS output is nondeterministic;
  - production rendering requires Vite;
  - the Provider requires copying generic server/session controllers; or
  - verified artifact packaging cannot represent multiple plugin views.
- Scope:
  - one app integration plugin;
  - two representative one-handler page files and paired feature views, one
    static and one dynamic;
  - development and production build paths;
  - safe hydration and artifact inspection; and
  - deterministic tests and a browser-visible check.
- Non-goals:
  - migrating the complete Tabular UI;
  - changing product behavior;
  - using real credentials or production resources;
  - proving PostgreSQL role/pool/worker behavior already owned by separate
    boundaries; or
  - editing the user-provided P-001 guide in place.
- Required closeout: record commands, dependency graph, generated entries,
  serialized hydration inspection, artifact checks, browser evidence, and all
  remaining target limitations before classifying the result.

### P-002 Result: proved within slice boundaries

- Commands passed: `npm install` and `npm test` in the proof directory. The
  isolated manifest installed direct packages only, and build discovered two
  views without resolving `listen`.
- Initial handler code treated `res.data` as a function, leaving each view with
  empty data. Focused-library source shows it is a Nest object; `res.data.set()`
  is the supported handoff. After that correction, `/` rendered its static
  heading and `/customer?name=Tabular` rendered its dynamic heading.
- The route/view ordering concern is resolved for this slice. Deterministic
  tests now prove an allowlisted Provider projection and manifest-bound public
  artifact reads that reject traversal, missing entries, and hash/size changes.
- `npm test` in the proof directory passed all three checks on 2026-08-06. This
  Proof does not widen its stated non-goals around PostgreSQL, workers,
  migrators, or deployment infrastructure.
- Evidence: `proofs/tabular-boilerplate-alignment/results.json` and its source.
