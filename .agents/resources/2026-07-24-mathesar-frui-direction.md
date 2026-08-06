# Raw Source: Mathesar-Like PostgreSQL Direction And FRUI Inspiration

Capture date: 2026-07-24

This Resource File preserves the user direction and the bounded source material
used for the focused R-020 research pass. It is evidence for Spec 00001, not an
implementation contract.

## User Direction

> I think Im leaning more towards just making this project into something like a way more user friendly phpMyAdmin like that removes the complexities. Almost the same concept as spreadsheets excepts it natively works the postgres features for example:
>
> 1. Create spreadsheet (creates table)
> 2. Define headers (the first row will always be the headers). Double clicking a cell just intakes the column name and default string type. right clicking after allows them to configure the column. Instead of giving them all the possible options that postgres gives to add a column, we simplify by just asking for the input field (text, email, url, price, number, switch, select). Then we infer the type and the output format choices based on the input chosen.
> 3. Add rows. Clicking a cell enters a draft mode (saved in a system revision table). when all the required columns are filled is when the row will add to the database.

> yea like mathesar. it's pretty rough UI wise, but has most of the functionality i was thinking of. based on the other competitors we already researched, what do you think we should keep if the idea is like mathesar as a base?

> yea i like this direction. Can you add our research findings to [00001-stackpress-airtable-like-application-research](.agents/specs/00001-stackpress-airtable-like-application-research/)? Also I want field and format types like frui.js.org (inspiration only)

Follow-up direction on 2026-07-24:

> well i was wondering if pg supports columns that are computed?

> from the frui research, what fields/formats can be supported without particular issues?

> Lets go with Research direction

> okay, as long as Needs additional policy is planned for a later spec

> G-026: lets defer formulas to another spec. for now import exact values

## Official Product Sources

Accessed 2026-07-24:

- Mathesar product: <https://mathesar.org/>
- Mathesar tables: <https://docs.mathesar.org/latest/user-guide/tables/>
- Mathesar data types: <https://docs.mathesar.org/latest/user-guide/data-types/>
- Mathesar 0.12.0 release: <https://docs.mathesar.org/latest/releases/0.12.0/>
- Supabase queued Table Editor operations:
  <https://supabase.com/changelog/42460-queue-table-inserts-edits-and-deletes-on-the-table-editor>
- NocoDB grid editing:
  <https://nocodb.com/docs/product-docs/records/actions-on-record>
- NocoDB buffered expanded-record editing and revision history:
  <https://nocodb.com/docs/product-docs/records/expand-record>
- Directus data model:
  <https://docs.directus.io/app/data-model>
- Directus fields:
  <https://docs.directus.io/app/data-model/fields>
- Baserow grid:
  <https://baserow.io/user-docs/guide-to-grid-view>
- Baserow PostgreSQL two-way sync:
  <https://baserow.io/blog/baserow-data-sync-guide>
- PostgreSQL 18 generated columns:
  <https://www.postgresql.org/docs/18/ddl-generated-columns.html>
- PostgreSQL 18 views:
  <https://www.postgresql.org/docs/18/sql-createview.html>
- PostgreSQL 18 materialized views:
  <https://www.postgresql.org/docs/18/rules-materializedviews.html>

Bounded captured statements:

- Mathesar presents a spreadsheet-like UI that works directly with PostgreSQL
  permissions, schemas, and tables.
- Supabase can batch Table Editor inserts, edits, and deletes, show a diff, and
  commit the batch in one transaction.
- NocoDB buffers expanded-record edits until Save, while inline grid edits save
  on Enter, blur, or inactivity.
- Directus separates database schema from field interface, display, validation,
  and conditional configuration.
- Baserow provides spreadsheet interaction patterns and PostgreSQL two-way
  synchronization, but remains a broader no-code database/application product.

## FRUI Source Provenance

- Website: <https://frui.js.org/>
- Repository: <https://github.com/OSSPhilippines/frui>
- Local source:
  `/Users/cblanquera/server/projects/stackpress/frui`
- Inspected revision:
  `096fd14580f0f49b6e159fa0aa5ae2a5bce8fb0e`
- Package version: `0.2.9`
- License: MIT
- Inspected files:
  - `package.json`
  - `src/form/index.ts`
  - `src/view/index.ts`

FRUI describes itself as a React component collection without a grid, theme,
layout system, or data-model contract. The following are the public component
families observed in the pinned local source.

### Form/Input Component Inventory

```text
Checkbox
CodeEditor
ColorInput
CountrySelect
CurrencySelect
DateInput
DatetimeInput
FieldControl
Fieldset
FileInput
FileList
ImageInput
ImageList
Input
MarkdownEditor
MaskInput
Metadata
NumberInput
PasswordInput
Radio
Rating
Select
Slider
SlugInput
SuggestInput
Switch
TagList
Textarea
TextEditor
TextList
TimeInput
```

### View/Format Component Inventory

```text
Code
Color
Country
Currency
DateFormat
EmailLink
Formula
HTML
Image
ImageCarousel
ImageFilm
Link
List
Markdown
Metadata
NumberFormat
PhoneLink
Rating
Spread
Tabular
Tags
TextOverflow
TextTransform
YesNo
```

## Stackpress Bridge Evidence

- Repository:
  `/Users/cblanquera/server/projects/stackpress/stackpress`
- Inspected revision:
  `a71d683051ba8350fdd12d6b5a33f268fdcc285f`
- Inspected source:
  `docs/idea-reference.md`

The Stackpress Idea reference already separates:

```text
storage/schema type
field/input component
list format
detail-view format
validation and other constraints
```

Examples in the pinned source use independent annotations such as
`@field.url`, `@list.image`, and `@view.image`. This is architectural
inspiration for a Tabular-owned registry. It does not require Tabular columns
to use Idea annotations, generated models, or FRUI component APIs.

## Focused FRUI Risk Evidence

The follow-up inspection also covered:

- `src/view/Formula.tsx`, which evaluates a generated JavaScript expression
  with `eval`;
- `src/view/HTML.tsx`, which renders with `dangerouslySetInnerHTML`;
- `src/form/FileInput.tsx`, which requires the consuming application to supply
  upload behavior and returns a URL;
- `src/form/TextEditor.tsx`, which produces rich HTML and supports embedded
  media;
- `src/form/MarkdownEditor.tsx` and `src/view/Markdown.tsx`, which add a
  Markdown rendering boundary;
- the scalar, selection, date/time, number, color, tag/list, and display
  components named in the inventories above.

These observations classify support risk; they do not authorize direct FRUI
reuse.

## Proof Authorization Follow-Up

Source: user prompt in the active Codex task on 2026-07-24.

> okay can you do all the proofs needed now?
