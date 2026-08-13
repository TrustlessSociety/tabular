# Status

## Current State

- Spec state: **Frozen 2026-08-01**
- Freeze state: **Frozen**
- Architecture direction: Direct focused packages accepted and Frozen on
  2026-08-01
- Research state: R-001 through R-004 complete
- Proof state: P-001 proved and human-accepted; P-002 proved on PostgreSQL 18.4;
  both Proofs Frozen
- Decision state: Nine direction decisions retained; all eleven Gaps answered
- Implementation plan: **Accepted 2026-08-01** in `tasks/sprint.md`; replaces
  the superseded Spec 00002 architecture proposal
- Implementation state: Task 00014 and corrective side quests 00014A through
  00014J verified; corrective side quest 00014K started
- Per-task human acceptance: Waived; every task records `none`
- Agent acceptance: Required only for tasks with applicable UI acceptance steps
- Final human review: In progress; explicit user acceptance remains pending
- Context promotion: Research/Proof and verified implementation-review
  corrections promoted; final implementation-closeout review remains pending
- User journeys: Not applicable; this spec changes technical composition, not
  accepted actors or product flows

## Work Items

| Work item | Status | Next action |
| --- | --- | --- |
| Create and route Spec 00003 | Complete 2026-08-01 | Keep manifest/index current |
| Preserve direct-library user direction | Complete | Review brief wording |
| Run Context/Spec intersection scan | Complete | Preserve portable versus architecture-specific split |
| Research package ownership and package identities | Complete | Recheck versions when Proof work starts |
| Audit absent umbrella capabilities | Complete | Preserve explicit application ownership |
| Complete R-003 security research | Complete 2026-08-01 | Revalidate with live identity target later |
| Complete R-004 topology research | Complete 2026-08-01 | Carry target validations into implementation |
| Execute P-001 direct composition | Proved and accepted 2026-08-01 | Preserve evidence and limits |
| Execute P-002 PostgreSQL boundary | Proved 2026-08-01 | Retain PostgreSQL 18 result provenance |
| Resolve G-001 through G-010 | Complete | Reopen only if review rejects an outcome |
| Resolve implementation-promotion G-011 | Complete 2026-08-04 | Preserve exact drag evidence in Task 00014E |
| Run context-promotion review | Complete 2026-08-01 | Keep disposable Proof details local |
| Freeze Spec 00003 | Complete 2026-08-01 | Reopen only with explicit permission |
| Replace production sprint | Accepted 2026-08-01 | Preserve stable task numbers |
| Create production task files | Complete 2026-08-01 | Preserve stable task numbers |
| Execute production Tasks 00001-00013 | Verified 2026-08-02 | Preserve task evidence |
| Prove Task 00014 release readiness | Verified 2026-08-04 | Preserve evidence; await final human review |
| Correct spreadsheet keyboard focus | Verified 2026-08-04 | Continue final human review |
| Correct context menus and header formatting | Verified 2026-08-04 | Resume final human review |
| Correct row and column insertion | Verified 2026-08-04 | Resume final human review |
| Restore direct spreadsheet insertion parity | Verified 2026-08-04 | Resume final human review |
| Preserve inserted-column drag and delete boundaries | Verified 2026-08-05 | Preserve evidence; resume final human review |
| Replace production iconography from the accepted inventory | Verified 2026-08-05 | Preserve evidence; resume final human review |
| Tighten Borders and alignment popover density | Verified 2026-08-05 | Preserve evidence; resume final human review |
| Expand color palettes and add Border accordion | Verified 2026-08-05 | Preserve evidence; resume final human review |
| Remove background Conditional formatting row | Verified 2026-08-05 | Preserve evidence; resume final human review |
| Repair Border styles and retain session custom colors | Verified 2026-08-05 | Preserve evidence; resume final human review |
| Repair grid default and visual regressions | Started 2026-08-11 | Implement and verify the user-supplied final-review corrections |

## Freeze Blockers

None. Every material Gap is answered, research is complete, required Proofs are
proved and Frozen, P-001 has human acceptance, and reusable boundaries are in
Context.

## Non-Blockers

- Product and wireframe behavior do not need another discovery pass.
- Dynamic user tables remain catalog-driven; no Idea replacement is needed.
- A third-party identity provider is not required for the first slice. Task
  00014 must provide PostgreSQL-native sign-in against the PostgreSQL user
  registry and the existing durable application session boundary.
- Hosting, secrets, alert destinations, backup ownership, and live Google
  credentials remain later inputs; R-004 did not show an architecture conflict.
- The prior transitive `esbuild` advisory was removed by the verified dependency
  override; both full and production audits now report zero vulnerabilities.

## Context-Promotion Review

Performed at research closeout and completed after P-001 acceptance on
2026-08-01.

Promoted to `tabular-implementation-boundaries.md`:

- the handwritten direct-library lane replacing optional generated fixed stores;
- provider-neutral session/CSRF and Reactus hydration-props constraints; and
- proved PostgreSQL role cleanup, migration locks, object identity, and durable
  job boundaries while retaining later deployment/load validations.

Exact dependency fixtures, screenshots, Docker commands, and disposable Proof
implementation details remain spec/proof-local.

Implementation-review reconciliation completed 2026-08-04. Promoted across the
Tabular Context files:

- PostgreSQL-native first-slice sign-in and fresh browser-acceptance integrity;
- reachable named-file creation, governed physical identity, and blank-sheet
  readiness;
- blur autosave, sparse-draft, selection, focus, presentation, insertion,
  deletion, menu, and row-coordinate rules verified by Tasks 00014-00014D and
  the independently passed 00014E subchecks.

Exact pointer-driven drag completion evidence, final review acceptance, test
counts, screenshots, local credentials, and disposable setup details remain
spec-local. No new reusable behavior required promotion from the final drag
check; the implementation-closeout review remains pending.

## Next Authority Gate

Resume final human review. Do not mark implementation `completed` until the
user explicitly accepts the final review.
