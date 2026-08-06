# Experiment Journal

## Retained

- One browser harness with chaptered routes instead of disconnected demos.
- A small API over PGlite so stateful wireframe claims are not static mocks.
- Logical grid state separate from mounted cells and from server records.
- Output formatting at rest and typed edge-to-edge editors only during editing.
- PGlite-backed drafts for invalid existing values and incomplete new rows.
- Presentation actions explicitly separated from schema/field/format metadata.
- A stable feature-coverage manifest consumed by tests and the final gap check.
- `tabulator-tables` 6.5.0 behind a small renderer adapter, with the logical
  selection model remaining the source of truth.
- Standard vertical virtualization plus ordinary horizontal scrolling for the
  current ten-column scope.

## Rejected

- Copying the existing wireframe JavaScript/CSS into the Proof. Context is the
  contract; the Proof must discover implementable boundaries independently.
- Treating each control as its own prototype. That would hide integration and
  focus/overlay conflicts.
- A dashboard-style guide shell with annotations inside the product UI.
- Client-only localStorage for persistent claims.
- A generated Stackpress model for each user-created table.
- AG Grid and Handsontable as the default range-selection dependency because
  their relevant production/range capabilities introduce commercial licensing.
- Glide Data Grid as the default because React/canvas ownership would change the
  current browser and accessibility contract.
- TanStack Virtual as the grid itself; it is a useful headless primitive but
  leaves grid selection, semantics, editing, and focus entirely application-owned.
- Tabulator horizontal virtual DOM in the first slice because its own guide
  labels that mode experimental and unstable with column manipulation.

## Still To Learn

- Whether presentation/reordering state is private, shared, or partly session-only.
- Native screen-reader behavior beyond browser accessibility-tree evidence.
- Production import authentication and download mechanics.

## R-003 Findings

- The renderer's first attempted range reset used a nonexistent
  `clearCellRanges` method. The retained adapter removes each public range
  returned by `getRanges()` before replaying logical selection.
- Tabulator clears renderer-owned ranges when data/layout changes. A range from
  `record:2/customer` through `logical:900/status` survived because the logical
  model retained stable endpoints and replayed them after `setData()`.
- At the far endpoint, only 60 of 1,000 logical rows were mounted; the anchor
  was absent, the focus was present, and all 2,697 selected cells remained in
  the logical target.
- The same range survived a 390px viewport with document width contained and
  grid overflow kept internal.
- Browser-tree evidence exposes 1,001 logical rows including the header and 11
  columns including the row header. This is architecture evidence, not a
  substitute for VoiceOver and the accepted browser matrix.
- Clear now persists a PGlite action plan containing stable row/column targets
  before the renderer changes. Canonical multi-cell mutation must use the
  previously proved atomic batch transaction rather than iterating HTTP edits.
# Rendered discovery log

## 2026-07-31 — import result integrity

The first rendered import run exposed a mismatch that the service-only test did
not: the transaction created the PGlite table and file record but the opened
sheet had no column metadata or visible records. The retained implementation now
creates 248 fixture records, six field records, four future columns, and
presentation state in the same transaction. The automated test now opens the
imported file and asserts its first rendered value boundary.

## 2026-07-31 — file-scoped transient state

The second rendered run showed an invalid-email token from Customer orders in
the same coordinate of Q3 orders. Browser error keys were only `row:column`.
They are now `file:row:column`; a clean browser reload confirmed the imported
email renders normally. Production state stores should apply the same file scope
to selection, editing, errors, and undo context.

## 2026-07-31 — narrow overflow

At 390 × 844, the document width stayed within the viewport while the sheet
scroll container retained horizontal overflow. The compact toolbar exposes a
named “More formatting controls” button. Native assistive-technology review is
still a production-target validation.

## 2026-08-01 — bounded presentation history

The initial toolbar showed presentation controls without proving their action
history. Font size, text styles, palettes, and border choices now emit
file-scoped presentation actions, and the PGlite journal is capped at the
accepted 100 current-session steps. The prior authority/version undo Proof
remains the backing evidence for canonical data mutations.

## 2026-08-01 — exact control choices and honest unavailable actions

Rendered review now covers the accepted Show, Freeze, Zoom, nested Format,
font-size, palette, and ten-placement border choices. Cut and Paste are visibly
unavailable where the minimal browser harness cannot safely represent native
clipboard behavior; Select all and Find remain representative. This keeps the
guide useful without relabeling static menu inventory as executed behavior.

## 2026-08-01 — import recovery states

Dedicated routes now render progress, failure, retry, changed-source, and
abandon outcomes. Retrying a failed operation enters a real progress state in
the browser. The PGlite import transaction remains the canonical evidence for
idempotent new-file commit; live source authorization is still a target recheck.
