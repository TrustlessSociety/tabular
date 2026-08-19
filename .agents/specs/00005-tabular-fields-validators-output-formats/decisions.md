# Decisions and Gaps

## Accepted requirements

### D-001: Independent axes remain mandatory

Storage type, semantic Field/editor, output Format, native constraints, and
Tabular validators remain independent. A Format never rewrites canonical
stored values.

Source: accepted Tabular Context Files.

### D-002: Columns support multiple validators

A column may carry many compatible validators. Composition, ordering,
parameters, duplicate handling, and bounded error aggregation are explicit.

Source: user requirement, 2026-08-13.

### D-003: Storage types imply baseline validation

Tabular mirrors PostgreSQL storage acceptance as locked baseline input rules.
Semantic Fields may add locked rules, while configured rules remain
independently removable. These validators do not alter the native database.

Source: user requirement, 2026-08-13.

### D-004: Validators are a Tabular layer, not database constraints

Saving a valid validator definition always succeeds regardless of current
accepted row values. It creates no target-table DDL, PostgreSQL CHECK, data
rewrite, or preflight gate. Existing stored values that violate the new active
rule render as `#VALUE!` while their database values remain unchanged. Future
invalid Tabular inputs are retained as correctable drafts and do not enter the
database.

Required, Unique, foreign keys, storage types/typmods, and other native schema
behavior remain a separate Constraints/PostgreSQL surface. Direct SQL writes
can bypass Tabular validators; any violating value is surfaced as `#VALUE!`
when Tabular reads it.

Source: user clarification, 2026-08-13.

## Accepted resolutions

### G-001: Complete Field disposition

Accepted resolution: use [Field Catalog](field-catalog.md). Add Metadata and
safe value-only adaptations; retain/refine existing clean Fields; defer media,
range-slider, and rich HTML editing; reject Password as secret storage.

Evidence: live Frui form catalog and `frui@0.2.9` source.

### G-002: Complete Format disposition

Accepted resolution: use [Output Format Catalog](format-catalog.md). Add or
refine safe scalar/list renderers; adapt sanitized Markdown; reject Formula
and raw HTML; defer image/media and nested Tabular views.

Evidence: live Frui view catalog; Frui Formula calls `eval` and HTML calls
`dangerouslySetInnerHTML`.

### G-003: Versioned validator registry

Accepted resolution: use [Validator Catalog](validator-catalog.md), with
readable, versioned Tabular rule IDs and typed parameters. Stackpress is concept
inspiration only; its coercion and regex behavior is not copied verbatim.

Evidence: pinned Stackpress `assert.ts` source.

### G-004: Implied/configured composition

Accepted resolution: show storage- and Field-implied rules as locked, then
evaluate ordered configured rules. SQL NULL skips ordinary rules; Required is
separate; empty, zero, false, and NULL remain distinct. Return up to eight
failures plus overflow count.

### G-005: PostgreSQL enforcement ownership

Accepted resolution: configured and Field-implied validators are Tabular-only
metadata and input validation. They never generate target-table CHECK
constraints. Storage types/typmods, NOT NULL, UNIQUE, foreign keys, and any
separately managed native constraints remain PostgreSQL authority and are not
reclassified as validators.

Evidence: D-004 and accepted PostgreSQL authority Context.

### G-006: Existing values when saving validators

Accepted resolution: save valid validator metadata without scanning or gating
on existing rows. Revalidate materialized values immediately; a violating
stored value renders `#VALUE!` without changing its PostgreSQL value. Values
loaded later receive the same validation when materialized. Removing or
changing the validator revalidates the display again.

### G-007: Bounded JSONB validation

Accepted resolution: first slice supports top-level object/array shape,
homogeneous scalar array items, and one level of object-property rules.
Recursive schemas and arbitrary JSON Schema are deferred.

### G-008: Locale and timezone ownership

Accepted resolution: canonical storage is locale-neutral. Locale and IANA
timezone inheritance are explicit Format configuration. TIMESTAMPTZ represents
an instant and does not retain the input zone.

### G-009: Field-change compatibility

Accepted resolution: same-storage Field changes save metadata without a row
preflight. Existing values that violate destination Field-implied validators
render `#VALUE!`; values remain unchanged. Storage/cardinality changes still
use governed casts and DDL because that is a storage operation, not validator
activation.

### G-010: Non-column concepts

Accepted resolution: do not force secret entry, file/media pipelines, nested
record grids, arbitrary markup, or executable formulas into a column
Field/Format. Catalogs record explicit defer/reject rationales.

### G-011: JSONB versus native PostgreSQL arrays

Accepted resolution: use the user's JSONB-array mapping for Tag List, Text
List, Checkbox list, and Multi-select. Add locked top-level array and string
item rules. Defer `text[]` as an advanced storage option because it introduces
a second collection codec/cast/import family without new requested behavior.

Evidence: PostgreSQL arrays enforce element type but not declared dimensions or
length; JSONB accepts heterogeneous shapes, so explicit locked shape rules are
mandatory.

## Context compatibility

- Accepted independent storage/Field/Format/constraint axes are preserved.
- URL and Phone remain loose Text Fields; strict URL validation is optional and
  never silently implied.
- Raw HTML, Frui `eval`, formulas, rich content, attachments, and deeply nested
  cells remain deferred or rejected rather than becoming first-slice defaults.
- Invalid attempts remain correctable drafts; PostgreSQL remains final
  constraint/trigger authority.
- Validator changes do not mutate rows or target-table schema; existing
  violations render `#VALUE!` and direct SQL may bypass Tabular validation.
- Defaults do not materialize merely because a Field/default setting changes.

## Freeze closure

G-001 through G-011 are accepted. No material Gap remains. The user authorized
Freeze on 2026-08-13 after accepting the application-only validator lifecycle.
Reusable decisions are promoted to Context; research provenance and detailed
implementation matrices remain in this Frozen package.
