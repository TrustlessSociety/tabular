# Task 00014: Prove Release Readiness

## Task Summary

Integrate all completed work, close traceability and operational gaps, run the
full technical and UI proof, and assemble the package for one final human review.

Status: `verified`; later final-review corrections are tracked by required side
quests 00014A through 00014J in `tasks/status.md`. All ten side quests are
verified; final human acceptance remains pending. Depends on Tasks 00001-00013.

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
8. Replace the missing authentication entry with PostgreSQL-native sign-in:
   authenticate an existing safe PostgreSQL `LOGIN` role through an ordinary
   short-lived PostgreSQL connection, never read or retain its password hash,
   bind the verified database/role OIDs to the application identity, resolve
   only live PostgreSQL memberships/roles the web authority may safely assume,
   and issue the existing durable PostgreSQL-backed browser session.
9. Add the complete human authentication surface: signed-out login page,
   generic failure handling and bounded attempt protection, exact-origin login,
   session resume/rotation, visible signed-in identity, and working sign-out.
   PostgreSQL administrators remain the user registry and account lifecycle
   owner; do not add an application-owned password registry or self-sign-up.
10. Add one supported local acceptance workflow that provisions an explicitly
    disposable PostgreSQL 18 database, web/migrator/worker authorities, a safe
    human `LOGIN` role and grants, migrations, representative Operations and
    Finance data/metadata, then starts web, worker, and continuous DDL migrator
    processes with bounded cleanup. Make the normal command and required
    credentials obvious to a human reviewer and refuse retained/non-loopback
    targets for destructive setup/reset behavior.
11. Replace developer and review-only runtime shortcuts: remove hard-coded
    `Acme Inc.` connection identity, fake Explorer counts/timestamps, review-row
    fallbacks for unknown files, and any production import of review fixtures.
    Derive visible connection/database identity and all product data from the
    configured PostgreSQL target or explicit Tabular metadata; unknown routes
    fail closed.
12. Make browser acceptance a fresh executable release command. It must begin
    at the normal signed-out application origin, submit PostgreSQL credentials
    through the real login UI, and complete the principal journey without
    `TestIdentityProvider`, `__acceptance`, direct service calls, injected
    cookies, or pre-existing browser evidence. Keep fault-injection controls
    separate from login and product navigation.
13. Regenerate the final review package only after the corrected clean setup,
    normal login, principal journey, two-session, responsive, Safari/VoiceOver,
    restart, and release gates pass. Mark the 2026-08-02 review package and
    browser/native ledgers as historical evidence, not current acceptance proof.
14. Correct the reachable blank-file workflow: ask for a display name and show
    the inferred PostgreSQL relation name, create a hidden durable row identity,
    render an immediately editable blank spreadsheet, let the first header and
    row create durable schema/data, rename the physical PostgreSQL relation
    without another confirmation dialog, and never report reconnecting when
    live synchronization cannot start.
15. Correct the first live-table entry path: preserve and directly revalidate a
    retained row when the PostgreSQL schema changes, project field-specific
    server errors instead of generic cell failures, support immediate header
    drag/drop with session-stable column order, keep WYSIWYG presentation tools
    active during a retained draft, and render Price as a currency-neutral
    comma-grouped number with exactly two decimal places.
16. Correct later updates on generated-hidden-key tables by keeping the hidden
    stable row identity in the locked PostgreSQL update projection; make custom
    column drag/drop own both before/after directions without a competing grid
    mover; make named header clicks visibly select the whole column and enable
    the existing presentation controls.
17. Remove the manual draft/Commit guardrail for valid edits and save changed
    cells automatically on blur through the existing durable PostgreSQL action
    boundary. Keep only invalid values as recoverable retained drafts. Model
    body-cell, named-header, and whole-column selection separately, project the
    spreadsheet axis highlights without stray selected cells, and let the
    WYSIWYG controls apply specifically to a selected named header.
18. Keep values beneath unnamed coordinates unstructured: create stable blank-
    display Tabular column metadata, store values in the owner-installed hidden
    JSON column, and never infer a visible or physical field name. Persist an
    incomplete logical row as a draft carrying the hidden shared-row rank so a
    skipped position survives reload without inserting empty PostgreSQL rows.

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
6. Prove PostgreSQL-native login success and generic denial for wrong password,
   absent/disabled/unsafe roles, OID replacement, lost membership, missing
   `SET` authority, malformed bodies, untrusted origins, and bounded repeated
   attempts. Prove the submitted password is never stored, logged, serialized,
   placed in a cookie, or retained after the authentication connection closes.
7. Prove the verified PostgreSQL identity can establish, resume, rotate, and
   revoke the existing durable browser session, and that logout clears both
   server state and the browser cookie. Rerun role/RLS/CSRF/session regressions.
8. From a clean checkout, run the documented local setup and start commands
   exactly as a human would. Verify readiness, login, representative seeded
   content, web/worker/migrator execution, restart, and bounded shutdown without
   importing test or `output/` modules. The supported development command must
   not emit the Node `module.register()` deprecation warning.
9. Add static and runtime checks that production browser bundles contain no
   review fixtures, fabricated connection labels, fake counts/timestamps,
   `__acceptance` entry, or test-provider imports.
10. Make `verify:release` execute the fresh browser acceptance command instead
    of accepting a recent JSON file. Fail the release when sign-in or any
    mandatory principal step is skipped, injected, stale, or unavailable.
11. Rerun the complete local verification, PostgreSQL 18 matrix, lifecycle,
    resilience, package integrity, dependency audits, desktop/390x844 browser
    journey, native Safari, and VoiceOver checks after the corrective work.
12. Prove both a newly created file and a pre-correction empty file can reach an
    editable 1,000-row spreadsheet, persist the first named column and value,
    retain data through physical rename and reload, and report an honest live or
    setup-required connection state.
13. Reproduce a stale retained first-row draft, commit it against the current
    schema without losing values, drag a named column to a new position and
    reload, apply presentation formatting during a draft, and confirm Price has
    no currency symbol while retaining exact PostgreSQL decimal storage.
14. Update and recommit an existing generated-hidden-key row, reload it, drag
    the same named column right and left, select a named header, apply Bold to
    the selected column, and confirm no retained active draft or client warning
    remains.
15. Change multiple valid cells without an explicit Commit action, blur each,
    navigate away and back, and confirm both PostgreSQL values persist with no
    active draft. Separately verify the body-cell, named-header, and whole-column
    visual states against the supplied spreadsheet references, and toggle
    presentation formatting on the named header without affecting body cells.
16. Enter a value beneath an unnamed header on a skipped row and prove its blank
    display metadata, hidden JSON value, persistent draft, and 24-digit hidden
    row rank survive reload at the same logical position. Prove skipped rows do
    not create target records and successful promotion inserts exactly one row.

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
7. The agent must perform the same start-to-finish path available to the user:
   use only documented setup/start commands, begin signed out at the normal
   origin, sign in through the visible PostgreSQL login form, and never enter
   through a fixture-only URL or injected cookie.
8. Leave a working local review environment running at the documented URL and
   give the user the exact local credentials and checklist. Task 00014 may
   return to `verified` only after the agent has independently repeated this
   path; final human acceptance remains pending until the user performs it.
9. From Explorer, create a named blank file, name its first column, enter and
   commit its first value, reload it, rename an existing file without a modal,
   and verify both the display name and PostgreSQL relation changed without data
   loss or browser-console errors.
10. On the resulting table, save and later recommit a row, reorder named columns
    in both directions by dragging a header, use the WYSIWYG controls on the
    selected cell or column, and
    confirm the Price cell displays grouped digits plus two decimals without a
    currency symbol.
11. On Product Data, edit two cells back-to-back and blur them without using a
    Commit control; confirm both save and survive navigation. Verify a body cell
    selects only that cell plus its light row/column axes, a named header selects
    only that header plus its axes, a whole-column selection fills the complete
    column with a dark coordinate header and no active body cell, and header
    formatting remains operable.
12. On a blank trailing coordinate in a skipped row, enter a value without first
    naming the header. Reload and confirm the unnamed column and draft remain at
    the same logical coordinate while skipped positions create no empty target
    records; completing the draft must promote exactly one PostgreSQL row.

## Corrective Reopen

Reopened by explicit user direction on 2026-08-03. The previous browser and
native reviews began behind a test-only PostgreSQL fixture that provisioned
roles, identities, data, sessions, and a proxy which injected the session
cookie through `__acceptance`. The normal application exposed no sign-in route,
so the user could not reach the dashboard from the shipped signed-out state.

That evidence remains useful for authenticated feature behavior but does not
satisfy the original clean-start or sign-in acceptance steps. The prior claim
that there was no inaccessible critical path is withdrawn. PostgreSQL is now
the accepted first-slice authentication registry: a verified PostgreSQL login
role is the human identity source, while native memberships, grants, ownership,
column privileges, and RLS remain final authorization. A third-party identity
provider is not required to close Task 00014. Live Google credentials, hosting,
TLS, secret-manager/alerts, and deployment RPO/RTO remain external inputs and
must not block local human acceptance.

The first reachable human review then exposed a second blocker: a new file was
created as a zero-column PostgreSQL relation without stable row identity. Grid
capability correctly rejected it, but the UI misleadingly reported both
`Read-only table` and `Reconnecting`, exposed no usable first-column path, and
left the reviewer stuck. File creation and rename confirmations also exposed
the internal migrator boundary instead of the user action. This second reopen
keeps the accepted DDL authority model while correcting that user path.

The next live-table review exposed a third blocker cluster. The user's first
row values were retained correctly, but a schema-change marker was projected as
four invalid cells and prevented revalidation; column movement was disabled;
presentation controls were disabled whenever a data draft existed; and Price
used a hard-coded peso symbol. This third corrective pass preserves the same
typed capability and PostgreSQL authority boundaries while making those four
interactions usable and diagnosable.

The following human review exposed a fourth blocker cluster. A new row could be
inserted, but a later edit could not be committed; header dragging worked only
toward the right; and clicking a named column header neither showed a selected
column state nor enabled WYSIWYG formatting for that column. This pass must
replace the earlier one-direction/cell-only browser evidence with explicit
saved-row update, both-direction reorder, and column-selection proof.

The latest human review exposed a fifth usability cluster. The bottom draft
guardrail made several uncommitted cell changes ambiguous; cell blur did not
behave like a spreadsheet save boundary; selection styling conflated the active
cell, named header, and entire column; and the named-header WYSIWYG target still
was not usable. This pass keeps durable invalid-value recovery while making
valid changed cells autosave on blur and giving each spreadsheet selection mode
its own logical and visual state.

The sixth human review found that trailing unnamed cells still rejected values,
and clearing the only value in a failed new row left row-level errors behind.
This pass infers a durable Text column from the entered coordinate and treats a
fully cleared failed insert as an abandoned empty draft.

The seventh human correction rejected that inferred-column behavior as drift.
Unnamed values remain unstructured in stable Tabular metadata over hidden JSON;
an incomplete value entered on a skipped row remains a persistent ranked draft
and does not manufacture empty PostgreSQL records for the visual gap.

## Implementation Notes

Started 2026-08-02 after every Integration-gate task passed its complete
technical, database, applicable browser, and specialist checks. This task closes
integration and assembles evidence; it does not weaken earlier verification or
substitute source inspection for browser review.

The original implementation pass completed in the release gate recorded at
`2026-08-02T17:04:30.137Z`:

- retained fifteen feature-owned Ingest plugins and the final App 404 fallback,
  with no generic feature-owning catch-all;
- made Reactus artifacts and HTTP route registration web-process-only while
  keeping migrator and worker composition free of browser artifacts/routes;
- made Reactus artifact source paths portable and finalized the isolated release
  manifest only after a production-only dependency install;
- added guarded demo seed, process-scoped production configuration, preflight,
  doctor, lifecycle, crash, physical restore, load, and release tooling;
- closed Files DDL-status routing and PostgreSQL catalog/Grid serialization
  races found by the final two-session browser proof; and
- assembled `output/release/task-00014/review-package.md` with the evidence,
  known deployment inputs, and final human-review instructions.

## Verification Notes

Corrective verification completed 2026-08-03. The final
`npm run verify:release` gate executed ten command groups and wrote the current
`output/release/task-00014/manifest.json`:

- `npm run verify` passed all 215 unit, component, contract, and local
  integration tests plus type, architecture, secrets, artifacts, runtime,
  entrypoint, release-static, and production-build checks;
- the isolated package installed with
  `npm ci --omit=dev --ignore-scripts`, then 3,961 files, including 3,333
  production dependency files, passed post-install size and SHA-256 checks;
- all ten PostgreSQL suites passed on PostgreSQL 18.4, including explicit proof
  that mapped member/operator roles have no `tabular` control-schema usage;
- packaged preflight, migration, guarded/idempotent demo seed, web/worker
  start, readiness, restart, bounded shutdown, and pool cleanup passed;
- process crash rolled back uncommitted work and preserved committed data, then
  physical `pg_basebackup` restore preserved exact database/role/schema/relation
  OIDs, migration history, RLS, jobs, outbox state, and packaged readiness;
- independent application instances passed durable SSE replay, catch-up,
  permission loss, backpressure, worker contention, fencing, and abandoned-lease
  recovery without sticky sessions;
- fresh Chromium acceptance started signed out at the ordinary origin, used
  visible PostgreSQL login in three independent contexts, and passed desktop,
  two-session, activity, rotation/logout isolation, and 390x844 checks;
- native Safari signed in through the same normal route, and native VoiceOver
  exposed/navigated the spreadsheet and authorized System activity surfaces;
- production and full dependency audits reported zero vulnerabilities; and
- the corrected build was restarted through the documented local-review
  commands, retained its PostgreSQL data and browser session, and was left
  running at `http://127.0.0.1:3000`.

One preliminary complete gate observed a non-reproducible grid SSE 500. A direct
rerun and three consecutive browser repetitions passed without failures, then
the final complete ten-command gate passed. The current browser ledger records
that investigation rather than silently omitting it.

The source checkout was intentionally preserved and not staged, committed,
branched, or pushed. The gate records `cleanCheckoutProof: false` and
`isolatedProductionPackage: true` without overstating that distinction. PNGs
from the withdrawn 2026-08-02 fixture-backed review remain historical; the
current JSON ledgers are the corrective machine-review records.

Blank-spreadsheet corrective verification completed later on 2026-08-03:

- all 215 unit, component, contract, and local integration tests passed;
- all ten PostgreSQL 18 suites passed, including hidden-row-key creation,
  insert, delete, undo, and redo coverage for an otherwise blank sheet;
- a preliminary PostgreSQL run caught that the hidden key must be `UNIQUE`
  rather than a primary key so a later visible primary key remains legal; the
  implementation was corrected before the complete ten-suite rerun passed;
- typecheck, lint/architecture/secrets, the production build, built-runtime
  health/readiness/assets/shutdown verification, and `git diff --check` passed;
- in-app Chromium repaired the pre-correction `Product Data` file, named its
  first column `Item`, persisted `First product`, and renamed the file and
  physical relation to `Product Catalog` without a confirmation dialog;
- the same visible Explorer flow created `QA Inventory` with previewed relation
  `qa_inventory`, immediately opened a live blank spreadsheet, named its first
  column `SKU`, persisted `SKU-001`, and retained it after reload; and
- direct read-only PostgreSQL inspection confirmed both physical relations and
  values, confirmed the old relation was absent after rename, and confirmed the
  hidden unique row identity. Browser console error inspection was empty.

Live-table corrective verification completed later on 2026-08-03:

- the retained `Product Data` first row was loaded with its raw typed values and
  an explicit explanation that the table structure had changed; Commit removed
  only the stale envelope issue, validated the values against the current
  columns, saved `id=1`, `title=iPhoneTX`, the original image URL, and
  `srp=50000`, then retired the stale draft as `abandoned`;
- in the in-app Browser, SRP was dragged from column E to A, remained first
  after reload, and retained stable logical coordinates and the selected value;
- the Bold WYSIWYG control remained enabled, visibly applied `font-weight: 700`
  to the selected cell, and could be toggled back without changing PostgreSQL
  data;
- Price rendered as `50,000.00`; the Browser contained no peso symbol and its
  console error ledger was empty;
- all 220 unit, component, contract, and local integration tests passed; the
  complete ten-suite PostgreSQL 18.4 matrix passed; typecheck,
  lint/architecture/secrets, production build, artifact verification, and
  built-runtime health/readiness/assets/shutdown verification passed; and
- the supported local review processes were restarted against the retained
  disposable PostgreSQL database and left running for final human review.

Fourth live-table corrective verification completed later on 2026-08-03:

- the failed existing-row recommit was traced to the catalog PostgreSQL target:
  the update lock omitted the generated hidden row key, re-encoded the row as a
  null identity, and therefore rejected the valid browse version. The locked
  projection now includes every stable key, with PostgreSQL 18 regression
  coverage that inserts and then updates an otherwise blank generated-key row;
- the in-app Browser updated row 2 from `iPhone X2` to
  `iPhone X2 updated`, reported `Saved · Edit 1 cell`, retained that value after
  reload, and direct PostgreSQL inspection confirmed it with zero active
  drafts;
- SRP moved from A to E and from E back to A through actual Browser drag paths,
  with the exact logical orders observed after each gesture and the final order
  retained after reload;
- clicking `A SRP` exposed `A:A`, `aria-selected=true`, the
  `tabular-active-column` state, a blue selected-header fill and 2px inset focus
  ring; Bold was enabled, reported `aria-pressed=true`, and applied weight 700
  to the selected Price column;
- Price remained currency-neutral at `50,000.00` and `60,000.00`, and the
  final served bundle emitted neither the removed invalid `movable` option
  warning nor any corrective debug/error diagnostic;
- the complete sequential `npm run verify` gate passed all 221 unit,
  component, contract, and local integration tests plus type, architecture,
  secrets, production build, artifacts, built runtime, entrypoints, and release
  static checks; the guarded ten-suite PostgreSQL 18.4 matrix also passed; and
- the verified build was restarted through the documented local-review
  commands and left running at `http://127.0.0.1:3000` for final human review.

Fifth live-table corrective verification completed later on 2026-08-03:

- the bottom draft/Commit guardrail was removed; two Title cells were changed
  back-to-back, blurred without an explicit Commit action, and reported one
  two-row PostgreSQL update while no invalid cell or draft bar appeared;
- navigation away and back retained both autosaved values. The same blur-save
  path restored `iPhoneTX` and `iPhone X2`, and direct PostgreSQL inspection
  confirmed both values with zero active drafts;
- the in-app Browser matched the supplied spreadsheet states: a body cell had
  one cell outline plus light row/column axes; a named header had one header
  outline plus light header-row/column axes and no selected body cell; and a
  whole column had a dark coordinate, light full-column fill and boundaries,
  with no stray active body cell;
- Bold remained enabled and applied only to the selected `Title` header. Italic
  toggled on and off on that header while the body Title cells retained their
  ordinary presentation;
- the complete sequential `npm run verify` gate passed all 222 unit, component,
  contract, and local integration tests plus type, architecture, secrets,
  production build, artifacts, built runtime, entrypoints, and release-static
  checks. The guarded PostgreSQL 18.4 matrix passed all ten suites, and
  `git diff --check` passed;
- the corrected build was restarted through `local-review:shutdown` and
  `local-review:start`; its web, worker, and migrator logs contained no error,
  uncaught, unhandled, or fatal diagnostics and the environment was left running
  at `http://127.0.0.1:3000` for final human review.

Superseded sixth-pass verification completed on 2026-08-03:

- in the in-app Browser, entering `Review note` beneath unnamed coordinate B in
  `QA Inventory` created display column `Column B`, inferred PostgreSQL column
  `column_b`, and saved the value without a retained draft or error;
- entering `temporary row` in Product Data row 4 reproduced the incomplete-row
  errors; clearing that last entered value removed row 4, every error marker,
  the attention state, and the persistent draft;
- direct read-only PostgreSQL inspection confirmed `SKU-001 | Review note`, two
  unchanged Product Data records, and zero active drafts;
- `npm run verify` passed all 223 checks, the guarded PostgreSQL 18.4 matrix
  passed all ten suites, and the agent-workspace validator plus
  `git diff --check` passed.

Latest corrective verification completed on 2026-08-04:

- 230 fast checks, all ten PostgreSQL 18.4 suites, the complete `npm run verify`,
  the agent-workspace validator, and `git diff --check` passed;
- earlier Browser proof kept independent G19/D20 drafts and skipped-row H23
  through reload; targeted clearing, header formatting, and both drags passed.
- A4/C4 display `#VALUE!` while formula/editor state retains raw `a`/`b`; blank
  required siblings stay row-only, and a temporary A5 cleared across reload.
- the completion audit replaced the stale Commit-based release journey with
  autosave-on-blur, moved local review off the deprecated loader, and serialized
  Files catalog reconciliation after a PostgreSQL `40001` startup race; the
  rebuilt app passed three fresh browser repetitions with health/readiness 200
  and no process error/warn records.

## Human Acceptance

None at task level. The required corrective side quests have passed; the
separate final human review remains pending until the user explicitly accepts
the overall implementation.

## Agent Acceptance

Passed 2026-08-04 through the corrected human-accessible path:

1. Passed — began signed out at the ordinary origin; generic wrong-password
   denial, visible PostgreSQL sign-in, session resume/rotation, simultaneous
   sessions, signed-in identity, and logout all used public product routes.
2. Passed — browse, create/rename, representative columns/relations, typed edit,
   invalid-value recovery, formatting, shared view, shared row order, CSV
   import/export, and authorized activity were exercised against PostgreSQL 18.
3. Passed — independent signed-in contexts proved visible bidirectional SSE
   synchronization, peer-preserving session rotation, current-cookie-jar-only
   logout, permission denial, and recovery.
4. Passed — desktop and 390x844 folder/table/import/activity surfaces retained
   accepted hierarchy and controls with no page-level horizontal overflow.
5. Passed — native Safari and VoiceOver covered normal login, Explorer,
   spreadsheet semantics/navigation, and the repaired System activity surface;
   VoiceOver was restored to its original off state.
6. Passed — source/package audits confirmed the accepted direct focused
   libraries, Ingest bootstrap and plugin registration, process-scoped
   entrypoints, feature ownership, and absence of runtime review fixtures.
7. Passed — local setup/start/shutdown/restart, PostgreSQL matrix, packaged
   lifecycle, crash/restore, multi-instance runtime, integrity, and audit gates
   completed without an unresolved blocker or silent loss.
8. Passed — current browser/native ledgers, release manifest, redacted logs,
   runtime/recovery evidence, and the regenerated human review package are under
   `output/release/task-00014`.
9. Passed — the visible blank-file path now starts with a display name and
   inferred relation preview, opens as `Saved · Live` with twelve blank headers
   and 1,000 logical rows, persists the first named column and value, and keeps
   that data while a modal-free display rename changes the PostgreSQL relation.
   A pre-correction empty file reaches the same state through the visible
   `Initialize spreadsheet` repair action; no console errors were observed.
10. Passed — a schema-stale retained first row revalidated and saved without
    value loss, and a later existing-row edit recommitted and survived reload;
    named columns moved both right and left by immediate drag/drop, named header
    clicks showed a selected column state and enabled Bold across that column,
    and Price displayed `50,000.00` with no currency symbol while PostgreSQL
    retained the exact numeric value `50000`.
11. Passed — two changed cells autosaved in sequence on blur without a Commit
    control and survived navigation with zero active drafts; cell, named-header,
    and whole-column selections matched the supplied spreadsheet references;
    Bold and Italic targeted the named header without selecting or formatting
    body cells.
12. Passed — adjacent sparse edits use independent persistent handles and hidden
    ranks, reload at their exact logical rows regardless of load order, update
    or clear without disturbing peers, and project errors only on failing fields.

Live Google credentials, hosting/TLS, secret-manager/alerts, backup ownership,
and deployment RPO/RTO remain explicit external inputs. No mock was substituted
for live Google validation. These inputs do not block local human review.
