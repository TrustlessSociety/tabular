# Brief

## Preserved User Direction

> Oh instead of directly using stackpress, I would like to use:
>
> - stackpress/ingest
> - stackpress/inquire
> - stackpress/reactus
> - stackpress/lib
>
> These are all included in stackpress lib, but based on the specs, i find no
> need for idea, and the builtin: auth, api, session, admin.

The user accepted the recommendation to create a new spec for this architecture
instead of rewriting Frozen Spec 00002 and its Proofs.

## Objective

Define and prove the smallest maintainable Tabular production architecture
using the focused Stackpress packages directly. Preserve all accepted Tabular
product, PostgreSQL-authority, browser, import/export, operations, and governed
MCP behavior while replacing umbrella lifecycle, Idea generation, and built-in
feature ownership with explicit application composition.

## Package Identity Correction

The GitHub repositories map to these installable packages:

- `stackpress/ingest` -> `@stackpress/ingest`
- `stackpress/inquire` -> `@stackpress/inquire`, plus
  `@stackpress/inquire-pglite` and `@stackpress/inquire-pg`
- `stackpress/reactus` -> `reactus`
- `stackpress/lib` -> `@stackpress/lib`

Ingest, Inquire, and Reactus depend on `@stackpress/lib`; they are not exports
or bundled modules of `@stackpress/lib`. The proof and production dependency
manifests must reflect those actual package identities.

## Scope

- Pin and compose the direct package set without the umbrella `stackpress`
  dependency.
- Define the Ingest request/route lifecycle and Reactus render, asset, hydration,
  development, build, and serve lifecycle.
- Use Inquire plus its PGlite/PostgreSQL adapters for parameterized SQL and
  transactions while keeping repositories, safe dynamic identifiers, catalog
  reconciliation, and migration history Tabular-owned.
- Replace `schema.idea` and generated fixed stores with versioned SQL migrations,
  handwritten TypeScript types, repositories, and focused contract tests.
- Define application-owned identity, durable session, CSRF, deny-default
  capability, and effective PostgreSQL-role boundaries without Stackpress
  built-in auth/session.
- Define handwritten web, governed MCP, System activity/admin, and internal API
  surfaces without Stackpress built-in API/admin.
- Preserve PostgreSQL-backed jobs/outbox and explicit worker ownership; use lib
  events only for in-process composition.
- Classify which Spec 00002 findings remain portable and which require fresh
  evidence.
- Execute one direct-composition Proof and one production PostgreSQL-boundary
  Proof before Freeze.
- Replace the proposed Spec 00002 sprint only after this architecture Freezes.

## Non-Goals

- Changing the accepted Tabular product, wireframe behavior, terminology, or
  first-slice feature scope.
- Reopening or editing the Frozen research and proof conclusions in Specs 00001
  and 00002 as though they had originally used this architecture.
- Adding Idea, generated domain stores, or a generated client for fixed or
  runtime-created tables.
- Adding the umbrella Stackpress auth, API, session, admin, or plugin suite.
- Selecting a final identity provider, hosting platform, secrets system, or
  observability vendor without a separate user decision when the choice affects
  product or operations scope.
- Treating PGlite, in-memory lib queues, source inspection, or a single process
  as production PostgreSQL/worker proof.
- Creating production scaffold, migrations, task files, or application code
  before this spec Freezes and its replacement sprint is accepted.

## Completion Criteria

- Exact direct dependencies, versions, peer dependencies, and import surfaces
  are documented and exercised without `stackpress` or Idea.
- One runnable composition shows Ingest request handling, application identity
  and CSRF gates, a shared capability, Inquire/PGlite transaction work, Reactus
  rendering, assets/hydration, and a browser action end to end.
- A PostgreSQL 18 Proof covers pool checkout/reset/release, effective-role
  cleanup, transactional migration history, two-connection races, external DDL
  reconciliation, and worker claiming without relabeling PGlite evidence.
- Authenticated identity, durable session, CSRF, migration, worker, API, MCP,
  and administrator ownership is explicit even where a provider choice is
  deliberately deferred.
- Every material Gap is accepted, answered, deferred, or explicitly unresolved
  with user approval.
- Portable Spec 00002 findings and invalidated architecture-specific findings
  are clearly separated.
- Accepted reusable boundaries receive a Context-promotion review.
- A replacement sprint is proposed from this Frozen architecture; the stale
  umbrella/Idea sprint is never accepted by accident.
