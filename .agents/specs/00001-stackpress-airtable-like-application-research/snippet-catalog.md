# Snippet Catalog

> Direction update (2026-07-24): snippets that assume generic canonical cell
> storage are historical evidence. The current direction uses real PostgreSQL
> tables plus Tabular-owned metadata and drafts; see
> `postgresql-native-product-direction-findings.md`.

Entries use short pseudocode rather than copied implementations. Follow the linked pinned path before relying on details, and re-check the path-specific license before direct reuse.

## S-001: DDL Before Metadata And Broadcast

Source: NocoDB [`tables.service.ts`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nocodb/src/services/tables.service.ts#L1131-L1181), followed by index/event handling through line 1264.

```text
physicalTable = ddl.create(tablePayload)
physicalColumns = ddl.inspectColumns(physicalTable)
model = metadata.insert(tablePayload, physicalColumns, virtualColumns)
indexes.ensure(model)
events.emit(TableCreated, model)
realtime.broadcast(MetadataChanged, model)
```

Usefulness: makes ordering and failure boundaries visible. Stackpress translation should place DDL and metadata changes inside an explicit application operation with compensation or transaction rules.

Reuse: pattern only; NocoDB Sustainable Use License.

## S-002: Schema Metadata Is Data

Source: Grist Core [`schema.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/common/schema.ts#L22-L49) and view metadata through line 140.

```text
TableMeta = { tableId, primaryView, summarySource, onDemand }
ColumnMeta = { tableRef, position, colId, type, isFormula, formula, recalcDeps }
ViewSectionMeta = { tableRef, viewRef, layout, filters, sorts, links }
```

Usefulness: a compact target for the control-plane model map and a reminder that formulas, views, and link semantics need durable identifiers.

Reuse: structure concept; Apache-2.0 source.

## S-003: Row-Aware Dependency Invalidation

Source: Grist Core [`depend.py`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/sandbox/grist/depend.py#L124-L164).

```text
queue = [(dirtyColumn, dirtyRows)]
while queue:
  column, rows = queue.pop()
  recompute[column] += rows
  for edge in dependants(column):
    queue.push(edge.output, edge.mapAffectedRows(rows))
```

Usefulness: recomputation must track both dependency edges and affected row sets; a column-only graph is insufficient for relations and lookups.

Reuse: algorithm pattern; Apache-2.0 source.

## S-004: Runtime ORM Over Physical User Tables

Source: Baserow [`table/models.py`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/backend/src/baserow/contrib/database/table/models.py#L933-L1068) and [`database-plugin.md`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/docs/technical/database-plugin.md#L8-L49).

```text
dbTable = "database_table_" + tableId
dbColumn = "field_" + fieldId
RuntimeModel = generateModel(dbTable, typedFields, relationRegistry, queryHelpers)
```

Usefulness: shows one concrete hybrid: durable metadata plus physical tables plus runtime query models. It also exposes complexity around registries, relations, cache invalidation, and concurrent model generation.

Reuse: architecture pattern; OSE path is MIT, while the linked documentation is CC BY-SA 4.0.

## S-005: Chunked Grid Window

Sources: NocoDB [`InfiniteTable.vue`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nc-gui/components/smartsheet/grid/InfiniteTable.vue#L232-L329), Baserow [`bufferedRows.js`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/web-frontend/modules/database/store/view/bufferedRows.js), and Grist [`BaseView.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/client/components/BaseView.ts).

```text
chunkSize = 50
rows = load({ offset, limit: chunkSize })
for row in rows: cache[row.index] = row
render(cache.slice(visibleStart, visibleEnd), placeholders)
```

Usefulness: defines the minimum logical-window/cache contract to test before building a polished two-axis, keyboard-accessible grid.

Reuse: interaction pattern only; NocoDB Sustainable Use License.

## S-006: Stable Stackpress Core, Dynamic Application Plane

Source: local Stackpress `.agents/context/modeling-and-generation.md`, `.agents/context/runtime-and-operations.md`, and `.agents/context/interfaces-and-experience.md` at revision `a71d683051ba8350fdd12d6b5a33f268fdcc285f`.

```text
Idea -> package transforms -> generated client -> registered model capabilities
request surface -> caller policy -> named event -> application data plane
```

Usefulness: keep only fixed identity/control models in generated Stackpress contracts while routing workbook/sheet/cell behavior through explicit application events and custom storage/query components.

Reuse: accepted boundary for fixed Stackpress control models versus the
PostgreSQL-native application plane. P-005 verified shared capability and
authorization behavior; P-007 verified the real-table, metadata, and draft
boundary. P-001 was invalidated by the accepted native-table direction.

## S-007: Loss-Aware Spreadsheet Import Cell

Sources: Google Sheets [`CellData`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells), Microsoft SpreadsheetML [formula contract](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas), and findings F-011/F-012.

```text
ImportedCell = {
  sourceCoordinate,
  sourceLiteralOrFormula,
  normalizedFormula,
  sourceCachedValue,
  sourceDisplayedValue,
  targetValue,
  compatibilityState,
  basicFormat,
  note,
  warnings
}
```

Usefulness: prevents early flattening and gives preview, commit, formula migration, and recovery one shared representation.

Reuse: target pseudocode synthesized from public platform contracts; no source implementation copied.

## S-008: Staged And Idempotent Import

Sources: Grist Core `app/server/lib/ActiveDocImport.ts`, Baserow `backend/src/baserow/contrib/database/file_import/{models,job_types}.py`, and findings F-014.

```text
import = createImport(sourceFingerprint, requestedBy)
stage = extractBounded(import, source)
report = validateAndMap(stage)
if userAccepts(report):
  commitOnce(import.idempotencyKey, stage, firstWorkbookRevision)
else:
  abandon(stage)
```

Usefulness: separates source extraction from canonical state and makes failures, warnings, retries, and user acceptance observable.

Reuse: pattern synthesis; linked NocoDB code is Sustainable Use licensed, Grist is Apache-2.0, and Baserow path-specific license review remains required.

## S-009: Generic Spreadsheet Storage Boundary

Sources: PostgreSQL [JSON design guidance](https://www.postgresql.org/docs/18/datatype-json.html), Stackpress ownership finding F-010, and import finding F-015.

```text
Generated control plane:
  account, workspace, membership, roleTemplate, applicationPolicy

Generic spreadsheet data plane:
  workbook, sheet, rowOrder, columnOrder, cell, formula, comment
  view, grant, import, action, audit, outbox, revision, provenance
  + bounded jsonb(value, format, sourceState, errorState)
```

Usefulness: preserves semantically unstructured spreadsheet content without turning a whole workbook into one independently uneditable JSON value.

Reuse: historical alternative only. The accepted PostgreSQL-native direction
does not use a generic cell JSONB data plane; P-007 instead verified real
tables with Tabular-owned metadata and drafts.

## S-010: Versioned Formula Compatibility Ledger

Sources: official [Google Sheets function list](https://support.google.com/docs/table/25273?hl=en), HyperFormula 3.3.0 [built-ins](https://hyperformula.handsontable.com/docs/guide/built-in-functions.html) and [differences](https://hyperformula.handsontable.com/docs/guide/list-of-differences.html), and F-019.

```text
FormulaCompatibility = {
  sourceCatalogSnapshot,
  engineVersion,
  sourceName,
  disposition: exactCandidate | mapped | unsupported | volatile | external,
  mappingVersion,
  fixtureResult
}
```

Usefulness: separates catalog presence from proved semantics and allows imports to preserve formulas even when the selected engine cannot evaluate them.

Reuse: target pseudocode synthesized from public catalogs; HyperFormula dependency use remains license-gated.

## S-011: Stable Cell Identity And Window Query

Sources: PostgreSQL [JSON atomicity guidance](https://www.postgresql.org/docs/18/datatype-json.html), [multicolumn indexes](https://www.postgresql.org/docs/18/indexes-multicolumn.html), [row locks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS), and F-020/F-021.

```text
CellKey = (sheetId, stableRowId, stableColumnId)
RowOrder = (sheetId, rowOrderKey, stableRowId)
ColumnOrder = (sheetId, columnOrderKey, stableColumnId)

window = cells
  .where(sheetId)
  .join(rowOrder between visibleStart and visibleEnd)
  .join(columnOrder between visibleLeft and visibleRight)
```

Usefulness: cell identity survives row/column reordering while the tuple and lock boundary remains one independently edited cell.

Reuse: target pseudocode; exact indexes, query plan, and cache/partition thresholds remain P-001 work.
