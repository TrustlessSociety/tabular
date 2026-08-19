# Compatibility Contract

## Resolution rule

Compatibility is derived from canonical value shape, not from matching labels.
A column configuration is valid only when all four checks pass:

1. Storage can represent the Field's canonical value without lossy coercion.
2. Every implied and configured validator accepts that value family.
3. Format can render that storage/refined shape without reinterpretation.
4. Field, Format, and validator configuration satisfies its versioned schema.

A Field supplies a recommended default Format, not an exclusive Format. For
example, any Text-backed column may choose Plain, Clipped, Wrapped, or a safe
compatible semantic renderer even if its editor is ordinary Text.

## Canonical value families

| Family | PostgreSQL storage | Compatible Field groups | Compatible Format groups |
| --- | --- | --- | --- |
| Text source | `TEXT` | Text, long text, Email, URL, Phone, Masked, Slug, Suggest, Markdown source, Code source, Color, Country/Currency code | Plain/Clipped/Wrapped, transform, safe links, code, Markdown, color, country/currency label |
| Whole number | `BIGINT` | Number, Rating, Slider, scalar option where configured | Plain, number, rating, currency where explicitly configured |
| Exact decimal | `NUMERIC` | Number, Price, Rating, Slider, scalar option where configured | Plain, number, rating, currency |
| Boolean | `BOOLEAN` | Checkbox, Switch | Plain or Yes/No |
| Calendar date | `DATE` | Date | Plain or Date |
| Wall-clock time | `TIME` | Time | Plain or Time |
| Instant | `TIMESTAMPTZ` | Date-time | Plain, Date-time, Date, Time, Relative-time |
| Identifier | `UUID` or target key type | Relation or advanced scalar input | Plain or Related record when relation metadata exists |
| JSON object | `JSONB` plus object shape | Metadata | Plain JSON fallback or Metadata |
| JSON string array | `JSONB` plus array/item shape | Tags, Text List, Checkbox list, Multi-select | Plain JSON fallback, List, Spread, Tags |

`Plain` is a safe escaped canonical fallback for every family. A semantic
Format may be selected on a compatible storage even when the Field differs;
Country Label on a Text Field is valid if its values are country codes.

## Validator filtering

- Storage compatibility is the first filter; JSON refined shape is the second.
- Field-implied rules are added after storage rules and cannot be configured on
  an incompatible storage.
- Configured rules never cause an implicit storage cast. Choosing a numeric
  bound on Text is rejected rather than coercing Text to Numeric.
- Relation key validity is a foreign key, not `one_of` copied into metadata.
- Required and Unique are constraints, so they remain available across storage
  families subject to PostgreSQL support and existing authority rules.

## Defaults and transitions

Recommended defaults are declared in one registry and tested as ordinary
combinations. They are not special-case fallthrough code. At minimum:

| Field | Storage default | Format default |
| --- | --- | --- |
| Text-like source | Text | Plain text |
| Number | Numeric | Number |
| Checkbox/Switch | Boolean | Yes/No |
| Date/Time/Date-time | Date/Time/Timestamptz | Matching temporal Format |
| Metadata | JSONB object | Metadata |
| Tags | JSONB string array | Tags |
| Text List | JSONB string array | List |
| Multi-select/Checkbox list | JSONB string array | Tags or List |

Changing any axis reruns the same configuration compatibility function. A
validator or same-storage Field change saves without an existing-row gate;
materialized violations render `#VALUE!` without changing stored values. No UI
helper may write cell values, populate defaults, or change another axis merely
because a Field or Format selection changed.
