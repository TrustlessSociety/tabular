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

The `test:postgres:*` gates were not run because no local PostgreSQL server is
available. They remain outstanding and are not claimed as passed. The fresh
signed-out ordinary-origin browser review at desktop and 390-by-844 was not
run; it remains for the separate browser agent, along with Task 00004's
outstanding browser review. No production-target evidence was collected, so no
production-readiness claim is made.

## Acceptance Notes

Acceptance remains open. A separate browser agent must review the signed-out
ordinary-origin flows at desktop and 390-by-844, and the PostgreSQL matrix plus
distinct production-target evidence remain outstanding.
