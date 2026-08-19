# Task 00005: Column Settings and Validator Authoring UI

## Task summary

Integrate compatible Field/Format configuration and ordered Tabular validator
authoring into the accepted column settings panel while keeping native
PostgreSQL constraints visibly separate.

## Implementation steps

1. Preserve the accepted panel order for name, Field, Format, Constraints,
   Validators, and Advanced PostgreSQL.
2. Filter choices through the shared registry and render locked implied rules.
3. Add ordered configured rule cards with typed parameters, bounded custom
   messages, reorder/remove controls, and Tabular-only disclosure.
4. Ensure configuration changes never populate cell values or defaults.

## Verification process

Run component/action tests for filtering, typed parameters, reordering,
removal, configuration contradictions, keyboard/accessibility behavior, and
browser inspection at the acceptance URL.

## Acceptance criteria

The user can visually configure several validators and distinguish Validated
by Tabular rules from native PostgreSQL constraints.

## Implementation notes

- Coordinator-owned and serialized after worker integration.
- Started after coordinator review and verification of Tasks 00002 through
  00004.

## Verification notes

- Direct metadata-save routing, compatibility filtering, locked implied rules,
  ordered configured rules, typed arguments, custom messages, and native
  Constraints separation are implemented.
- Read-only native columns permit presentation-only metadata saves while
  continuing to block storage/name/default DDL plans.
- Typecheck and 22 focused settings/registry/validator tests pass.
- Browser inspection remains pending; task stays `started`.

## Acceptance notes

- Pending explicit user acceptance.
