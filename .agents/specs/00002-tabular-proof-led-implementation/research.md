# Research

## State

Accepted and bounded on 2026-07-31. R-001/R-002 used current local truth. R-003
was triggered by browser evidence, authorized with Round 2 acceptance, and
completed as focused primary-source research plus a PGlite/browser experiment
on 2026-08-01.

## Planned Topics

### R-001: Current Stackpress Ownership Boundaries

- Question: Which current Stackpress layers should own fixed control records,
  dynamic table capabilities, handwritten pages/views, web handlers, MCP
  adapters, and verification?
- Method: begin at the current Stackpress knowledge base named by the accepted
  discovery handoff; inspect source only when the KB routes to it or an exact
  runtime contract is necessary.
- Affected Gaps: G-003, G-005, G-011
- Status: Complete on 2026-07-31

Findings:

- Fixed Tabular control records may use Idea/generated stores where their
  domain is stable. User-created PostgreSQL tables stay catalog-driven; do not
  generate a Stackpress model/client per runtime table.
- Inquire/Stackpress SQL owns visible parameterized SQL, PostgreSQL dialect
  builders, adapters, and transaction mechanics. Safe dynamic identifiers,
  catalog reconciliation, drafts, and Tabular policy remain application-owned.
- Register the PGlite engine during `config`, named reusable capabilities during
  `listen`, and browser/MCP routes after capabilities exist during `route`.
- Handwritten page/view and MCP adapters may share a named capability, but each
  surface must keep its own caller identity, input validation, output mapping,
  and access policy. Event invocation alone does not authorize a caller.
- Stackpress Session's empty access map is allow-all. Tabular therefore needs an
  explicit deny-default capability layer in addition to native grants/RLS; UI
  permission helpers are never authorization authority.
- PGlite uses Stackpress's PostgreSQL dialect adapter and one cached native
  resource per transaction. It is an embedded/WASM database, not evidence for
  network PostgreSQL or pool/client lifecycle.
- Production routing remains multi-lane: fixed schema/config, runtime
  capability/adapter code, handwritten page/view code, MCP surface adapters,
  and target-specific verification. Dynamic tables do not belong in the
  generation lane.

Sources checked: current Stackpress Context index; architecture, runtime,
interfaces, ecosystem, and contribution Context Files; SQL, database adapter,
session, operational, and interface-exposure references in the local Stackpress
KB. No external browsing was needed.

### R-002: Current Local PGlite Harness Boundary

- Question: Which Spec 00001 database/evidence utilities can be reused without
  coupling the new Proof result ledger to the Frozen package?
- Method: inspect root `proofs/package.json`, `proofs/lib/`, and focused prior
  examples; preserve reproducibility of existing Proof commands.
- Affected Gaps: G-003, G-004, G-007, G-010
- Status: Complete on 2026-07-31

Findings:

- The existing harness pins `@electric-sql/pglite` 0.3.15 and Stackpress 0.10.8.
  The accepted run environment currently reports Node 26.3.0 and npm 11.16.0.
- `proofs/lib/database.mjs` provides isolated in-memory databases and focused
  row helpers. `proofs/lib/evidence.mjs` writes timestamped JSON evidence.
- The root test command already discovers one-level `*/proof.test.mjs` suites
  serially. Spec 00002 can add two new sibling folders without changing or
  overwriting Spec 00001 prototypes.
- The prior grid Proof demonstrates a small Node HTTP browser harness, while
  the authorization Proof demonstrates application-policy plus role/RLS-shaped
  denial. Those patterns are reusable as experiment technique, not as accepted
  production module boundaries.
- New Proofs should write distinct result/evidence files and add explicit
  feature-coverage manifests so the final gap check can audit every `W-*` and
  `D-*` row.

Rejected setup choices:

- Do not scaffold a Stackpress application: the Proof phase intentionally lacks
  production scaffold values and must not imply architecture acceptance.
- Do not create a second dependency tree or change prior result files.
- Do not use static browser mocks as the sole stateful feature evidence.

### R-003: Browser Grid And Accessibility Choice

- Question: Can the browser guidebook prove the accepted grid contract with a
  minimal local implementation, or does a library choice materially affect
  production architecture?
- Method: prototype the smallest bounded grid first. Research a dependency only
  if runtime evidence shows the choice changes virtualization, focus, or
  accessibility contracts.
- Affected Gaps: G-002, G-008
- Status: Complete and accepted in Round 3 on 2026-08-01; recommendation
  promoted to Context

Findings:

- AG Grid provides mature range and keyboard selection, but Cell Selection is
  an Enterprise feature. Handsontable's production use is commercially licensed
  and its accessibility guide recommends disabling DOM virtualization for full
  screen-reader access. Neither is the default first-slice candidate.
- Glide Data Grid is MIT and range-capable, but its React/canvas ownership would
  change the current browser/accessibility contract. TanStack Virtual is a
  useful headless primitive, not a grid: Tabular would still own selection,
  semantics, editing, focus, and rendering.
- Tabulator 6.5.0 is MIT, vanilla-compatible, vertically virtualized, and
  supports cell/range/row/column selection plus Shift-key extension. It is the
  recommended renderer candidate behind a Tabular-owned adapter.
- Tabulator cannot own canonical selection. Its documented data/layout
  lifecycle clears ranges, so an external stable-row-ID/stable-column-ID model
  retains the selection and replays it into the renderer.
- The real browser experiment retained a 2,697-cell range while its anchor was
  unmounted, after a renderer data reset, and at 390px. It also exposed mixed
  toolbar state and logical ARIA totals/indices with only 60 of 1,000 rows
  mounted.
- A PGlite action plan now stores aligned row IDs, column IDs, and cell count
  before a clear is projected into the renderer. Frozen P-002 remains the
  evidence for executing the canonical mutation as one atomic batch.
- Use vertical virtualization and ordinary internal horizontal scrolling for
  the first slice. Tabulator documents horizontal virtual DOM as experimental
  and unstable with column manipulation; enable it only after a measured scale
  requirement and a new target validation.
- Browser-tree/ARIA evidence is not native assistive-technology evidence.
  VoiceOver and the accepted production browser matrix remain required.

Primary sources:

- Tabulator range selection: <https://tabulator.info/docs/6.4/range>
- Tabulator virtual DOM: <https://tabulator.info/docs/6.3/virtual-dom>
- Tabulator layout/horizontal virtual DOM: <https://tabulator.info/docs/6.4/layout>
- Tabulator accessibility: <https://tabulator.info/docs/6.3/accessibility>
- Tabulator MIT license: <https://www.tabulator.info/docs/4.9/license/>
- AG Grid cell selection: <https://www.ag-grid.com/javascript-data-grid/cell-selection/>
- AG Grid Community versus Enterprise: <https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/>
- Handsontable accessibility: <https://handsontable.com/docs/javascript-data-grid/accessibility/>
- Handsontable software license: <https://handsontable.com/docs/12.0/software-license/>
- Glide Data Grid: <https://docs.grid.glideapps.com/>
- TanStack Virtual: <https://tanstack.com/virtual/latest/docs/introduction>

## Expansion Rule

Research is subordinate to the Proofs. If execution exposes a new topic that
cannot be answered by current Context, local Stackpress truth, or experiment,
record the proposed topic and affected Gap before browsing or broad source
inspection. Do not silently turn Spec 00002 into another competitor-research
package.
