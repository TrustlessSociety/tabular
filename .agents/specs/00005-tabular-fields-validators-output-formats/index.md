# Spec 00005: Tabular Fields, Validators, and Output Formats

## Status

**Frozen 2026-08-13.** Research and material Gap resolution are complete. The
implementation plan was accepted on 2026-08-13; use the stable task records
under `tasks/` for implementation.

## Load order

1. [Brief](brief.md) — load for the user request, scope, non-goals, sources,
   and governing context.
2. [Status](status.md) — load for Freeze readiness, completed work, and the
   next action.
3. [Decisions](decisions.md) — load for accepted requirements, open Gaps,
   assumptions, evidence, and risks.
4. [Research](research.md) - load for the bounded research queue and findings
   from Frui, Stackpress, PostgreSQL, and the current Tabular implementation.
5. [Field catalog](field-catalog.md) - load for all 29 Frui form dispositions,
   SQL value shapes, adaptations, and deferrals.
6. [Format catalog](format-catalog.md) - load for all 24 Frui view dispositions
   and safe output behavior.
7. [Validator catalog](validator-catalog.md) - load for the versioned registry,
   implied rules, composition, and Stackpress disposition.
8. [Compatibility contract](compatibility-contract.md) - load for the exact
   storage/value-shape algorithm and default combinations.
9. [Lifecycle contract](lifecycle-contract.md) - load for edit/import/default
   behavior, validator/database separation, existing violations, metadata, and
   tests.
10. [Proofs](proofs.md) - load only if implementation planning exposes a
   technical uncertainty that requires an executable experiment.

## Authority

The [Tabular product knowledge base](../../context/index.md) remains the source
of Accepted Reusable Truth. This package records planning and evidence only.
Where it conflicts with Context Files, the conflict is a Gap until resolved.

## Expected deliverables

- A complete disposition of Frui form controls against clean PostgreSQL
  storage types.
- A complete disposition of Frui view renderers as Tabular output formats.
- A validator catalog with storage compatibility, parameters, implied rules,
  and enforcement ownership.
- A field × storage × validator × output-format compatibility contract.
- Explicit deferrals and rejection reasons for unsafe, lossy, or non-column
  concepts.

All expected research deliverables are accepted. Reusable product decisions
are promoted to Context; implementation sequencing remains under `tasks/`.

## Implementation routing

The [accepted sprint](tasks/sprint.md) contains task summaries, ordering,
verification, acceptance criteria, and the required coordinator/worker shape.
[Task status](tasks/status.md) and the stable numbered task files record
implementation progress without changing the Frozen product contract.
