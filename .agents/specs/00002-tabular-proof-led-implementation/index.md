# Spec 00002: Tabular Proof-Led Implementation

Status: **Frozen 2026-08-01.** Both Proofs completed on 2026-07-31; Rounds 2 and
3 plus the r007 product/design closure were accepted and promoted on
2026-08-01. Production implementation remains unstarted and requires a separate
accepted task plan.

This is the entry point for the proof-led implementation-discovery spec for
Tabular. It turns the accepted product contract and approved wireframe behavior
into two executable PGlite-backed guidebooks before production scaffolding.
It does not reopen Frozen Spec 00001 or authorize production implementation.

## Files

- [Brief](brief.md): load for the preserved user goal, accepted scope,
  non-goals, source boundary, and completion contract.
- [Status](status.md): load for Freeze readiness, proof state, blockers, and the
  next authority gate.
- [Decisions And Gaps](decisions.md): load for accepted planning decisions,
  assumptions to verify, and questions the Proofs or final gap check must answer.
- [Feature-To-Proof Matrix](feature-proof-matrix.md): load before designing or
  executing either Proof; every represented wireframe feature must retain a
  coverage row and evidence disposition.
- [Research](research.md): load before expanding source or documentation review
  beyond the accepted Context Files and existing local Proof harness.
- [Proofs](proofs.md): load for the two required PGlite Proof contracts,
  guidebook artifact rules, execution order, and result ledger.
- [Post-Proof Gap Check](gap-check.md): load after both Proofs meet their
  evidence signals; it defines the mandatory implementation-readiness review.

## Authority And Provenance

- The [accepted PostgreSQL-native product contract](../../context/tabular-product-contract.md)
  governs product and data behavior.
- The [creative foundation](../../context/tabular-creative-spec.md),
  [grid and column contract](../../context/tabular-grid-and-column-spec.md),
  [command-surface contract](../../context/tabular-command-surface-spec.md), and
  [file/import/settings contract](../../context/tabular-files-import-and-settings-spec.md)
  govern approved visible behavior where they do not conflict with the product
  contract.
- The [wireframe decision history](../../context/tabular-wireframe-decision-history.md)
  identifies superseded and deliberately unavailable behavior.
- The [accepted implementation boundaries](../../context/tabular-implementation-boundaries.md)
  govern runtime-object, authority, migration, ordering, action, and
  target-recheck rules promoted from the Proof and r007 closure rounds.
- Frozen Spec 00001 remains provenance and historical evidence, not a sibling
  source of truth. Shared decisions needed here are already in Context.

## Operating Boundary

- Exactly two Proof suites are planned: one browser/interaction guidebook and
  one Stackpress/data guidebook.
- Both Proofs must use PGlite. PGlite evidence may not be relabeled as proof of
  PostgreSQL server pools, network identity, multi-process behavior, or a
  production deployment.
- Proofs may experiment freely inside their bounded prototype folders, but
  production app scaffolding, migrations, and generated application code wait
  for an accepted implementation task plan derived from this Frozen spec.
- After Freeze, implementation planning routes through the Stackpress app
  coordinator and phase-specific Stackpress skills.
