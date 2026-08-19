# Tabular Product Knowledge Base

## Purpose and status

This is the durable product and creative knowledge base for Tabular. The
PostgreSQL-native product contract was accepted and promoted when research Spec
00001 Froze on 2026-07-31. The creative reconstruction preserves r007 Round 2,
and Frozen Spec 00003 supplies the accepted direct-library application,
security, migration, PostgreSQL, and process boundaries. User-directed,
verified implementation-review corrections from Spec 00003 Tasks 00014 and
00014A through 00014J, including the deletion, menu, row-numbering, exact drag,
production iconography, compact formatting-popover, rendered Border-style, and
page-session custom-color outcomes, were promoted by 2026-08-05.

Frozen Spec 00005 adds the accepted Field/storage families, safe Format
boundary, composable Tabular-only validator layer, JSONB collection shapes,
and existing-value `#VALUE!` lifecycle as of 2026-08-13.

The exact pointer-driven inserted-column drag acceptance passed on 2026-08-05
and its detailed evidence remains Spec 00003-local. Final human acceptance is
the remaining evidence gate; its pending status does not restore the superseded
product behavior recorded by earlier wireframes.

It does **not** authorize production implementation or PostgreSQL migrations.
Implementation requires an accepted task plan from a Frozen spec.

## Read in this order

1. [PostgreSQL-native product contract](tabular-product-contract.md) — accepted
   product, data, authority, grid, import/export, MCP, operations, and deferred
   boundaries; it wins over older wireframe-only assumptions.
2. [Creative foundation and screen map](tabular-creative-spec.md) — product
   model, visual language, shell, routes, screen inventory, and rebuild rules.
3. [Spreadsheet canvas and column configuration](tabular-grid-and-column-spec.md)
   — the grid, editing, errors, accepted ordering ownership, column settings,
   and relationships.
4. [Fields, validators, and Formats](tabular-fields-validators-formats.md) —
   canonical value families, safe editors/renderers, validator composition,
   database separation, JSONB collections, and `#VALUE!` behavior.
5. [Spreadsheet command surface](tabular-command-surface-spec.md) — File, Edit,
   View, Format, toolbar, popovers, and target-specific context menus.
6. [File explorer, new file, import, and table settings](tabular-files-import-and-settings-spec.md)
   — folder-first Files/Views discovery and all file-level flows.
7. [Wireframe decision history](tabular-wireframe-decision-history.md) — why
   current behavior supersedes earlier revisions and the browser-review record.
8. [Implementation boundaries](tabular-implementation-boundaries.md) — accepted
   direct-library composition, runtime-object, identity, authority, migration,
   browser-state, ordering, action, worker, and production-recheck rules from
   Specs 00002/00003 and r007.

## Source boundary

The reconstruction used the written specifications and review notes from
`wireframes/r001-postgres-native-core/` through
`wireframes/r007-integrated-views-activity/`, the current Tabular research
package, and the accepted/verified implementation-review records in Spec 00003.
No screenshots, wireframe assets, HTML, CSS, JavaScript, or other raw source
material were copied into `.agents/resources/` or this KB.

## Current product vocabulary

The Frozen product contract supersedes the older r005 visual-only folder rule:
primary navigation maps server/connection → database → schema folder →
table/view file. Detailed r005 screens remain visual evidence; where their
product assumptions conflict, the product contract wins.

| Use in primary UI | Use only as secondary or advanced detail |
| --- | --- |
| Server/connection, database, schema folder, file, table, column, row, record, field, format | Storage, table name, column name, relation |

Database and schema identity are visible. Operations and Finance are peer
schemas shown as folders inside one database. A file is the familiar container
users open; its canonical object is a PostgreSQL table or view.

## PostgreSQL-first decision rule

Infer product behavior from native PostgreSQL and evidenced Mathesar behavior
wherever they answer the requirement. Add Tabular-owned behavior only for
approved spreadsheet interactions or application surfaces such as governed
MCP/harness actions that PostgreSQL cannot express; never widen PostgreSQL
authority.

## Rebuild guardrails

- Reconcile r007's file-first visual language with the accepted
  server/database/schema-folder/table-file hierarchy; do not restore the older
  focused create-table builder.
- Retain the spreadsheet-first interaction model: the grid is the place to
  name columns, configure them, and enter values.
- Derive connection, database, schema, and identity labels from the configured
  PostgreSQL target; `Acme Inc.` remains a historical wireframe example only.
- Use the reviewed grayscale wireframe language. Do not copy Google Drive or
  Google Sheets branding, colors, global navigation, or unrelated features.
- Treat source screenshots as interaction inspiration only; the detail in this
  KB is the durable product direction.
- Saved views belong to folder discovery and the spreadsheet File menu; do not
  restore the rejected persistent saved-view bar above the grid.
- System activity is reachable from the normal explorer and spreadsheet shell;
  do not isolate operations states behind a review-only workflow index.
- Keep all simulated-only behavior visibly separate from a live PostgreSQL
  claim. See each document's boundaries and the decision history.
