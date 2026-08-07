# Spec 00004: Tabular Stackpress Boilerplate Alignment

Status: **Frozen 2026-08-06.** The user-provided boilerplate proof and the
current-code comparison are recorded. The corrected direct import, one-handler
page files, lazy server-entry registration, and registered-view build strategy
are explicit. Provider projection, removal of `plugins/ui`, and UnoCSS/default
CSS ownership are accepted. The implementation sprint was accepted 2026-08-06
and is in progress: Tasks 00001 through 00004 and the added Task 00006 are
verified, and Task 00005 remains open. Lifecycle and closeout gates remain
mandatory for the remaining work.

This spec preserves the proposed restructuring that makes Tabular resemble the
small, lifecycle-driven Stackpress boilerplate without restoring umbrella
Stackpress, weakening existing production boundaries, or reopening Frozen Spec
00003.

## Files

- [Brief](brief.md): load for the preserved user direction, objective, scope,
  non-goals, proposed target shape, and completion criteria.
- [Status](status.md): load for current planning state, work items, Freeze
  blockers, and the next authority gate.
- [Decisions And Gaps](decisions.md): load for inherited decisions, proposed
  assumptions, and questions that require user, source, or Proof resolution.
- [Research](research.md): load for the completed local structure comparison,
  current findings, remaining source research, and provenance.
- [Proofs](proofs.md): load for the user-provided guide artifact, its evidence
  limits, and the planned Tabular-specific composition Proof.
- [Sprint](tasks/sprint.md) and [Task Status](tasks/status.md): load for the
  accepted wave plan and the authoritative per-task state.

## Authority And Relationship

- [Tabular Context](../../context/index.md) remains the source of Accepted
  Reusable Truth and wins over this Proposed spec.
- [Implementation boundaries](../../context/tabular-implementation-boundaries.md)
  retain the focused-package, application-owned security, PostgreSQL,
  hydration, process, artifact, and release contracts.
- [Frozen Spec 00003](../00003-tabular-direct-stackpress-libraries-architecture/index.md)
  remains the current implementation authority. This new package does not
  rewrite its historical task or Proof records.
- The [Stackpress boilerplate proof](../../../proofs/stackpress-boilerplate/)
  is preserved source-shape guidance. It is not production authority and is
  not evidence that Tabular's security or PostgreSQL boundaries may be removed.

## Current Direction

The intended destination is dedicated environment config, thin lifecycle-driven
scripts, an app plugin that owns Reactus, a typed shared Provider projection,
one lazy default page handler per server entry, one feature view per rendered
route, build-time discovery through `server.views`, manifest-verified production
assets, and route-by-route UnoCSS use. Conventional vendor, Tabulator,
accessibility, or cascade-sensitive exceptions live only in
`public/styles/*.css`. Existing Tabular feature domains adopt the proof's
centered plugin shape, and `plugins/ui` is removed after ownership migration.

## Operating Boundary

- Implement only from the accepted sprint in `tasks/sprint.md`. Work outside it
  needs explicit user authorization, as Task 00006 received.
- Do not add or import umbrella `stackpress`.
- Do not expose raw request headers/bodies, cookies, opaque session identifiers
  or tokens, server config, PostgreSQL credentials, raw errors, or stacks
  through Reactus hydration. Preserve the Provider through the explicit browser
  projection in `decisions.md`.
- Do not use Vite development middleware as a production surface.
- Do not treat PGlite or the boilerplate's ignored `.build` output as
  production PostgreSQL or current artifact evidence.
