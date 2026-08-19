# Task 00001: Registry, Metadata, and Value-Contract Foundation

## Task summary

Create stable shared contracts for compatible storage, Fields, Formats, and
validators; expand cell values for bounded JSON; add versioned validator
metadata and migration wiring; and centralize recommended defaults without
changing target-table data or schema.

## Implementation steps

1. Inventory current contracts, migration chain, metadata repositories, action
   payloads, and tests while preserving unrelated worktree changes.
2. Add stable shared type and registry interfaces for canonical value families,
   compatibility, recommended defaults, and validator metadata.
3. Expand shared grid/action values to include bounded JSON objects and arrays
   while preserving exact numeric and canonical temporal strings.
4. Add the application-metadata migration and round-trip wiring for
   `validator_config`, with no target-table DDL or row rewrite.
5. Fix Field defaults for Time, Tags, Text List, Metadata, Multi-select, and
   Checkbox List.
6. Publish exact file allow-lists and interfaces for Tasks 00002 through 00004.

## Verification process

Run focused type/static checks, compatibility/default matrix tests, metadata
round-trip and migration tests, JSON value contract tests, and assertions that
validator metadata changes emit no target-table DDL and mutate no rows.

## Acceptance criteria

Acceptance criteria: none; this task has no human-reviewable visual output.

## Implementation notes

- Coordinator-owned shared foundation. Workers may not edit these files.
- Started 2026-08-13 after the plan-acceptance records were created.
- Baseline Agent Workspace validation reports five unrelated existing
  missing-link errors in `chrisai-chatting` and `chrisai-designing` records;
  no reported error names a Spec 00005 file.
- Added the closed Field/Format/validator registry, exact canonical JSON
  transport, versioned validator metadata, migration 0012, metadata round-trip
  helper, description wiring, and centralized Field defaults.
- Published worker allow-lists:
  - `validator_worker`: `src/plugins/files/helpers/validator-engine.ts` and
    `tests/plugins/files/validator-engine.test.ts` only.
  - `field_codec_worker`: `src/plugins/grid/helpers/field-codecs.ts`,
    `src/plugins/grid/components/expanded-field-editors.tsx`,
    `tests/plugins/grid/field-codecs.test.ts`, and
    `tests/plugins/grid/expanded-field-editors.test.ts` only.
  - `format_renderer_worker`: `src/plugins/grid/helpers/format-renderers.ts`
    and `tests/plugins/grid/format-renderers.test.ts` only.

## Verification notes

- `npm run typecheck`: passed.
- Focused Node/TSX suite: 15 tests passed across registry compatibility,
  defaults, canonical JSON actions, migration history, metadata round trips,
  and no-target-DDL/no-row-mutation assertions.
- Migration 0012 is statically confined to `tabular.column_metadata`; PGlite
  target-table column count, row count, and raw value were identical before
  and after validator metadata save.

## Acceptance notes

- No visual acceptance applies; the task finishes at `verified`.
