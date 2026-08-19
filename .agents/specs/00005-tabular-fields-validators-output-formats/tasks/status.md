# Task Status

## Spec

Frozen Spec 00005. Implementation plan accepted 2026-08-13.

## Tasks

| Task | Status | Acceptance |
| --- | --- | --- |
| [00001 Registry, metadata, and value-contract foundation](00001-registry-metadata-value-contract-foundation.md) | verified | none |
| [00002 Pure validator engine and failure contract](00002-pure-validator-engine-failure-contract.md) | verified | none |
| [00003 JSONB and expanded Field editors/codecs](00003-jsonb-expanded-field-editors-codecs.md) | verified | user visual review required |
| [00004 Safe output Format renderers](00004-safe-output-format-renderers.md) | verified | user visual review required |
| [00005 Column settings and validator authoring UI](00005-column-settings-validator-authoring-ui.md) | started | user visual review required |
| [00006 Read/edit/action integration and VALUE errors](00006-read-edit-action-value-errors.md) | started | user visual review required |
| [00007 Paste, import, defaults, and native separation](00007-paste-import-defaults-native-separation.md) | started | user visual review required |
| [00008 Integrated security, regression, and acceptance gate](00008-integrated-security-regression-acceptance.md) | started | user visual review required |

## Status notes

- Task 00001 is the dependency gate for worker Tasks 00002 through 00004.
- Tasks 00005 and 00006 are serialized through the coordinator.
- Task 00007 starts only after codec and action validation are stable.
- Only the coordinator updates this file.
- Agent Workspace validation baseline: five unrelated pre-existing missing-link
  errors in `chrisai-chatting`/`chrisai-designing` skill records, plus existing
  preferred-line-count warnings. No error names a Spec 00005 file.
- Task 00001 verified with typecheck and 15 focused tests. Worker file ownership
  was published before Tasks 00002 through 00004 started.
- Tasks 00005 through 00007 have implementation and focused-test coverage;
  they remain `started` until the required browser verification passes.
- Task 00008 started. The acceptance HTTP target, `/healthz`, and `/readyz`
  return 200 from the existing server. Browser-control discovery returns no
  available browser, so visible/console/network acceptance remains blocked.
- Final repository verification passes: typecheck, lint, production build,
  runtime, entrypoints, release-static, diff check, and the full test suite
  (330 passed, 0 failed, 2 environment skips).
- The disposable PostgreSQL 18 matrix is unavailable because no local test
  listener/database or explicit destructive-cleanup authorization is present.
  This environment prerequisite is separate from repository test failures.
