# Brief

## Preserved User Goal

> can we create a new implementation spec based on the last spec? I want to
> make proofs for every feature represented in the wireframes. Until we know
> exactly how to develop this app, I want to use proofs to allow you to
> experiment and discover if that makes sense. Proofs should be treated as like
> a coding guide book to implementing the difficult parts of this project that
> can't be inferred as a whole. I want you to use PGLite for both the proofs.
> Once the proofs are done, do a gap check.

## Objective

Produce two executable, PGlite-backed implementation guidebooks that discover
how Tabular's approved experience and difficult PostgreSQL-native behavior fit
together. Use their evidence to perform a complete feature and architecture gap
check before any production implementation plan is Frozen.

The Proofs are allowed to try, discard, compare, and document implementation
approaches. Their job is to make hard boundaries understandable through small
working examples, tests, visible states, and explicit production-translation
notes. They are not a hidden first version of the product.

## Accepted Inputs

1. The current `.agents/context/` Tabular product and creative contracts.
2. The approved r001-r007 wireframe lineage as reconstructed in Context,
   through r007 Round 2.
3. Existing root `proofs/` utilities and Spec 00001 evidence when useful as
   prior experiment infrastructure, not as production architecture.
4. The Frozen Spec 00001 discovery handoff only for provenance that has not
   been copied into this spec; Context wins on shared truth.

## Scope

- Inventory every current feature or deliberately unavailable state represented
  by the approved wireframes and assign it a stable coverage ID.
- Build one integrated browser/interaction Proof that demonstrates those
  features with real PGlite-backed state and human-reviewable desktop and narrow
  workflows.
- Build one Stackpress/data Proof that demonstrates the difficult application,
  database, authority, concurrency, import/export, jobs, and MCP patterns needed
  to back the visible experience.
- Make both Proofs guidebook-quality: runnable examples, focused tests,
  architecture notes, decisions tried, failure cases, limitations, and a map
  from prototype boundaries to eventual production responsibilities.
- Reuse or refactor the existing PGlite Proof harness only where doing so keeps
  Spec 00001 evidence reproducible and makes Spec 00002 ownership explicit.
- Run a final coverage, interaction-to-domain, Stackpress ownership, PostgreSQL
  translation, security, accessibility, operations, and delivery gap check.
- Feed every unresolved result back into `decisions.md`, `proofs.md`, and
  `gap-check.md` before Freeze.

## Non-Goals

- Production scaffolding, schema generation, deployable migrations, or a
  production database.
- Treating PGlite as proof of PostgreSQL server connection pools, role reset,
  network authentication, multi-process concurrency, external DDL races,
  backup/restore, or deployment behavior.
- Pixel-perfect reimplementation of the wireframe artifact or copying its
  source into the Proofs.
- Reopening or editing Frozen Spec 00001.
- Implementing deferred formulas, rich content/attachments, non-CSV export,
  public APIs, webhooks, automation, plugins/marketplace, public sharing,
  frontend generation/delivery, Qdrant, or cross-database relations.
- Selecting final app/package/brand/port scaffold values before they are needed.
- Freezing a production implementation sequence before the final gap check.

## Proof Guidebook Contract

Each Proof must provide:

1. a concise `README.md` that names the questions, boundaries, and run commands;
2. chapter-level examples aligned to the feature matrix;
3. the smallest useful PGlite schema and fixtures for each example;
4. automated success and failure-path checks;
5. browser review artifacts for visible behavior;
6. an experiment journal recording approaches kept, changed, or rejected;
7. a production translation section naming what can be reused conceptually,
   what must be replaced, and what remains unproved; and
8. a machine-readable evidence summary that the final gap check can audit.

Source inspection, test output, and JSON evidence are verification. The
browser Proof also requires human-reviewable rendered workflows; it cannot be
declared complete from source-only checks.

## Completion Criteria

- Every feature-matrix row has fresh evidence from one or both Proofs and no
  sub-item is silently omitted.
- Both Proofs use PGlite and state their runtime/version limitations.
- Both Proofs meet their expected signals or record an accepted fallback,
  deliberate deferral, or explicit unresolved result.
- The browser Proof has desktop and narrow review artifacts plus accessibility
  evidence for the represented keyboard/focus behavior.
- The Stackpress/data Proof demonstrates shared capability ownership rather
  than generating a model/client per runtime table.
- The post-Proof gap check is complete and classifies every finding.
- Material reusable discoveries receive a Context-promotion review.
- The spec has no unresolved Freeze blocker or conflict with Context.
- Production implementation remains unstarted until a later accepted task plan.
