# Source Inventory

Initial access date: 2026-07-23. Focused completion access date: 2026-07-24.
This is the revision-pinned inventory used for the bounded research queue. “Complete” means enough source evidence was inspected to answer or assign every current Gap; it does not claim exhaustive repository coverage.

## Revision Pins

| Source | Branch | Inspected revision | License boundary | Inventory state |
| --- | --- | --- | --- | --- |
| `nocodb/nocodb` | `develop` | [`b464046cd489d31ffed515e149f351a42a433c5d`](https://github.com/nocodb/nocodb/commit/b464046cd489d31ffed515e149f351a42a433c5d) | Sustainable Use License; internal business and non-commercial/personal use limits make direct reuse unsuitable as a default | Complete for bounded research |
| `gristlabs/grist-core` | `main` | [`e9b287491d6aea9600d1c495fdf240dde84400cb`](https://github.com/gristlabs/grist-core/commit/e9b287491d6aea9600d1c495fdf240dde84400cb) | Apache-2.0 | Complete for bounded research |
| `gristlabs/grist-static` | `main` | [`4eb5c66c2bf9b0c50dd0d11031e1f989ebf1e09e`](https://github.com/gristlabs/grist-static/commit/4eb5c66c2bf9b0c50dd0d11031e1f989ebf1e09e) | Apache-2.0 | Complete; portability case |
| `baserow/baserow` | `develop` | [`bc8c5e825c4a8cf95197284f99e611ed709d832e`](https://github.com/baserow/baserow/commit/bc8c5e825c4a8cf95197284f99e611ed709d832e) | OSE and served client JavaScript are MIT; docs are CC BY-SA 4.0; premium and enterprise trees have separate licenses | Complete for bounded research |
| `handsontable/hyperformula` | release tag | [`3.3.0`](https://github.com/handsontable/hyperformula/tree/3.3.0) | GPLv3 or proprietary/commercial | Formula benchmark snapshot complete; not an accepted dependency |
| `OSSPhilippines/frui` | `main` | [`096fd14580f0f49b6e159fa0aa5ae2a5bce8fb0e`](https://github.com/OSSPhilippines/frui/commit/096fd14580f0f49b6e159fa0aa5ae2a5bce8fb0e) | MIT | Complete bounded inventory for field/format inspiration only |
| Stackpress `.agents` | local `main` | `a71d683051ba8350fdd12d6b5a33f268fdcc285f` | Local project source; no uncommitted `.agents` changes at inspection | Complete capability map |

## NocoDB

Initial architecture map:

- TypeScript monorepo with backend under `packages/nocodb`, Vue grid/client under `packages/nc-gui`, and shared SDK packages.
- `Model`, `Column`, and `View` are metadata records keyed by workspace/base/source/model identifiers.
- Table creation performs database-specific DDL first, reads physical columns where needed, inserts metadata, creates operational indexes, emits an application event, and broadcasts a metadata event.
- Formula V2 builds database expressions through Knex and dialect-specific branches; lookup and rollup fields have separate query builders.
- The infinite grid uses offset/limit chunks, a row-index cache, visible windows, and placeholder rows.

Inspected evidence:

- `README.md`, `LICENSE.md`, `package.json`
- `packages/nocodb/src/models/{Model,Column,View}.ts`
- `packages/nocodb/src/services/tables.service.ts`
- `packages/nocodb/src/db/formulav2/formulaQueryBuilderv2.ts`
- `packages/nc-gui/components/smartsheet/grid/InfiniteTable.vue`

Import-specific evidence:

- `packages/nocodb/src/modules/jobs/jobs/data-import/handlers/excel-import.handler.ts` streams XLSX, ignores styles/hyperlinks, and returns cached formula results rather than formulas.
- `packages/nc-gui/workers/importWorker.ts` separates parser adapters, template/data generation, progress, and errors.

Security/collaboration evidence:

- `packages/nocodb/src/utils/acl.ts` maps organization, workspace, and base operations to role scopes.
- `packages/nocodb/src/services/views.service.ts` adds resource ownership and state checks beyond coarse ACL.
- `packages/nocodb/src/utils/audit.ts` carries actor/request/tenant/resource context and masks sensitive properties.
- `packages/nocodb/src/command-registry/types.ts` defines typed operations, inverse commands, snapshots, replay, and scoped undo logs; the pinned GUI undo composable is disabled.

Completion evidence also covered row transaction context and serial query control in `BaseModelSqlv2.ts`, relation/column lifecycle, metadata migrations, application hooks, keyboard/range/paste behavior, and cache invalidation. The later Proof loop covered target grid behavior in P-002 and PostgreSQL-native storage/metadata/drafts in P-007; P-001 was invalidated by that native-table direction.

## Grist Core

Initial architecture map:

- Node/TypeScript home-server and doc-worker layers with a sandboxed Python data engine.
- Each open document is assigned to one doc worker, backed by a local SQLite document file; formulas run in the Python engine.
- `_grist_*` metadata tables describe document tables, columns, views, view sections, fields, ACL rules, imports, attachments, and triggers.
- User Actions become simple Doc Actions; Node translates Doc Actions to SQLite updates and broadcasts them to connected clients.
- Formula invalidation is modeled as a dependency graph over table/column nodes and affected row sets.
- Action history distinguishes local unsent, local sent, and shared actions and maintains client-linked undo information.

Inspected evidence:

- `README.md`, `LICENSE.txt`, `package.json`
- `documentation/overview.md`
- `app/common/{schema,TableData}.ts`
- `sandbox/grist/depend.py`
- `app/server/lib/ActionHistory.ts`

Import-specific evidence:

- `sandbox/grist/imports/import_xls.py` uses read-only, data-only, values-only XLSX extraction and therefore flattens formulas and omits formatting/comments.
- `app/server/lib/ActiveDocImport.ts` supplies parse-plugin, hidden-preview-table, bundled-action, transform, finalize, cancel, and cleanup boundaries.

Security/collaboration evidence:

- `app/common/ACLRuleCollection.ts` supplies deny-oriented access fallbacks.
- `app/server/lib/GranularAccess.ts` authorizes initial and expanded actions and filters client delivery.
- `app/server/lib/Sharing.ts` serializes document mutation, history, and post-commit broadcast.
- `app/server/lib/{ActionHistory,AuditEvent}.ts` separates document actions/undo from security and operational audit.

Completion evidence also covered lazy/on-demand query models, cursor/edit/clipboard behavior, API authorization, bounded webhook delivery, file backup/snapshot separation, attachment-store boundaries, and custom-widget access levels. The later Proof loop covered applicable target semantics in P-002, P-004, and P-005; P-003 moved with formulas to a later spec.

## Grist Static

Initial architecture map:

- A fully browser-side packaging of Grist for `.grist` files and CSV content without a special backend.
- Supplies bootstrap, CSV viewer, web-component, and alternate behavior/storage hook surfaces.
- Explicitly lacks durable shared changes and specific access control in its default mode.
- Demonstrates that a rich data UI can be adapted behind alternate storage and identity hooks, but not that the backend domain responsibilities disappear.

Inspected evidence:

- `README.md`, `LICENSE.txt`, `package.json`
- `ext/app/pipe/GristOverrides.ts`

Completion evidence inspected `SqliteJs.ts`, document creation/storage hooks, and the destructive/export-reopen caveat of sql.js. The source remains a portability/adapter case; offline/browser persistence is outside the accepted product boundary.

## Baserow

Initial architecture map:

- Django backend, Vue frontend, PostgreSQL storage, REST APIs, and a registry-based plugin system.
- Metadata `Table`, polymorphic `Field`, and polymorphic `View` records are separate from row data.
- Each user table has a physical PostgreSQL table; fields become `field_<id>` columns.
- Runtime-generated Django models point at the physical user table and receive field-type-specific model fields and query behavior.
- Views own filter, sort/group, public-share, and per-field display options.
- Field dependencies are durable records and can traverse a link-row field.

Inspected evidence:

- `README.md`, `LICENSE`
- `docs/technical/database-plugin.md`
- `backend/src/baserow/contrib/database/table/models.py`
- `backend/src/baserow/contrib/database/fields/{models,registries}.py`
- `backend/src/baserow/contrib/database/fields/dependencies/models.py`
- `backend/src/baserow/contrib/database/views/models.py`
- `docs/plugins/{field-type,view-type}.md`

Import-specific evidence:

- `web-frontend/modules/database/utils/excel.js` disables formula parsing and converts cells to formatted strings.
- `TableExcelImporter.vue` performs bounded preview and full reparse at commit.
- `backend/src/baserow/contrib/database/file_import/{models,job_types}.py` persists import identity/report data and uses table locking, actions, transaction cleanup, and row-level error reporting.

Security/collaboration evidence:

- `docs/technical/permissions-guide.md` defines backend actor/operation/context checks, hierarchical query filtering, and deny when no manager decides.
- `docs/technical/undo-redo-guide.md` and `backend/src/baserow/core/action/handler.py` define session/scope undo, locks, atomic action groups, and redo invalidation.
- `backend/src/baserow/contrib/database/rows/models.py` records before/after row history tied to action UUIDs.
- `backend/src/baserow/contrib/database/ws/rows/signals.py` broadcasts row and history changes only after commit.
- Enterprise scoped roles and audit logs are feature/license gated and are pattern evidence, not default reuse candidates.

Completion evidence also covered sparse buffered rows, selection/copy/paste, dependency rebuild/topological cycle handling, registry composition, import-job cleanup, post-commit webhooks, bounded queues, retries, call records, and failure deactivation. Current target behavior follows the P-002 through P-007 dispositions in `proofs.md`; P-001 is historical.

## HyperFormula

Formula benchmark:

- Version 3.3.0 is a headless parser/evaluator with a published built-in catalog, volatile-function list, and explicit comparison against Google Sheets and Microsoft Excel.
- The rendered catalog advertised 418 functions and exposed 416 distinct IDs; `NORMDIST` appeared twice. This discrepancy is preserved as catalog-drift evidence rather than silently normalized.
- Comparing its distinct IDs with the 515 distinct names extracted from the official Google Sheets list produced 378 same-name candidates.
- HyperFormula's own difference ledger prevents treating same-name presence as semantic parity. The target still needs a versioned fixture corpus and an explicit mapping/unsupported ledger.
- The dual GPLv3/proprietary license is an architecture gate. Research use is allowed; product dependency selection requires an accepted licensing decision.

Inspected evidence:

- `package.json` and `LICENSE.txt` at tag `3.3.0`
- `docs/guide/built-in-functions.md`
- Published [built-in functions](https://hyperformula.handsontable.com/docs/guide/built-in-functions.html), [differences](https://hyperformula.handsontable.com/docs/guide/list-of-differences.html), and [volatile functions](https://hyperformula.handsontable.com/docs/guide/volatile-functions.html)

Disposition: historical benchmark for a later formula spec. P-003 is deferred
and must not execute under Spec 00001.

## Stackpress

Initial capability map:

- Idea compiles application schema; package-owned transforms emit an executable generated client.
- Stackpress Schema normalizes model/column semantics; Stackpress SQL owns generated stores, actions, events, diffs, and migration operations.
- Named events are the shared capability protocol; pages, admin, APIs, MCP, CLI, and desktop remain adapters with separate caller policy.
- Generated field/filter/list/span/view components are useful for fixed system/admin models, but generated UI is not evidence of spreadsheet-grid behavior.
- Revisions record generated schema history and are explicitly not a database applied-migration ledger or record-edit history.

Inspected evidence:

- `.agents/context/{index,architecture-and-composition,modeling-and-generation,runtime-and-operations,interfaces-and-experience,ecosystem-and-portability}.md`
- `.agents/references/{00006-schema-api-contracts,00010-sql-api-contracts,00011-database-adapter-contracts,00012-view-api-contracts}.md`

Completion evidence also inspected application page/event examples, PostgreSQL transaction use, batch actions, API/webhook/MCP adapters, session allow-all risk, SSR snapshot exposure, lifecycle placement, and the absence of native workbook history/job/outbox/grid contracts. These responsibilities are mapped in `domain-capability-model.md` and `interfaces-and-operations-findings.md`.

## Focused PostgreSQL-Native Product And FRUI Evidence
The 2026-07-24 direction pass added official product-document evidence for
Mathesar's direct PostgreSQL orientation; Supabase's queued diff and
transactional save; NocoDB's grid and record actions; Directus's separation of
schema, input, display, and validation; and Baserow's grid, view, and
PostgreSQL-sync patterns. These are bounded behavior/positioning observations,
not source-code pins or authorization to copy product UI or implementation.
The pinned FRUI form and view exports supplied input- and format-family
inspiration. Its README describes a component collection, not a layout, grid,
theme, or design system. D-012 limits it to registry inspiration.
The local Stackpress revision was checked against `docs/idea-reference.md` and
schema examples. Idea separates storage, input, format, and validation for
fixed schemas; Tabular may adapt that separation but must not generate a client
for every user table.
The preserved prompts, URLs, exact exports, revisions, and source boundaries
are in `.agents/resources/2026-07-24-mathesar-frui-direction.md`; conclusions
are in `postgresql-native-product-direction-findings.md`.

## Official Platform Contracts
The import and storage continuation also inspected:

- the official [Google Sheets function list](https://support.google.com/docs/table/25273?hl=en), which rendered 515 distinct names after de-duplicating `UNIQUE`;
- Google Sheets `CellData`, spreadsheet properties, bounded `spreadsheets.get`, and Drive comment resources recorded in `import-formula-findings.md`;
- Microsoft SpreadsheetML formula/cell contracts and RFC 4180 recorded in `import-formula-findings.md`;
- PostgreSQL 18 `jsonb`, row locking, indexes, TOAST, `ON CONFLICT`,
  partitioning, generated columns, views, and materialized views recorded in
  `postgresql-storage-comparison.md` and `computed-columns-and-frui-support-findings.md`.
- Google Sheets format/dimension fields, Drive comment/anchor and file-version limits, and Microsoft legacy/threaded-comment/placeholder contracts recorded in `import-fidelity-contract.md`;
- ExcelJS 4.4.0 at `5bed18b45e824f409b08456b59b87430ded023ab`, SheetJS CE 0.20.3 official release docs, and openpyxl 3.1.3 comment limits recorded as adjacent parser evidence in `import-fidelity-contract.md`.
