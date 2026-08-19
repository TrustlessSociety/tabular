# Frui and Stackpress source inventory, 2026-08-13

This Resource File preserves the exact external catalog and source identities
used by Spec 00005. It is evidence, not Accepted Reusable Truth.

## Frui identity

- Documentation: `https://frui.js.org/form` and `https://frui.js.org/view`
- Package: `frui@0.2.9`
- Repository: `https://github.com/OSSPhilippines/frui.git`
- Package archive SHA-256:
  `E2E288BE2E440101CD765331F046E908286287FB056B9EF1FBDC73F75EE44450`
- Accessed: 2026-08-13

The live documentation client bundles and the matching package declarations
were both inspected so labels were not used as a proxy for value shape.

## Live form catalog (29)

1. Checkbox
2. Color Input
3. Country Select
4. Currency Select
5. Date Input
6. Datetime Input
7. File Input
8. File List
9. Image Input
10. Image List
11. Input
12. Markdown Editor
13. Mask Input
14. Metadata
15. Number Input
16. Password Input
17. Phone Input
18. Radio
19. Rating
20. Select
21. Slider
22. Slug Input
23. Suggest Input
24. Switch
25. Tag List
26. Textarea
27. Text Editor
28. Text List
29. Time Input

`Checkboxes` is not a live Frui catalog entry. Spec 00005 treats a checkbox
list as a Tabular adaptation of a restricted multiple-choice field.

## Live view catalog (24)

1. Code Highlighter
2. Color
3. Country
4. Currency
5. Date Format
6. Email Link
7. Formula
8. HTML
9. Image
10. Image Carousel
11. Image Film
12. Link
13. List
14. Markdown
15. Metadata
16. Number Format
17. Phone Link
18. Rating Format
19. Spread
20. Tabular
21. Tags
22. Text Overflow
23. Text Transform
24. Yes/No

## Material Frui value and execution findings

- Checkbox and Switch expose scalar boolean state.
- Metadata edits key/value pairs and therefore has object semantics. JSONB
  duplicate-key collapse means duplicate keys must be rejected before save.
- Tag List and Text List hold string arrays.
- Select can be scalar or multiple. Tabular separates those cardinalities into
  distinct Field choices.
- Slider emits a number or, in range mode, a two-number array.
- File and Image controls emit URL strings or URL arrays only after an upload
  or media lifecycle; they are not self-contained database cell editors.
- Text Editor reads and writes HTML through `innerHTML`, supports code view,
  data-URL images, iframe/video/audio insertion, and HTML templates.
- Formula substitutes values into a string and calls JavaScript `eval`.
- HTML uses React `dangerouslySetInnerHTML`.
- Markdown delegates rendering to `markdown-to-jsx` without a Tabular-owned
  sanitization boundary.

## Stackpress identity

- Source:
  `https://github.com/stackpress/stackpress/blob/418d9d08d53657c01bd091593d1c821974f2d1c4/stackpress/src/schema/assert.ts`
- Raw source:
  `https://raw.githubusercontent.com/stackpress/stackpress/418d9d08d53657c01bd091593d1c821974f2d1c4/stackpress/src/schema/assert.ts`
- Commit: `418d9d08d53657c01bd091593d1c821974f2d1c4`
- Accessed: 2026-08-13

## Pinned assertion exports

- Presence: `required`, `notempty`
- Equality and membership: `eq`, `ne`, `option`, aliases `oneof`
- Text shape: `starting`, `ending`, `regex`, alias `pattern`
- Temporal: `date`, `future`, `past`, `present`
- Numeric comparison: `gt`, `ge`, `lt`, `le`
- Character count: `ceq`, `cgt`, `cge`, `clt`, `cle`
- Word count: `weq`, `wgt`, `wge`, `wlt`, `wle`
- Semantic patterns: `cc`, `color`, `email`, `hex`, `price`, `url`
- Type: `boolean`, `string`, `number`, `float`, `integer`, `object`
- Collection: `array(values, validator, ...args)`

## Stackpress behavior that must not be copied verbatim

- `required` distinguishes null/undefined only; it permits empty strings and
  collections. Tabular preserves this distinction explicitly.
- `notempty` treats numeric zero as empty and can call `Object.keys(null)`.
- Equality is coercive; numeric comparison turns failed number conversion into
  zero.
- Date rules use JavaScript parsing and the local clock/timezone.
- Character length uses JavaScript UTF-16 code-unit length. Word length splits
  only on a literal space.
- Several pattern expressions have narrow or defective behavior for modern
  values. Credit-card pattern validation also creates a misleading payment
  security surface.
- `array` dispatches an arbitrary assertion name from a string. Tabular instead
  uses a closed, versioned validator ID registry.

## PostgreSQL sources

Accessed 2026-08-13:

- JSONB: `https://www.postgresql.org/docs/current/datatype-json.html`
- Arrays: `https://www.postgresql.org/docs/current/arrays.html`
- Numeric: `https://www.postgresql.org/docs/current/datatype-numeric.html`
- Date/time: `https://www.postgresql.org/docs/current/datatype-datetime.html`
- Constraints: `https://www.postgresql.org/docs/current/ddl-constraints.html`

Material facts: JSONB validates JSON syntax but accepts scalar, array, or
object shapes; it discards duplicate object keys and object-key order.
PostgreSQL native arrays enforce element type but not declared dimensions or
length. `numeric` is exact and typmods can impose precision/scale. TIMESTAMPTZ
stores an instant in UTC and does not retain the input zone. CHECK expressions
must be immutable for durable integrity, CHECK does not reject NULL by itself,
and PostgreSQL does not promise constraint evaluation order.
