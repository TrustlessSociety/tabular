# Task 00001: Process-safe configuration and entrypoints

## Summary

Separate build, development, live, worker, migrator, doctor, and preflight
configuration. Make each process resolve only its permitted lifecycle phases.

## Implementation Steps

1. Define the phase matrix and narrow config contracts.
2. Move process settings into dedicated modules and thin entrypoints.
3. Prove builds do not create listeners, pools, workers, or migrators.

## Verification

Run focused lifecycle tests, typecheck, clean build, runtime/entrypoint checks,
and architecture/secrets checks.

## Acceptance Criteria

None; this task has no human-reviewable visual output.

## Implementation Notes

Implemented the Task 00001 lifecycle/configuration foundation without changing
product routes, focused-package dependencies, PostgreSQL authority, security,
hydration, or production artifact boundaries.

- `config/phases.ts` defines the process names, lifecycle phase matrix, optional
  migrator-worker permission, and validation helper. The effective matrix is:
  build `config, route`; development `config, listen, route`; live
  `config, listen, route`; worker `config, worker`; migrator `config, migrate`
  with `worker` only for `--consume-operations`; doctor `config, doctor`; and
  preflight `config, preflight`.
- `config/process.ts` and `config/{build,dev,live,worker,migrator,doctor,preflight}.ts`
  attach dedicated process profiles to the shared validated settings. The
  existing `config/index.ts` loader remains available for shared/plugin
  consumers through the exported `ConfigLoadOptions` contract.
- `bootstrap/lifecycle.ts` adds `resolveProcessPhases`, which validates and
  resolves only the selected profile’s phases, de-duplicates requests, and
  supports the migrator’s explicit optional worker phase.
- `bootstrap/application.ts` accepts process-scoped config and build-only
  switches. Web startup resolves the development/live HTTP profile before
  readiness and listener startup; build bootstrap can omit artifact loading and
  Reactus serving.
- `bootstrap/build.ts` owns the renderer artifact composition formerly in
  `scripts/build-reactus.ts`. `scripts/build.ts` now bootstraps the plugin graph,
  resolves only build phases, rejects registered runtime resources, and then
  builds the current singleton Reactus entry. The singleton entry remains a
  compatibility boundary for Tasks 00002/00003.
- `entrypoints/{web,worker,migrate,doctor,preflight,seed-demo}.ts` now select
  their dedicated configs and resolve only their permitted profiles. Migrator
  operation consumption explicitly opts into the worker phase.
- `package.json` routes `build:reactus` through `scripts/build.ts` and adds
  `test:release:lifecycle:build`. `tests/process-phases.test.ts` proves the
  matrix and build bootstrap have no listener, pool, worker, or migrator
  resources.
- `scripts/verify-entrypoints.ts` checks the compiled build permissions and
  retains web/migrator/worker/preflight checks. `scripts/verify-architecture.ts`
  and `scripts/verify-secrets.ts` normalize Windows paths so their intended
  production/test exclusions work in this workspace. `tests/artifacts.test.ts`
  skips only when the host denies symlink creation; artifact containment remains
  unchanged.

## Verification Notes

Final required gate sequence, run after implementation:

- `npm run typecheck` — exit 0; `tsc -p tsconfig.json --noEmit` completed.
- `npm run verify:architecture` — exit 0; output included
  `"result": "passed"`, focused direct dependencies, and
  `"forbiddenPackages": "absent"`.
- `npm run verify:secrets` — exit 0; output included
  `"result": "passed"`, `candidateFiles: 226`, and `contentPatterns: 6`.
- `npm test` — exit 0; 256 passed, 0 failed, 1 skipped. The skipped test is
  the existing symlink containment case because this Windows environment denies
  symlink creation.
- `npm run build` — exit 0; `Reactus built 3 production artifacts.`,
  `Copied 11 server SQL asset(s).`, and `Verified 3 Reactus artifacts and 11
  SQL asset(s).`
- `npm run verify:artifacts` — exit 0; `Verified 3 Reactus artifacts and 11
  SQL asset(s).`
- `npm run verify:runtime` — exit 0; JSON reported `result: passed`, `built:
  true`, manifest-allowlisted assets, and idempotent port release.
- `npm run verify:entrypoints` — exit 0; JSON reported `result: passed`, web
  health/readiness/SIGTERM/port release, fail-closed migrator and worker with
  no HTTP listener, and rejected shared production authorities.
- `npm run test:release:lifecycle:build` — exit 0; both focused subtests passed:
  the phase matrix excludes build listener/worker/migrator phases, and build
  bootstrap resolved no listener, pool, worker, or migrator.
- `python .agents/scripts/validate-agent-workspace.py` — exit 1. The validator
  reported pre-existing missing example links in `skills/chrisai-chatting` and
  `skills/chrisai-designing`; it also reported existing line-count warnings.
  No Task 00001 file caused those missing-link errors.

Earlier diagnostic runs that were corrected before the final sequence: the two
architecture/secrets verifiers needed Windows test-path normalization; the
artifact symlink test needed an explicit privilege-aware skip; and the
entrypoint verifier needed Windows-aware handling of `SIGTERM` exit code `null`.

## Acceptance Notes

None; no human-reviewable visual output.
