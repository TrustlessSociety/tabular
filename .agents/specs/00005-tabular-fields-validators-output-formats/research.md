# Research

## Research rules

- Official documentation/source and pinned versions were preferred.
- Labels were not treated as value-shape evidence.
- The exact catalog/source identities are preserved in
  [the Resource File](../../resources/2026-08-13-frui-stackpress-field-format-validator-source.md).
- Research was bounded to the declared queue; no executable Proof was needed.

## R-001: Current Tabular contract and implementation

**Status: complete.** Inspected 2026-08-13.

Primary paths:

- `src/plugins/files/helpers/contracts.ts`
- `src/plugins/files/helpers/validation.ts`
- `src/plugins/grid/components/column-settings-panel.tsx`
- `src/plugins/grid/helpers/contracts.ts`
- `src/plugins/grid/helpers/tabulator-adapter.ts`
- `src/plugins/database/migrations/0004-file-ddl-lifecycles.sql`
- `src/plugins/import-export/helpers/inference.ts`

Findings:

- Storage already registers Text, Bigint, Numeric, Boolean, Date, Time,
  Timestamptz, JSONB, and UUID.
- Field kinds already name most requested scalar/source controls plus Tags and
  Text List. Format kinds similarly name many requested renderers, but declared
  registry membership is ahead of complete grid behavior.
- Column metadata stores Field/Format JSONB objects, Required, and Unique; it
  has no versioned validator configuration.
- Axis validation checks only whether names exist, not whether a
  storage/Field/Format combination is compatible.
- Field default inference maps numeric-like Fields, Boolean Fields, Date, and
  Date-time explicitly, then falls through to Text. Time, Tags, and Text List
  therefore receive incorrect default storage today.
- The grid value contract is scalar (`string | number | boolean | null`) and
  cannot round-trip JSONB objects/arrays.
- Import inference can recognize JSONB but does not distinguish object versus
  array for semantic Field suggestions.
- Current renderers cover Boolean, numeric/price, Email/URL/Phone links, and a
  UTC Date-time projection; many declared Formats need dedicated safe output
  implementations.

Affected Gaps: G-003 through G-009 and implementation impact.

## R-002: Complete Frui form catalog

**Status: complete.** Sources accessed 2026-08-13:

- `https://frui.js.org/form`
- `frui@0.2.9` declarations and ESM source from the official package repository

Findings:

- The live catalog contains 29 entries; all are dispositioned in
  [Field Catalog](field-catalog.md).
- Scalar booleans, strings, exact numbers, date/time values, and JSON object or
  array shapes have clean PostgreSQL mappings.
- Select and Slider each have scalar and array modes; Tabular must not hide a
  cardinality/storage change inside ordinary Field configuration.
- Metadata is object-like, while Tags/Text List are string arrays.
- Frui Text Editor writes HTML through `innerHTML` and includes code view,
  templates, embedded media, iframes, and data URLs; TEXT storage is clean but
  the accepted rich-content security/product boundary is not.
- File/Image controls depend on upload/media lifecycle, so their emitted URLs
  do not make them self-contained column Fields.

Affected Gaps: G-001, G-007, G-008, G-010, G-011.

## R-003: Complete Frui view catalog

**Status: complete.** Sources accessed 2026-08-13:

- `https://frui.js.org/view`
- `frui@0.2.9` declarations and ESM source

Findings:

- The live catalog contains 24 entries; all are dispositioned in
  [Output Format Catalog](format-catalog.md).
- Most scalar/list displays can be adapted if Tabular owns escaping, protocol
  allow-lists, locale/timezone config, bounds, and plain-text fallback.
- Frui Formula calls JavaScript `eval`; Frui HTML injects raw HTML; and the
  Markdown renderer is not a Tabular-owned sanitizer. They cannot be adopted
  as-is.
- Image views require the deferred media authorization/privacy boundary.
- Nested Tabular output is a layout/subgrid, not a compact first-slice cell
  Format.

Affected Gaps: G-002, G-008, G-010.

## R-004: Pinned Stackpress assertion catalog

**Status: complete.** Source accessed 2026-08-13:

- `stackpress/src/schema/assert.ts` at commit
  `418d9d08d53657c01bd091593d1c821974f2d1c4`

Findings:

- The source covers presence, equality/membership, prefix/suffix/pattern,
  temporal comparison, numeric comparison, character/word counts, semantic
  patterns, type checks, and element-wise array assertions.
- It demonstrates useful validator categories, but not the required Tabular
  composition, stable rule identity, error shape, DDL ownership, or migration
  lifecycle.
- Coercive equality/numeric behavior, local clock/date parsing, UTF-16 length,
  literal-space word counting, arbitrary assertion-name dispatch, and several
  narrow/defective patterns must not define the public Tabular contract.
- Required and non-empty are separate concepts; Tabular additionally fixes
  zero, false, SQL NULL, and empty collection semantics.

Affected Gaps: G-003, G-004, G-007.

## R-005: PostgreSQL type and constraint semantics

**Status: complete.** Official PostgreSQL 18/current documentation accessed
2026-08-13:

- `https://www.postgresql.org/docs/current/datatype-json.html`
- `https://www.postgresql.org/docs/current/arrays.html`
- `https://www.postgresql.org/docs/current/datatype-numeric.html`
- `https://www.postgresql.org/docs/current/datatype-datetime.html`
- `https://www.postgresql.org/docs/current/ddl-constraints.html`

Findings:

- JSONB enforces valid JSON but permits scalar, array, and object values; it
  discards duplicate object keys and object-key order. Field shape therefore
  needs an additional locked Tabular validator.
- Native arrays enforce base element type but do not enforce declared length or
  dimensions. JSONB arrays remain the proposed first-slice collection mapping.
- Numeric is exact and can impose precision/scale. JavaScript floating point
  must not become authority for stored numeric values or validator parameters.
- TIMESTAMPTZ stores an instant in UTC and does not retain its input timezone;
  locale/timezone presentation belongs to Format configuration.
- CHECK passes TRUE or NULL, so native Required remains NOT NULL. PostgreSQL
  assumes CHECK expressions are immutable and does not guarantee constraint
  order; these findings reinforce keeping the Tabular validator list separate
  from native schema constraints.
- UNIQUE, foreign keys, native typing, and any separately managed CHECK remain
  PostgreSQL authority through governed DDL. Configured validators do not
  generate target-table constraints.

Affected Gaps: G-005 through G-009 and G-011.

## Rejected leads

- Copying Frui components directly: rejected because interaction inspiration
  does not provide Tabular value, security, grid-density, or authority rules.
- Copying pinned Stackpress assertions verbatim: rejected because several
  coercion and pattern semantics conflict with exact PostgreSQL values.
- Treating every Frui entry as a Field/Format: rejected because media, nested
  layouts, raw markup, formulas, and secret entry cross established boundaries.

## Research conclusion

The source record is sufficient to draft all catalog, validator, separation,
and lifecycle decisions. The user has accepted application-only validator
ownership and save-with-existing-violations behavior. No bounded executable
uncertainty remains at the spec research layer; remaining decision review, not
more research, is the next gate.
