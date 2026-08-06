# Import And Formula Findings

Access date: 2026-07-23

> Scope disposition (2026-07-24): D-008 now requires exact values only.
> Formula definitions, formatting, comments, and notes below are historical
> evidence for later specs. Formula cells currently import their latest
> source-calculated/cached value as ordinary data.
> P-006 passed for this retained value-only boundary, including Google
> effective values, XLSX cached values, CSV literals, source/error blocking,
> idempotency, rollback, and ambiguous-commit recovery.

These findings preserve the earlier rich-fidelity research; they do not define
the current value-only import boundary.

## Required Fidelity Matrix

| Source | Formulas | Basic formatting | Notes | Comments | Required import disposition |
| --- | --- | --- | --- | --- | --- |
| Google Sheets | Preserve source formula, source-calculated value, displayed value, and mapping status | Preserve required number/font/fill/border/alignment/dimension state plus source locale/timezone | Preserve cell note | Preserve discussion, replies, author/time/resolution, mentions, quoted content, and raw anchor; unresolved placement is explicit | Highest-fidelity path |
| XLSX | Preserve formula text and cached value independently | Preserve required number/font/fill/border/alignment/dimension state through workbook styles | Preserve legacy comment/note text, author, and cell | Preserve threaded cell, IDs/parents, replies, author/time, resolution, and mentions without duplicating legacy placeholders | High-fidelity path |
| CSV | No formula contract beyond literal text beginning with `=` | None | None | None | Values, row order, delimiter/encoding provenance, and explicit type-inference report |

The detailed [Import Fidelity Contract](import-fidelity-contract.md) defines the recommended basic subset as number display, font, fill, borders, alignment/wrapping/text direction, row height, column width, hidden state, and raw/resolved color provenance. Padding, rotation, rich-text runs, conditional rules, hyperlinks, smart chips, and advanced workbook behavior remain non-required with explicit warnings.

## Direct Platform Evidence

### Google Sheets

Google Sheets [`CellData`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells) exposes `userEnteredValue`, `effectiveValue`, `formattedValue`, `userEnteredFormat`, `effectiveFormat`, and `note`. This supports a loss-aware import record containing the source expression or literal, the value calculated by Google, the display value, formatting, and a cell note instead of collapsing them into one string.

Spreadsheet properties include locale, time zone, recalculation interval, and iterative-calculation settings. These are formula inputs and must be captured as provenance even when the target does not implement every source behavior.

For large workbooks, [`spreadsheets.get`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get) supports ranges and field masks and recommends requesting only needed fields. The importer should page or range over bounded grid regions rather than request an unbounded workbook payload.

Google collaborative comments are not `CellData.note`. The Drive [`Comment`](https://developers.google.com/workspace/drive/api/reference/rest/v3/comments) resource contains discussion content, replies, author, timestamps, resolution state, mentions, quoted content, and an anchor JSON string. [`comments.list`](https://developers.google.com/workspace/drive/api/reference/rest/v3/comments/list) is paginated and requires an explicit field mask. Google publishes no supported decoder from a Sheets comment anchor to `sheetId + cell/range`, warns that anchors are immutable and may not track content across revisions, and does not populate the author's email or permission ID. Preserve the raw anchor and source identity; attach only with proved mapping evidence; otherwise retain an unplaced workbook-level discussion and warn.

The official [Google Sheets function list](https://support.google.com/docs/table/25273?hl=en) is the compatibility inventory. “Google Sheets-compatible” must therefore be a versioned matrix, not a claim that any Excel-like parser is automatically compatible.

The completed [Formula Compatibility Matrix](formula-compatibility-matrix.md) compares the 515 distinct Google function names in the 2026-07-23 snapshot with HyperFormula 3.3.0 and records exact-candidate, mapped, unsupported, volatile, and external dispositions.

### XLSX

SpreadsheetML stores formula text in a cell `<f>` element and the last calculated value in `<v>`, according to Microsoft’s [formula documentation](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas). Cell location, type, style index, value, and formula are separate properties, and style records live in a Styles Part, according to the Open XML [cell contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.cell?view=openxml-3.0.1).

The importer must not equate a cached result with the formula or assume that opening an XLSX file recalculates it. Legacy comments and modern threaded comments occupy different parts; threaded comments retain cell reference, IDs/parents, author/person, timestamp, resolution, and mentions and may include a legacy placeholder that must not become a duplicate note. ExcelJS 4.4.0 covers rich styles and old-style comments but its pinned XLSX route has no threaded-comment/person part. SheetJS CE 0.20.3 documents threaded support but does not prove full required style or discussion metadata fidelity. These richer fidelity concerns remain historical input for a later formula/import-fidelity spec; P-006 passed the current value-only contract.

### CSV

[RFC 4180](https://datatracker.ietf.org/doc/html/rfc4180) describes records, fields, quoting, and the optional header convention; it does not carry workbook formulas, formatting, notes, comments, types, locale, or timezone. Any inferred type is a target decision and must be shown in preview and recorded in the import report.

## Named-Source Import Findings

### NocoDB

At pinned revision `b464046cd489d31ffed515e149f351a42a433c5d`, `packages/nocodb/src/modules/jobs/jobs/data-import/handlers/excel-import.handler.ts` streams workbooks with styles and hyperlinks ignored. Formula cells resolve to the cached result rather than retaining the formula. This is useful evidence for bounded streaming and preview/type detection, but it is incompatible with the required fidelity.

The older browser worker at `packages/nc-gui/workers/importWorker.ts` separates parser initialization, template generation, imported columns, data, progress, and errors. The adapter/job separation is reusable even though its output model is table-oriented.

### Grist Core

At pinned revision `e9b287491d6aea9600d1c495fdf240dde84400cb`, `sandbox/grist/imports/import_xls.py` opens XLSX with `read_only=True`, `data_only=True`, and `values_only=True`. It intentionally imports calculated values rather than formulas and does not retain styles or comments.

`app/server/lib/ActiveDocImport.ts` provides stronger process evidence: parse through a file-parser boundary, create hidden preview tables, apply transforms, bundle user actions, clean up uploads, and support cancel/finalize flows. The staged action pattern is reusable; the fidelity model is not.

### Baserow

At pinned revision `bc8c5e825c4a8cf95197284f99e611ed709d832e`, `web-frontend/modules/database/utils/excel.js` sets `cellFormula: false` and `raw: false`, producing formatted strings instead of formulas or typed cell state. `TableExcelImporter.vue` performs a bounded preview and reparses the full selected sheet only on commit.

`backend/src/baserow/contrib/database/file_import/job_types.py` locks the target table during import, executes through table/row actions, retains row-level error reports, and cleans temporary data after commit. `file_import/models.py` persists importer type, original filename, target, header choice, and an error report. These are good job and recovery patterns, but the flattened import payload is not sufficient for this target.

## Cross-Source Conclusions

### F-011: Import Needs A Loss-Aware Intermediate Representation

The three named importers optimize for creating database-style tables and flatten source cells early. This target needs an intermediate representation that preserves workbook/sheet coordinates, source literal or formula, cached/effective value, display value, format subset, note, comment references, source locale/timezone, and warnings before PostgreSQL commit.

Affects: G-002, G-003, G-010, G-021, G-024; strengthens P-006.

### F-012: Formula Text, Normalized Meaning, And Value Are Distinct

Store at least the original formula text, parsed/normalized representation or mapping, current target result, source cached result, compatibility state, and error state. This allows imports to complete when a formula is unsupported without pretending the formula was migrated correctly.

Affects: G-004, G-022; strengthens P-003.

### F-013: Notes And Comments Need Separate Models

A note is cell metadata. A collaborative comment is a discussion with identity, replies, lifecycle state, and a source anchor. Collapsing comments into notes would lose authorship and resolution history.

Affects: G-002, G-007, G-021, G-024.

### F-014: Import Is A Staged Domain Operation

Preview, validation, mapping, commit, and recovery should be explicit phases under one import ID. Grist’s hidden-preview/bundled-action flow and Baserow’s job, transaction, report, and cleanup boundaries are stronger starting patterns than a single upload endpoint.

Affects: G-006, G-010, G-016, G-024; strengthens P-006.

### F-015: PostgreSQL Should Store Generic Spreadsheet Units

PostgreSQL `jsonb` supports structured JSON operators and indexing, but its own [JSON design guidance](https://www.postgresql.org/docs/18/datatype-json.html) recommends that a JSON document represent an atomic unit that cannot reasonably be modified independently. A whole workbook or sheet JSON blob conflicts with independent cell edits, revisions, comments, formula invalidation, and permissions.

Research should compare cell rows, row documents, and bounded cell blocks. Whichever wins, workbook ID, sheet ID, coordinates, revision, provenance, and actor-visible permissions should remain ordinary indexed columns; flexible cell value, format, source, and error data may use bounded `jsonb`.

The completed [PostgreSQL Storage Comparison](postgresql-storage-comparison.md) recommends cell rows as the canonical research direction, with stable row/column identifiers and order records. Row documents and bounded blocks remain comparison shapes for P-001 and possible derived caches, not canonical storage.

Affects: G-003, G-006, G-012, G-023; revises P-001.

### F-016: Existing Importers Are Pattern Sources, Not Fidelity Engines

NocoDB, Grist, and Baserow provide useful preview, streaming, transform, job, transaction, and error-report patterns. Their inspected XLSX paths all discard required formula or formatting information. Directly adopting any of them would make the migration lossy by design.

Affects: G-010, G-014, G-021.

### F-017: Formula Engine Selection Has A License And Compatibility Gate

[HyperFormula](https://hyperformula.handsontable.com/docs/) is a serious benchmark because it supplies a dependency-aware TypeScript engine, roughly 400 functions, and explicit Excel/Google compatibility documentation. It also documents behavioral differences from Google Sheets and is GPLv3 or commercially licensed. It is a candidate for evaluation, not an accepted dependency.

Function libraries without a workbook dependency graph are not by themselves a formula engine. Research must evaluate parser/AST, reference rewriting, dependency invalidation, array behavior, errors, locale/timezone, volatile/external functions, function coverage, and license together.

Affects: G-004, G-014, G-022; strengthens P-003.

### F-018: Future AI Indexing Requires Provisions, Not Integration

The current model should provide stable object identifiers, source provenance, revisions/change sequence, permission metadata, and a transactional event or outbox boundary. It should not add embeddings, vector fields, Qdrant clients, indexing jobs, or Qdrant-shaped storage in this phase.

Affects: G-006, G-016.

### F-019: Formula Compatibility Is A Versioned Ledger

The official Google snapshot contained 515 distinct names. Against HyperFormula 3.3.0, 324 are exact-name candidates, 68 require an alias or semantic mapping, 110 are unsupported, 4 are volatile, and 9 are external. Exact-name candidates are not exact support until fixtures verify syntax, coercion, result, error, array, reference, locale/timezone, and recalculation behavior.

This makes the compatibility ledger a durable product artifact tied to a source snapshot, engine version, mapping version, and test corpus. Unsupported, external, and failed formulas must retain source text and source-calculated values rather than flattening silently.

Affects: G-004, G-014, G-022; keeps P-003.

### F-020: Canonical Cell Rows Best Match The Edit Boundary

PostgreSQL row locks make tuple granularity the writer-contention boundary, while its JSON guidance recommends JSON documents represent atomic units. Cells, formulas, notes, comments, and revision deltas are independently modified business units, so a whole row, block, sheet, or workbook is too coarse as the canonical tuple.

Use stable sheet, row, column, and cell identifiers; ordinary indexed columns for identity, ordering, revision, and permission-relevant ownership; and bounded `jsonb` for flexible cell format/source/error metadata. Row and block representations may be import batches, API payloads, or later derived caches.

Affects: G-002, G-003, G-006, G-008, G-012, G-023; sharpens P-001.

### F-021: Coordinate Identity Must Survive Reordering

A cell should reference stable row and column IDs rather than use mutable numeric coordinates as its only identity. Row and column dimension records can preserve order keys and original source coordinates, allowing insert/reorder operations without rewriting every downstream cell identity or formula reference.

Affects: G-002, G-003, G-004, G-006, G-023.
