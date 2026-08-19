# Validator Catalog

## Rule model

A column has three ordered rule sources:

1. **Storage-implied** rules mirror PostgreSQL type/typmod input acceptance in
   Tabular and cannot be removed while storage is unchanged.
2. **Field-implied** rules come from the selected semantic Field and appear as
   locked rules in settings.
3. **Configured** rules are a user-ordered JSONB array in column metadata.

All rules in this catalog are a Tabular layer and create no target-table DDL.
`Required`, `Unique`, Relation foreign keys, and storage behavior remain
separate native Constraints/PostgreSQL settings. Output Formats never imply
rules.

## Configured metadata shape

```json
{
  "version": 1,
  "rules": [
    {
      "id": "vr_01J...",
      "kind": "min_value",
      "args": { "value": "0" },
      "message": "Must be zero or more"
    }
  ]
}
```

- `id` is stable across reorder/rename so errors map to the same rule.
- `kind` comes from this closed versioned registry. No function name, SQL,
  JavaScript, or arbitrary regular-expression flags are executable metadata.
- Exact numeric parameters are decimal strings and are never narrowed through
  JavaScript `number` before Tabular's exact comparison.
- `message` is optional bounded plain text; the canonical error code remains.

## Public configured registry

| Rule kind | Compatible values | Parameters | Evaluation |
| --- | --- | --- | --- |
| `not_empty` | Text, JSONB object/array | none | Tabular |
| `equals`, `not_equals` | Any non-relation canonical value | typed `value` | Tabular |
| `one_of` | Text, bigint, numeric, date/time, UUID | typed `values` | Tabular |
| `starts_with`, `ends_with` | Text | `text` | Tabular |
| `pattern` | Text | bounded pattern, Tabular dialect/version | Tabular |
| `min_length`, `max_length`, `exact_length` | Text | non-negative integer | Tabular |
| `min_words`, `max_words`, `exact_words` | Text | non-negative integer | Tabular |
| `email_shape` | Text | none | Tabular |
| `url_shape` | Text | allowed protocols | Tabular; never implied by URL Field |
| `hex_shape` | Text | case policy, optional prefix | Tabular |
| `min_value`, `max_value` | Bigint, numeric | exact typed value, inclusive flag | Tabular |
| `integer_value` | Numeric | none | Tabular |
| `multiple_of` | Bigint, numeric | positive exact step | Tabular |
| `before`, `after` | Date, time, timestamptz | fixed typed value, inclusive flag | Tabular |
| `past`, `future`, `today` | Date, timestamptz as applicable | timezone inheritance | Tabular dynamic rule |
| `min_items`, `max_items`, `exact_items` | JSONB array | non-negative integer | Tabular |
| `unique_items` | JSONB scalar array | none | Tabular |
| `items` | JSONB array | ordered compatible child rules | Tabular |
| `required_keys`, `allowed_keys` | JSONB object | bounded unique key list | Tabular |
| `properties` | JSONB object | one-level key to child-rule map | Tabular |

`min_*` and `max_*` are inclusive by default. The UI describes inclusive
behavior directly; it does not expose cryptic `gt`, `ge`, `clt`, or `wle`
names from the inspiration source.

## Implied registry

| Source | Locked implied rules |
| --- | --- |
| `BIGINT` | PostgreSQL bigint parse and range; integer value. |
| `NUMERIC(p,s)` | Exact numeric parse plus configured precision/scale. |
| `BOOLEAN` | Boolean or SQL NULL; false is a value, not empty. |
| `DATE`, `TIME`, `TIMESTAMPTZ` | PostgreSQL type parse; canonical transport representation. |
| `UUID` | PostgreSQL UUID parse/canonical value. |
| JSONB Metadata | Valid JSON, top-level object, bounded payload. |
| JSONB string-list Fields | Valid JSON, top-level array, string items, bounded payload. |
| Checkbox list/Multi-select | String-list rules plus configured option membership. |
| Tag List | String-list rules plus non-empty and unique items. |
| Email Field | `email_shape` after edit exit; source remains Text. |
| URL/Phone Field | No strict semantic validator under accepted Context. |
| Color Field | Color-shape rule matching configured color modes. |
| Country/Currency Field | Current code-registry membership. |
| Rating/Slider | Configured min, max, and step. |
| Slug Field | Versioned slug-shape rule. |
| Restricted Select/Radio | Option membership matching scalar storage. |
| Relation | Native foreign key and target-key type. |

## Composition semantics

- SQL NULL skips every Tabular validator. Native Required/NOT NULL rejects it
  through the separate Constraints lifecycle.
- Empty text/array/object is distinct from NULL and is rejected only by an
  implied or configured non-empty/length rule. Zero and false are never empty.
- Evaluate storage-implied, Field-implied, then configured rules in stored
  order. Database constraint evaluation is separate from this validator list.
- Collect all actionable failures up to eight per cell, then return an
  overflow count. Do not stop at the first configured failure.
- Reject exact duplicate rules. Detect contradictions in the validator
  definition before save,
  including empty `one_of` intersections, minimum greater than maximum, and
  equality outside another bound.
- Child `items`/`properties` rules use the same IDs and failure shape with a
  bounded JSON path. Recursive schemas and arbitrary JSON Schema are deferred.

## Pinned Stackpress disposition

Adapt presence, equality, membership, prefix/suffix, pattern, temporal,
comparison, length, word-count, color/email/hex/URL, type, and array concepts
to the registry above. Do not copy coercive equality, `Number(value) || 0`,
local-clock dates, UTF-16 length, literal-space word counting, arbitrary
string dispatch, or the pinned price/URL/number patterns.

Reject the `cc` assertion as a public Field validator: recognizing a card-like
string is not payment security and invites sensitive authentication data into
ordinary spreadsheet columns. Type assertions become locked storage rules,
and `price` becomes exact numeric storage plus optional scale/value rules.
