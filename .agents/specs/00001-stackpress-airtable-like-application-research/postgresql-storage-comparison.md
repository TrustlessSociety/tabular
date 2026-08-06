# PostgreSQL Spreadsheet Storage Comparison

Access date: 2026-07-23

> Historical comparison: R-020 superseded this generic cell-row recommendation
> with a direct PostgreSQL table model. Retain this file for formula/import and
> alternate-storage evidence only. Load
> [PostgreSQL-Native Product Direction Findings](postgresql-native-product-direction-findings.md)
> for the current target.

This compares canonical storage granularity for a generic spreadsheet data plane. It does not authorize schema implementation and does not replace the workload Proof proposed in P-001.

## Required Workload

The accepted product boundary requires:

- independent cell edits;
- bounded grid-window reads and batch paste;
- formulas and dependency invalidation;
- cell notes and threaded comments;
- revisions, audit, undo, and optimistic concurrency;
- sparse sheets and one-time Google Sheets/XLSX/CSV import;
- stable provenance and identifiers without per-department or per-workbook generated models.

## PostgreSQL Evidence

- PostgreSQL's [`jsonb` guidance](https://www.postgresql.org/docs/18/datatype-json.html) says a JSON document should ideally represent an atomic unit that cannot reasonably be subdivided and warns that every update acquires a row-level lock on the whole row.
- PostgreSQL [row-level locks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) block writers and lockers to the same row, which makes the chosen tuple boundary the edit-contention boundary.
- A [multicolumn B-tree](https://www.postgresql.org/docs/18/indexes-multicolumn.html) is most efficient when equality constraints cover leading columns, which fits `sheet_id` followed by row and column position/rank access.
- PostgreSQL [TOAST](https://www.postgresql.org/docs/18/storage-toast.html) moves oversized values out of line. It makes large JSON values possible, but it does not turn a large row or block into an independently editable set of cells.
- [`ON CONFLICT`](https://www.postgresql.org/docs/18/sql-insert.html#SQL-ON-CONFLICT) provides an atomic insert-or-update outcome against a unique arbiter, useful for idempotent staged-import commit.
- Declarative [partitioning](https://www.postgresql.org/docs/18/ddl-partitioning.html) can improve some very large-table workloads and maintenance operations, but it should follow measured size and access patterns rather than define the first schema.

The conclusions below are inferences from those database contracts plus the cell-scoped product workload.

## Option Matrix

| Criterion | Cell row | Row document | Bounded block | Whole sheet/workbook |
| --- | --- | --- | --- | --- |
| Independent edit/lock boundary | Strong: one cell tuple | Medium: every cell in the row shares a lock | Weak-medium: every cell in the block shares a lock | Poor: all edits share one row |
| Bounded grid reads | Strong with sheet/row/column index; more tuples | Strong natural row window | Strong when window aligns with blocks; edge stitching required | Poor unless full document is read and decoded |
| Sparse data | Strong: absent cells need no tuple | Medium: sparse cells fit JSON but row still exists | Medium: empty regions can omit blocks | Weak: document grows with workbook metadata/content |
| Formula dependencies | Strong: stable cell identity and direct joins | Medium: separate dependency table still needed | Medium: separate identity/dependency tables still needed | Poor: fine-grained invalidation is external to the document |
| Notes/comments | Strong cell foreign key | Medium: discussions should still be separate | Medium: discussions should still be separate | Poor: thread lifecycle conflicts with document updates |
| Revision/audit delta | Strong cell/action delta | Medium row delta can overstate one-cell edits | Medium block delta can overstate one-cell edits | Poor large deltas or custom patch machinery |
| Bulk import/paste | More tuples; bounded batch insert/upsert | Efficient row batches | Efficient block batches | Simple initial write, poor later edits |
| Secondary value queries | Scalar columns/indexes are direct | JSON extraction/expression indexes required | JSON extraction plus block expansion required | Broad JSON scans or extensive expression indexes |
| Operational complexity | High row volume, familiar relational behavior | Fewer rows, mixed JSON/query semantics | Block math, stitching, split/rewrite policy | Simple only until editing, history, and concurrency matter |
| Primary failure mode | Tuple/index volume | Row contention and oversized row rewrites | Hot-block contention and complex partial updates | Whole-document contention and unbounded rewrites |

## Research Recommendation

Use a **cell-row canonical model** with stable workbook, sheet, row, column, and cell identifiers. Keep order/position on separate row and column dimension records so inserting or reordering a row does not rewrite every cell coordinate.

Recommended boundaries:

```text
workbook -> sheet
sheet -> sheet_row(id, order_key, source_row)
sheet -> sheet_column(id, order_key, source_column)
cell(sheet_id, row_id, column_id, kind, typed_value, formula_id, format_jsonb,
     source_jsonb, compatibility_state, version)
formula(cell_id, source_text, normalized_ast, source_cached_value,
        target_value, error_state, mapping_version)
note(cell_id, content, provenance)
comment_thread(cell_id?, source_anchor, state) -> comment/reply
revision/action -> affected cell IDs and before/after or inverse delta
```

Ordinary indexed columns should hold identity, ownership, sheet/row/column keys, value kind, revision/version, provenance keys, and permission-relevant ownership. Bounded `jsonb` is appropriate for flexible per-cell format, source, and error metadata because those values move with the cell as one edit unit.

The first access path should be a uniqueness constraint on `(sheet_id, row_id, column_id)` plus B-tree indexes that begin with `sheet_id` and follow the actual window-order columns. Exact covering indexes must wait for observed query shapes; PostgreSQL warns against indiscriminate wide multicolumn indexes.

## Why The Other Options Are Not Canonical

- A row document is attractive for importing and rendering a row, but simultaneous edits to different cells in one row contend on the same tuple. Formula, comment, audit, and cell-specific query concerns still require separate structures.
- A bounded block can be useful later as a derived cache or transport payload, but making it canonical moves contention and revision scope to the block and adds stitching, split, and partial-update rules.
- A whole sheet or workbook JSON document conflicts directly with PostgreSQL's atomic-document guidance because cells, comments, formulas, and revisions are independently modified business units.
- Per-workbook physical tables and per-department generated Stackpress models violate the accepted generic-data constraint and inherit the runtime-DDL complexity found in NocoDB and Baserow.

## Import, Concurrency, And History

Staging may use row or block batches as an extraction/transport optimization without making those shapes canonical. Commit should:

1. bind the source fingerprint and import ID;
2. create stable workbook/sheet/row/column IDs;
3. insert or upsert cells under a unique import/coordinate rule;
4. attach formulas, notes, comments, provenance, and the fidelity report;
5. publish one first-workbook revision only after the canonical transaction succeeds.

An initial edit contract should use a cell `version` or revision precondition so stale writes fail visibly. Durable history should be an action/delta subsystem, not copies of the whole workbook and not Stackpress schema revisions.

## Proof Boundary

Source research answers the model-selection question strongly enough to recommend cell rows, but P-001 remains justified before architecture acceptance. It should measure:

- tuple and index size for representative sparse and dense sheets;
- bounded window latency and batch paste/import throughput;
- concurrent edits in the same row and nearby cells;
- formula dependency fan-out and recomputation writes;
- revision growth and reconstruction cost;
- whether and when sheet/workbook/hash partitioning or a derived row/block cache becomes useful.

The Proof should compare the same workload against row documents and bounded blocks. It must not implement production schema, Qdrant, department models, or a polished grid.
