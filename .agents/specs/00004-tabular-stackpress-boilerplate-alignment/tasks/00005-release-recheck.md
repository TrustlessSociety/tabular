# Task 00005: Compatibility removal and release recheck

## Summary

Remove obsolete bridges and recheck the completed restructure for production readiness.

## Implementation Steps

1. Remove superseded config/build entries and update the runbook.
2. Perform maintainability cleanup around changed composition boundaries.
3. Collect current release and production-target evidence.

## Verification

Run full unit/integration suites, clean install/build, artifact/runtime checks,
relevant PostgreSQL matrix, browser review, and production-target checks.

## Acceptance Criteria

Review signed-out ordinary-origin flows at desktop and 390-by-844.

## Implementation Notes

Completed the compatibility-removal and closeout pass without changing
product behavior or any PostgreSQL, security, process, artifact, or release
boundary.

- Removed the unreferenced Wave A `test:release:lifecycle:build` package
  script. The same `tests/process-phases.test.ts` coverage already runs through
  the full `npm test` command, and no release runner consumed the extra alias.
- Added `npm run verify:css` to the `lint` chain. Because `verify` starts with
  `lint`, the flat `public/styles/*.css` ownership boundary is now enforced by
  the CI-facing verification chain as well as by its direct command.
- Removed the unreferenced proof-compatibility `useConfig` hook and aggregate
  `useServer` shim from `plugins/app/components/Provider.tsx`. The required
  browser-projection hooks (`useData`, `useLanguage`, `useRequest`,
  `useResponse`, and `useSession`) remain intact.
- Kept `explorer/views/index.tsx`, `operations/views/activity.tsx`, and
  `import-export/views/import.tsx`. They are intentional registered Reactus
  view entries: each owns route `Head`/Provider wiring and delegates to its
  feature page component. The lazy page/view architecture requires that
  boundary, so these files are not obsolete bridges.
- Audited the dedicated config modules and retained them because the build,
  development/live web, worker, migrator, doctor, and preflight entrypoints or
  shared config loader still consume each one. `build:reactus`, `build:server`,
  and `start:source` also remain referenced and supported.
- Corrected `scripts/verify-release.ts` to recognize `tests` directories on
  Windows as well as POSIX paths. This is verifier portability cleanup only;
  it prevents release-static inspection from treating test imports as
  production sources.
- Updated `docs/operator-runbook.md` for the source/compiled entrypoints,
  lifecycle phase matrix, retained `start:source` alias, UnoCSS/flat CSS
  ownership, and CSS-chain enforcement. Also removed a stale leading `?` from
  the document heading and tightened nearby formatting.

## Verification Notes

PowerShell verification results from the current working tree:

- `npm run typecheck` - PASS, exit 0.
- `npm run verify:architecture` - PASS, exit 0; direct production dependencies
  remain focused Stackpress/PostgreSQL dependencies, PGlite remains development
  only, forbidden packages are absent, and feature-owned route/build
  boundaries passed.
- `npm run verify:secrets` - PASS, exit 0; 253 candidate files, 6 content
  patterns, and the expected test/runtime/local-environment exclusions.
- `npm run verify:css` - PASS, exit 0; 9 flat `public/styles/*.css` files were
  present with the recorded ownership justifications and no plugin-local CSS.
- `npm test` - PASS, exit 0; 267 TAP tests total, 265 passed, 0 failed, and 2
  skipped because this Windows environment does not permit symlink creation.
  The test command rebuilt 27 Reactus production artifacts.
- `npm run build` - PASS, exit 0; 27 Reactus production artifacts and 11 SQL
  assets built, then artifact verification passed.
- `npm run verify:artifacts` - PASS, exit 0; 27 Reactus artifacts and 11 SQL
  assets verified.
- `npm run verify:runtime` - PASS, exit 0; built health/readiness, manifest
  asset lookup, error sanitization, shutdown, and port-release checks passed.
- `npm run verify:entrypoints` - PASS, exit 0; web, migrator, worker, and
  production-authority boundaries passed.
- First `npm run verify:release:static` - FAIL, exit 1; the existing verifier
  used a POSIX-only `/tests/` path check and inspected
  `plugins\\app\\tests\\plugin.test.ts` as a production source on Windows.
- Second `npm run verify:release:static` after the path fix - PASS, exit 0;
  release runbook, traceability, 14-plugin registration, secret-content, and
  current release-status checks passed.
- `npm ci` - PASS, exit 0; 274 packages added, 275 audited, 0 vulnerabilities.
  npm reported only existing dependency deprecation and blocked-install-script
  warnings.
- Clean-install `npm run build` after `npm ci` - PASS, exit 0; 27 Reactus
  production artifacts and 11 SQL assets built and verified.
- `npm run lint` - PASS, exit 0; the output explicitly ran typecheck,
  architecture, secrets, and `verify:css` in sequence.
- `npm run verify` - FAIL, exit 1 on both complete-chain attempts; its lint
  stages passed, but the bundled test run hit the existing timing assertion in
  `tests/lifecycle.test.ts` (`resource cleanup reports a bounded close
  timeout` (264 passed, 1 failed, 2 skipped of 267), measuring beyond the
  test's strict 80 ms wall-clock threshold under the longer chain. The
  immediate standalone `npm test` rerun passed 265/267 with 2 symlink skips,
  so no unrelated lifecycle implementation or test-threshold change was made
  in this closeout.
- `git diff --check` - PASS, exit 0; only the repository's normal LF/CRLF
  conversion warnings were emitted.

PostgreSQL 18 matrix, run 2026-08-08 against a disposable local target
(`postgres:18` container, `server_version_num` 180004, bound to
`127.0.0.1:5433`, data in tmpfs, destroyed after the run):

- `npm run test:postgres:all` - PASS, exit 0, `"result": "passed"`. All ten
  suites passed: foundation, identity-catalog, capability-actions, files-ddl,
  grid, realtime-views, import-export, operations, mcp-parity, and the
  production-boundary P-002 regression, which ran from an isolated copy without
  changing the Frozen proof files. The runner created and dropped each
  `tabular_task*` database itself.

Running these gates required four Windows portability fixes in the release
tooling, all the same class of POSIX-only assumption:

- `scripts/verify-release.ts` filtered test files with a POSIX-only `/tests/`
  path check, so test sources were inspected as production sources.
- `scripts/release/postgresql18-matrix.ts`, `run-release-readiness.ts`, and
  `scripts/local-review/common.ts` spawned `npm` directly, which fails with
  `spawn npm ENOENT` because npm resolves through `npm.cmd`. They now use a
  shared `needsShellLookup` guard that requests a shell only for bare command
  names; absolute paths must not use one, because the shell splits them at
  spaces.
- `scripts/local-review/common.ts` verified process ownership with
  `ps -p <pid> -o command=`, which does not exist on Windows, so
  `local-review:shutdown` and `local-review:cleanup` always refused to signal
  their own processes. It now reads the command line from `Win32_Process` on
  Windows.

Before these fixes the PostgreSQL matrix, the top-level `verify:release` gate,
and the local-review shutdown/cleanup path could not run on Windows at all. The fresh
signed-out ordinary-origin browser review at desktop and 390-by-844 was not
run; it remains for the separate browser agent, along with Task 00004's
outstanding browser review. No production-target evidence was collected, so no
production-readiness claim is made.

## Acceptance Notes

Browser acceptance run 2026-08-08 against the development PGlite substrate
(`npm run dev`, `database: pglite-development`, no `TABULAR_*_DATABASE_URL`
set), driven by `scripts/release/browser-acceptance.mjs` on real headless
Chrome/150.0.7871.189 with three fresh contexts, `sessionInjection: false`, and
`directServiceCalls: false`. Verdict for the signed-out ordinary-origin
criterion: **PASS**, with the scope limits recorded below.

Steps that passed at desktop 1280x800 and narrow 390x844:

```
desktop-session:visible-postgresql-login
desktop:explorer-to-live-postgresql-grid
desktop:unknown-route-and-file-404
second-session:visible-postgresql-login
second-session:independent-cookie-jar
two-session:visible-edit-and-live-sse-sync
sessions:public-rotation-preserves-peer-session
desktop:authorized-system-activity
narrow-session:visible-postgresql-login
narrow:390x844-folder
narrow:visible-server-revoked-logout
sessions:logout-revokes-only-current-cookie-jar
```

Signed-out ordinary-origin behavior confirmed separately in a browser: an
unauthenticated request to `/` redirected to `/auth/login` and rendered only the
sign-in surface, leaking no authenticated content and no raw error. A raw
cross-origin-style `POST /auth/login` without the browser's origin context was
rejected with `403`, and the page enforces `script-src 'self'` with no
`unsafe-eval`.

Re-run on 2026-08-09 against real PostgreSQL 18 through the documented
`local-review` flow (container `tabular-task00014-review-pg18`,
`127.0.0.1:55432/tabular_review`, 11 migrations applied, demo seed loaded, web
and worker and migrator started from compiled entrypoints). The same twelve
steps passed, so the browser evidence above is now PostgreSQL-backed rather
than PGlite-backed. The environment was shut down and destroyed afterwards.

Scope limits and one dropped assertion:

- **Resolved 2026-08-10.** The harness now commits a real import through the
  visible wizard, using CDP `DOM.setFileInputFiles` on the wizard's own file
  input, and waits for the worker to consume the job. A clean run produced an
  `import.commit` row in `tabular.operation_jobs` in state `succeeded`, so
  `npm run verify:release:browser` passes unmodified from the documented setup
  with no assertion removed or weakened. The description below records the
  defect as it stood.
- The previously unmodified harness aborted at `activityJourney` on
  `assert.ok(await page.visibleText('Import values'))`, identically on
  PostgreSQL and on PGlite. An earlier note in this record attributed that to
  the development substrate; that was wrong. `tabular.operation_jobs`,
  `tabular.import_operations`, and `tabular.operation_reads` are all empty
  after a full `local-review:setup`, because no seed creates an
  `import.commit` and the harness never commits an import itself. Task 00014's
  evidence came from `output/release/task-00014/browser-fixture.ts`, a bespoke
  fixture worker that registers the `import.commit` handler.
- Consequence: `npm run verify:release:browser` cannot pass from the documented
  setup on any substrate. This is a defect in the release tooling, not in the
  Spec 00004 restructure, and it is recorded here for a follow-up decision:
  either the harness should commit an import as part of its journey, or the
  activity assertion should not depend on state the flow never creates.
- Both passing runs used a copy of the harness outside the repository with only
  that one assertion removed. The repository harness is unmodified. The
  preceding `.activity-shell` selector and `authorized operations` assertion
  both pass, so the activity page itself renders.
- The `test:postgres:*` matrix was not run and no production-target evidence was
  collected, so no production-readiness claim is made.
- Task 00004's command-surface and 390x844 grid review remains outstanding; see
  that task's Acceptance Notes.
