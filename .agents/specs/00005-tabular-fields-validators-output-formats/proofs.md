# Proofs

## Current posture

No research Proof is required. Official documentation, pinned source, and the
current Tabular codebase answered the catalog, type, and composition questions.

## Proof triggers

Implementation planning must queue a bounded Proof if it cannot establish one
of these signals from focused source/tests:

- Whether the pinned Stackpress schema surface can compose multiple assertions
  without hidden coercion or first-error behavior that conflicts with the
  proposed Tabular contract.
- Whether PGlite and production PostgreSQL differ materially for a proposed
  JSONB/array codec or storage cast used by the spec.
- Whether a proposed editor can round-trip its canonical value through the
  current grid action and draft boundaries without lossy conversion.

Any queued Proof must record its Gap, hypothesis, expected signal, failure
signal, scope, non-goals, and root `proofs/<proof-slug>/` path before work
begins.

## Closeout

No Proof was run, so there is no root `proofs/` artifact, residual risk, or
cleanup obligation from this research pass.
