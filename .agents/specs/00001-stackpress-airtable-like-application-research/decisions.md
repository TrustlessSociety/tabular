# Decisions And Gaps

## Accepted Setup Decisions

### D-001: Research-Only Boundary

The current package is for research. It does not authorize product implementation, framework changes, or disposable prototypes.

Evidence: the user requested a spec for research.

### D-002: Required Primary Sources

The primary source set is NocoDB, Grist Core, Grist Static, Baserow, and the local Stackpress `.agents` knowledge base named in `brief.md`.

Evidence: the user explicitly supplied these sources.

### D-003: Required Evidence Types

Research must seek models, patterns, Proof candidates, code snippets, and other useful implementation evidence. Tests, migrations, fixtures, architecture records, and rejected approaches are in scope when they provide stronger evidence.

Evidence: the user explicitly requested these evidence types and allowed adjacent useful findings.

### D-004: Stackpress Is The Target Foundation

Recommendations must be translated into Stackpress ownership and capability terms. Source-project patterns are inputs, not the target runtime or framework.

Evidence: the requested application is to be written in Stackpress.

## Working Assumptions To Verify

### A-001: Airtable-Like Is A Category Boundary

Assumption: “like Airtable” means a collaborative relational-table product category, not complete feature or visual parity. Research must identify a viable starting slice instead of inheriting every Airtable capability.

### A-002: Evidence Must Be Revision-Pinned

Assumption: GitHub findings should be reproducible against an inspected commit SHA, with exact paths and access dates recorded.

### A-003: Stackpress KB Is The Read-First Boundary

Assumption: Stackpress research begins in its `.agents` context and references. Source files outside that folder are inspected only when routed or necessary to verify an exact claim.

### A-004: Adaptation Is Preferred Over Blind Reuse

Assumption: models and patterns may be adapted across languages and architectures, but direct code reuse is recommended only after license, coupling, and maintainability review.

## Open Gaps

### G-001: What product slice should define the first implementation target?

- Status: Unresolved
- Owner: User, informed by research
- Assumption to verify: a base/table/field/record/grid core with relations, saved views, import/export, and basic sharing is a better initial comparison boundary than full Airtable parity.

### G-002: What canonical domain model should the target application use?

- Status: Unresolved
- Owner: Research
- Assumption to verify: workspace, base, table, field, record, cell/value, view, relation, member, and permission are distinct concepts, but their exact boundaries must come from source evidence and Stackpress fit.

### G-003: How should user-defined tables and fields map to physical storage?

- Status: Unresolved
- Owner: Research and possible Proof
- Assumption to verify: dynamic metadata may require a metadata-as-data, JSON, EAV, generated-physical-table, or hybrid strategy rather than treating every user table as a build-time Stackpress model.

### G-004: Which type, formula, relation, lookup, rollup, and dependency semantics are necessary?

- Status: Unresolved
- Owner: Research
- Assumption to verify: a smaller explicit type and dependency system should precede broad spreadsheet-function compatibility.

### G-005: How should saved views be represented and executed?

- Status: Unresolved
- Owner: Research
- Assumption to verify: filters, sorting, grouping, field visibility, order, widths, and view type should be durable metadata separate from canonical records.

### G-006: Which query, indexing, migration, and revision patterns remain viable as data grows?

- Status: Unresolved
- Owner: Research and possible Proof
- Assumption to verify: application metadata and user-row access paths need separate performance analysis and migration rules.

### G-007: What tenancy, permission, sharing, and audit model should the first product support?

- Status: Unresolved
- Owner: User, informed by research
- Assumption to verify: authorization must be enforced at capability and query boundaries, not only in the grid UI.

### G-008: What collaboration, concurrency, undo, history, and recovery semantics are required?

- Status: Unresolved
- Owner: Research and user
- Assumption to verify: optimistic concurrency plus durable revision history may be a more viable starting point than full real-time co-editing.

### G-009: Which grid, editor, clipboard, keyboard, and virtualization patterns are reusable?

- Status: Unresolved
- Owner: Research and possible Proof
- Assumption to verify: interaction contracts and accessibility behavior are more transferable than another project's exact UI components.

### G-010: Which import, export, API, webhook, automation, and integration capabilities belong in the first boundary?

- Status: Unresolved
- Owner: Research and user
- Assumption to verify: CSV import/export and a stable record API may precede general automation or plugin marketplaces.

### G-011: What extensibility model should the target application expose?

- Status: Unresolved
- Owner: Research
- Assumption to verify: Stackpress named events and plugins can own application capabilities, while user-configurable extensions need a separate trust, permission, and lifecycle model.

### G-012: Which findings map to native Stackpress capability, adaptation, application logic, or a framework gap?

- Status: Unresolved
- Owner: Research
- Assumption to verify: Stackpress supplies strong generated-model and multi-surface primitives, but dynamic end-user schema authoring may need application-owned metadata and runtime behavior.

### G-013: What is the relationship between Grist Core and Grist Static for this research?

- Status: Unresolved
- Owner: Research
- Assumption to verify: their overlap and differences should be established from repository evidence before counting them as separate architectural examples.

### G-014: Which source patterns should be rejected despite appearing useful?

- Status: Unresolved
- Owner: Research
- Assumption to verify: incompatible language/runtime coupling, licensing, deployment assumptions, hidden complexity, or product-scope mismatch will make some patterns unsuitable for Stackpress.

### G-015: Which uncertainties still require executable Proofs after source research?

- Status: Unresolved
- Owner: Research, then user approval
- Assumption to verify: dynamic schema storage, grid-scale querying, computed dependency behavior, and concurrency are the most likely Proof areas, but research may prove some unnecessary.

### G-016: What operational architecture is needed for background work, search, cache, attachments, and observability?

- Status: Unresolved
- Owner: Research
- Assumption to verify: these concerns should be separated from the synchronous record-edit path and scoped by the chosen first product slice.

### G-017: Who is the initial audience, and what project shape is intended?

- Status: Unresolved
- Owner: User, informed by research
- Assumption to verify: the source comparison should produce options for a product-oriented app, teaching sample, architecture sample, or production-oriented baseline without choosing one from the repository folder name.

### G-018: What are the primary user flows, admin responsibilities, custom behaviors, and custom pages?

- Status: Unresolved
- Owner: User, informed by research
- Assumption to verify: research should identify viable workflow slices and custom-behavior signals, but final product requirements require explicit user acceptance.

### G-019: What auth model and role boundaries should the first product use?

- Status: Unresolved
- Owner: User, informed by research
- Assumption to verify: workspace membership plus explicit owner/admin/member or guest boundaries may be a starting option, but cannot be accepted from competitor patterns alone.

### G-020: What app name, package name, brand name, and development port should a later scaffold use?

- Status: Deferred to app-discovery closure
- Owner: User
- Assumption to verify: none; the current repository folder name must not be treated as approval of these values.

## Decision Rule

Research may answer a Gap only with explicit source evidence, an approved product decision, or an accepted Proof result. A recommendation remains unaccepted until the user approves it or the spec is Frozen with that recommendation included.

App discovery is not complete while G-001, G-002, and G-017 through G-020 remain unresolved. Do not hand off to scaffold, schema authoring, or plugin implementation until those requirements are concrete enough that the next skill does not need to guess.
