# Task 00007: Paste, Import, Defaults, and Native Separation

## Task summary

Apply the stable codecs and validators to paste, import, and defaults, infer
JSONB Field shape, and retain native Required, Unique, foreign-key, storage,
trigger, and constraint authority.

## Implementation steps

1. Route paste, import, and literal/server default validation through the same
   canonical codecs and validator registry.
2. Infer JSONB object versus string-array Field suggestions without changing
   JSONB storage inference.
3. Preserve per-cell correctable drafts for mixed-invalid bulk input.
4. Prove Field/default configuration never materializes blank cells and native
   constraint failures remain separate.

## Verification process

Run focused import/paste/default integration tests, JSONB shape inference,
mixed-invalid bulk cases, no-population assertions, native constraint
regressions, and browser workflows.

## Acceptance criteria

Visible paste/import/default correction flows with no unexpected cell
population require explicit user visual acceptance.

## Implementation notes

- Coordinator-owned after codecs and action validation are stable.
- Paste and defaults use edit-exit validation. Import inference now retains
  JSONB storage while suggesting Metadata versus Text List, and import preview
  applies the same Field codecs and implied validator registry.

## Verification notes

- Typecheck and 40 focused import, paste, default, metadata-only, and capability
  tests pass, including mixed-invalid bulk input and no-population assertions.
- Native integration regressions and browser workflows remain pending; task
  stays `started`.

## Acceptance notes

- Pending explicit user acceptance.
