# Research Plan And Findings

## State

Research started on 2026-07-23 and the original R-001 through R-019 queue
completed on 2026-07-24. The user then accepted a Mathesar-like,
PostgreSQL-native direction and requested FRUI-inspired field and format types.
R-020, the computed-column/FRUI risk follow-up R-021, and the approved-wireframe
reconciliation R-022 are complete. Their
result supersedes the generic cell-row recommendation, invalidates P-001 as
written, and resolves G-026 through G-028. Formula compatibility is deferred;
current imports preserve exact values only. Source research alone did not prove
runtime behavior; the retained Proof loop later proved the bounded runtime
contracts recorded in `proofs.md`.

## Evidence Protocol

For each GitHub repository:

1. Record repository URL, inspected commit SHA, access date, license, language/package layout, and relevant roots.
2. Map architecture using source, tests, migrations, fixtures, and docs; do not rely only on README claims.
3. Record candidate models, patterns, snippets, constraints, and rejected leads with exact paths.
4. Tie each material finding to one or more Gap IDs from `decisions.md`.
5. Separate directly observed facts from interpretation and recommendations.

For Stackpress:

1. Start at `.agents/context/index.md` and follow its load guidance by research topic.
2. Use context for accepted architectural boundaries and references for exact contracts.
3. Trace outside `.agents` only when exact source evidence is required, and record the routed file and reason.
4. Classify every proposed target-application capability as native Stackpress support, adaptation, application-owned behavior, or an unresolved framework gap.

For code evidence, record:

- source repository and commit;
- exact path and symbol or line range;
- the question the snippet answers;
- the shortest useful excerpt, or pseudocode when copying would be inappropriate;
- surrounding assumptions and dependencies;
- license and reuse disposition;
- likely Stackpress translation rather than a mechanical port.

Preserve negative evidence, dead ends, and patterns rejected for licensing, coupling, complexity, or product mismatch.

## Primary Source Queue

| ID | Source | Focus | Status | Affected Gaps |
| --- | --- | --- | --- | --- |
| R-001 | `nocodb/nocodb` | Package architecture; metadata and row storage; table/field/view/relation models; API, access, sync, import, tests, migrations, and extension patterns | Complete for the bounded comparison | G-002 through G-012, G-014, G-016 |
| R-002 | `gristlabs/grist-core` | Document/table/column/record models; formula/dependency engine; views; permissions; revisions; collaboration; import/export; UI and test contracts | Complete for the bounded comparison | G-002 through G-010, G-013 through G-016 |
| R-003 | `gristlabs/grist-static` | Static/runtime boundary, reuse of Grist concepts, packaging and persistence constraints, and meaningful contrast with Grist Core | Complete; portability case classified | G-002, G-003, G-005, G-010, G-013, G-014, G-016 |
| R-004 | `baserow/baserow` | Backend/frontend boundaries; field types; tables/rows/views; plugin model; permissions, jobs, APIs, collaboration, migrations, and tests | Complete for the bounded comparison | G-002 through G-012, G-014, G-016 |
| R-005 | Stackpress `.agents` | Idea/schema semantics; generated runtime; SQL/storage; events, view/admin/API/MCP surfaces, sessions, plugin lifecycle, and verification contracts | Complete; retained runtime uncertainties proved within `proofs.md` limits | G-001 through G-012, G-014 through G-019 |
| R-016 | Google Sheets, Drive, SpreadsheetML, CSV, PostgreSQL official contracts | Formula/value/format/note/comment extraction, file-format boundaries, large-import reads, and generic JSON storage constraints | Historical rich-fidelity research complete; value-only fixtures verified by P-006; P-003 deferred | G-002 through G-004, G-006, G-010, G-014, G-016, G-021 through G-025 |

## Cross-Source Synthesis Queue

| ID | Topic | Required output | Status | Affected Gaps |
| --- | --- | --- | --- | --- |
| R-006 | Domain and data model | Semantic model map with source-specific differences and target implications | Historical generic model retained; canonical recommendation superseded by R-020 and verified by P-007 | G-002 through G-005, G-021 through G-023 |
| R-007 | PostgreSQL spreadsheet persistence | Compare cell-row, row-document, bounded-block, indexes, revisions, and grid/query costs; reject per-department schema and whole-workbook blobs | Historical comparison complete; cell-row recommendation superseded by D-010 | G-003, G-006, G-012, G-015, G-023 |
| R-008 | Product capability and workflow | Evidence-backed first-slice, user/admin flow, auth, surface, and deferred-capability options for internal staff | Complete; Q-001 through Q-016 accepted the replacement discovery boundary | G-001, G-007 through G-011, G-016 through G-019 |
| R-009 | UI and grid interaction | Pattern comparison for scale, editing, keyboard, clipboard, views, accessibility, and browser behavior | Research complete; P-002 proved the bounded contract | G-005, G-009, G-015 |
| R-010 | Security and collaboration | Tenancy, permissions, sharing, audit, concurrency, history, and recovery matrix | Research and P-004/P-005 evidence complete; exact product policy remains | G-007, G-008, G-016 |
| R-011 | Extensibility and interfaces | API, webhook, automation, plugin, import/export, and surface-boundary matrix | Research complete; external surfaces deferred | G-010, G-011, G-012 |
| R-012 | Stackpress capability fit | Native/adapt/application/framework-gap mapping with exact Stackpress evidence | Updated by R-020; applicable P-002 through P-007 evidence complete | G-003 through G-012, G-015, G-016 |
| R-013 | Snippet catalog | Minimal, provenance-rich excerpts or pseudocode grouped by research question | Complete; 11 representative entries recorded | All material Gaps |
| R-014 | Proof selection | Keep, revise, invalidate, or defer candidate Proofs based on remaining uncertainty | Complete: P-001 invalidated, P-003 deferred, and five applicable Proofs proved | G-003, G-006, G-008, G-009, G-012, G-015 |
| R-015 | Final synthesis | Recommended starting product and architecture, app-discovery handoff, tradeoffs, rejected alternatives, risks, and open decisions | Complete; refreshed after R-020/R-021, Proofs, and the accepted grill | G-001 through G-025 |
| R-017 | Import fidelity | Google Sheets/XLSX/CSV matrix, loss-aware intermediate representation, preview/report contract, and explicit unsupported-feature policy | Rich-fidelity research preserved; current value-only behavior verified by P-006 | G-010, G-014, G-021, G-024, G-025 |
| R-018 | Formula compatibility | Versioned Google function inventory; parser/AST and engine candidates; mapping rules; dependency, array, error, locale, timezone, volatile, and external-function semantics; license review | Historical inventory complete; deferred with P-003 to a later formula spec | G-004, G-006, G-014, G-022 |
| R-019 | Downstream-index readiness | Specify only stable IDs, revisions, provenance, permissions, and event/outbox provisions; prevent vector concerns from shaping current canonical storage | Research complete; detailed Qdrant research deliberately deferred | G-006, G-016 |
| R-020 | PostgreSQL-native product direction | Compare Mathesar, Supabase Studio, NocoDB, Directus, Baserow, Stackpress, and FRUI for direct-table mapping, semantic fields/formats, staged edits, drafts, views, and product scope | Complete; current direction recorded; later reconciled by R-021 | G-001 through G-006, G-008 through G-012, G-014 through G-016, G-018, G-021 through G-028 |
| R-021 | Computed columns and FRUI support risk | Verify PostgreSQL generated/view boundaries; classify pinned FRUI fields and formats by implementation risk; reconcile G-028 | Complete; G-026 through G-028 accepted | G-004, G-006, G-012, G-014, G-015, G-026 through G-028 |
| R-022 | Approved wireframe reconciliation | Apply the accepted r001–r005 file explorer, grid, column, command, settings, and import workflow to the research ledger without promoting simulated behavior to production truth | Complete; D-015 records the accepted UX direction and its retained policy boundaries | G-001, G-004, G-005, G-009, G-010, G-018 |

## Comparison Tracks

Use these tracks across sources so the final packet is comparative rather than a set of isolated repository summaries:

1. Audience, project shape, product slice, user/admin flows, auth/roles, and custom surface needs.
2. Product and tenancy hierarchy.
3. Workbook, sheet, row/column coordinate, cell/value, formula, comment/note, view, import, provenance, and revision semantics.
4. Cell-row, row-document, bounded-block, and hybrid PostgreSQL storage strategies.
5. Historical Google Sheets formula compatibility evidence retained for a
   later spec; no current formula runtime.
6. Query, filter, sort, group, pagination, index, and aggregation behavior.
7. Revision, migration, transaction, concurrency, undo, history, and recovery behavior.
8. Permissions, sharing, authorization enforcement, audit, and secret boundaries.
9. Grid rendering, editing, selection, keyboard, clipboard, virtualization, and accessibility.
10. One-time Google Sheets/XLSX/CSV exact-value preview, typed staging, commit,
    retry, rollback, warnings, and provenance.
11. Plugin, extension, module, package, event, and lifecycle ownership.
12. Testing strategies, fixtures, failure modes, observability, jobs, cache, and deployment assumptions.
13. Stackpress translation and the minimum evidence needed for a later implementation spec.

## Useful Adjacent Evidence

Capture adjacent material only when it changes a decision or Proof disposition:

- schema migrations and compatibility policies;
- representative test cases and fixtures that reveal hidden invariants;
- architecture decision records and issue-linked design rationale;
- performance thresholds or benchmark methodology;
- recovery, retry, background-job, and observability mechanisms;
- licensing or dependency constraints;
- known limitations and deliberately unsupported behavior.

## Findings Ledger

- [Pinned sources, licenses, inspected paths, and bounded inventory conclusions](source-inventory.md)
- [Current PostgreSQL-native direction, competitor disposition, FRUI-inspired field/format registries, and persistent drafts](postgresql-native-product-direction-findings.md)
- [Approved r001–r005 wireframe direction and the Gaps it narrows](approved-wireframe-reconciliation.md)
- [PostgreSQL computed columns, low-friction FRUI-inspired support, and risk boundaries](computed-columns-and-frui-support-findings.md)
- [Foundational cross-source findings and Stackpress implications](initial-findings.md)
- [Import, formula, PostgreSQL, and future-indexing-boundary findings](import-formula-findings.md)
- [Basic-format, note/comment, parser, retry/abandon, warning, and unsupported-feature contract](import-fidelity-contract.md)
- [Versioned Google Sheets and HyperFormula compatibility matrix](formula-compatibility-matrix.md)
- [PostgreSQL cell-row, row-document, bounded-block, and whole-document comparison](postgresql-storage-comparison.md)
- [Security, collaboration, history, recovery, and Stackpress ownership findings](security-collaboration-findings.md)
- [UI/grid interaction, clipboard, keyboard, accessibility, and P-002 findings](grid-interaction-findings.md)
- [Semantic domain and Stackpress capability ownership model](domain-capability-model.md)
- [Interfaces, extensions, background jobs, outbox, and operations findings](interfaces-and-operations-findings.md)
- [Product discovery handoff and first-slice recommendation](product-discovery-handoff.md)
- [Representative pseudocode-first snippet catalog](snippet-catalog.md)
- [Final recommendation, pattern disposition, Proof selection, risks, and handoff](final-synthesis.md)

The Mathesar-like direction, value-only import, low-friction registry,
FRUI-as-inspiration boundary, metadata/draft direction, per-row unstructured
JSON, PostgreSQL-native authority, extension surfaces, and complete first slice
are accepted. Formula compatibility and policy-gated field families are
assigned to later specs. The research, Proof, and grill loops are complete, and
accepted reusable truth is promoted into shared context. No research or Proof
finding authorizes implementation without a separate approved implementation
spec.
