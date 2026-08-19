# Tabular Fields, Validators, and Formats

## Status and authority

Accepted reusable product contract promoted when Spec 00005 Froze on
2026-08-13. Load this file for column value families, semantic Fields, output
Formats, validator behavior, existing-value errors, and deferred controls.

## Independent axes

PostgreSQL storage, semantic Field/editor, output Format, native constraints,
and Tabular validators are independent. Selecting a Field, Format, validator,
or default never writes cell values or silently changes another axis. A Format
renders accepted canonical values but never converts storage.

## Accepted canonical value families

| Value family | Storage | Accepted Field groups |
| --- | --- | --- |
| Text source | `TEXT` | Text, long text/Textarea, Email, URL, Phone, Masked, Slug, Suggest, Markdown source, Code source, Color, Country code, Currency code |
| Whole number | `BIGINT` | Number, Rating, scalar Slider, compatible scalar option |
| Exact decimal | `NUMERIC` | Number, Price, Rating, scalar Slider, compatible scalar option |
| Boolean | `BOOLEAN` | Checkbox, Switch |
| Calendar date | `DATE` | Date |
| Wall-clock time | `TIME` | Time |
| Instant | `TIMESTAMPTZ` | Date-time |
| Identifier | `UUID` or target key type | Relation or advanced scalar input |
| JSON object | `JSONB` with object rule | Metadata |
| JSON string array | `JSONB` with array/item rules | Tags, Text List, Checkbox list, Multi-select |

Metadata accepts a top-level object with string keys and JSON scalar values;
duplicate keys are rejected before JSONB serialization. Collection Fields use
top-level JSONB arrays with homogeneous string items. Tag List also implies
non-empty unique items; Text List permits duplicates unless configured.

Native PostgreSQL arrays remain a later advanced storage option. The accepted
first slice uses JSONB arrays so it has one collection codec/import/cast family.

## Field behavior and deferrals

- Select remains scalar. Multi-select is a separate JSONB-array Field so a
  cardinality/storage change cannot hide inside Field configuration.
- Checkbox List is a Tabular adaptation with restricted option membership.
- Number/Price/Rating/Slider preserve exact decimal or integer values; browser
  floating point is not canonical authority.
- Country and Currency store stable codes, never localized display labels.
- Date-time stores an instant with an explicit offset. Display timezone is
  Format configuration.
- URL and Phone preserve entered Text and do not imply strict rejection.
- Password is rejected as an ordinary Field because masking is not secure
  password or secret storage.
- File/Image inputs and lists are deferred pending an asset lifecycle.
- Rich Text Editor is deferred because its HTML/media surface needs a separate
  sanitization and rich-content contract.
- Range Slider is deferred; scalar Slider is accepted.

## Output Formats

Safe compatible Formats include escaped Plain/Clipped/Wrapped text, visual text
transform, safe Email/Phone/Link targets, number/currency/rating, Date/Time/
Date-time/Relative-time, Color, Country/Currency labels, Yes/No, code
highlighting, sanitized Markdown, Metadata preview, List, Spread, and Tags.

- Link protocols are allow-listed; unsafe targets fall back to plain text.
- Markdown uses a Tabular-owned sanitizer with raw HTML and active unsafe URL
  schemes disabled. The editable/copyable value remains Markdown source.
- Collection previews are bounded and do not create nested cell editors.
- Renderer/config failures fall back to escaped canonical text and report a
  diagnostic rather than hiding values.
- Locale and IANA timezone inheritance are explicit Format metadata.
- Raw HTML and executable Formula output are rejected. Image/media and nested
  Tabular views remain deferred.

## Validator ownership

Validators are versioned Tabular metadata and input rules. They never create
target-table DDL, native CHECK constraints, or row rewrites. Required/NOT NULL,
Unique, foreign keys, storage types/typmods, and separately managed native
constraints stay in the PostgreSQL Constraints/Advanced lifecycle.

A column evaluates locked storage-implied rules, locked Field-implied rules,
then ordered configured rules. Compatible configured families include
presence/emptiness, equality/membership, prefix/suffix/pattern, length/word
count, numeric bounds/integer/multiple, fixed and dynamic temporal comparison,
array length/uniqueness/items, and one-level object key/property validation.
Arbitrary recursive schemas are deferred.

- SQL NULL skips Tabular validators; native Required/NOT NULL owns nullability.
- Empty text/collections, zero, false, and SQL NULL remain distinct.
- Exact duplicate or internally contradictory validator definitions are
  rejected before metadata save.
- Return all actionable failures up to eight per cell plus an overflow count.
- Validator IDs are stable and closed/versioned; arbitrary JavaScript, SQL,
  function names, and unsafe regular-expression behavior are not metadata.

## Save and error lifecycle

Saving valid validator metadata succeeds regardless of existing row values and
does not run a full-table gate. Materialized cells are revalidated immediately;
later values are validated when loaded. A violating stored value renders
`#VALUE!`, while edit mode exposes its unchanged raw value. Changing/removing
rules can restore ordinary output without touching PostgreSQL data.

Future invalid Tabular edits, paste values, imports, and defaults do not enter
the database; they remain correctable actor-owned drafts under the accepted
grid lifecycle. Direct SQL can bypass validators, but violating values surface
as `#VALUE!` when Tabular reads them.

Changing a same-storage Field is metadata-only and can make existing values
render `#VALUE!`. Changing storage or cardinality remains governed PostgreSQL
DDL/cast work because it changes the database, not because validators changed.
