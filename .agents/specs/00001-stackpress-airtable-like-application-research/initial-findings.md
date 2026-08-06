# Initial Cross-Source Findings

> Direction note: F-001 through F-010 preserve the first generic-spreadsheet
> synthesis. R-020 supersedes its rejection of per-table PostgreSQL DDL. Load
> [PostgreSQL-Native Product Direction Findings](postgresql-native-product-direction-findings.md)
> for the current product model.

These findings are evidence-backed research conclusions, not accepted product decisions. Their source revisions and inspected paths are recorded in `source-inventory.md`.

## F-001: Separate Control Metadata From User Row Data

NocoDB, Grist, and Baserow all distinguish table/field/view definitions from user row values, even though they choose different physical storage. This is the strongest initial model pattern.

Stackpress implication: use generated Stackpress models only for fixed control data such as accounts, workspaces, memberships, role templates, and application policy. Keep workbook, sheet, order, cell, formula, comment, view, import, revision, audit, and outbox semantics in the application-owned generic spreadsheet plane rather than build-time Idea source.

Affects: G-002, G-003, G-005, G-012; strengthens P-001.

## F-002: Runtime Physical Schema Is A Dedicated Subsystem, Not A Default

- NocoDB performs physical table DDL, reconciles physical columns, then records metadata and broadcasts the change.
- Baserow gives each user table a physical PostgreSQL table and generates isolated Django models at runtime.
- Grist contains user tables and `_grist_*` schema metadata in a versioned SQLite document.

None treats user-authored schema as a casual variation of static application models. This evidence explains the cost of per-sheet physical schema and supports rejecting it as the default for the accepted generic spreadsheet target.

Stackpress implication: the documented Idea/generated-client path remains suitable for stable application/control models. P-001 now compares cell rows, row documents, and bounded blocks in one generic data plane; it does not attempt runtime per-workbook Stackpress generation.

Affects: G-003, G-006, G-012, G-015.

## F-003: Saved Views Are Durable Metadata

NocoDB `View`, Grist view/section/field metadata, and Baserow `View` plus field options all keep presentation/query configuration separate from records. Per-view filters, sorts, grouping, visibility, widths, and layout can evolve without rewriting canonical row values.

Stackpress implication: view definitions should be application models interpreted by grid/query events and custom views. Stackpress generated column UI metadata describes fixed application UI roles; it should not be conflated with user-created saved views.

Affects: G-005, G-009, G-012.

## F-004: Formula Engines Are Architectural, Not A Field Widget

- NocoDB compiles formula, lookup, and rollup behavior into database expressions with dialect-specific handling.
- Grist maintains a dependency graph over table/column nodes and affected row sets, then includes computed results in Doc Actions.
- Baserow persists field-dependency edges, including dependencies that traverse linked rows.

The transferable pattern is an explicit typed expression/dependency contract with cycle/error behavior and bounded recomputation. Formula inventory research now supplies a versioned compatibility ledger, but the execution strategy is not yet selected.

Stackpress implication: the target needs an application-owned parser, type system, dependency model, execution boundary, mapping ledger, and query integration. Build-time Stackpress field metadata is not the imported cell-formula model.

Affects: G-004, G-006, G-012; strengthens P-003.

## F-005: Grid Scale Requires A Window Contract

NocoDB's infinite table uses fixed-size chunks, offset/limit loading, a row-index cache, and visible-row placeholders. Grist's architecture document explicitly calls full in-memory document loading limiting and treats on-demand tables as an exception.

Stackpress implication: a custom grid should consume an explicit two-axis window query with stable IDs/order, revision tokens, total/count semantics, batch mutation, and cache invalidation. Selection remains logical when DOM rows are recycled. Generated admin lists are not evidence for interaction, scale, clipboard, keyboard, or accessibility.

Affects: G-006, G-009, G-012; strengthens P-002.

## F-006: Mutations Need A Domain Action Envelope

Grist's User Action to Doc Action flow separates user intent, computed effects, persistence, broadcast, and response. NocoDB similarly performs the storage change, records metadata, emits an application event, and broadcasts a metadata event.

Stackpress implication: named events are a strong native fit for table, field, row, and view commands. Each event must still define actor context, authorization, validation, transaction scope, emitted change set, audit record, and surface-safe response.

Affects: G-007, G-008, G-010, G-011, G-012; retains P-005.

## F-007: Record History Is Not Schema Revision History

Grist action history distinguishes local unsent, local sent, and shared actions, and separately links actions to clients for undo. Stackpress revision records describe generated schemas and explicitly do not prove database-applied migrations or application record history.

Stackpress implication: undo, collaboration, and record audit require a target-owned action/revision subsystem. Do not overload Stackpress schema revisions for this job.

Affects: G-008, G-012, G-015; strengthens P-004.

## F-008: Grist Static Is A Portability Case

Grist Static packages Grist for browser-only viewing and interaction with `.grist` or CSV data. Its default boundary has no durable shared edits or specific access control.

Research disposition: use Grist Static to study adapter seams, alternate storage hooks, migration-on-load costs, and constrained/offline modes. Do not count it as an independent server architecture or evidence that collaboration and authorization can remain client-only.

Answers: G-013.

## F-009: License Boundaries Affect Reuse

- NocoDB's pinned `develop` source is Sustainable Use licensed; use it for architectural research and pattern comparison, not as the default direct-code source.
- Grist Core and Grist Static are Apache-2.0.
- Baserow OSE and served client JavaScript are MIT, while docs, premium, and enterprise paths have separate terms.

Research disposition: keep the snippet catalog pseudocode-first, record exact provenance, and require a path-specific license check before direct reuse.

Affects: G-014.

## F-010: Preliminary Stackpress Ownership Split

| Classification | Initial responsibilities |
| --- | --- |
| Native Stackpress | fixed control models, SQL adapters/transactions, named events, sessions, pages, API/MCP adapters, SSR/hydration, generated admin for safe control data |
| Adapt Stackpress | deny-default session policy, caller propagation, window/batch events, custom grid pages/views, application migration scripts |
| Application-owned | workbook/sheet/order/cell data, formulas, comments, views, grants, revisions/undo/audit, import, outbox/jobs, snapshots, filtered realtime |
| Unresolved framework fit | cell-row scale and caches, two-axis grid contract/accessibility, formula/revision throughput, durable jobs, cross-surface authorization parity |

This split is preliminary. It prevents implementation from treating Stackpress generation as either irrelevant or sufficient for the whole product.

Affects: G-003 through G-012, G-015, G-016.

The completed target model, surface/operations boundary, discovery handoff, and recommendation are recorded in `domain-capability-model.md`, `interfaces-and-operations-findings.md`, `product-discovery-handoff.md`, and `final-synthesis.md`.
