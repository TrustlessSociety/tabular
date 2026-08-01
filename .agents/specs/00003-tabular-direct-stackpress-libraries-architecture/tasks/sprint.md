# Direct-Library Production Sprint Plan

## State And Goal

- Spec: `00003-tabular-direct-stackpress-libraries-architecture`
- Spec authority: Frozen 2026-08-01
- Implementation plan: `accepted` 2026-08-01
- Implementation: not started; fourteen task files are open

Deliver Tabular's first production slice as a maintainable PostgreSQL-native spreadsheet
application using focused Stackpress libraries. This is an ordered backlog, not a calendar estimate.

## Accepted Inputs

| Input | Accepted value |
| --- | --- |
| App/package/brand | `Tabular` / `@trustless/tabular` / `Tabular` |
| Local web port | `3000` |
| Server/database | Node HTTP with Ingest plugins/bootstrap; PostgreSQL 18 |
| Focused local tests | PGlite through `@stackpress/inquire-pglite` |
| Committed synchronization | Authenticated SSE; HTTP actions for mutations |
| Browser targets | Current Chromium and Safari; 390 x 844; native VoiceOver/Safari |

Live identity, Google sandbox credentials, hosting/secrets, backup owner, and alerts are later inputs.
Missing inputs may block their task; they never authorize a simulated production claim.

## Sequencing Rules

1. Use direct Ingest, Inquire, Reactus, and lib composition. Register feature
   `plugins/*/plugin.ts` through `package.json.plugins` and `server.bootstrap()`;
   omit umbrella Stackpress, `schema.idea`, generation, and built-in features.
2. Establish migrations, repositories, identity, PostgreSQL authority, and the
   action kernel before product UI depends on them.
3. UI tasks use the real local capability/database boundary. Provider doubles
   stay inside their owning task and must be replaced before its final claim.
4. Committed synchronization uses durable journal/outbox cursors and authorized
   SSE. PostgreSQL `LISTEN/NOTIFY` is a wake-up hint only; reconnect uses
   `Last-Event-ID` replay or an authorized snapshot refresh when replay has a gap.
5. Every gate reruns relevant P-001/P-002 regressions plus production tests;
   PGlite and PostgreSQL evidence remain separately labeled.
6. Keep implementation, verification, and acceptance steps distinct. The agent
   runs applicable UI acceptance; per-task human acceptance is always `none`.

## Wave A: Direct Production Foundation

### 00001 - Initialize The Direct-Library Application

- Output: root config/bootstrap; exact pins; Ingest plugin registry and feature
  folder contract; web/migrate/worker entrypoints; Reactus build/serve assets;
  health/readiness, errors, signals, and bounded shutdown.
- Verification: clean install/build/type/test/start/stop; artifact manifest;
  dependency audit; negative audit for umbrella `stackpress`, Idea, and built-ins.
- Acceptance steps: none; a starter route is not product UI.

### 00002 - Install The Handwritten PostgreSQL Data Foundation

- Output: system schema, ordered SQL migrations, advisory locking, handwritten
  contracts/repositories, safe identifiers, separate migrator/caller roles,
  PostgreSQL pools, PGlite unit harness, and PostgreSQL 18 integration harness.
- Verification: clean install, idempotency, failed-DDL rollback, pool reset and
  destruction, concurrent migrators/writers, catalog OID rename/replacement.
- Acceptance steps: none; results are integration evidence.

### 00003 - Implement Identity, Sessions, Authority, And Catalog Discovery

- Output: provider adapter; subject normalization; server-side session rotation,
  expiry/revocation and CSRF; role resolution; deny-default capability policy;
  grants/RLS intersection; caller-filtered table/read-only-view catalog.
- Verification: authentication and allow/deny matrices; cookie/origin/CSRF tests;
  logout/remap; forced RLS/column grants; drift/race/redaction and pool-leak tests.
- Acceptance steps: none; security output is validation.

### 00004 - Build The Capability, Draft, And Action Kernel

- Output: `tabular.capability`; typed web/MCP actions; parameterized reads;
  expected-version edits; persistent drafts; atomic range mutations; journal;
  bounded current-session undo/redo.
- Verification: success, invalid, denial, conflict, retry, rollback, batch
  atomicity, authority/version recheck, history isolation, and redaction.
- Acceptance steps: none; this is shared domain infrastructure.

### 00005 - Implement File, Column, Relation, And DDL Lifecycles

- Output: blank table/file creation; display/physical-name separation; metadata;
  constraints/generated columns; native foreign keys; collision-safe hidden JSON
  and rank fields; confirmed owner actions through the migrator boundary.
- Verification: identifier collisions; permission/constraint/relation failures;
  stable/composite-key cases; promotion rollback and JSON retention.
- Acceptance steps: none; visible behavior is reviewed in later UI tasks.

Foundation gate: Tasks 00001-00005 must be verified on a clean PostgreSQL 18
database before feature UI begins.

## Wave B: Usable Reactus Spreadsheet

### 00006 - Build The Reactus UI Foundation And Grid Adapter

- Output: accessible shell, reusable controls/overlays/panels/error states,
  responsive layouts, and Tabulator 6.5.0 behind stable-ID logical selection.
- Verification: component/adapter tests; virtualization restoration; ARIA
  totals/indices; overlay geometry; desktop/narrow browser and console checks.
- Acceptance steps: agent loads the component/grid review at desktop and 390 x 844.

### 00007 - Deliver Explorer, Navigation, Blank File, And Table Settings

- Output: connection/database/schema-folder hierarchy; Files/Views discovery;
  search/list/grid states; authorized New/Import; spreadsheet shell; rename;
  blank file and mutually exclusive Table/Column panels.
- Verification: route/permission tests, state parity, names, empty states,
  browser console and overflow checks.
- Acceptance steps: agent runs the desktop/narrow explorer-to-file walkthrough.

### 00008 - Deliver Grid Editing, Validation, Columns, And Relations

- Output: typed editors/formatters; keyboard lifecycle; clipboard/clear;
  undo/redo; drafts/errors; column settings; Select/Relation; constraints and
  Advanced PostgreSQL controls.
- Verification: editor matrix, focus/keyboard/batch tests, PostgreSQL rejection,
  stable-key states, settings rollback, and relation authority.
- Acceptance steps: agent runs desktop/narrow editing and correction journeys covering
  every first-slice field plus a cross-schema relation.

### 00009 - Deliver Menus, Formatting, And Context Actions

- Output: File/Edit/View/Format, toolbar/More, presentation controls, target-aware
  cell/row/column menus, confirmations, and honest disabled/deferred commands.
- Verification: pointer/keyboard/Shift+F10, mixed/disabled state, focus restore,
  action routing, no grid reflow, overflow, or silent schema mutation.
- Acceptance steps: agent runs the desktop/narrow command-surface walkthrough.

Browser gate: the agent executes and records Tasks 00006-00009 acceptance steps
without a human pause; UI acceptance never replaces database/security proof.

## Wave C: Persistence, Integrations, And Operations

### 00010 - Deliver Committed SSE Sync, Saved Views, And Shared Row Order

- Output: authenticated same-origin SSE with scoped subscriptions, event cursor,
  heartbeat, replay, snapshot fallback, and slow-client policy; durable committed
  record/schema/presentation events; saved views and convergent shared row order.
- Verification: snapshot/subscribe race; authorization and session revocation;
  `Last-Event-ID`, disconnect/reconnect, gap refresh, multi-instance wake-up,
  ordering, idempotency, backpressure, proxy buffering, and idle timeouts.
- Acceptance steps: agent runs a two-session edit/view/row-order walkthrough including
  disconnect, missed changes, reconnect, and convergence.

### 00011 - Deliver Values-Only Import And Authorized CSV Export

- Output: CSV/XLSX/Google preview, warnings, staging, fingerprint/recheck,
  transactional new-table commit, recovery, and current-result CSV export.
- Verification: exact-value/formula-cache fixtures; limits; idempotency; rollback;
  query/export parity; live Google sandbox authorization/revocation.
- Acceptance steps: agent runs a desktop/narrow recovery walkthrough and checks the CSV.

### 00012 - Deliver Durable Workers And System Activity

- Output: post-commit outbox; `SKIP LOCKED` claiming; leases; bounded retry/dead letters;
  filtered activity; admin retention; publication through Task 00010's SSE channel only.
- Verification: multi-worker contention/crash/reclaim/idempotency; redaction; metrics/logs/alerts;
  retention authorization; SSE replay and duplicate suppression.
- Acceptance steps: agent runs the desktop/narrow activity and recovery walkthrough.

### 00013 - Deliver Governed MCP And Harness Parity

- Output: bounded discovery/read tools, allowlisted actions, versioned frontend
  contract, independent MCP identity/validation/output, and no raw SQL/DDL.
- Verification: web/MCP parity, caller filtering, version compatibility,
  invalid/denied/conflict paths, SQL/DDL rejection, and role cleanup.
- Acceptance steps: none; contract tests and transcripts are validation.

Integration gate: web, MCP, jobs, imports, and recovery must share authority and
domain outcomes without sharing transport policy or unaccepted provider doubles.

## Wave D: Release Readiness

### 00014 - Refactor, Recheck, And Accept The Production Slice

- Output: maintainability pass; feature/context trace; dependency disposition;
  deployment/operations runbook; production-target identity, browser, native AT,
  load, migration, backup, rollback, and recovery evidence; acceptance build.
- Verification: clean checkout/build; full unit/contract/integration/E2E suites;
  migration/rollback; races/load; SSE concurrency/reconnect storm/proxy checks;
  browser/native VoiceOver; zero unexpected console errors/warnings or overflow.
- Acceptance steps: agent runs complete desktop/narrow first-slice journeys including
  denial, validation, conflict, recovery, views, import, activity, and MCP-backed
  outcomes.

## Rubric Decisions And Next Gate

- Tasks 00001-00006 form the reusable foundation; 00006 also begins visual UI.
- No standalone placeholder layer exists. Identity/Google doubles are confined
  to their owning task and cannot satisfy live-target verification.
- Real persistence precedes UI; refactoring is continuous and closes in 00014.
- Applicable verification and agent acceptance advance each gate; per-task human
  acceptance is none, and temporary runtimes are cleaned up.
- WebSockets are deferred until accepted scope needs bidirectional presence,
  live cursors, typing, or similarly high-frequency client messages.

The tracker and fourteen task files are implementation authority; begin with Task 00001 only.
