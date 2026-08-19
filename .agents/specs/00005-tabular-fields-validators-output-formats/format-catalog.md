# Output Format Catalog

## Format invariant

A Format renders the canonical stored value. It never mutates storage, changes
the Field, installs a validator, or makes an invalid stored value valid.
Format configuration is locale/presentation metadata only.

## Complete Frui view disposition

| Frui view | Disposition | Compatible storage | Tabular contract |
| --- | --- | --- | --- |
| Code Highlighter | Add | `TEXT` | Escape source and use an allow-listed language grammar; never execute code. |
| Color | Retain | `TEXT` | Render an escaped label plus swatch; invalid legacy text falls back to plain text. |
| Country | Retain | `TEXT` | Convert a stored country code to a configured-locale label; retain code fallback. |
| Currency | Retain | `NUMERIC`, `BIGINT` | Explicit currency code, locale, decimals, and rounding display only. |
| Date Format | Adapt | `DATE`, `TIME`, `TIMESTAMPTZ` | Separate Date, Time, Date-time, and Relative-time formats with explicit locale/timezone. |
| Email Link | Retain | `TEXT` | Escaped label and `mailto:` target; malformed legacy text falls back to plain text. |
| Formula | Reject | None | Frui evaluates a generated expression with JavaScript `eval`; formulas have a separate deferred spec. |
| HTML | Reject | None | Frui uses raw `dangerouslySetInnerHTML`; Tabular does not expose raw HTML output. |
| Image | Defer | Future asset ID | Requires the deferred asset authorization, proxying, loading, and privacy policy. |
| Image Carousel | Defer | Future asset-ID array | Media plus multi-item cell-layout boundary. |
| Image Film | Defer | Future asset-ID array | Media plus multi-item cell-layout boundary. |
| Link | Retain | `TEXT` | Escape label and allow-list target protocols; unsafe values display as text. |
| List | Retain/refine | `JSONB` array | Render bounded escaped items; overflow count opens a non-cell detail surface. |
| Markdown | Add adapted | `TEXT` | Parse through a Tabular-owned sanitizer; raw HTML and active URL schemes are disabled. |
| Metadata | Add | `JSONB` object | Compact escaped key/value preview; full object opens a bounded detail surface. |
| Number Format | Retain/refine | `BIGINT`, `NUMERIC` | Locale, grouping, decimals, percent, and sign style affect output only. |
| Phone Link | Retain | `TEXT` | Preserve visible stored text; best-effort safe `tel:` target or plain-text fallback. |
| Rating Format | Retain | `BIGINT`, `NUMERIC` | Bounded icon/number display; raw value remains accessible text. |
| Spread | Adapt | `JSONB` array | A List variant with configured escaped separator, never joined storage. |
| Tabular | Defer | `JSONB` record array | Nested record grids cross the accepted deeply-nested and cell-density boundary. |
| Tags | Retain/refine | `JSONB` string array | Bounded escaped chips with overflow count; order follows stored array. |
| Text Overflow | Retain | `TEXT` | Existing Plain, Clipped, and Wrapped variants. |
| Text Transform | Retain | `TEXT` | Visual case transformation with explicit locale; copied/raw value remains unchanged. |
| Yes/No | Retain | `BOOLEAN` | Configurable true/false/null labels with accessible text, not color alone. |

## Safety and fallback rules

- All text is inserted as text content unless it passes a named, reviewed safe
  renderer. A formatter cannot opt into arbitrary HTML.
- Link-like formats allow-list protocols and add `noopener noreferrer` for
  external navigation. Invalid or unsafe targets render as ordinary text.
- Markdown rendering strips raw HTML and unsafe URLs. The original source is
  the editable and copyable value.
- Collection previews are bounded by item count and rendered height. They do
  not create nested editors inside a grid cell.
- Renderer failure, unknown config, or incompatible legacy metadata falls back
  to escaped plain text and reports a diagnostic; it never blanks the value.

## Locale and timezone rules

- Canonical `DATE` and `TIME` values contain no locale.
- `TIMESTAMPTZ` is an instant; PostgreSQL does not retain its input timezone.
- Date/time Format config stores an IANA timezone or explicit workspace/user
  inheritance. Browser-local time is never an unrecorded durable default.
- Number/currency config stores an explicit locale inheritance and currency
  code where applicable. Currency Field values and currency Format config are
  independent.
