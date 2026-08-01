# Implementation Task Status

## Current State

- Spec: `00003-tabular-direct-stackpress-libraries-architecture`
- Implementation plan: **accepted 2026-08-01**
- Implementation state: Not started
- Active task: None
- Task sequence: Stable Tasks 00001-00014
- Per-task human acceptance: `none`
- Final human review: Pending after all tasks are verified

## Task Record Convention

Every task begins with three distinct execution sections:

1. `Implementation Steps` — create or change the task output.
2. `Verification Steps` — technical checks such as tests/build/type/static
   validation, or `none` when no meaningful technical check applies.
3. `Acceptance Steps` — load and exercise user-visible UI from a user
   perspective, or `none` when the task has no meaningful UI effect.

The agent executes applicable acceptance steps and records `passed` or `failed`.
Verification never substitutes for UI acceptance. Human acceptance is `none` in
every task file; tasks finish at `verified` after all applicable steps pass.

## Tasks

| Task | Status | Verification | Agent acceptance | Gate |
| --- | --- | --- | --- | --- |
| [00001 Direct-library application](00001-direct-library-application.md) | open | Not run | Not required | Start here |
| [00002 PostgreSQL data foundation](00002-postgresql-data-foundation.md) | open | Not run | Not required | 00001 verified |
| [00003 Identity, authority, catalog](00003-identity-authority-catalog.md) | open | Not run | Not required | 00002 verified |
| [00004 Capability and action kernel](00004-capability-action-kernel.md) | open | Not run | Not required | 00003 verified |
| [00005 File, column, relation, DDL](00005-file-column-relation-ddl.md) | open | Not run | Not required | 00004 verified |
| [00006 Reactus UI and grid adapter](00006-reactus-ui-grid-adapter.md) | open | Not run | Pending | Foundation gate |
| [00007 Explorer and table settings](00007-explorer-table-settings.md) | open | Not run | Pending | 00006 verified |
| [00008 Grid editing and relations](00008-grid-editing-relations.md) | open | Not run | Pending | 00007 verified |
| [00009 Menus and formatting](00009-menus-formatting.md) | open | Not run | Pending | 00008 verified |
| [00010 SSE, views, row order](00010-sse-views-row-order.md) | open | Not run | Pending | Browser gate |
| [00011 Import and CSV export](00011-import-csv-export.md) | open | Not run | Pending | 00010 verified |
| [00012 Workers and activity](00012-workers-activity.md) | open | Not run | Pending | 00011 verified |
| [00013 MCP and harness parity](00013-mcp-harness-parity.md) | open | Not run | Not required | 00012 verified |
| [00014 Release readiness](00014-release-readiness.md) | open | Not run | Pending | Integration gate |

## Wave Gates

- Foundation: 00001-00005 verified on a clean PostgreSQL 18 target.
- Browser: 00006-00009 verified with applicable agent acceptance passed.
- Integration: 00010-00013 verified; agent acceptance passed where applicable.
- Release: 00014 verified and its final review package assembled.

## Final Human Review

The user reviews only after every task is verified:

1. Does the final implementation match the wireframes in shape and functionality?
2. Does the source use Ingest configuration, plugin registration, and bootstrap?
3. Is source organized under feature-owned `plugins/*/components`, `events`,
   `pages`, `views`, and `helpers` where applicable?
4. Does the application generally work end to end?

Implementation becomes `completed` only after this final review is accepted.
