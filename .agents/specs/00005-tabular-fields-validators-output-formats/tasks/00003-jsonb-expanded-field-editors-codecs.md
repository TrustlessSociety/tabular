# Task 00003: JSONB and Expanded Field Editors/Codecs

## Task summary

Implement isolated codecs and Field components for Metadata, Tags, Text List,
Multi-select, and Checkbox List, and refine accepted scalar Fields without
lossy conversion or implicit value population.

## Implementation steps

1. Build exact JSON object/string-array codecs against Task 00001 contracts.
2. Reject duplicate object keys before JSONB serialization and preserve array
   order, configured duplicate policy, SQL NULL, and empty collections.
3. Add isolated grid-density Field editors/components and focused tests.
4. Preserve draft, focus, keyboard, edit-exit, and default behavior.

## Verification process

Run codec round trips, editor lifecycle and storage-default tests, exact-value
cases, and focused browser inspection after coordinator integration.

## Acceptance criteria

Rendered real-grid editing flows for each new Field family require explicit
user visual acceptance.

## Implementation notes

- Assigned to `field_codec_worker` after Task 00001 verification.
- Started after Task 00001 verification. Exact allow-list:
  `src/plugins/grid/helpers/field-codecs.ts`,
  `src/plugins/grid/components/expanded-field-editors.tsx`,
  `tests/plugins/grid/field-codecs.test.ts`, and
  `tests/plugins/grid/expanded-field-editors.test.ts` only.
- Worker stayed within the allow-list. Coordinator reviewed exact-source
  Metadata parsing, duplicate-key rejection, string-array policies, explicit
  SQL NULL behavior, and the controlled editor lifecycle.

## Verification notes

- Worker: 16 focused codec/editor tests passed; typecheck passed.
- Coordinator rerun: all 16 codec/editor tests passed together with 15
  validator tests and full typecheck (31 tests total).
- Real-grid integration, browser focus inspection, and visual evidence remain
  Tasks 00006 and 00008, so this task is verified but not human-accepted.

## Acceptance notes

- Pending user review after integrated browser evidence is available.
