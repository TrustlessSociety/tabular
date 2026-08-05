# Decisions And Gaps

## Accepted Direction Decisions

### D-001: Compose focused packages directly

Use `@stackpress/ingest`, `@stackpress/inquire`,
`@stackpress/inquire-pglite`, `@stackpress/inquire-pg`, `reactus`, and
`@stackpress/lib` directly. Do not install or import the umbrella `stackpress`
package.

Evidence: explicit user direction; current package manifests inspected on
2026-08-01.

### D-002: Remove the Idea and generation lane

Do not create `schema.idea`, generated fixed stores, generated clients, or
per-runtime-table models. Fixed `tabular.*` control records use versioned SQL
migrations, handwritten TypeScript contracts, and handwritten repositories.
Dynamic PostgreSQL tables and views remain catalog-driven.

This selects the non-generated option permitted by current Context; it does not
change PostgreSQL's canonical ownership.

### D-003: Give each focused package one narrow responsibility

| Boundary | Owner |
| --- | --- |
| HTTP/WHATWG request lifecycle and routes | Ingest |
| React document render, hydration, assets, development/build/serve | Reactus |
| SQL construction and adapter transactions | Inquire |
| Low-level events and utility primitives | lib |
| Domain capability and action envelopes | Tabular application |
| PostgreSQL authority and canonical data | PostgreSQL |

No package boundary may silently grant authorization or absorb a domain rule.

### D-004: Keep security application-owned

Do not use Stackpress built-in auth or session. A Tabular-owned adapter must map
an authenticated external identity to a request principal and effective
PostgreSQL role, enforce durable session and CSRF rules, and perform deny-default
checks before PostgreSQL applies final grants/RLS/constraint authority.

The request/session types in lib are transport primitives, not proof of signed,
persistent, revocable authentication.

### D-005: Keep migrations and repositories application-owned

Inquire supplies SQL builders, dialects, adapters, raw SQL, and transaction
mechanics. Tabular owns migration history and locks, safe dynamic identifiers,
catalog reconciliation, handwritten repositories, schema drift, and separate
caller versus migrator roles.

### D-006: Separate in-process events from durable operations

Use lib events to decouple modules within one process. Do not use lib's
in-memory queues as the durable job/outbox system. Canonical jobs, retries, dead
letters, and post-commit delivery remain PostgreSQL-backed and worker-owned.

### D-007: Handwrite product surfaces

Build web routes, internal structured endpoints, governed MCP adapters, System
activity, and administrator-only controls as Tabular-owned handlers and Reactus
views. Do not add Stackpress built-in API or admin packages. Public API remains
outside the accepted first slice.

### D-008: Preserve Proof provenance honestly

Spec 00002 P-001 remains portable browser/interaction evidence. P-002's
catalog, PostgreSQL-authority, migration semantics, drafts, jobs/outbox, and
action-envelope findings remain prior conceptual evidence. Its umbrella
Stackpress lifecycle, Idea/generated-store, plugin ownership, and
`stackpress/pglite` integration are not evidence for the direct composition.

Do not edit the old Proofs to make them appear to have tested new packages.

### D-009: Gate the implementation sprint behind this spec

The Spec 00002 sprint stays `proposed` and is superseded in architecture. Retain
it only as a reviewable historical proposal. The Spec 00003 direct-library
sprint replaces it; task files and production code still wait for plan acceptance.

## Resolved Gap Ledger

### G-001: What exact dependency and version contract should Freeze?

- Status: Answered by P-001.
- Decision: exact direct pins and lockfile are mandatory. The proved graph uses
  Stackpress 0.10.8 siblings, PGlite 0.3.15, React 19.2.4, Reactus 0.10.8, and
  Vite 7.3.6 without umbrella `stackpress` or Idea.
- Remaining risk: one contained low `esbuild` dev-server advisory remains; do
  not expose Vite development serving and re-audit during implementation.

### G-002: How do Ingest and Reactus compose end to end?

- Status: Answered by P-001.
- Decision: an explicit Node HTTP bootstrap owns Ingest routes, Reactus built
  page/client/assets, request mapping, errors, readiness, and resource cleanup.
- Constraint: Reactus hydration props carry allowlisted shell values only;
  mutable user/database strings use authenticated JSON actions.

### G-003: What is the identity, session, and CSRF contract?

- Status: Provider-neutral boundary answered by R-003/P-001; the first-slice
  human target was later closed by Task 00014 and G-011 with PostgreSQL-native
  sign-in. A third-party provider is a future option, not a release blocker.
- Decision: verify an existing safe PostgreSQL `LOGIN` role through a
  short-lived connection, bind its live database/role identities to the
  application identity, and use opaque rotated server-side sessions, expiry,
  idle/revocation state, production-secure cookies, exact origin, and a
  session-bound synchronizer token. A future provider maps into this boundary;
  neither a cookie nor a provider claim grants a database role.

### G-004: Does the handwritten data layer retain migration guarantees?

- Status: Answered by P-001 and P-002.
- Decision: Tabular-owned migrations keep DDL and version rows in one
  transaction, serialize PostgreSQL application with an advisory transaction
  lock, and use handwritten repositories. Failed DDL leaves no version or
  partial column; no Idea replacement is required.

### G-005: Does the production adapter preserve caller authority safely?

- Status: Answered by P-002 on PostgreSQL 18.4.
- Decision: one checked-out client owns each role-scoped transaction. Set only
  an allowlisted role and settings with transaction-local scope; roll back on
  failure, reset and verify state before release, and destroy on cleanup failure.
  Expected-version conflicts, cancellation recovery, RLS, and OID identity were
  exercised across real connections.

### G-006: What is the production process topology?

- Status: Answered by R-004 and P-001/P-002.
- Decision: first target is Node HTTP. Package Reactus built outputs; run a
  one-shot elevated migrator before traffic; run web and durable workers as
  separate observable entrypoints with separate pools and bounded shutdown.
  Hosting, sizing, live cancellation, backup/restore, and load remain target
  validations rather than Freeze blockers.

### G-007: How are custom web, MCP, and admin adapters kept consistent?

- Status: Answered by D-003/D-007 and proved at the capability seam.
- Decision: share typed actions and the Tabular capability, but keep independent
  identity, validation, response mapping, and transport policy per surface.

### G-008: Which prior evidence can be reused?

- Status: Answered by D-008 and the fresh Proofs.
- Decision: reuse portable semantics only; direct package imports, lifecycle,
  Reactus delivery, Inquire adapters, sessions, migrations, pools, and workers
  now have separate evidence and provenance.

### G-009: When should Context change?

- Status: Answered and promoted 2026-08-01.
- Decision: reusable direct composition, session/CSRF, hydration, PostgreSQL,
  migration, and worker boundaries are in Context. Proof fixtures remain local.

### G-010: When should the sprint be replaced?

- Status: Answered and executed after Freeze.
- Decision: `tasks/sprint.md` is the replacement proposal. The old proposal is
  historical; neither proposal becomes task authority until the new one is accepted.

### G-011: Which post-Freeze implementation corrections change Context?

- Status: Answered by explicit user review and verified Tasks 00014 and
  00014A-00014J; promoted by 2026-08-05.
- Decision: promote the PostgreSQL-native sign-in and fresh-acceptance boundary,
  reachable named-file lifecycle, blur autosave, stable sparse drafts, distinct
  selection/focus behavior, neutral Price display, target-aware commands,
  direct blank row/column insertion, blank-only deletion, visible-menu cleanup,
  row-1 coordinate contract, production iconography, compact formatting
  popover hierarchy, exact shared color palettes, and the single-open Border
  accordion, with no deferred Conditional formatting row in background/fill
  palettes. Render every selected Border style distinctly, and retain
  deduplicated custom colors across all three palettes for the current page
  session only. Keep exact pointer-drag completion evidence, task
  sequencing, test counts, screenshots, credentials, and disposable setup
  details spec-local; only final implementation acceptance remains open.
