# Spec 00003: Tabular Direct Stackpress Libraries Architecture

Status: **Frozen 2026-08-01; Task 00014 latest corrective pass verified 2026-08-04.** Research is
complete, both architecture Proofs passed, P-001 received human acceptance, and
reusable architecture truth is in Context. The replacement sprint is accepted;
Task 00014 is agent-verified after correcting sparse drafts, exact partial-row
validation, retained invalid-value tokens, and stale launch/browser gates. Final
human review is available; acceptance remains pending.

This spec is the architecture reset for Tabular's production implementation.
It composes the focused Stackpress repositories directly and removes the
umbrella application's Idea and built-in feature assumptions without changing
the accepted product or visible-behavior contracts.

## Files

- [Brief](brief.md): load for the preserved user direction, scope, non-goals,
  package identities, and completion criteria.
- [Status](status.md): load for Freeze readiness, blockers, and the next
  authority gate.
- [Decisions And Gaps](decisions.md): load for accepted ownership decisions and
  the questions research or Proofs must still answer.
- [Research](research.md): load for completed package, security, topology, and
  PostgreSQL-source findings.
- [Proofs](proofs.md): load for the two required delta Proof contracts and their
  completed result ledger plus remaining evidence limits.
- [Accepted Sprint](tasks/sprint.md): load for the gated direct-library
  implementation sequence and task-level verification/acceptance rules.
- [Task Status](tasks/status.md): load for verified Tasks 00001-00014, wave
  gates, and the pending final human-review contract.
- [Implementation Traceability](tasks/traceability.md): load for requirement,
  decision, proof, wireframe, task, test, runtime, and evidence mapping.

## Authority And Relationship

- The [Tabular product contract](../../context/tabular-product-contract.md) and
  current creative Context Files remain authoritative and unchanged.
- The [implementation boundaries](../../context/tabular-implementation-boundaries.md)
  now contain this spec's promoted direct-library, handwritten data-layer,
  security, hydration, PostgreSQL, and process boundaries.
- Frozen Spec 00002 and its Proof artifacts remain historical evidence. Their
  portable PostgreSQL, browser, capability, and data-contract findings may be
  cited, but their umbrella Stackpress lifecycle, Idea, generated-store, and
  plugin-ownership conclusions do not prove this architecture.
- The proposed Spec 00002 sprint is historical and not implementation authority.
  The accepted Spec 00003 task tracker and detail files are current authority.

## Direct Package Set

| Responsibility | Selected package or owner |
| --- | --- |
| HTTP/WHATWG server, routing, middleware, deployment wiring | `@stackpress/ingest` |
| SQL builders and transaction-facing engine | `@stackpress/inquire` |
| Local Proof adapter | `@stackpress/inquire-pglite` plus PGlite |
| Production PostgreSQL adapter | `@stackpress/inquire-pg` plus `pg` |
| TSX rendering, hydration, assets, development/build/serve | `reactus` |
| Events, request/response types, queues, and low-level utilities | `@stackpress/lib` |
| Identity, durable session, CSRF, authorization adapters | Tabular/application owned |
| Migrations, repositories, safe identifiers, jobs/outbox, web/MCP/admin | Tabular/application owned |

These are separate packages that depend on `@stackpress/lib`; Ingest, Inquire,
and Reactus are not bundled inside `@stackpress/lib`.

## Operating Boundary

- Do not install or import the umbrella `stackpress` package.
- Do not add `schema.idea`, Idea generation, or generated stores/clients.
- Do not add Stackpress built-in auth, API, session, or admin features.
- Do not treat `@stackpress/lib` Session or in-memory queues as authenticated,
  durable, or production-operational infrastructure.
- Do not revise the product/creative Context to fit a framework preference.
- Follow `tasks/status.md` in stable order. No task may start before its
  dependency gate; per-task human acceptance is intentionally `none`.
