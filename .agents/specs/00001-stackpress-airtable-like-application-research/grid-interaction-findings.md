# UI And Grid Interaction Findings

Access date: 2026-07-24.

> Direction note: the interaction evidence remains useful, but R-020 replaces
> generic workbook/sheet/cell storage identity with database/schema/table,
> primary-key, and column identity. The reframed P-002 proof passed; load
> `proofs.md` for current evidence and limitations.

This file completes R-009. It defines a research recommendation, not an
accepted production grid library.

## Cross-Source Evidence

| Source | Observed pattern | Target implication |
| --- | --- | --- |
| NocoDB | Pinned [`InfiniteTable.vue`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nc-gui/components/smartsheet/grid/InfiniteTable.vue) uses 50-row chunks, an initial 100-row load, adjacent prefetch, a 100-row cache buffer, placeholder rows, and concurrent missing-chunk reads. [`Table.vue`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nc-gui/components/smartsheet/grid/Table.vue) keeps active-cell, range, edit, permission, and batch behavior separate. | Keep logical row/cell state outside rendered DOM nodes and make window reads explicit. |
| Grist | Pinned [`BaseView.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/client/components/BaseView.ts) creates lazy row models and a floating edit row. [`GridView.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/client/components/GridView.ts) separates cursor, selection, edit commands, scrolling, copy/paste, and bundled mutation. | Keep cursor/selection identity stable when rows are recycled; editing should not depend on a mounted row component surviving. |
| Baserow | Pinned [`bufferedRows.js`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/web-frontend/modules/database/store/view/bufferedRows.js) represents unloaded rows as holes, derives bounded offset/limit reads from the visible range, and updates the buffer around inserts/deletes. [`GridView.vue`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/web-frontend/modules/database/components/view/grid/GridView.vue) separates frozen sections, cell selection, editing, scrolling, paste, and permission checks. | The window cache needs row-identity reconciliation, not only append-only pagination. |
| Stackpress | Generated lists and field widgets cover fixed model UI, but accepted Stackpress context says generated structure does not prove grid-scale, keyboard, clipboard, hydration, or accessibility behavior. | The spreadsheet grid is a custom page/view consuming application-owned events; generated admin remains for stable control data. |

## Required Window Contract

The recommended first contract is a two-dimensional logical window:

```text
readWindow({
  workbookId, sheetId, viewId,
  rowAnchor, rowTake, columnAnchor, columnTake,
  sort, filter, knownWorkbookRevision
}) -> {
  stable rows, stable columns, sparse cells,
  totalRows, totalColumns, workbookRevision, windowToken
}
```

Rules:

1. Cell identity is `(sheetId, stableRowId, stableColumnId)`. Display indexes are
   mutable order metadata, not identity.
2. The client cache is keyed by stable IDs and window/revision tokens. DOM index
   and array position are never write identifiers.
3. Sorting/filtering produces a view order. Reorder, insert, delete, and filter
   changes invalidate affected windows explicitly.
4. Unknown rows/cells render placeholders without inventing empty canonical
   values.
5. Reads and writes are bounded. No normal grid action transfers a whole sheet.
6. Horizontal and vertical virtualization are both required research targets;
   frozen headers/columns are projections over the same logical selection.

Offset windows are acceptable only while ordering is stable and mutation
invalidation is explicit. P-002 must compare that boundary with a stable cursor
or order-key anchor under concurrent inserts and reorders.

## Selection And Edit State

Recommended v1 selection state:

```text
activeCell + anchorCell + extentCell + mode(cell|row|column|all) + sheetRevision
```

- Support one active cell and one contiguous rectangular range first.
- Keep selection logical when its cells are offscreen.
- Separate navigation mode from edit mode.
- Enter, F2, double-click, or printable input enters editing; Escape cancels;
  Enter/Tab commits and moves according to the accepted keyboard map.
- Arrow keys navigate in cell mode and belong to the editor/widget in edit mode.
- Shift extends the range; platform modifier keys activate copy, paste, undo,
  redo, and boundary navigation.
- A paste, fill, clear, or multi-cell edit is one domain action with one action
  ID. It is atomic or returns explicit per-cell rejection before any commit.
- Permission, readonly, formula, protected-state, and stale-version checks run
  on the server even when the client already disabled editing.

The target should not start with disjoint ranges, merged-cell navigation,
multi-user selection overlays, or a CRDT cursor model.

## Clipboard Contract

Grist's pinned [`Clipboard.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/client/components/Clipboard.ts)
routes browser copy/cut/paste into view commands and prefers HTML table data
when available. Baserow's pinned
[`copy-and-paste.md`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/docs/technical/copy-and-paste.md)
documents interoperable TSV/HTML plus a matching internal rich representation.
NocoDB's pinned [`pasteUtils.ts`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nc-gui/utils/pasteUtils.ts)
also serializes plain, HTML, JSON, row identity, and column metadata.

Recommended channels:

- `text/plain`: TSV with spreadsheet-compatible quoting and line endings;
- `text/html`: sanitized table markup for spreadsheet interoperability;
- internal structured payload: source workbook/sheet, stable source range,
  typed values, formulas, formats, provenance, and payload digest.

The internal payload is used only when its plain-text digest still matches and
the current caller can read the source and write the destination. Otherwise,
paste is external text/HTML and passes through type/formula mapping. Relative
formula references are rewritten against source and destination coordinates;
the original formula remains attributable. Never trust hidden clipboard IDs as
authorization.

Large paste uses a preview/progress boundary and the same batch-action contract.
Cut clears its source only after the destination commit succeeds and the source
version still matches.

## Accessibility Baseline

The W3C [ARIA grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
requires managed focus, directional navigation, grid/row/header/gridcell
semantics, and explicit selection/readonly state. With virtualized content,
`aria-rowcount`, `aria-colcount`, `aria-rowindex`, and `aria-colindex` must
represent the logical grid, not only mounted nodes.

Required target behavior:

- one managed grid tab stop plus deterministic entry/exit;
- accessible workbook, sheet, grid, row-header, and column-header labels;
- active cell, selected range, readonly/editing state, errors, and formula
  results announced without reading placeholder rows as data;
- focus recovery after virtualization, sorting, deletion, dialogs, and editor
  teardown;
- no conflict between grid arrows and editors, menus, comboboxes, or formula
  reference selection;
- keyboard access to every pointer action.

Grist contains deliberate screen-reader announcements and active-descendant
focus handling, but the inspected sources do not establish a complete
virtualized spreadsheet conformance result. Equivalent proof was not found in
the pinned NocoDB or Baserow grid paths. Accessibility therefore remains a
first-class P-002 acceptance dimension, not inherited competitor evidence.

## Saved Views

Saved views remain metadata over canonical cells:

```text
filter expression, sort order, hidden/order/width columns,
frozen rows/columns, row height, owner, shared scope, version
```

Personal view state and shared view definitions are distinct. A view cannot
hide data from authorization checks, and hidden rows/columns are not a security
boundary.

## Rejected Transfers

- full-sheet client loading as the normal path;
- DOM position as row/cell identity;
- generated admin tables as proof of spreadsheet interaction;
- last-write-wins multi-cell mutation;
- plain-text-only copy for internal formulas/types;
- client-only edit permission;
- canvas rendering without an equivalent accessibility model;
- adopting competitor shortcuts without one documented target keyboard map.

## P-002 Boundary

P-002 proved stable bounded windows with explicit stale-cursor invalidation,
offscreen logical selection, edit-mode focus, typed multi-format clipboard,
atomic batch rollback, and the virtualized ARIA/keyboard contract. A native
VoiceOver pass remains implementation acceptance. Formula-aware paste is
deferred to the later formula spec.
