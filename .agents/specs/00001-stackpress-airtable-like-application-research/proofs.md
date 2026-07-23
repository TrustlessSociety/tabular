# Candidate Proofs

## State And Boundary

No Proof is authorized, started, or completed. These are candidates to test only if source research cannot resolve the linked Gaps and the user approves a bounded prototype.

Do not create root `proofs/` during setup. Before executing a Proof, replace its provisional scope with exact inputs, limits, commands, evidence capture, cleanup, and acceptance conditions.

## Selection Rule

A candidate remains only when:

- the question materially affects the architecture or first product slice;
- docs and source inspection cannot establish the required behavior;
- the expected signal is observable in a small isolated prototype;
- the Proof avoids becoming hidden production implementation;
- the user approves its final scope.

Research may revise, split, invalidate, defer, or remove candidates while preserving the reason in this ledger.

## Candidate Queue

### P-001: Dynamic User Schema On Stackpress

- Gap: G-003, G-006, G-012, G-015
- Question: Can the target application create and evolve user-defined tables and fields at runtime without unsafe application regeneration or unbounded migration cost?
- Hypothesis: an application-owned metadata model with a bounded storage strategy can coexist with Stackpress-generated system models.
- Expected signal: create a table and typed fields through an application capability, persist/query rows, change safe field metadata, and reload without rebuilding the application.
- Failure signal: ordinary schema changes require application regeneration, unsafe DDL, data loss, or query behavior that cannot be bounded.
- Provisional scope: one base, two related tables, a small type set, and one schema change.
- Non-goals: production migrations, broad type coverage, or final performance claims.
- Status: Candidate; research first.

### P-002: Grid-Scale Query And Edit Contract

- Gap: G-005, G-006, G-009, G-012, G-015
- Question: Can a Stackpress page/event/storage path support deterministic windowed reads, sorting, filtering, and batched edits suitable for a virtualized grid?
- Hypothesis: a cursor or stable window query plus batched capability events can keep the UI responsive without loading a full table.
- Expected signal: stable windows under sort/filter, bounded payloads, atomic or explicitly partial batch results, and observable request/query cost.
- Failure signal: unstable row ordering, full-table transfer, unbounded query cost, or ambiguous partial-write behavior.
- Provisional scope: synthetic representative data and one minimal grid surface.
- Non-goals: polished UI, internet-scale claims, or exhaustive database benchmarks.
- Status: Candidate; research first.

### P-003: Formula And Relation Dependency Semantics

- Gap: G-004, G-006, G-012, G-015
- Question: What minimal dependency engine can recompute typed formulas, relations, lookups, or rollups deterministically?
- Hypothesis: an explicit dependency graph with cycle detection and bounded recomputation can support a deliberately small function set.
- Expected signal: deterministic recomputation after edits, correct dependency ordering, explicit cycle/error states, and preserved typed values.
- Failure signal: silent stale values, non-deterministic ordering, unbounded cascading work, or type/error ambiguity.
- Provisional scope: two tables, a relation, one lookup or rollup, and several arithmetic/text formulas.
- Non-goals: spreadsheet compatibility or a complete expression language.
- Status: Candidate; research first.

### P-004: Concurrent Edit And Revision Boundary

- Gap: G-008, G-012, G-015
- Question: Which optimistic concurrency and revision mechanism prevents silent overwrites and supports a bounded recovery story?
- Hypothesis: record or document revisions with compare-and-set behavior can establish a useful first boundary before real-time co-editing.
- Expected signal: conflicting edits are detected or merged by an explicit rule, audit identity is preserved, and a prior value can be reconstructed.
- Failure signal: last-write-wins occurs silently, revision ownership is ambiguous, or recovery evidence is incomplete.
- Provisional scope: two concurrent clients editing overlapping and non-overlapping values.
- Non-goals: CRDT implementation, offline-first sync, or production collaboration infrastructure.
- Status: Candidate; research first.

### P-005: Cross-Surface Capability And Authorization Parity

- Gap: G-007, G-010, G-011, G-012, G-015
- Question: Can the same table operations be exposed through page and API adapters without losing caller identity, validation, authorization, or audit semantics?
- Hypothesis: shared named events can own domain behavior while each surface supplies explicit identity and protocol policy.
- Expected signal: equivalent authorized operations return compatible domain outcomes, unauthorized callers fail at the correct boundary, and audit evidence identifies actor and surface.
- Failure signal: surface-specific bypasses, inconsistent validation, caller-context loss, or accidental browser exposure.
- Provisional scope: read and update operations for one table through a page action and configured API.
- Non-goals: every interface, public SDKs, OAuth applications, MCP tools, or production hardening.
- Status: Candidate; research first.

### P-006: Import Transaction And Failure Recovery

- Gap: G-006, G-010, G-016
- Question: Can a representative CSV import validate types, report row-level errors, and commit or resume with an explicit failure policy?
- Hypothesis: staged parsing and validation with bounded batches can provide deterministic partial-failure behavior.
- Expected signal: invalid rows are attributable, accepted rows follow the declared atomicity rule, retry does not duplicate data, and progress is observable.
- Failure signal: partial state is ambiguous, retries duplicate records, or errors cannot be connected to input rows.
- Provisional scope: one CSV, a small type set, duplicate keys, and invalid values.
- Non-goals: all file formats, huge-file performance, attachment import, or production job infrastructure.
- Status: Candidate; research first.

## Results Ledger

No results. Populate this section only after a Proof is approved and executed under the local SDD workflow.
