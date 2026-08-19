# Field Catalog

## Disposition terms

- **Add**: a new first-slice Field with a complete value contract.
- **Retain**: an existing Tabular Field whose contract is confirmed or refined.
- **Adapt**: use the interaction, but give it a Tabular-owned value contract.
- **Defer**: the SQL value is plausible, but a required product/security
  boundary is outside this spec.
- **Reject**: do not expose this concept as an ordinary database column Field.

## Complete Frui form disposition

| Frui control | Disposition | Canonical storage/value | Field rule or rationale |
| --- | --- | --- | --- |
| Checkbox | Retain | `BOOLEAN` | Scalar boolean; nullable blank remains distinct from false. |
| Color Input | Retain | `TEXT` | Canonical CSS color string; Color Field implies the selected color-shape rule. |
| Country Select | Retain | `TEXT` | Store stable ISO 3166-1 alpha-2 code, never the display label. |
| Currency Select | Retain | `TEXT` | Store stable ISO 4217 code, never a symbol or localized name. |
| Date Input | Retain | `DATE` | Canonical ISO date; storage parsing is implied. |
| Datetime Input | Retain | `TIMESTAMPTZ` | Canonical instant with an explicit offset; display timezone belongs to Format config. |
| File Input | Defer | Candidate `TEXT` asset ID | Requires the deferred upload, authorization, lifecycle, and asset-serving contract. |
| File List | Defer | Candidate `JSONB` ID array | Same media boundary plus collection lifecycle. |
| Image Input | Defer | Candidate `TEXT` asset ID | Never make a remote URL or data URL an implicit managed attachment. |
| Image List | Defer | Candidate `JSONB` ID array | Same media boundary plus collection lifecycle. |
| Input | Retain | `TEXT` | Ordinary single-line Text Field. |
| Markdown Editor | Retain | `TEXT` source | Editor stores Markdown source; default output is plain text until safe Markdown Format is selected. |
| Mask Input | Retain | `TEXT` | Mask guides entry; a configured pattern validator decides acceptance. |
| Metadata | Add | `JSONB` object | Top-level object with string keys and JSON scalar values; duplicate keys rejected before serialization. |
| Number Input | Retain | `BIGINT` or `NUMERIC` | Storage selection decides whole versus exact decimal; UI does not use IEEE-754 as authority. |
| Password Input | Reject | None | Masking is not encryption, hashing, secret management, or safe password storage. Use Masked Text only for non-secrets. |
| Phone Input | Retain | `TEXT` | Preserve the entered string; Phone does not imply strict rejection. |
| Radio | Retain | Storage-compatible scalar | Restricted one-of options; all option values use one scalar storage family. |
| Rating | Retain | `NUMERIC` | Field config supplies min, max, and step as locked implied rules. |
| Select | Adapt | Scalar storage or `JSONB` array | Keep Select scalar. Add Multi-select as a separate Field with string-array semantics. |
| Slider | Retain scalar | `NUMERIC` | Scalar min, max, and step are locked implied rules. Range mode is deferred. |
| Slug Input | Retain | `TEXT` | Slug Field implies the documented slug-shape rule; no later silent rewrite. |
| Suggest Input | Retain | `TEXT` | Suggestions do not restrict accepted values unless Restricted is enabled. |
| Switch | Retain | `BOOLEAN` | Same canonical value as Checkbox; interaction differs, storage does not. |
| Tag List | Retain/refine | `JSONB` string array | Top-level array, string items, no duplicate tag, stable input order. |
| Textarea | Retain | `TEXT` | Multi-line plain text. |
| Text Editor | Defer | Candidate `TEXT` sanitized markup | Frui reads/writes raw HTML and embeds media; accepted Context defers rich content. |
| Text List | Retain/refine | `JSONB` string array | Top-level array with string items; duplicates allowed unless configured otherwise. |
| Time Input | Retain/refine | `TIME` | Canonical time without zone; current Field defaulting must stop mapping it to Text. |

## Tabular adaptations and retained non-catalog Fields

| Field | Storage/value | Contract |
| --- | --- | --- |
| Checkbox list | `JSONB` string array | Tabular adaptation requested by the user; restricted option set and homogeneous string items. |
| Multi-select | `JSONB` string array | Separate from scalar Select so cardinality cannot change silently in config. |
| Long text | `TEXT` | Existing plain-text Field retained; Textarea is its editor. |
| Email | `TEXT` | Existing semantic Field; implies Tabular email-shape validation after edit exit. |
| URL | `TEXT` | Existing loose Field; no strict implied URL rule under accepted Context. |
| Price | `NUMERIC` | Exact decimal input; default Format remains symbol-free and two-decimal display. |
| Relation | Target key type | Native foreign key and relation picker; target key dictates storage. |
| Code source | `TEXT` | Existing text source Field; no arbitrary execution. |

## JSONB collection decision

Spec 00005 selects JSONB for these first-slice multi-value Fields because the
user requested JSONB arrays and Tabular already recognizes JSONB storage.
Every Field adds a locked top-level shape and element-type rule; JSONB storage
alone is not enough because PostgreSQL accepts any JSON shape.

Native `text[]` is valid PostgreSQL and enforces element type more directly,
but it would introduce a second collection codec, cast policy, import syntax,
and metadata choice without a distinct requested behavior. It remains a later
advanced storage option, not an automatic replacement for JSONB Fields.

## Field-change rule

Changing between Fields with the same storage is metadata-only and is never
blocked by existing values. A value that violates the destination Field's
implied Tabular validators renders `#VALUE!` while remaining unchanged in
PostgreSQL. Any storage or cardinality change still uses governed DDL planning,
explicit casts, and the existing draft/error boundary. No editor choice may
silently rewrite accepted values.
