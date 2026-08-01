# Proofs

## State And Shared Contract

Both required architecture-delta Proofs are Frozen. P-001's automated/browser
evidence passed and the user accepted its visual result on 2026-08-01. P-002
passed against native PostgreSQL 18. Existing Spec 00001/00002 outputs remain
unchanged and retain separate provenance.

Shared rules:

- pin and report every direct dependency, peer dependency, Node runtime,
  PGlite/PostgreSQL version, and browser used;
- isolate the new Proof dependency/import graph so the legacy root Proof
  harness's umbrella `stackpress` dependency cannot mask accidental reliance;
- do not install or import the umbrella `stackpress` package;
- do not add `schema.idea`, generated stores, or built-in auth/API/session/admin;
- separate application identity/CSRF, capability policy, and PostgreSQL final
  authority in code and evidence;
- include success, invalid-input, denial, error, rollback, cleanup, and recovery
  paths appropriate to the boundary;
- label source inspection, PGlite behavior, PostgreSQL-server behavior, browser
  review, and deferred provider behavior separately; and
- close HTTP servers, browser processes, database connections, and temporary
  resources after every run.

## P-001: Direct-Library Composition Guidebook

- Gaps: G-001, G-002, G-003, G-004, G-007, G-008
- Question: Can the focused packages compose into one explicit Tabular request,
  render, hydration, capability, and transaction lifecycle without the umbrella
  Stackpress package, Idea, or built-in features?
- Hypothesis: an explicit bootstrap can bind Ingest, Reactus, lib events, a
  provider-neutral identity/session/CSRF adapter, and Inquire/PGlite while
  preserving one Tabular capability and transport-independent action contracts.
- Prototype path: `proofs/tabular-direct-stackpress-composition/`
- Human review: required for a desktop and 390 x 844 rendered route plus one
  hydrated authorized mutation and its visible denial/error states.

Expected proof signals:

1. A clean dependency graph imports `@stackpress/ingest`,
   `@stackpress/inquire`, `@stackpress/inquire-pglite`, `reactus`, and
   `@stackpress/lib`, with no umbrella `stackpress` or Idea packages.
2. One documented bootstrap owns config, resources, routes, Reactus server/client
   manifests, startup, readiness, errors, and shutdown.
3. An Ingest request passes through a provider-neutral authenticated-principal
   test double, durable-session contract double, CSRF gate, and deny-default
   capability before an Inquire/PGlite transaction executes.
4. Reactus renders the response, serves its required assets/client bundle, and
   hydrates one browser action without losing request identity or action typing.
5. Fixed `tabular.*` records install through a transactional, idempotent
   Tabular migration runner and handwritten repository; no generated store is
   present.
6. Web and a small governed MCP-shaped adapter share the capability while
   retaining independent identity, validation, and response mapping.
7. Success, denial, invalid CSRF, stale version, database rollback, render error,
   and resource cleanup have focused automated evidence.

Failure signals:

- hidden reliance on umbrella bootstrap or generated artifacts;
- request cookies accepted as identity without verification;
- Reactus build or hydration requires an unowned lifecycle;
- adapters duplicate domain rules or bypass PostgreSQL-shaped authority;
- migrations partially apply or record a version outside their DDL transaction;
  or
- the demo works only through undocumented global state or leaked resources.

Non-goals:

- live identity provider, production PostgreSQL pools, deployment, final visual
  polish, the full grid, or re-proving every Spec 00002 feature.

Result 2026-08-01: **Proved; human visual acceptance complete.**

- `npm test`: 1 test passed; all ten result signals are true on Node v26.3.0.
- HeadlessChrome 150 exercised sign-in, invalid-CSRF denial, authorized hydrated
  rename, and the 390 x 844 state. The deliberate HTTP 403 was the only console
  error; warnings and unexpected errors were zero; narrow overflow was zero.
- Evidence: [result JSON](../../../proofs/tabular-direct-stackpress-composition/results.json),
  [browser ledger](../../../proofs/tabular-direct-stackpress-composition/output/playwright/browser-review.md),
  [guidebook](../../../proofs/tabular-direct-stackpress-composition/README.md),
  and [production translation](../../../proofs/tabular-direct-stackpress-composition/production-translation.md).
- Limits: provider is a labeled test double, session persistence is proof-lifetime
  PGlite, local HTTP omits `Secure`, and PGlite makes no server-role claim.
- Dependency disposition: high Vite advisories were removed by upgrading to
  7.3.6. One low transitive `esbuild` Windows dev-server advisory is contained,
  not fixed; production must re-audit and never expose the development server.
- Acceptance: the user accepted the desktop authorized/denied states and the
  390 x 844 artifact on 2026-08-01.

## P-002: PostgreSQL 18 Production-Boundary Guidebook

- Gaps: G-004, G-005, G-006, G-008
- Question: Does the direct Inquire/PostgreSQL composition preserve migration,
  pool, role, concurrency, external-DDL, and worker guarantees that PGlite cannot
  prove?
- Hypothesis: an application-owned connection/transaction boundary around
  `@stackpress/inquire-pg` and `pg` can set caller authority locally, guarantee
  cleanup, serialize migrations, reconcile external DDL, and claim PostgreSQL
  jobs safely across real concurrent connections.
- Prototype path: `proofs/tabular-direct-postgresql-boundary/`
- Human review: none. The output is integration evidence and a concise
  production-translation report, not a visual product artifact.

Expected proof signals:

1. PostgreSQL 18 version and server settings are captured from the actual test
   target; PGlite is not used for target claims.
2. Pool checkout/set-role/transaction/reset/release is proved on success,
   denial, exception, cancellation, and retry without role leakage.
3. Migration history, advisory locking, DDL, and version records are atomic and
   idempotent across two concurrent migrators.
4. Two connections exercise expected-version mutation, schema replacement, and
   external rename/drop/recreate reconciliation without trusting display names.
5. At least two workers exercise safe job/outbox claiming, retry, dead-letter,
   crash/reclaim, and idempotency behavior.
6. Web/MCP-shaped callers receive equivalent authority outcomes while their
   transport adapters remain separate.
7. The report names unproved deployment, live identity, backup/restore, load,
   and disaster-recovery claims honestly.

Failure signals:

- role/session settings survive pool release;
- DDL and migration history diverge after failure;
- concurrent workers duplicate non-idempotent effects or lose jobs;
- catalog identity relies on name alone;
- elevated migration authority leaks into caller transactions; or
- a PGlite/single-process substitute is reported as PostgreSQL-server evidence.

Non-goals:

- hosting-provider selection, live Google OAuth/Drive, backup certification,
  production load limits, native VoiceOver, or a deployable Tabular application.

Result 2026-08-01: **Proved.**

- `PROOF_DATABASE_URL=... npm test`: 1 test passed on Node v26.3.0 against
  PostgreSQL 18.4 in a disposable official `postgres:18` container.
- Eight result groups cover PostgreSQL version, RLS isolation, role/timeout
  cleanup and cancellation recovery, locked transactional migrations,
  expected-version racing, OID identity, durable job behavior, and transport
  parity. `npm audit --json` reported zero vulnerabilities.
- Evidence: [result JSON](../../../proofs/tabular-direct-postgresql-boundary/results.json),
  [experiment journal](../../../proofs/tabular-direct-postgresql-boundary/experiment-journal.md),
  and [production translation](../../../proofs/tabular-direct-postgresql-boundary/production-translation.md).
- Cleanup: the explicitly named container was stopped and removed; no matching
  container remained.
- Limits: deployment, live identity, backup/restore, load, and disaster recovery
  remain target validations.

## Execution Order

1. Direction and Proof contracts accepted for execution — complete.
2. R-003/R-004 and decisions update — complete.
3. P-001 execution, evidence capture, and human review — complete.
4. P-002 on PostgreSQL 18 — complete.
5. Spec result ledgers and Context-promotion review — complete.
6. P-001 acceptance, Context promotion, and Spec Freeze — complete.
7. Direct-library implementation sprint proposal — complete; user review next.

## Results Ledger

| Proof | State | Evidence | Remaining limits |
| --- | --- | --- | --- |
| P-001 | Proved; human accepted | Result JSON, browser ledger, 3 screenshots, guidebook | Live identity/deployment; contained low dev-only advisory |
| P-002 | Proved | Result JSON, journal, production translation | Deployment, backup/restore, load, DR |
