# Research Plan And Findings

## State

Research is planned and has not started. This file defines the bounded queue and evidence method for user review before source acquisition.

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
| R-001 | `nocodb/nocodb` | Package architecture; metadata and row storage; table/field/view/relation models; API, access, sync, import, tests, migrations, and extension patterns | Pending | G-002 through G-012, G-014, G-016 |
| R-002 | `gristlabs/grist-core` | Document/table/column/record models; formula/dependency engine; views; permissions; revisions; collaboration; import/export; UI and test contracts | Pending | G-002 through G-010, G-013 through G-016 |
| R-003 | `gristlabs/grist-static` | Static/runtime boundary, reuse of Grist concepts, packaging and persistence constraints, and meaningful contrast with Grist Core | Pending | G-002, G-003, G-005, G-010, G-013, G-014, G-016 |
| R-004 | `baserow/baserow` | Backend/frontend boundaries; field types; tables/rows/views; plugin model; permissions; jobs; APIs; collaboration; migrations; tests | Pending | G-002 through G-012, G-014, G-016 |
| R-005 | Stackpress `.agents` | Idea/schema semantics; generated runtime; SQL/storage; events; view/admin/API/MCP surfaces; sessions; plugin lifecycle; verification contracts | Pending | G-001 through G-012, G-014 through G-019 |

## Cross-Source Synthesis Queue

| ID | Topic | Required output | Status | Affected Gaps |
| --- | --- | --- | --- | --- |
| R-006 | Domain and data model | Semantic model map with source-specific differences and target implications | Pending | G-002 through G-005 |
| R-007 | Persistence and dynamic schema | Strategy comparison covering storage, queries, indexes, migrations, and revisions | Pending | G-003, G-006, G-012, G-015 |
| R-008 | Product capability and workflow | Evidence-backed audience, project-shape, first-slice, user/admin flow, auth, surface, and deferred-capability options | Pending | G-001, G-007 through G-011, G-016 through G-019 |
| R-009 | UI and grid interaction | Pattern comparison for scale, editing, keyboard, clipboard, views, accessibility, and browser behavior | Pending | G-005, G-009, G-015 |
| R-010 | Security and collaboration | Tenancy, permissions, sharing, audit, concurrency, history, and recovery matrix | Pending | G-007, G-008, G-016 |
| R-011 | Extensibility and interfaces | API, webhook, automation, plugin, import/export, and surface-boundary matrix | Pending | G-010, G-011, G-012 |
| R-012 | Stackpress capability fit | Native/adapt/application/framework-gap mapping with exact Stackpress evidence | Pending | G-003 through G-012, G-015, G-016 |
| R-013 | Snippet catalog | Minimal, provenance-rich excerpts or pseudocode grouped by research question | Pending | All material Gaps |
| R-014 | Proof selection | Keep, revise, invalidate, or defer candidate Proofs based on remaining uncertainty | Pending | G-003, G-006, G-008, G-009, G-012, G-015 |
| R-015 | Final synthesis | Recommended starting product and architecture, app-discovery handoff, tradeoffs, rejected alternatives, risks, and open decisions | Pending | G-001 through G-020 |

## Comparison Tracks

Use these tracks across sources so the final packet is comparative rather than a set of isolated repository summaries:

1. Audience, project shape, product slice, user/admin flows, auth/roles, and custom surface needs.
2. Product and tenancy hierarchy.
3. Table, field, record, cell/value, relation, and view semantics.
4. Dynamic-schema and physical-storage strategy.
5. Type, formula, computed-value, dependency, and validation systems.
6. Query, filter, sort, group, pagination, index, and aggregation behavior.
7. Revision, migration, transaction, concurrency, undo, history, and recovery behavior.
8. Permissions, sharing, authorization enforcement, audit, and secret boundaries.
9. Grid rendering, editing, selection, keyboard, clipboard, virtualization, and accessibility.
10. Import, export, attachment, API, webhook, automation, and external integration behavior.
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

No findings have been recorded. Add evidence only after the setup review gate in `status.md` is cleared.
