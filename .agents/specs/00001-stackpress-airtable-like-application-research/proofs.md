# Candidate Proofs

## State And Boundary

The user authorized all currently needed Proofs on 2026-07-24. P-002, P-004,
P-005, P-006, and P-007 are approved for the bounded scopes below. P-001
remains invalidated and P-003 remains deferred to the later formula spec.

Proof artifacts belong under root `proofs/`; they are disposable prototypes,
not production implementation, and must state local-runtime limitations.

## Selection Rule

A candidate remains only when the question materially affects architecture or
the first slice, requires runtime evidence, fits an isolated disposable
prototype, and has an approved scope.

## Research Closure Disposition

| Proof | Disposition after bounded research | Reason |
| --- | --- | --- |
| P-001 | Invalidated by D-010; do not execute | It tests a generic cell-row canonical store and explicitly avoids per-spreadsheet DDL, which contradicts the accepted real-table direction |
| P-002 | Proved | The bounded real-row/column query, grid state, browser, keyboard, clipboard, and accessibility-tree signals passed |
| P-003 | Deferred to later formula spec | Formula definitions, compatibility, and evaluation are outside Spec 00001 |
| P-004 | Proved | Expected-version conflicts, permission-aware undo/redo, action history, reconstruction, and post-commit publication passed |
| P-005 | Proved | Stackpress surface parity plus Tabular policy and PostgreSQL grants/RLS intersection passed |
| P-006 | Proved | Exact typed-value extraction, missing-cache warnings, retry, commit recovery, rollback, and abandon passed |
| P-007 | Proved | DDL, metadata identity, drafts, drift, keys, constraints, triggers, grants, and RLS passed |

## Approved Execution Contract

| Proof | Exact input and limit | Command and evidence | Cleanup and acceptance |
| --- | --- | --- | --- |
| P-002 | 100,000 synthetic rows, 200 logical columns, bounded 40-by-20 reads, single-key ordering, insert/sort/filter shifts, batch edits, clipboard fixtures, and one browser-rendered virtual grid | `npm run proof:p002`; Playwright CLI snapshot, keyboard actions, and screenshot under `proofs/grid-scale-query-and-edit-contract/output/playwright/` | Stop the static server. Pass only if query/edit assertions succeed and fresh browser evidence shows stable logical selection, bounded mounted cells, keyboard editing, and ARIA grid indices/counts. |
| P-004 | Two logical clients, overlapping and non-overlapping edits, expected row versions, one permission change, action deltas, undo/redo, and bounded reconstruction | `npm run proof:p004`; JSON result under the prototype folder | In-memory database closes after the run. Pass only if stale writes are visible, unauthorized undo fails, later work is preserved, and reconstruction matches committed state. |
| P-005 | Stackpress `0.10.8`, page/API adapters invoking one named capability, one PostgreSQL table, deny-default Tabular policy, database roles/grants, forced RLS, filtered reads, denied writes, and redacted audit | `npm run proof:p005`; JSON result records framework, role, policy, and audit signals | In-memory database and server close after the run. Pass only if both surfaces return compatible authorized outcomes and neither application policy nor PostgreSQL policy can be bypassed. |
| P-006 | Google Sheets API-shaped literal/effective values, XLSX literal/cached and missing-cache cells, CSV encoding/delimiter/value cases, duplicate retry, changed fingerprint, forced staging/commit failure, and abandon | `npm run proof:p006`; fixtures and JSON result under the prototype folder | Temporary workbook data stays inside the prototype; database closes. Pass only if values are never recalculated or guessed, warnings retain coordinates, retry is idempotent, changed sources block commit, and commit/abandon are unambiguous. |
| P-007 | One Tabular system schema; new and existing tables; single, composite, and absent keys; one relation; required/check/trigger failures; rename/drop/type drift; draft promotion; grants and forced RLS | `npm run proof:p007`; JSON result records catalog identities, key classifications, draft lifecycle, errors, and permission state | In-memory database closes. Pass only if real tables remain canonical, metadata detects drift without silent rebinding, incomplete drafts never enter target tables, promotion is atomic, failures map to cells, and permissions are not widened. |

The database runtime is the Stackpress-supported PGlite path backed by
PostgreSQL 17.5 semantics. A server-based PostgreSQL 18 image was preferred,
but the local Docker credential helper prevented image acquisition. Results
must not claim PostgreSQL 18 connection, multi-process, or network behavior.

## Candidate Queue

### P-001: Generic Spreadsheet Storage On Stackpress And PostgreSQL

- Disposition notice: invalidated by D-010. Preserve this scope as historical
  evidence only; do not approve or execute it.
- Gap: G-003, G-006, G-012, G-015, G-023
- Question: Can a generic workbook/sheet data plane support independent cell edits, bounded grid reads, formulas, comments, and revisions without per-spreadsheet DDL or whole-workbook rewrites?
- Hypothesis: stable relational IDs and coordinates plus bounded `jsonb` value/format metadata can coexist with Stackpress-generated control models.
- Expected signal: import two sheets, read and edit bounded windows, attach a note/comment, update a formula dependency, reconstruct a revision, and reload without application regeneration.
- Failure signal: normal edits rewrite an entire workbook/sheet, queries scan unbounded JSON, coordinates or revisions become ambiguous, or Stackpress generation is required for user content.
- Provisional scope: compare cell rows, row documents, and bounded blocks using one representative workbook shape.
- Non-goals: production migrations, final scale claims, semantic department modeling, Qdrant, or vector indexing.
- Status: Invalidated by D-010; replaced by P-007.

### P-002: Grid-Scale Query And Edit Contract

- Gap: G-005, G-006, G-009, G-012, G-015
- Question: Can a Stackpress page/event/storage path support deterministic two-axis windowed reads over real PostgreSQL rows and columns, logical selection/edit state, accessible keyboard focus, rich clipboard transfer, and atomic batched edits without loading the full table?
- Hypothesis: stable primary-key-aware row windows plus a logical grid state, persistent row drafts, and batched capability events can keep the UI responsive and accessible while DOM cells mount and unmount.
- Expected signal: stable windows under insert/reorder/sort/filter; explicit behavior for single, composite, or absent keys; bounded payloads; selection and active cell surviving offscreen movement; deterministic edit/keyboard focus; TSV, HTML, and versioned internal clipboard handling; atomic batch results; valid ARIA row/column metadata; and usable screen-reader navigation.
- Failure signal: unstable ordering, full-sheet transfer, lost focus or selection, inaccessible virtual rows/columns, plain-text-only loss of typed data, unbounded query cost, or partial writes.
- Approved prototype: `proofs/grid-scale-query-and-edit-contract/`, using the
  exact P-002 row, column, window, browser, and acceptance limits above.
- Non-goals: polished UI, internet-scale claims, or exhaustive database benchmarks.
- Status: Proved on 2026-07-24. Database, state, keyboard, clipboard, and
  browser accessibility-tree signals passed. Native VoiceOver interaction was
  not run and remains an implementation-phase accessibility validation.

### P-003: Google Sheets Formula Compatibility Boundary

- Disposition notice: deferred to a separate later formula spec. Preserve this
  research scope but do not approve or execute it under Spec 00001.
- Gap: G-004, G-006, G-012, G-014, G-015, G-022
- Question: Can a selected parser/engine preserve and evaluate a representative Google Sheets formula corpus with explicit mappings and honest unsupported states?
- Hypothesis: source formula plus normalized AST/mapping, source cached value, target value, dependency graph, and compatibility state can support safe incremental migration.
- Expected signal: deterministic cross-sheet recomputation, correct reference rewriting, explicit cycle/error/unsupported states, preserved cached values, a measured boundary between synchronous and queued recomputation, and a generated compatibility report.
- Failure signal: formulas are flattened, rewritten without provenance, silently diverge from Google results, lose locale/timezone behavior, or require an unacceptable license.
- Provisional scope: a versioned fixture covering arithmetic, text, date/time, lookup, array, error, cross-sheet, volatile, and unsupported/external functions.
- Non-goals: claiming full Google Sheets parity or implementing every function.
- Status: Deferred to a separate later formula spec.

### P-004: Concurrent Edit And Revision Boundary

- Gap: G-008, G-012, G-015
- Question: Can expected-version row writes, draft revisions, durable table/schema action deltas, and scoped undo prevent silent overwrites without requiring CRDT collaboration?
- Hypothesis: primary-key-aware record comparison plus atomic action history, draft promotion, and post-commit invalidation can establish a useful first boundary before full real-time co-editing.
- Expected signal: non-overlapping row edits commit, overlapping stale edits fail visibly, draft and action identity survive, undo rechecks PostgreSQL permission and revision state, a conflicting undo does not erase later work, and a prior application action can be reconstructed.
- Failure signal: last-write-wins occurs silently, events publish before commit, undo reverses another actor's later change, revision ownership is ambiguous, or reconstruction is incomplete.
- Approved prototype: `proofs/concurrent-edit-and-revision-boundary/`, using
  the exact P-004 clients, actions, permissions, and acceptance limits above.
- Non-goals: CRDT implementation, offline-first sync, or production collaboration infrastructure.
- Status: Proved on 2026-07-24.

### P-005: Cross-Surface Capability And Authorization Parity

- Gap: G-007, G-010, G-011, G-012, G-015
- Question: Can the same table operations be exposed through page and API adapters while preserving both Tabular capability policy and PostgreSQL roles, grants, ownership, and RLS?
- Hypothesis: shared named events can own domain behavior while each surface supplies explicit identity/protocol policy and the database connection strategy preserves authoritative PostgreSQL denial.
- Expected signal: equivalent authorized operations return compatible domain outcomes, unauthorized reads are filtered by both layers, unauthorized writes and expanded effects fail before commit, RLS is not bypassed by an owner connection, and redacted audit evidence identifies actor and surface.
- Failure signal: empty-policy allow, a privileged shared connection widens access, surface-specific bypasses, inconsistent validation, caller-context loss, unfiltered reads/broadcasts, audit divergence, or accidental browser exposure.
- Approved prototype:
  `proofs/cross-surface-capability-and-authorization-parity/`, using the exact
  P-005 Stackpress, surface, role, RLS, audit, and acceptance limits above.
- Non-goals: every interface, public SDKs, OAuth applications, MCP tools, or production hardening.
- Status: Proved on 2026-07-24 with the documented PGlite boundary. A later
  deployment must recheck connection-pool role reset and network identity.

### P-006: Import Transaction And Failure Recovery

- Disposition notice: reframed for exact values only. Formula definitions,
  formatting, comments, and notes are outside this Proof.
- Gap: G-006, G-010, G-016, G-021, G-024, G-025
- Question: Can Google Sheets/XLSX/CSV import preserve exact typed values and
  source provenance with deterministic warnings, retry, commit, and abandon?
- Hypothesis: fingerprinted sources, typed value staging, idempotent chunks,
  explicit missing/stale/unrepresentable warnings, and one transactional commit
  make value-only import deterministic.
- Expected signal: Google literal/effective values, XLSX literals/cached formula
  results, and CSV source tokens/parsed values import without reinterpretation;
  absent caches warn or block; source changes block commit; retry is idempotent;
  abandon affects only staging.
- Failure signal: formulas execute, values change silently, missing cached
  results are guessed, source mutation is missed, commit is ambiguous, retry
  duplicates data, or warnings lack source coordinates.
- Approved prototype: `proofs/import-transaction-and-failure-recovery/`, using
  the exact P-006 source fixtures, failure cases, and acceptance limits above.
- Non-goals: ongoing Google sync, huge-file performance claims, every XLSX feature, attachments, Qdrant, or production job infrastructure.
- Status: Proved on 2026-07-24 with API-shaped Google fixtures and generated
  XLSX/CSV fixtures. Live Google authorization/download was not exercised.

### P-007: PostgreSQL-Native Table, Metadata, And Draft Boundary

- Gap: G-002, G-003, G-006, G-012, G-015, G-023, G-028
- Question: Can Tabular safely create and expose real PostgreSQL tables while
  its UI metadata and incomplete row drafts remain stable across DDL, schema
  drift, key variation, and permission enforcement?
- Hypothesis: introspected real tables plus a Tabular-owned system schema,
  stable application metadata, typed JSON draft patches, and transactional
  promotion can work without generating Stackpress models per user table.
- Expected signal: create a table from a spreadsheet action; create a header as
  default text; map semantic fields and formats independently; persist an
  incomplete draft without touching the target table; promote a valid draft in
  one transaction; map constraint failures to cells; edit an existing table;
  reconcile rename/drop/type changes; handle single, composite, and absent
  primary keys explicitly; and preserve grants/RLS without partial DDL or data.
- Failure signal: metadata silently binds to the wrong object, a draft targets
  the wrong row, incomplete records leak into a business table, DDL or data is
  partially applied, database permission is widened, schema changes orphan
  metadata without warning, or runtime operation requires generated
  per-table Stackpress models.
- Approved prototype:
  `proofs/postgresql-native-table-metadata-draft-boundary/`, using the exact
  P-007 schema, key, relation, failure, drift, draft, permission, and acceptance
  limits above.
- Non-goals: production migrations, full PostgreSQL administration, polished
  UI, multi-database portability, formula compatibility, or large-scale
  benchmarking.
- Status: Proved on 2026-07-24 with PostgreSQL 17.5/PGlite catalog,
  transaction, constraint, trigger, grant, and RLS semantics. Server-based
  PostgreSQL 18 and external DDL races remain implementation validation.

## Results Ledger

Execution was authorized and completed on 2026-07-24.

| Proof | Result | Primary evidence | Affected Gaps |
| --- | --- | --- | --- |
| P-001 | Invalidated | D-010 and the preserved historical scope above | G-003, G-023 |
| P-002 | Proved | [Result JSON](../../../proofs/grid-scale-query-and-edit-contract/results.json), [browser evidence](../../../proofs/grid-scale-query-and-edit-contract/output/playwright/) | G-005, G-006, G-009, G-012, G-015 |
| P-003 | Deferred | Later formula spec boundary above | G-004, G-022 |
| P-004 | Proved | [Result JSON](../../../proofs/concurrent-edit-and-revision-boundary/results.json) | G-008, G-012, G-015 |
| P-005 | Proved | [Result JSON](../../../proofs/cross-surface-capability-and-authorization-parity/results.json) | G-007, G-010, G-011, G-012, G-015 |
| P-006 | Proved | [Result JSON](../../../proofs/import-transaction-and-failure-recovery/results.json) | G-006, G-010, G-016, G-021, G-024, G-025 |
| P-007 | Proved | [Result JSON](../../../proofs/postgresql-native-table-metadata-draft-boundary/results.json) | G-002, G-003, G-006, G-012, G-015, G-023, G-028 |

### Commands And Fresh Evidence

- Commands: `cd proofs && npm install`; `cd proofs && npm test`.
- Result: five tests passed, zero failed, in about 5.4 seconds on the final run.
- Runtime: Stackpress `0.10.8`; Stackpress-supported PGlite with PostgreSQL `17.5` semantics.
- P-002 browser evidence: Playwright CLI accessibility/edit/draft/final snapshots and a final screenshot are preserved under `output/playwright/`; signals include `aria-rowcount=100001`, `aria-colcount=200`, 96 mounted cells, one tabbable cell, `Control+End` reaching R100000/C200, a saved `Final draft`, three clipboard formats, and zero post-reload console errors.
- Cleanup: the Playwright browser and localhost proof server were stopped.

### Result Boundaries

- P-002 proves the bounded query/edit/virtualization and browser accessibility
  contract. It does not replace a native VoiceOver acceptance pass.
- P-005 and P-007 prove PostgreSQL behavior in one process. They do not prove
  PostgreSQL 18 server connections, connection-pool role reset, external DDL
  races, network identity propagation, or large-schema performance.
- P-006 proves the value-only normalization and transaction contract with
  deterministic fixtures. It does not prove live Google OAuth, download, or
  Drive version API integration.
- These residual checks belong to later implementation/deployment acceptance;
  they do not justify another research Proof in Spec 00001.
