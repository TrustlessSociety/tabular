# Proofs

## State And Shared Contract

P-001 and P-002 were accepted and executed on 2026-07-31. Their accepted-truth
auto-resolution round was executed, rendered, and accepted on 2026-08-01.
Focused R-003 extends P-001 without creating a third Proof suite.
Both use PGlite and live under root `proofs/` in new Spec 00002-owned folders.
Existing Spec 00001 Proofs stay reproducible and are not overwritten.

Shared runtime and evidence rules:

- pin the actual Node, Stackpress, PGlite, browser, and relevant package
  versions used by each run;
- give every feature-matrix ID an evidence disposition;
- separate executable behavior, human-reviewable output, and unproved claims;
- include success, denial, invalid-input, conflict, rollback, and recovery
  paths where the feature has those states;
- record approaches retained and rejected so the Proof reads like a coding
  guide rather than a demo;
- never claim PostgreSQL server/pool/network behavior from PGlite; and
- close local servers and ephemeral resources after verification.

## P-001: Browser And Interaction Implementation Guidebook

- Gap: G-001, G-002, G-006, G-007, G-008
- Question: Can every approved wireframe feature be expressed as one coherent,
  accessible browser experience whose state transitions and persistence
  boundaries are explicit enough to guide production implementation?
- Hypothesis: a chaptered browser harness with logical grid state, small named
  domain actions, and PGlite-backed fixtures can demonstrate the complete
  interaction contract without becoming an accidental product scaffold.
- Expected signal: every `W-*` matrix row has runnable behavior, a focused
  automated check, and an evidence record; desktop and narrow workflows are
  reviewable; PGlite state agrees with visible actions; unavailable/deferred
  controls are honest; keyboard, focus, overlays, errors, and grid geometry meet
  the accepted contract.
- Failure signal: features exist only as static markup, a group hides missing
  sub-items, PGlite is bypassed for stateful claims, responsive or keyboard
  behavior breaks, state ownership is ambiguous, or the harness must adopt an
  unreviewed production architecture to stay integrated.
- Prototype path: `proofs/tabular-browser-interaction-guide/`
- Chapters: explorer/hierarchy; new file and identity; grid/selection;
  fields/formats/editing; validation/drafts; columns/relations/reordering;
  menus/toolbar/context actions; import/export-visible states; responsive and
  accessibility walkthrough; integrated feature report.
- Non-goals: production branding, deployment, live Google authorization,
  production PostgreSQL, final framework selection, or pixel-perfect copying.
- Human review: required for desktop and narrow primary journeys plus named
  overlay/error/keyboard states.
- Status: **Proved; post-Proof policy rows closed** on 2026-08-01. Automated
  feature-manifest/PGlite checks pass; fresh desktop and 390px Playwright review
  covers exact presentation choices, import recovery, and R-003 virtualized
  logical selection with zero console errors. W-015 and W-025 were not proved
  by this suite; the approved r007 policy pass closed them without relabeling
  design acceptance as executable evidence.

## P-002: Stackpress And Data Implementation Guidebook

- Gap: G-003, G-004, G-005, G-006, G-007, G-009, G-010, G-011
- Question: Can Stackpress capabilities over PGlite demonstrate the difficult
  data, authority, concurrency, integration, and operations contracts needed to
  support the visible Tabular experience without per-table code generation?
- Hypothesis: catalog-driven repositories plus named domain capabilities,
  explicit web/MCP adapters, a versioned Tabular system schema, and transactional
  action envelopes can provide a teachable production map while PostgreSQL
  objects remain canonical.
- Expected signal: every `D-*` matrix row and every P-001 stateful feature has a
  backing-action disposition; dynamic tables require no generated model/client;
  grants/RLS-shaped denial cannot be widened by application policy; DDL, drafts,
  conflicts, undo, imports, views, jobs/outbox, CSV export, MCP, and frontend
  contract examples produce focused evidence and translation notes.
- Failure signal: adapters duplicate domain rules, runtime tables require
  generation, privileged connections erase caller authority, transactions or
  identity are ambiguous, PGlite limitations are hidden, or a visible feature
  has no credible backing boundary.
- Prototype path: `proofs/tabular-stackpress-data-guide/`
- Chapters: catalog/system schema; identities/roles/capabilities; dynamic query
  and DDL; metadata/fields/formats/unstructured promotion; drafts/validation;
  concurrency/journal/undo; relations/generated columns; saved views;
  import/export/jobs/outbox; MCP/harness/frontend contract; integrated
  interaction-to-domain trace; production translation ledger.
- Non-goals: production pool configuration, live external services, deployment,
  backup/restore, arbitrary SQL/DDL MCP, or performance claims beyond the exact
  fixtures measured.
- Human review: a concise generated guide/report is reviewable; code, tests, and
  logs remain verification rather than visual acceptance.
- Status: **Proved; post-Proof visible gaps closed** on 2026-08-01. The real
  `stackpress/pglite` adapter, lifecycle, capability event, catalogs,
  transactional system migration, separated business/migration authority,
  collision-safe unstructured promotion, compiled read/export/view queries,
  idempotent jobs/outbox, frontend contract, and honest report pass. D-007 and
  D-010's visible surfaces were later approved in r007; their data contracts
  remain backed by this Proof.

## Execution Order

1. Accept or revise the matrix and both Proof contracts.
2. Run R-001 and R-002; update affected Gaps without widening scope.
3. Establish a shared Spec 00002 PGlite/evidence convention without changing
   prior Proof outputs.
4. Build P-001 in feature chapters, recording domain-action needs as explicit
   handoff inputs to P-002.
5. Build P-002 around those action contracts and accepted product-only `D-*`
   rows; send any interaction mismatch back to P-001.
6. Run both suites fresh and complete their result ledgers.
7. Perform the mandatory post-Proof gap check. Add a follow-up Proof only when a
   blocking Gap cannot be resolved from the two suites and the user accepts the
   change to the exactly-two-Proof contract.

## Results Ledger

| Proof | Result | Evidence | Remaining limits |
| --- | --- | --- | --- |
| P-001 | Proved; policy closure accepted | `proofs/tabular-browser-interaction-guide/results.json`; 12 screenshots; three focused tests; Playwright browser ledger; approved r007 | Native AT later |
| P-002 | Proved; visible design accepted | `proofs/tabular-stackpress-data-guide/results.json`; 22 executable signals; desktop/narrow report; approved r007 | Production target rechecks |

Combined fresh verification: `npm test` passed 9/9 root Proof tests on
2026-08-01 with serial execution, including R-003. Existing Spec 00001
result/fixture files were restored after the run so this package does not
overwrite Frozen evidence. The workspace validator also passed with only
pre-existing/document-length warnings.
