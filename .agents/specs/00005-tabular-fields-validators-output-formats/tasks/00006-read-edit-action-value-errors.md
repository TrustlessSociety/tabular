# Task 00006: Read/Edit/Action Integration and VALUE Errors

## Task summary

Wire validation into materialized values and Tabular mutations so violating
stored data renders `#VALUE!` without mutation and invalid future inputs remain
correctable drafts outside PostgreSQL.

## Implementation steps

1. Validate loaded/materialized cells and expose bounded failures separately
   from the unchanged raw PostgreSQL value.
2. Validate edit-exit and durable actions; keep invalid attempts actor-owned.
3. Show raw data in edit mode, persist valid correction, and restore output
   when rules change or are removed.
4. Preserve direct-SQL bypass and native database-error separation.

## Verification process

Run action/integration tests, direct-SQL fixtures, no-row-mutation assertions,
reload tests, and browser journeys for violations, correction, rule removal,
eight-plus failures, and bypassed values.

## Acceptance criteria

Visible existing-value, edit/correct, rule-removal, reload, and direct-SQL
bypass journeys require explicit user visual acceptance.

## Implementation notes

- Coordinator-owned and serialized after Task 00005.
- Loaded-cell projection, edit-exit validation, durable capability validation,
  exact JSON editor source, safe Format rendering, and `#VALUE!` projection are
  implemented without target-value mutation.

## Verification notes

- Typecheck and 52 focused validator, codec, renderer, editing, cell-projection,
  and capability-action tests pass.
- Browser correction, reload, rule-removal, and direct-SQL journeys remain
  pending; task stays `started`.

## Acceptance notes

- Pending explicit user acceptance.
