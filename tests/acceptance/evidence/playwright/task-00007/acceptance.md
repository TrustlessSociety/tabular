# Task 00007 browser acceptance evidence

Agent acceptance: `passed — three final specialist reviews`

Reviewed 2026-08-02 against the current uncommitted workspace source and rebuilt
Reactus artifacts at `http://127.0.0.1:3067/`.

## Authentication and authority boundary

- An explicitly labeled `TestIdentityProvider` double established disposable
  owner and reader identities. Each identity crossed the real identity service,
  a durable hashed PostgreSQL session, the mapped database role boundary, live
  Catalog discovery, and Files permission discovery before Explorer rendered.
- No test-login route was added. An unauthenticated request receives the
  `Sign in required` page with HTTP 401 and no database metadata. A deployable
  external identity provider remains a later configuration input, so this proof
  does not claim production sign-in is configured.
- Owner and reader browser contexts used different durable sessions and real
  PostgreSQL roles. The reader retained browsing access but received no New file
  or Import action and could not regain rename authority after following a file.
- The New file event used same-origin credentials, exact-origin validation, and
  the session synchronizer token. The server rediscovered the caller-visible
  snapshot, reconstructed the typed action from stable IDs, and delegated to
  `FilesPluginService.plan`. The browser received only the non-secret request ID
  and `planned` state; no confirmation token was exposed and no physical DDL was
  claimed or applied.
- The recorded browser proof preserves only booleans for CSRF/session presence;
  neither token value is stored in the workspace. See
  [acceptance-proof.mjs](acceptance-proof.mjs) and the redacted
  [acceptance-result.json](acceptance-result.json).

## Automated verification

- Focused Node 22.14.0 Explorer, app, UI, grid, and runtime suite: 26 passed,
  0 failed.
- `npm run verify`: passed; 56 tests passed, 0 failed.
- Production build: 3 Reactus artifacts and 4 server SQL assets verified.
- Architecture: passed; the transitive browser graph is server-free.
- Built runtime: health, readiness, manifest-allowlisted assets, and idempotent
  shutdown passed. The runtime subprocess self-reported Node v26.2.0.
- Entrypoints: web, migrator, and worker checks passed.

## Desktop Explorer acceptance — 1440x900

Artifact: [explorer-desktop.png](explorer-desktop.png)

- The authenticated root exposed exactly the live Operations and Finance
  PostgreSQL schemas beneath the live database breadcrumb.
- Operations exposed six catalog files with live stable `obj_*` identifiers.
  The native PostgreSQL `monthly_rollup` view appeared in Files, labeled Read
  only; it was not mislabeled as a Tabular saved view.
- Files and Views are addressable query routes. Arrow-key navigation moved the
  roving tab stop from Files to Views, and the active tab survived reload.
- Views contained accepted temporary Tabular saved-view metadata attached to the
  live source file ID and slug. Opening `Ready to ship` used the source file
  route plus `view=ready`; the workbench displayed the active view in the compact
  breadcrumb and document title, applied its presentation after grid readiness,
  and retained the route across reload. No persistent grid-control view label
  was added.
  Task 00010 still owns durable saved-view persistence.
- Search remained scoped to the active collection and used the correct accessible
  name (`Search files` or `Search views`). Filtering Vendors preserved its live
  stable ID. No-results, loading/recovery, error/retry, and empty states retained
  their folder context.
- Grid/list view preference survived reload.

## Blank file and table settings — 1440x900

Artifact: [table-settings-desktop.png](table-settings-desktop.png)

- New file crossed the authenticated Files planning boundary, then opened an
  `Untitled File` draft with 1,000 blank rows, coordinate columns A-L,
  `aria-rowcount="1001"`, `aria-colcount="13"`, and a named Row number header.
- Folder-local duplicate rename rejected `Vendors` and returned focus to the
  inline input. A valid rename to `Incident log` returned focus to the title.
- The Table settings modal took focus, contained keyboard focus, and exposed only
  Display name, Folder, and PostgreSQL table name.
- An existing Customer orders file was temporarily renamed to Customer order
  archive and moved from Operations to Finance through the authenticated event
  boundary. Its stable source ID was rebound independently from the destination
  folder, and the workbench retained the temporary destination context.
- Rename and settings actions carry server-rebound source and destination
  folders. Both permissions are required; automated mixed-authority cases with
  a denied source and allowed destination return `permission_denied` for rename
  and settings.
- Applying `Incident archive`, Finance, and the overridden physical name
  `incident_archive` reported that the temporary settings were updated while a
  physical PostgreSQL change still requires confirmation. Rename/settings are
  authenticated temporary configuration in this task, not a claim that DDL ran.
- The real reader role followed Customer orders into the workbench, received the
  exact permission denial on rename, and retained focus in the input.

## Narrow acceptance — 390x844

Artifacts:

- [explorer-narrow.png](explorer-narrow.png)
- [table-settings-narrow.png](table-settings-narrow.png)

- Explorer document and body widths were both 390 px. Breadcrumb, New file,
  Import, tabs, search, and view controls remained available without document
  overflow.
- The settings dialog stayed within the viewport at x=24, y=0, width=366, and
  height=844. Cancel and Apply changes were fully visible at the bottom.
- DOM sanity found no duplicate IDs, unnamed buttons, or unnamed links.

## Runtime signals and scope

- Browser console warnings/errors: 0.
- Uncaught page errors: 0.
- Recorded Explorer mutations: five owner POSTs and one reader POST; every
  request recorded JSON content, exact origin, CSRF presence, and session-cookie
  presence, and every response was HTTP 200. Values of the CSRF token and session
  cookies were not recorded.
- Document-level horizontal overflow: none at either reviewed viewport.
- The Import entry remains an honest unavailable-connectors shell; Task 00011
  owns the import workflow. External provider sign-in, durable saved views, and
  confirmed physical PostgreSQL mutation execution remain outside this proof.
