# Task 00008: Integrated Security, Regression, and Acceptance Gate

## Task summary

Reconcile all Spec 00005 work, run the full relevant verification and release
checks, inspect the real browser target, clean temporary artifacts, and present
the complete experience for human acceptance.

## Implementation steps

1. Review worker and coordinator changes against the Frozen contract and dirty
   worktree; remove only task-owned temporary fixtures.
2. Run focused and full relevant suites, migrations/restart checks,
   production-target smoke tests, security payloads, and performance bounds.
3. Verify the existing development server before starting any process; inspect
   the acceptance URL's visible behavior, console errors, and failed network
   calls.
4. Record pre-existing validator failures separately from new failures and
   perform context-promotion review and Agent Workspace validation.

## Verification process

Run repository validation commands, focused and full tests, release checks,
browser screenshots/recording, console/network inspection, and final diff/status
review.

## Acceptance criteria

The user explicitly accepts the complete Field, Format, settings, `#VALUE!`,
paste/import/default, reload, and security-fallback experience.

## Implementation notes

- Coordinator-only final gate and handoff.
- Started after Tasks 00005 through 00007 reached focused-test readiness.
- Context-promotion review skipped: implementation matched the already
  accepted promoted Context contract; no new cross-spec product truth emerged.

## Verification notes

- `npm test`: 330 passed, 0 failed, 2 environment skips.
- `npm run lint`, `npm run build`, `npm run verify:runtime`,
  `npm run verify:entrypoints`, and `npm run verify:release:static`: passed.
- Build verified 27 Reactus artifacts and 12 SQL assets. `git diff --check`
  found no whitespace errors.
- Existing server reused: health, readiness, and the required table URL return
  HTTP 200. No additional process was started.
- Browser-control bootstrap and prescribed discovery completed, but the
  runtime reported zero available browsers. Visible behavior, console errors,
  failed network requests, screenshots, and user acceptance remain pending;
  Task 00008 stays `started`.
- PostgreSQL 18 destructive integration commands stopped at their required
  explicit environment guard because the local disposable database target and
  authorization are absent. The full release runner likewise stops before any
  destructive action because `TABULAR_RELEASE_POSTGRES_DISPOSABLE` is unset;
  its PostgreSQL and browser credential prerequisites were not fabricated.
  Migration-count expectations are updated to 12.
- Agent Workspace validation still reports exactly the five pre-existing
  unrelated broken links in `chrisai-chatting`/`chrisai-designing`, plus
  pre-existing preferred-line-count warnings; no Spec 00005 error appears.

## Acceptance notes

- Pending explicit user acceptance; no visual task will be marked accepted
  before that review.
