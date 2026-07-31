# Status

## Current State

- Spec state: Frozen
- Freeze state: Frozen on 2026-07-31
- Research state: R-001 through R-022 complete; G-026 through G-028 accepted
- Proof state: complete; P-001 invalidated, P-003 deferred, and
  P-002/P-004/P-005/P-006/P-007 proved within recorded limits
- Grill state: Frozen; Q-001 through Q-016 accepted, Q-016-F1 superseded, none asked/partial/queued
- Implementation state: Not authorized; ready for a separate implementation-spec planning pass
- Context promotion: Complete; accepted reusable truth is in
  `.agents/context/tabular-product-contract.md`, and creative context explicitly
  defers conflicting product assumptions to that contract

## Work Items

| Work item | Status | Next action |
| --- | --- | --- |
| Create and route the spec package | Complete | Keep the manifest and index current |
| Preserve the requested goal, company background, and sources | Complete | Keep accepted scope distinct from research recommendations |
| Define Gaps and assumptions | Complete | Every material Gap is accepted, answered, superseded, or explicitly deferred |
| Resolve the product-policy grill | Complete | Frozen with 23 accepted decisions, one superseded question, and no open queue |
| Define and execute the bounded research queue | Complete | Add new research only when review exposes a material unanswered question |
| Acquire and pin GitHub source revisions | Complete | Refresh pins only for a deliberate later research snapshot |
| Inventory each named source | Complete | Pins and high-signal paths are recorded in `source-inventory.md` |
| Define import fidelity by source | Complete | Exact-value import accepted and P-006 fixture/recovery evidence passed |
| Build Google Sheets formula compatibility inventory | Deferred from current scope | Preserve the historical inventory for a separate later formula spec; P-003 is deferred |
| Compare PostgreSQL storage granularity | Superseded | Preserve the cell/row/block comparison as history; P-007 verified direct real tables under D-010 |
| Compare permissions, collaboration, and history | Complete | P-004/P-005 evidence and accepted policies are preserved |
| Compare grid interaction and accessibility | Complete | P-002 passed its bounded database, state, keyboard, clipboard, visual, and browser accessibility-tree checks |
| Extract domain and persistence models | Complete | `domain-capability-model.md` records the semantic and ownership map |
| Extract reusable and rejected patterns | Complete | The findings and synthesis record retained, adapted, and rejected patterns |
| Map findings onto Stackpress | Complete | Native, adapted, application-owned, and framework-gap responsibilities are separated |
| Build the snippet catalog | Complete | Pseudocode and provenance remain research-only |
| Record the Mathesar-like PostgreSQL-native direction | Complete | Use `postgresql-native-product-direction-findings.md` as the current routing record |
| Reconcile approved r001–r005 wireframes with the research ledger | Complete | `approved-wireframe-reconciliation.md` records accepted UX direction and retained policy boundaries |
| Verify computed-column and FRUI support boundaries | Complete | R-021 separates generated columns from spreadsheet formulas and classifies low-friction versus policy-gated families |
| Inventory FRUI-inspired field and format families | Complete | Low-friction registry accepted; policy-gated families assigned to a separate later spec |
| Reconcile G-026 through G-028 | Complete | Value-only import, low-friction registry, and system-schema direction accepted |
| Select required Proofs | Complete | P-001 invalidated; P-003 deferred; five active Proofs authorized |
| Execute approved Proofs | Complete | Five automated tests passed; P-002 browser evidence passed; preserve recorded limitations |
| Synthesize the accepted starting architecture | Complete | `final-synthesis.md` closes the research against the accepted PostgreSQL-native direction |
| Produce the app-discovery handoff | Complete | Accepted PostgreSQL-native replacement handoff is implementation-spec ready |
| Review findings for context promotion | Complete | Promoted the accepted product contract and reconciled creative-context precedence |
| Freeze the research spec | Complete | Frozen after accepted scope, completed evidence, resolved/deferred Gaps, context promotion, and handoff review |

## Deferred Follow-Up Specs

| Working title | Creation trigger | Required scope |
| --- | --- | --- |
| Tabular Export and Interchange | Spec 00001 is Frozen; create before implementing non-CSV export | XLSX, Google Sheets, JSON, schema/DDL, history, and multi-table export, including PostgreSQL authority, fidelity, job, packaging, and delivery policy |
| Tabular Formula Compatibility | Before implementing imported/spreadsheet formula behavior | Function inventory, parser/engine/version/license choice, compatibility semantics, volatile/external behavior, formula-aware paste, and recalculation |
| Tabular Rich Content and Attachments | Before implementing rendered Markdown, rich text, nested structures, files, images, galleries, or media | Sanitization, content shape, storage, upload, authorization, delivery, cleanup, and retention |
| Tabular Frontend Generation and Delivery | Before MCP-driven application generation, build, hosting, or deployment | Framework targets, generated-code authority, secrets, lifecycle, verification, hosting, deployment, and ownership |

## Setup Review Gate

Cleared on 2026-07-23 when the user instructed the research to start.

Before research starts, review:

- the research topics and comparison tracks in `research.md`;
- the assumptions and open questions in `decisions.md`;
- the candidate experiments in `proofs.md`.

## Next Authority Gate

Spec 00001 is Frozen and must not be changed unless the user explicitly reopens
it. The next authorized planning step is a separate implementation spec based
on the promoted Context Files and Frozen discovery handoff. Before scaffolding,
collect the user-owned app name, package name, brand name, and development port
from G-020. No deferred follow-up spec has been created yet.
