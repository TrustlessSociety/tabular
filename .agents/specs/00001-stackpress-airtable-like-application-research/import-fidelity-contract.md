# Import Fidelity Contract

Access date: 2026-07-24

> Scope disposition (2026-07-24): D-008 now requires exact values only.
> Formula definitions, formatting, comments, and notes below are historical
> research for later specs. Current P-006 is narrowed to typed values,
> warnings, retry, commit, and abandon; that bounded proof later passed.

This file preserves R-017 evidence. It does not authorize implementation or
define the executed P-006 scope; use `proofs.md` for its result.

## Required Source Outcomes

| Source | Required preserved outcome | Source-specific limit |
| --- | --- | --- |
| Google Sheets | User-entered value/formula, effective value, formatted display, source locale/timezone, required basic format, cell note, and Drive discussion content | Sheets notes have cell coordinates. Drive comments use a separate API whose anchor has no supported Sheets cell-coordinate schema or cross-revision stability guarantee. |
| XLSX | Cell identity, formula text, cached value, required basic format, dimensions, legacy comment/note content, and complete threaded discussion metadata | Legacy comments and modern threaded comments use different package parts. A threaded comment can also have a legacy placeholder that must not become a duplicate note. |
| CSV | Record/field values, row order, header decision, delimiter, quoting, encoding, line-ending, original bytes digest, and type-inference decisions | CSV has no workbook formula, style, note, comment, locale, or timezone contract. |

The importer retains a raw source representation or reference whenever normalization may lose meaning. The report says `preserved`, `mapped`, `flattened`, `unplaced`, `unsupported`, or `failed`; absence of a warning is not evidence of fidelity.

## Basic Formatting Boundary

The recommended required subset, pending user acceptance, is:

| Area | Required normalized state |
| --- | --- |
| Number display | Source format type/pattern, normalized type, source-formatted value, and locale/timezone provenance |
| Font | Family, size, bold, italic, underline, strikethrough, and foreground color |
| Fill | Solid/background color |
| Borders | Top, bottom, left, and right style/color |
| Alignment | Horizontal, vertical, wrapping, and text direction |
| Dimensions | Row height, column width, and user-hidden state; hidden state is presentation, never authorization |
| Color provenance | Resolved display color plus raw theme/indexed/tint representation when supplied |

Google [`CellData` and `CellFormat`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells)
separate user-entered/effective formats and expose number format, background, borders, alignment, wrapping, text direction, and text format. Sheet
[`DimensionProperties`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets)
exposes row/column pixel size and hidden state. Capture both user-entered and effective format: effective format preserves the cutover appearance when an
unsupported conditional rule changes it, while the report states that the rule
itself was flattened.

For XLSX, preserve the cell style index and referenced style records before mapping to the same normalized shape. Unknown/custom number patterns retain the raw pattern and cached display text. Theme/indexed colors retain raw provenance even when a resolved RGB fallback is available.

Not part of the required basic subset:

- padding, text rotation, comment-box geometry, and rich-text runs;
- conditional-format rules, named styles, themes as reusable target features;
- freeze panes, print/page setup, row/column groups, and workbook views;
- hyperlinks, smart chips, and attachments as active target behaviors.

These features must still be detected where the source exposes them. Preserve
safe raw metadata when practical, flatten only to the required cell-level
result, and emit a warning. Hyperlink targets require a separate security and
product decision and must not be activated silently.

## Google Notes And Drive Discussions

Google Sheets [`CellData.note`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells)
is a cell note and maps directly to the source cell.

Drive [`Comment`](https://developers.google.com/workspace/drive/api/reference/rest/v3/comments)
is a discussion containing content, replies, timestamps, resolution state, author display data, mentions, quoted content, and an `anchor` JSON string. The API does not populate the author's email address or permission ID. Source authors therefore remain source identities unless an accepted mapping exists.

The official [comment guide](https://developers.google.com/workspace/drive/api/guides/manage-comments)
says anchors are immutable, their position is not guaranteed between revisions, developers define the anchor format, and Google Workspace editors treat developer-created anchors as unanchored. It does not publish a supported decoder from an existing Google Sheets comment anchor to `sheetId + A1/range`.

Required disposition:

1. Preserve comment/reply IDs, plain and HTML content, display author, created
   and modified times, resolution, mentions, quoted content, and raw anchor.
2. Set placement to `cell`, `range`, or `unplaced` with mapping evidence.
3. Attach to a cell/range only when a versioned fixture proves the decoder for
   that exact API behavior; never guess by matching quoted text or cell value.
4. Keep unresolved discussions at workbook/source-file level and warn
   `GOOGLE_COMMENT_ANCHOR_UNRESOLVED`.
5. Treat a missing author email as an identity limit, not an empty author.

Unplaced but fully preserved discussion content is degraded fidelity, not silent
loss. Missing discussion text/replies or converting the discussion into a note
is a blocker for the accepted comments requirement.

## XLSX Legacy And Threaded Comments

Legacy SpreadsheetML [`Comment`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.comment?view=openxml-3.0.1)
has a cell reference, author index, and optionally rich text. Required legacy
fidelity is cell reference, plain text, and author display. Comment-box geometry
and rich-text styling may be flattened with a warning.

Microsoft's [threaded-comment contract](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/e0fb917a-1107-409a-852f-13b47aea70dc)
separates thread parts from cell content. `CT_ThreadedComment` carries cell
reference, ID, parent ID, author/person ID, timestamp, resolution flag, text,
and mentions. The persons part carries display and provider identity.

Required threaded fidelity is worksheet/cell reference; comment ID and parent/reply relationship; text, author display/source person identity, timestamp, resolution state, mentions; and raw part provenance sufficient to diagnose parser loss.

Microsoft also specifies a [legacy placeholder](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/6383f002-c90b-401c-a1d7-66b97b14cb3e)
for each top-level threaded comment. The importer must reconcile placeholder UID
and threaded-comment ID and emit one discussion, not a duplicate legacy note.

## Parser Candidate Findings

| Candidate | Evidence | Disposition |
| --- | --- | --- |
| ExcelJS 4.4.0, MIT, pinned commit [`5bed18b`](https://github.com/exceljs/exceljs/commit/5bed18b45e824f409b08456b59b87430ded023ab) | The [README](https://github.com/exceljs/exceljs/blob/5bed18b45e824f409b08456b59b87430ded023ab/README.md) documents number/font/alignment/border/fill styles and explicitly calls `cell.note` an “old style comment.” Pinned [`xlsx.js`](https://github.com/exceljs/exceljs/blob/5bed18b45e824f409b08456b59b87430ded023ab/lib/xlsx/xlsx.js) routes `xl/comments*.xml` and VML notes; no threaded-comments/person-part route was found. | Strong style and legacy-comment candidate; insufficient alone for modern threaded comments. |
| SheetJS CE 0.20.3 official release docs; CE repository [license](https://github.com/SheetJS/sheetjs/blob/3f44ddd99c704d7ca35ea76fef7b8af2d2d435cb/LICENSE) is Apache-2.0 | Official [parse options](https://docs.sheetjs.com/docs/api/parse-options/) expose formulas, number formats, formatted text, row/column properties, and limited style metadata. Official [comment docs](https://docs.sheetjs.com/docs/csf/features/comments/) claim XLSX legacy and threaded read/write and mark threaded parts with `T`. Full cell/text styling is described as a Pro capability. | Strong detection/thread candidate; does not prove the full required style subset or preservation of thread IDs, parents, timestamps, resolution, and mentions. |
| openpyxl 3.1.3 | Official [comment docs](https://openpyxl.readthedocs.io/en/stable/comments.html) preserve text/author only, lose formatting/dimensions, and do not support comments in read-only mode. | Confirms the inspected Grist-style data-only/read-only path is not a fidelity engine. |

No inspected candidate alone proves the full required contract. Dependency selection remains open. P-006 should compare exact locked versions and allow a small standards-based Open XML part adapter only for fields the selected parser cannot preserve.

## Safe Retry, Review, Commit, And Abandon

Recommended job states:

```text
received -> fingerprinted -> extracting -> staged -> reviewed
         -> committing -> committed

extracting/staged/reviewed -> failed_retryable | failed_terminal | abandoned
```

Rules:

1. Identity is unique over workspace, source kind, source identity/fingerprint, import options hash, importer version, and IR version.
2. Local XLSX/CSV identity uses a cryptographic digest of the original bytes.
3. Google identity records file ID, the [Drive file's](https://developers.google.com/workspace/drive/api/reference/rest/v3/files) monotonic `version`, modified time, extraction manifest digest, and comment digest.
4. Read Google file version before and after extraction. A change blocks commit and restarts extraction. Because Sheets and Drive comments are separate APIs without a shared snapshot token, require a quiet-source migration window and report snapshot confidence; equal versions do not create an atomic API snapshot guarantee.
5. Each staged chunk is idempotent by import/sheet/range or part key.
6. Commit runs once in a database transaction guarded by the unique import ID, creates the initial workbook revision, and publishes side effects only after commit.
7. On a crash during `committing`, recovery checks the committed import ID before retrying; it never creates a second workbook.
8. `abandoned` is allowed only before commit and schedules staged cleanup. Reversing a committed import is a separate authorized delete/restore action.

## Warning And Commit Contract

Every finding contains:

```text
code, severity, source kind, feature, sheet/cell/range or part locator,
count, samples, raw-preservation state, target disposition, explanation,
remediation, acknowledgedBy, acknowledgedAt
```

Severities:

- `blocker`: required content cannot be extracted/preserved, source changed
  during extraction, input is malformed/unsafe, or commit state is ambiguous;
- `degraded`: source content is preserved but placement, evaluation, styling,
  or active behavior will differ; explicit acknowledgement is required;
- `info`: detected non-required feature with an attributable disposition.

The review report aggregates counts but retains a downloadable detailed ledger.
It includes source fingerprint/version, parser and IR versions, formula
compatibility, basic-format coverage, note/comment placement, unsupported
features, errors, snapshot confidence, and commit eligibility.

Commit is blocked when required formula text/cached value, required basic-format
source data, note text, or discussion content/replies cannot be preserved.
Unsupported formula evaluation may be acknowledged when source formula and
cached value remain intact. An unresolved Drive anchor may be acknowledged when
the whole discussion and raw anchor remain intact. Nothing is silently dropped.

## Explicit V1 Unsupported Dispositions

| Feature | Import disposition |
| --- | --- |
| Merged cells | Record ranges, retain constituent source cells, do not recreate merge behavior, warn |
| Data validation and protected ranges | Record detectable presence/rules, do not enforce, warn |
| Named ranges | No target UI feature; extract definitions only when required to classify/rewrite a referenced formula, otherwise warn |
| Conditional formatting | Google: retain current effective appearance plus raw rule presence; XLSX: retain detectable rule/part evidence; do not execute rules, warn |
| Rich-text runs and detailed style | Preserve plain text and required cell-level format; retain raw provenance when available, warn |
| Charts, images, drawings, pivots, slicers, macros, external data, and advanced workbook views | Record detected feature/part and count where possible; do not import active behavior, warn |
| Smart chips and hyperlinks | Preserve safe display/raw metadata where available; do not activate links or chip behavior without a separate decision, warn |

Unsupported-feature detection must include a package/API preflight independent
of the convenience parser so ignored parts still appear in the report.

## Historical Rich-Fidelity Proof Boundary

The following earlier P-006 proposal is superseded by the accepted value-only
scope and preserved only for later policy specs:

- real Google Sheets note and Drive-comment anchor samples, including an
  unresolvable anchor and a source version change;
- XLSX legacy comment, threaded replies, mentions, resolution, authors/times,
  and legacy-placeholder reconciliation;
- the required basic-format subset across Google and XLSX;
- duplicate retry, mid-extraction failure, mid-commit failure, and abandon;
- exact warning/blocker output for every degraded or unsupported fixture.
