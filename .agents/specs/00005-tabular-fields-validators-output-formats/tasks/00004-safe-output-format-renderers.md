# Task 00004: Safe Output Format Renderers

## Task summary

Implement isolated safe renderers for the accepted scalar, temporal, link,
Markdown, metadata, collection, code, label, rating, color, and boolean Formats.

## Implementation steps

1. Build renderers against Task 00001 canonical values and compatibility.
2. Implement explicit locale/timezone metadata and bounded collection previews.
3. Allow-list link protocols; sanitize Markdown with raw HTML and unsafe URL
   schemes disabled; escape fallback output and report diagnostics.
4. Add isolated renderer and security tests without editing shared grid wiring.

## Verification process

Run focused renderer/security tests for unsafe targets and markup, locale and
timezone behavior, renderer failures, and bounded collections; inspect the
integrated real-grid Format matrix in the browser.

## Acceptance criteria

A rendered Format gallery in the real grid requires explicit user visual
acceptance.

## Implementation notes

- Assigned to `format_renderer_worker` after Task 00001 verification.
- Started after Task 00001 verification. Exact allow-list:
  `src/plugins/grid/helpers/format-renderers.ts` and
  `tests/plugins/grid/format-renderers.test.ts` only.
- Worker stayed within the allow-list. Coordinator reviewed the result and its
  closed renderer/config dispatch, exact-decimal path, explicit locale/timezone
  metadata, safe link and Markdown handling, and escaped diagnostic fallback.

## Verification notes

- Worker: 10 focused renderer/security tests passed; typecheck passed.
- Coordinator rerun: the same 10 tests and full typecheck passed.
- Integrated real-grid gallery and browser evidence remain part of Tasks 00006
  and 00008, so this task is verified but not human-accepted.

## Acceptance notes

- Pending user review after integrated browser evidence is available.
