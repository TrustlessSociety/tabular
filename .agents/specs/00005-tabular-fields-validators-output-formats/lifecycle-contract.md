# Validation and Change Lifecycle

## Validation result

Every failure has this serializable shape:

```json
{
  "ruleId": "vr_01J...",
  "kind": "min_value",
  "source": "configured",
  "code": "value_below_minimum",
  "message": "Must be zero or more",
  "path": null
}
```

`source` is `storage`, `field`, `configured`, or `postgresql`. Validator
failures use the first three sources; native database errors remain separate
and retain their canonical constraint identity. JSON child failures may have a
bounded path. Messages are safe text.

## Edit, paste, default, and import behavior

1. While a user is typing, the editor preserves raw input and may show quiet
   guidance; it does not repeatedly persist an invalid value.
2. On Enter, Tab, or click-away, decode the canonical value once and run all
   implied/configured application rules.
3. A valid value crosses the durable action boundary. PostgreSQL constraints
   and triggers remain final authority.
4. An invalid attempt remains a correctable actor-owned draft with its bounded
   failure list and raw attempted representation.
5. Paste and import use the identical codec and registry per cell; there is no
   looser bulk path.
6. Literal and server defaults are validated when configured. A blank logical
   cell does not materialize a default merely because a Field/default setting
   is selected; the accepted blank-row/default lifecycle remains authoritative.

## Validator and database separation

| Behavior | Owner | Examples |
| --- | --- | --- |
| Input validators | Tabular metadata and action validation | Bounds, membership, length, shape, pattern, temporal and nested rules. |
| Storage acceptance | PostgreSQL type/typmod | Bigint range, numeric precision/scale, date parsing, UUID. |
| Native constraints | Governed owner/migrator DDL | Required/NOT NULL, Unique, foreign key, separately managed CHECK. |

Saving, changing, reordering, or removing a validator writes Tabular metadata
only. It never adds/removes target-table constraints or rewrites values. The UI
labels the section **Validated by Tabular** and states that direct SQL clients
can bypass it. Required, Unique, foreign keys, and Advanced PostgreSQL remain
separate controls and lifecycles.

## Adding or changing rules

1. Validate only the rule definition, parameter types, compatibility,
   duplicate IDs/rules, and internal contradictions.
2. Save valid validator metadata regardless of current accepted row values.
   No target-table scan or DDL is required before Apply succeeds.
3. Re-evaluate materialized cells immediately. Any stored value that violates
   the active rule renders `#VALUE!`; its PostgreSQL value remains unchanged.
4. Validate values loaded later when they materialize. A full-table violation
   count is optional future analysis, not a save gate.
5. Removing, changing, or reordering rules reruns materialized-cell validation
   and may restore ordinary output without touching the database value.

Changing a same-storage Field follows the same metadata-only behavior for its
implied validators. Changing storage still requires the existing governed cast
plan because it changes PostgreSQL storage, not because a validator changed.
Changing only Format configuration does not run validators.

## Settings-panel contract

Keep the accepted top-to-bottom order and expand it to:

1. Column name.
2. Field and Field-specific configuration.
3. Format and Format-specific configuration.
4. Constraints: native Required, Unique, and Relation integrity where applicable.
5. Validators: Tabular-only locked implied rules, then configured rules.
6. Advanced PostgreSQL storage and identity.

The Add validator menu is filtered by storage and Field compatibility. A rule
card shows readable name, parameters, a **Validated by Tabular** label, optional
custom message, reorder control, and remove control. Locked implied rules
explain which storage/Field choice owns them and cannot be removed directly.

## Metadata and implementation impact

- Add a versioned `validator_config JSONB NOT NULL DEFAULT` object to column
  metadata with rules-array validation. Any CHECK on Tabular's own metadata
  shape does not create a constraint on the user's target column.
- Expand the grid cell/action contract to round-trip bounded JSON object/array
  values. The current scalar-only `GridCellValue` cannot represent new Fields.
- Replace registry-membership-only axis validation with an explicit
  storage-by-Field-by-Format compatibility registry.
- Fix current default inference for `time`, `tags`, and `text-list`; they
  currently fall through to Text storage.
- Ensure import inference distinguishes JSONB object from array for Field
  suggestions without changing the inferred storage type.
- Implement safe output renderers independently from editor components; Frui
  source is interaction inspiration, not a runtime security boundary.

## Verification requirements for implementation planning

- Unit matrices for every storage/Field/Format/rule compatibility edge.
- Codec round trips for exact numerics, temporal strings, JSON objects/arrays,
  SQL NULL, empty collections, zero, and false.
- Integration coverage proving validator changes create no target-table DDL or
  row mutation, while native constraint errors remain independently stable.
- Browser acceptance for adding/reordering/removing several rules, locked
  implied rules, existing values becoming/restoring from `#VALUE!`, eight-plus
  errors, invalid draft correction, defaults, paste, import, locale/timezone
  Formats, and safe renderer fallbacks.
- Security tests for unsafe link protocols, Markdown/HTML payloads, regex
  bounds, oversized JSON, and untrusted custom messages.
