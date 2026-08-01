# P-001 Browser And Interaction Implementation Guidebook

This Proof demonstrates the accepted Tabular wireframe contract as a chaptered
browser application backed by PGlite. Its R-003 chapter adds a focused
virtualized-grid experiment while keeping the remaining product-policy gaps
explicit. It is executable learning, not production scaffolding.

## Run

```bash
cd proofs
npm run proof:p101
npm run serve:p101
```

Open `http://127.0.0.1:4312`. Stop the server after browser review.
Open `http://127.0.0.1:4312/r003.html` for the focused grid experiment.

## Design Plan

- Subject: an internal operations team editing real PostgreSQL records through
  a spreadsheet interaction model.
- Job: browse authorized schema folders, open a file, edit typed cells, inspect
  errors, configure columns, and import a new file without encountering raw
  database administration.
- Palette: Paper `#ffffff`, Canvas `#f5f6f7`, Graphite `#202124`, Rule
  `#dadce0`, Focus `#1a73e8`, Error `#c5221f`.
- Type: Arial for interface/data, `ui-monospace` only for technical identities.
- Layout: full-width explorer or spreadsheet shell with internal grid overflow;
  panels and menus float without changing grid geometry.
- Signature: the coordinate band and field-header band stay visually distinct,
  making spreadsheet position and PostgreSQL field meaning legible at once.

The deliberately austere risk is density: there is no dashboard hero, sidebar,
or descriptive marketing layer. The product begins with the work surface.

## Guide Chapters

1. Explorer and hierarchy: W-001 through W-011.
2. Grid, editing, validation, and reordering: W-012 through W-025.
3. Column configuration and relations: W-026 through W-032.
4. Menus, toolbar, formatting, and contextual actions: W-033 through W-046.
5. Import: W-047 through W-053.
6. Accessibility, visual language, and negative guardrails: W-054 through W-058.

`coverage.mjs` maps every stable feature ID to a chapter, source anchor, and
automated check. `results.json` combines that map with PGlite and browser signals.

The focused R-003 chapter closes W-013, W-020, W-038, and W-054 with a stable-ID
logical selection model, a PGlite-backed batch-action plan, mixed toolbar state,
and rendered virtual-window evidence. W-015 and W-025 remain product-policy
gaps. All other wireframe IDs are demonstrated, guided, or tied to accepted
prior Proof evidence.

## R-003 Grid Chapter

- Pin `tabulator-tables` 6.5.0 behind a Tabular-owned adapter for the first
  production slice candidate.
- Keep selection authority outside the renderer and address rows/columns by
  stable identities. The adapter projects that logical range into the mounted
  window and restores it after renderer data resets.
- Use vertical virtualization. Keep ordinary horizontal scrolling with all
  current-scope columns mounted; do not depend on Tabulator's experimental
  horizontal virtual DOM until a scale target proves it necessary.
- Prepare range mutations in PGlite with current-file-validated row IDs,
  column IDs, cell count, and status. This chapter proves the target envelope;
  Frozen P-002
  remains the evidence for executing one atomic canonical batch transaction.
- Keep browser ARIA row/column totals and mounted indices explicit, then re-run
  the accepted browser/native-assistive-technology matrix on the production
  renderer.

## Production Translation

- Keep: the stable-ID logical selection model independent of mounted DOM, the
  pinned renderer adapter boundary, named action boundaries,
  typed editor/output separation, persistent draft semantics, and feature IDs.
- Replace: the single-process HTTP service, fixture identities, in-memory
  database, simplified session presentation persistence, and sample import
  adapter.
- Revalidate: SSR/hydration choice, production browser matrix, native assistive
  technology, network PostgreSQL, connection pools, external DDL, and scale.

## Boundaries

- PGlite proves local PostgreSQL-shaped state and transactions only.
- The proof selects a renderer candidate and adapter contract; it does not claim
  a final frontend framework or production Stackpress route/view implementation.
- Representative/deferred menu commands remain visibly unavailable or
  explicitly labeled; they are not silently implemented.
- Browser rendering proves exact View/Format/toolbar choices, import recovery,
  and the R-003 virtualized selection model. Native assistive technology and
  private/shared/session presentation persistence remain unsettled.
