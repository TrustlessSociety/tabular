# Computed Columns And FRUI Support Findings

Access date: 2026-07-24.

This file records R-021. It answers the PostgreSQL computed-column question,
classifies the pinned FRUI families by implementation risk, and records the
user's acceptance of the G-028 research direction. It remains research-only.

Source material and pinned FRUI provenance are preserved in the
[Mathesar-like direction and FRUI packet](../../resources/2026-07-24-mathesar-frui-direction.md).

## PostgreSQL Computed Values

PostgreSQL 18 supports generated columns:

```sql
subtotal numeric GENERATED ALWAYS AS (quantity * unit_price) STORED
```

The [PostgreSQL 18 generated-column contract](https://www.postgresql.org/docs/18/ddl-generated-columns.html)
defines two kinds:

- `VIRTUAL`, the PostgreSQL 18 default, computes on read and stores no value;
- `STORED` computes on insert/update and stores the result.

Generated columns are read-only and recalculate when their source row changes.
Their expression may use other columns in the same row, but only immutable
functions. It cannot use subqueries, other rows/tables, or another generated
column.

This supports a Tabular `computed` field without requiring a spreadsheet
formula engine. The UI should provide a constrained expression builder,
show the generated SQL before applying DDL, and mark the grid cell read-only.
It must never execute FRUI's JavaScript `Formula` component.

Use the PostgreSQL-native layers deliberately:

| Need | PostgreSQL feature | Tabular behavior |
| --- | --- | --- |
| Deterministic same-row calculation | Generated column | Show as a read-only computed field |
| Cross-table lookup, join, or aggregate | [View](https://www.postgresql.org/docs/18/sql-createview.html) | Expose as a read-only or capability-checked derived table |
| Expensive aggregate with controlled refresh | [Materialized view](https://www.postgresql.org/docs/18/rules-materializedviews.html) | Advanced/deferred administration surface |
| Google Sheets formula compatibility | Separate parser/runtime | Remains conditional under G-026 |

Generated columns therefore narrow G-026 but do not answer Google Sheets/XLSX
formula migration. Spreadsheet formulas can be positional, cross-row,
cross-sheet, volatile, or external; native generated columns cannot.

## Low-Friction Field Families

These FRUI-inspired families map to ordinary PostgreSQL types and need no
special backend service. “Low friction” still requires normal validation,
escaping, accessibility, and transaction handling.

| Tabular field family | FRUI inspiration | PostgreSQL shape |
| --- | --- | --- |
| Text, long text, slug, masked text | `Input`, `Textarea`, `SlugInput`, `MaskInput` | `text` |
| Email, URL, phone | text controls | `text` plus explicit validation |
| Number, price | `NumberInput` | `numeric`; currency remains metadata |
| Checkbox/switch | `Checkbox`, `Switch` | `boolean` |
| Select/radio/suggestion | `Select`, `Radio`, `SuggestInput` | `text`, checked value, or foreign key |
| Date, date-time, time | date/time inputs | `date`, `timestamptz`, `time` |
| Color | `ColorInput` | normalized `text` plus check validation |
| Country/currency code | country/currency selects | ISO-like code in `text` |
| Rating/slider | `Rating`, `Slider` | bounded `smallint` or `numeric` |
| Tags/text list | `TagList`, `TextList` | usually `text[]`; `jsonb` only when structure requires it |
| Code/Markdown source | `CodeEditor`, `MarkdownEditor` | plain `text`; rendering has a separate policy |
| Relation | searchable select/suggestion | real foreign key |
| Computed | PostgreSQL, not FRUI `Formula` | generated column |

Password input is not a general-purpose field type. Authentication secrets need
a dedicated credential flow, hashing policy, restricted display, and audit
boundary.

## Low-Friction Format Families

The following are display-only and can be supported with routine validation:

- plain, clipped, wrapped, and text-transform;
- number and currency;
- date, date-time, time, and relative-time;
- yes/no;
- color swatch;
- country and currency labels;
- rating;
- tags and simple lists;
- code highlighting;
- link, email-link, and phone-link with an allowed-protocol policy;
- labels, badges, and related-record labels.

Formats never change canonical values. A formatter may be replaced without
altering the PostgreSQL column.

## Supportable With Additional Policy

| Family | Why it is not low-friction |
| --- | --- |
| Markdown | Needs sanitization, safe-link rules, and a controlled renderer |
| Rich text | Stores HTML-like content and needs sanitization, media, paste, and compatibility rules |
| Metadata, spread, nested tabular | Needs a stable `jsonb` shape, query/index policy, and bounded rendering |
| File and image | Needs upload/storage, authorization, malware/size/type checks, signed delivery, cleanup, and retention |
| Image film/carousel | Inherits the attachment boundary and remote-image/CSP concerns |

## Do Not Reuse Directly

- FRUI `Formula` uses JavaScript `eval`; Tabular should use validated
  PostgreSQL expressions or a separately designed formula engine.
- FRUI `HTML` uses `dangerouslySetInnerHTML`; raw HTML is not an acceptable
  default field or formatter.
- Password controls must not turn arbitrary table columns into credential
  stores.

## Gap Impact

- G-026 is accepted: native computed fields remain in scope, imports preserve
  exact values, and spreadsheet formula compatibility moves to a later spec.
- G-027's low-friction registry is accepted. The policy-gated families require
  a separate later spec before implementation.
- G-028's system-schema metadata/draft direction is accepted. P-007 later
  verified schema drift, key variation, DDL safety, constraint translation,
  draft promotion, and permission preservation within its recorded limit.
