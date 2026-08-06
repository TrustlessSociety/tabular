# Research

## Status

Initial local source review and the corrected proof comparison were completed
2026-08-06. No online research has been performed or authorized. R-001 and
R-004 are complete; R-002 is partially complete and R-003 remains open before
Freeze.

## R-001: Compare the proof with the current application structure

- Status: Complete 2026-08-06.
- Sources: user-provided boilerplate, current `package.json`, `tsconfig.json`,
  `uno.config.ts`, `bootstrap/`, `config/`, `entrypoints/`, `plugins/`,
  `scripts/`, `tests/`, and Accepted Context.
- Findings:
  - Both architectures already use focused packages, `package.json.plugins`,
    Ingest bootstrap, Reactus, and feature plugins.
  - The proof uses explicit `config`, `listen`, and `route` lifecycle resolution
    in thin build/development scripts.
  - The proof's app plugin owns the Reactus engine, route-to-view rendering,
    shared Provider, and client-side server abstractions.
  - Tabular's 602-line `bootstrap/application.ts` imports every feature service,
    owns HTTP adaptation and Reactus setup, validates the service graph, starts
    the listener, and installs shutdown behavior. Plugins import its server type
    back, creating a bidirectional composition dependency.
  - Tabular builds one Reactus entry. The 3,525-line workbench entry imports
    responsibilities from most UI-facing plugins and selects multiple surfaces.
  - The proof instead discovers registered view entries from `server.views`.
  - The revised proof uses direct `@stackpress/ingest/Server` typing and moves
    build/development settings into dedicated `config/` modules.
  - The user clarified that each server page entry must live in a one-default-
    export file and be registered through an anonymous dynamic import. Rendered
    routes pair that handler with an independently built view entry.
- Affected decisions/gaps: D-004 through D-010 and G-003.

## R-002: Verify Ingest lifecycle and multi-view composition

- Status: Partially complete; route classification verified, process lifecycle
  isolation remains open.
- Sources to inspect: installed `@stackpress/ingest` 0.10.8 router, view-router,
  plugin loader, event priority, request/response, and server APIs; installed
  `reactus` 0.10.8 build/development APIs.
- Questions:
  - Which lifecycle phases can run without opening listeners, pools, workers,
    or other side effects?
  - How should build mode discover views without requiring production database
    readiness or mutable runtime resources?
  - How should production rendering consume built pages while development uses
    Vite middleware only on the development surface?
- Verified findings:
  - Ingest classifies a zero-argument anonymous route callback as an import
    entry, invokes the dynamic import only when that action executes, and calls
    the imported module's default export.
  - A string route action is a view entry. `ViewRouter` records it under
    `server.views`, which the proof's build loop can enumerate without executing
    the page handler.
  - Pairing `server.import.<method>` and `server.view.<method>` on the same route
    gives one handler preparation boundary and one independently discoverable
    view entry. Exact priority/error behavior remains part of P-002.
- Affected decisions/gaps: G-003 and D-008.

## R-003: Audit UnoCSS and isolated dependencies

- Status: Open technical audit; styling ownership is resolved by D-011.
- Initial findings:
  - Root `uno.config.ts` matches the proof. The working-tree manifests observed
    on 2026-08-06 contained an unstaged UnoCSS addition, but the current Reactus
    build did not include `unocss/vite` or `virtual:uno.css`.
  - The root config is outside the current TypeScript `include` list.
  - Three custom rules emit CSS property names with leading spaces.
  - The hex matcher uses `\w`, which accepts characters outside hexadecimal.
  - The revised boilerplate no longer imports umbrella `stackpress`. It still
    has type-level direct imports such as `frui`, `rollup`, and
    `stackpress-language` that are not declared in its manifest, so isolated
    reproducibility is not established.
  - The ignored boilerplate `.build` output predates its latest utility-class
    source update and is not current evidence.
- Remaining work: confirm the smallest explicit Vite/Reactus dependency set,
  validate generated utility output per route, inventory every conventional CSS
  rule against D-011, verify exception files live only in `public/styles/*.css`,
  and define clean-install checks.
- Affected decisions/gaps: D-011 and G-007.

## R-004: Inventory concentration and plugin ownership

- Status: Complete 2026-08-06.
- Findings:
  - The reviewed current surface contains 188 production TS/TSX/CSS files and
    about 55,446 lines; 33 production files exceed 500 lines.
  - Largest centered candidates are the 3,525-line UI workbench, 2,146-line
    import/export service, 1,897-line catalog PostgreSQL target, 1,749-line
    Tabulator adapter, and 1,265-line operations service.
  - `plugins/ui` owns grid-specific state/helpers plus generic primitives while
    its registered service contains only shell/density/theme metadata.
  - Cross-plugin imports are expected for capabilities, identity, database, and
    operations, but the UI workbench acts as a global frontend composition root
    instead of a centered feature view.
- Interpretation: the workbench and composition cycle are first-order changes.
  Other large modules should split only around centered responsibilities, not a
  line-count rule.
- Affected decisions/gaps: D-010 and G-007.

## Rejected Research Expansion

- No product, competitor, framework-version, or online architecture research is
  required before the local lifecycle and dependency questions are exhausted.
- Do not broaden into a product redesign, umbrella Stackpress comparison, or
  generic CSS-framework migration study.
