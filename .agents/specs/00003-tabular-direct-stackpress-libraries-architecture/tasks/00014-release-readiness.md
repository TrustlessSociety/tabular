# Task 00014: Prove Release Readiness

## Task Summary

Integrate all completed work, close traceability and operational gaps, run the
full technical and UI proof, and assemble the package for one final human review.

Status: `open`; depends on Tasks 00001-00013 passing the Integration gate.

## Implementation Steps

1. Integrate the completed feature plugins without creating a catch-all plugin;
   refactor misplaced code into its owning feature boundary.
2. Audit direct dependency usage: `@stackpress/ingest`, `@stackpress/inquire`,
   `reactus`, and `@stackpress/lib` only, with no umbrella Stackpress,
   Idea, generation lifecycle, or unneeded built-in plugins.
3. Audit Ingest configuration, root bootstrap, `package.json.plugins`, every
   `plugins/*/plugin.ts`, browser-safe imports, and web/migrate/worker entrypoints.
4. Audit feature organization under applicable `plugins/*/components`,
   `events`, `pages`, `views`, and `helpers`; remove empty or dumping directories.
5. Complete requirement, decision, proof, wireframe, task, test, and runtime
   traceability; resolve all accepted-scope gaps or record a true blocker.
6. Finalize migrations, seed/demo fixtures, environment examples, startup and
   shutdown behavior, backup/recovery notes, diagnostics, and operator runbook.
7. Assemble a final review package containing commands, environment, test
   results, browser matrix, screenshots, known limits, and review instructions.

## Verification Steps

1. From a clean state, install, configure, migrate, seed, start web and worker,
   exercise shutdown/restart, and rerun all unit, component, integration,
   contract, harness, accessibility, type, lint, and production-build checks.
2. Run migrations and core database tests on PostgreSQL 18, including pooled
   role cleanup, RLS, DDL authority, crash recovery, and backup/restore smoke.
3. Run multi-instance SSE/outbox load, reconnect, slow-consumer, authorization,
   and worker contention/recovery tests without relying on sticky sessions.
4. Run supported browser and viewport checks, including keyboard-only and
   VoiceOver review for principal workflows.
5. Run repository audits for forbidden dependencies, plugin registration,
   browser/server boundary violations, source organization, secrets, and stale
   task/traceability status.

## Acceptance Steps

1. Start from a clean supported environment and complete the principal journey:
   sign in, browse, create/rename a file, configure columns/relations, edit data,
   format, save a view, reorder rows, import, export, and inspect activity.
2. Use two signed-in sessions to confirm live synchronization, reconnect catch-
   up, permission changes, and user-facing recovery from representative errors.
3. Repeat principal journeys at desktop and 390x844; compare every accepted
   surface with its wireframe for shape, hierarchy, controls, and functionality.
4. Inspect the final source and runtime evidence to confirm Ingest configuration,
   `package.json.plugins`, bootstrap, and feature-owned plugin organization.
5. Confirm the application generally works end to end with no unresolved
   blocker, uncaught runtime error, inaccessible critical path, or silent loss.
6. Record `passed` or `failed` for each item, attach final screenshots and logs,
   and present the review package to the user without marking human acceptance.

## Implementation Notes

Not started. This task closes integration and assembles evidence; it does not
weaken earlier verification or substitute source inspection for browser review.

## Verification Notes

Not run.

## Human Acceptance

None. This task prepares the package; the user performs one separate final spec
review only after all tasks, including this one, are `verified`.

## Agent Acceptance

Pending. The implementing agent must execute every Acceptance Step and record
`passed` or `failed` with the complete final review package.
