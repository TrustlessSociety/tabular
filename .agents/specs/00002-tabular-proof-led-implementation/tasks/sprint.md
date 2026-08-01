# Production Implementation Sprint Proposal

## State

- Spec: `00002-tabular-proof-led-implementation`
- Spec authority: Frozen 2026-08-01
- Implementation plan: `proposed`
- Architecture disposition: superseded by Not-Frozen Spec 00003; do not accept
- Implementation: not started
- Task files and task statuses: create only after the user accepts this plan

This is an ordered production backlog, not a calendar estimate. Team capacity
and review availability are not yet known, so the plan uses dependency gates
instead of invented dates or story points.

## Supersession Notice

The user selected direct `@stackpress/ingest`, `@stackpress/inquire`, `reactus`,
and `@stackpress/lib` composition without Idea or built-in auth/API/session/admin
after this proposal was drafted. [Spec 00003](../../00003-tabular-direct-stackpress-libraries-architecture/index.md)
owns that architecture reset and its required delta Proofs. Preserve this file
as a historical proposal, but do not accept it, create its task files, or
implement its umbrella/Idea-specific tasks. Replace the sprint after Spec 00003
Freezes.

## Goal

Deliver the first production slice of Tabular as a maintainable Stackpress
application: a spreadsheet-friendly web UI over real PostgreSQL tables, with
catalog-driven dynamic objects, native PostgreSQL authority, governed MCP,
values-only import, saved views, and permission-filtered operations.

The two PGlite Proofs are guidebooks and test references. Production code must
not be copied or promoted wholesale from `proofs/`.

## Approval Inputs

Confirm or replace these proposed scaffold and target values when accepting the
plan:

| Input | Proposed value |
| --- | --- |
| App name | `Tabular` |
| Package name | `@trustless/tabular` |
| Brand name | `Tabular` |
| Development port | `3000` |
| Server target | PostgreSQL 18, while retaining PGlite for focused local tests |
| Browser review | Current Chromium and Safari; native VoiceOver on Safari; desktop and 390 x 844 narrow viewport |

Google OAuth sandbox credentials, production hosting/secrets, backup ownership,
and alert destinations may be supplied when their tasks open. Their absence
does not justify weakening or silently simulating the final acceptance claim.

## Sequencing Rules

1. Follow Stackpress phases in order: scaffold, fixed schema, generation,
   runtime/plugin routing, verification, then optional polish.
2. Keep fixed Tabular control records in the generated/fixed lane. Keep dynamic
   user tables and views catalog-driven; never generate a model/client per
   runtime object.
3. Establish identity and PostgreSQL authority before exposing data actions.
4. Keep browser selection and presentation state outside the grid renderer and
   outside canonical PostgreSQL data.
5. Connect each visible slice to the real local capability boundary. Use a
   placeholder only for an external provider, then replace it in the owning
   task before that task can close.
6. Re-run server-target checks before making production claims. PGlite results
   remain local programming evidence only.

## Wave A: Production Foundation

### 00001 - Scaffold The Stackpress Application

- Output: baseline Stackpress app, pinned runtime/toolchain, normal local
  PGlite resource, config-driven sample records where useful, test commands,
  and a reachable health/starter route.
- Ownership: `stackpress-app-scaffold`, coordinated by the app coordinator.
- Verification: clean install; build/type/static checks; app start; expected
  files and resource registration; temporary server cleanup.
- Acceptance criteria: none. A starter page is not a meaningful product review
  artifact.

### 00002 - Define Fixed Control Schema And Generate

- Output: intentional `schema.idea` for fixed Tabular control records only,
  generated stores/clients where appropriate, and an inspected generation diff.
- Coverage: fixed portions of D-002; no dynamic user-table models.
- Ownership: `stackpress-idea-authoring`, normal generation, then coordinator
  inspection.
- Verification: schema validation; generation from a clean state; generated
  output checks; explicit audit that no table-specific runtime model is emitted.
- Acceptance criteria: none. Schema and generated code are verification inputs.

### 00003 - Install The Versioned System Schema And Server Test Harness

- Output: one registered database resource; transactional, idempotent Tabular
  system-schema migrations; separate business-owner and migrator principals;
  PostgreSQL 18 integration harness; deploy-order and rollback fixtures.
- Coverage: D-002, D-012; D-013/D-012 decisions.
- Ownership: route database and migration work through the Stackpress plugin
  router before selecting scaffold/runtime specialists.
- Verification: failed-migration rollback; idempotent re-entry; migration lock;
  connection checkout/reset/release; role cleanup; clean database install.
- Acceptance criteria: none. Results are automated integration evidence.

### 00004 - Implement Identity, Authority, And Authorized Catalog Discovery

- Output: authenticated-user to PostgreSQL-role mapping; deny-default
  capability policy; grants/RLS intersection; caller-filtered discovery;
  stable object identity and drift reconciliation for tables/read-only views.
- Coverage: D-001, D-003, D-005 and the discovery backings for W-001-W-005.
- Verification: allow/deny matrix; forced-RLS and column-grant cases; pool-leak
  checks; rename/drop/replacement drift; two-connection external-DDL races;
  redaction tests.
- Acceptance criteria: none. Authorization and catalog output are validation,
  not a visual artifact.

### 00005 - Build The Transactional Capability And Action Kernel

- Output: one `tabular.capability` ownership boundary; typed page/MCP action
  envelopes; parameterized reads; expected-version edits; persistent drafts;
  atomic range mutation; journal; 100-step session-history contract.
- Coverage: D-006 and data ownership for W-013-W-023.
- Verification: success, invalid, denial, conflict, retry, rollback, batch
  atomicity, authority/version recheck, and redacted-journal tests.
- Acceptance criteria: none. This is the shared domain foundation.

### 00006 - Implement File, Field, Relation, And DDL Lifecycles

- Output: blank-file/table creation; display-name/table-name separation;
  metadata registry; constraints; generated columns; native same-database
  foreign keys; collision-safe hidden JSON storage and promotion; confirmed
  schema actions through the separate migrator.
- Coverage: D-004, D-008 and data ownership for W-008-W-011, W-015-W-018,
  W-023-W-032.
- Verification: identifier collisions; permission denial; constraint and
  relation failures; composite/stable-key cases; forced transactional rollback;
  successful promotion and failed-promotion JSON retention.
- Acceptance criteria: none. Visible file and column behavior is reviewed in
  later browser tasks.

### Foundation Gate

Advance only when Tasks 00001-00006 are verified on a clean local database and
the PostgreSQL-server suite proves migrations, pool cleanup, authority, catalog
reconciliation, and the action kernel. Do not start UI work on fixture-only
domain contracts.

## Wave B: Usable Spreadsheet Surface

### 00007 - Build The Browser Foundation And Grid Adapter

- Output: handwritten view/plugin shell; reusable controls, overlays, panels,
  error surfaces, and responsive layouts; Tabulator 6.5.0 behind a Tabular-owned
  adapter; stable-ID logical selection with vertical virtualization.
- Coverage: W-012-W-014, W-038, W-046, W-053-W-057.
- Ownership: plugin scaffold as needed, then `stackpress-plugin-views`; no
  renderer API may enter domain actions.
- Verification: component tests; 2,697-cell logical selection including an
  unmounted anchor; reset/reorder restoration; ARIA totals/indices; overlay
  clamp and geometry; desktop and narrow browser checks.
- Acceptance criteria: a rendered component/grid review page showing cell,
  range, row, and column selection; mixed/disabled states; overlays; desktop
  and narrow behavior.

### 00008 - Deliver Explorer, File Navigation, Blank File, And Table Settings

- Output: connection/database/schema-folder hierarchy; Files/Views tabs;
  list/grid/search states; authorized New file/Import actions; spreadsheet
  shell; inline rename; blank file; mutually exclusive Table/Column panels.
- Coverage: W-001-W-011 and the discovery surface of D-001/D-007.
- Verification: route and permission tests; list/grid parity; scoped empty
  states; display/table-name separation; no forbidden routes/actions; browser
  console and overflow checks.
- Acceptance criteria: desktop and narrow walkthrough of root, Operations and
  Finance folders, a file, a new `Untitled File`, rename, and Table settings.

### 00009 - Deliver Grid Editing, Validation, Columns, And Relations

- Output: typed edge-to-edge editors; raw/rest formatting; keyboard lifecycle;
  atomic clipboard/clear; undo/redo; incomplete-row drafts; error popovers;
  column configuration; Select and Relation pickers; constraints and Advanced.
- Coverage: W-012-W-032, excluding shared row-order delivery assigned to 00011.
- Verification: editor/formatter matrix; keyboard and focus tests; batch action
  tests; invalid draft and PostgreSQL rejection; stable-key read-only cases;
  settings rollback; relation eligibility and authority checks.
- Acceptance criteria: rendered desktop and narrow editing journeys covering
  every first-slice field, invalid cell/row correction, range action, undo/redo,
  column settings, and a cross-schema relation.

### 00010 - Deliver Menus, Formatting, And Context Actions

- Output: File/Edit/View/Format menus; formatting toolbar and More surface;
  palettes, borders, alignment and wrapping; cell/row/column menus; confirmed
  destructive actions; honest disabled/deferred commands.
- Coverage: W-033-W-046 and presentation portions of W-021/W-025.
- Verification: pointer and keyboard navigation; Shift+F10 target correctness;
  active/mixed/disabled state; focus restoration; action routing; no grid
  reflow, document overflow, silent schema mutation, or deferred leakage.
- Acceptance criteria: rendered command-surface walkthrough at desktop and
  narrow width, including all named popovers, three context-menu targets,
  destructive confirmation, and undoable presentation changes.

### Browser Gate

Tasks 00007-00010 require explicit user acceptance of their rendered artifacts
after automated verification. Acceptance covers visible behavior only; it does
not replace server, authority, or native-assistive-technology evidence.

## Wave C: Persistence, Integrations, And Operations

### 00011 - Deliver Saved Views And Shared Row Order

- Output: current-tab presentation state; private/shared saved views; one
  allowlisted read/export/view compiler; `security_invoker` publication;
  folder/File-menu discovery; compact active-view context; collision-safe
  shared rank and real-time plus queued row-order delivery.
- Coverage: W-025, W-034, W-036-W-042 and D-007.
- Verification: owner/member publication matrix; security-invoker denial;
  query parity; new-tab behavior; idempotent move/rank maintenance; concurrent
  clients; persistence separation among tab/private/shared state.
- Acceptance criteria: a two-session walkthrough showing unsaved presentation,
  private/shared creation and discovery, new-tab opening, authorization denial,
  and shared row-order convergence.

### 00012 - Deliver Values-Only Import And Authorized CSV Export

- Output: three-step CSV/XLSX/Google Sheets import; fingerprints, preview,
  warnings, staging, source recheck, progress, retry/changed-source/abandon,
  one transactional new-table commit; current-result CSV export.
- Coverage: W-047-W-052 and D-009.
- Verification: exact 248-row/6-column fixture; formula cached-value behavior;
  parser/type warnings; idempotency; rollback; file-scale limits; query/export
  parity; Google OAuth/download/revocation sandbox tests.
- Placeholder rule: provider doubles may establish contracts early, but the
  live Google sandbox adapter must replace them before this task is verified.
- Acceptance criteria: desktop and narrow import recovery walkthrough ending
  in the new file, plus a reviewable authorized filtered/sorted CSV result.

### 00013 - Deliver Jobs, Outbox, Real-Time Delivery, And System Activity

- Output: post-commit outbox; safe worker claiming; capped retry; dead letters;
  row-order/import/view/export operation events; permission-filtered activity;
  retry/acknowledgement; administrator-only retention and observability hooks.
- Coverage: D-010 and operational delivery for W-025/W-052.
- Verification: multi-worker contention; crash recovery; deduplication;
  delivery retry; alert/metric/log signals; redaction; retention authorization;
  acknowledgement preserves audit history.
- Acceptance criteria: desktop and narrow System activity walkthrough covering
  active, queued, attention, completed, detail, dead-letter retry,
  acknowledgement, and administrator/non-administrator retention states.

### 00014 - Deliver Governed MCP And Harness Parity

- Output: bounded discovery/read tools; allowlisted structured mutations;
  versioned caller-authorized `get_frontend_contract`; shared capability use
  with independent MCP identity, validation, and output mapping; no raw SQL/DDL.
- Coverage: D-011 and parity for every exposed stateful web action.
- Verification: page/MCP parity matrix; caller filtering; schema-version
  compatibility; invalid/denied/conflict paths; raw SQL/DDL rejection; role
  reset after every MCP transaction.
- Acceptance criteria: none. Contract output and MCP transcripts are
  verification evidence, not a human-reviewable product surface.

### Integration Gate

Advance only when the same caller, authority, query, mutation, job, and recovery
contracts agree across web and MCP, and all external-provider doubles have been
removed or explicitly excluded by the Frozen first-slice scope.

## Wave D: Target Rechecks And Release Readiness

### 00015 - Recheck, Refactor, And Accept The Production Slice

- Output: maintainability pass; dependency/security disposition; full feature
  trace; PostgreSQL 18, pool, identity, concurrency, external-DDL, worker,
  browser, native VoiceOver, deployment, migration, backup, and rollback
  evidence; deployment/operations runbook; final acceptance build.
- Coverage: D-012, W-053-W-058, every retained `W-*`/`D-*` row, and all accepted
  implementation validations F-004-F-007/F-009/F-011/F-014.
- Verification: clean checkout/build; unit/contract/integration/E2E suites;
  fresh database migration and rollback drill; multi-connection race/load
  checks with recorded limits; supported-browser matrix; accessibility tree
  plus native VoiceOver; zero unexpected console errors/warnings or document
  overflow; proof-to-production trace audit.
- Acceptance criteria: the complete first-slice desktop and narrow journeys in
  the production build, including denial, validation, conflict, recovery,
  saved-view, import, activity, and MCP-backed outcomes.

## Rubric Decisions

- Reusable foundation is Tasks 00001-00007.
- No standalone placeholder phase is planned. Static sample data is
  config-driven; external provider doubles live only inside Task 00012 and are
  replaced there.
- Reusable technical units and layouts are separated in Tasks 00007-00008;
  domain workflows and primary outputs follow in Tasks 00009-00014.
- Real persistence is not postponed behind a fake backend. Browser slices use
  the verified capability and database foundation from Wave A.
- Refactoring is continuous at every gate and receives a final cross-boundary
  pass in Task 00015.
- Optional G-013 refinements remain out of scope: persisted explorer view
  preference, explorer sorting, high-volume Views filtering, combined New,
  separate table-rename migration UI, and acknowledged-only filtering.

## Plan Acceptance And Next Step

If the user accepts this proposal, update implementation status to `accepted`,
create `tasks/status.md`, and create exactly fifteen stable task files for
00001-00015 with status `open`. Implementation then begins at Task 00001 only.
No scaffold, generated code, migration, or production task should start merely
because this proposal exists.
