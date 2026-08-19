# Brief

## User goal

Create a new spec covering more Fields, validators, and output formats.

The user supplied these example mappings to validate against the complete
Frui catalogs:

- Metadata -> JSONB object.
- Tag List, Text List, and Checkboxes -> JSONB array.
- Text Editor, Markdown Editor, and Textarea -> TEXT-compatible source values.
- Checkbox and Switch -> BOOLEAN.

The user also requires:

- Scan the entire [Frui form catalog](https://frui.js.org/form), not only the
  examples, and determine what can map cleanly to SQL data types.
- Scan the entire [Frui view catalog](https://frui.js.org/view) for output-format
  inspiration under the same PostgreSQL-clean rule.
- Research the pinned Stackpress
  [`assert.ts`](https://github.com/stackpress/stackpress/blob/418d9d08d53657c01bd091593d1c821974f2d1c4/stackpress/src/schema/assert.ts#L180-L191)
  validator surface.
- Allow many compatible validators against one column.
- Treat some validators as implied by the column's storage type.

## Scope

- Semantic Fields and their cell editors.
- PostgreSQL storage-type compatibility and canonical value shape.
- Output Formats that render accepted values without changing storage.
- Multiple ordered validators per column, including parameters and error
  presentation.
- Storage-implied validation versus user-configured validation.
- Application validation, PostgreSQL constraint authority, migration impact,
  import behavior, drafts, and existing-value compatibility.
- Add/adapt/defer/reject disposition for every relevant Frui form and view.

## Non-goals

- Implementation tasks, migrations, or production code before Freeze.
- Spreadsheet formulas or Frui `eval` execution.
- Raw HTML execution, arbitrary user code, or unsafe rich-content rendering.
- Attachments, file storage, media pipelines, or external asset hosting unless
  research proves a safe value-only field belongs in this spec.
- Replacing PostgreSQL constraints, triggers, grants, or RLS as final
  authority.
- Treating a display Format as a storage conversion.

## Governing context

- [PostgreSQL-native product contract](../../context/tabular-product-contract.md)
  — storage, Fields, Formats, constraints, drafts, and deferred boundaries.
- [Spreadsheet canvas and column configuration](../../context/tabular-grid-and-column-spec.md)
  — current Field/Format axes, editor lifecycle, settings panel, and errors.
- [Implementation boundaries](../../context/tabular-implementation-boundaries.md)
  — direct-library, action, migration, authority, and browser-state rules.

## Source material

- User request in this conversation, 2026-08-13.
- Frui form and view documentation, to be captured in `research.md`.
- Pinned Stackpress source at commit
  `418d9d08d53657c01bd091593d1c821974f2d1c4`, to be captured in
  `research.md`.
- Current Tabular source and tests, to be inventoried in `research.md`.
- Official PostgreSQL documentation where type or constraint behavior needs
  confirmation.
