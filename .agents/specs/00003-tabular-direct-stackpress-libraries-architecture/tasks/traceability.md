# Implementation Traceability

## Authority chain

The accepted requirement source is the Context package, led by
`tabular-product-contract.md`, `tabular-implementation-boundaries.md`, and
`tabular-creative-spec.md`. D-001 through D-009 and G-001 through G-010 in
`decisions.md` bind that product truth to the direct-library architecture.
Frozen P-001 proves direct composition and P-002 proves the PostgreSQL 18
boundary; neither substitutes for production-target identity, deployment,
backup, load, browser, or native-assistive-technology validation.

The visual chain is the accepted r007 creative baseline with the cumulative
behavior retained from `r003-spreadsheet-table-canvas`,
`r004-spreadsheet-command-surface`, `r005-spreadsheet-file-explorer`, and
`r007-integrated-views-activity`. Raw wireframes demonstrate shape and
interaction intent only. Runtime acceptance evidence must prove persistence,
authority, transport, and recovery separately.

## Task matrix

| Task | Requirement and decision/proof source | Wireframe or visible contract | Runtime owner | Executable verification and retained evidence |
| --- | --- | --- | --- | --- |
| 00001 | Implementation boundaries; D-001–D-003, D-007; G-001–G-002; P-001 | None | `config/`, `bootstrap/`, `entrypoints/`, Ingest/Reactus build | `npm run verify`; architecture, artifact, runtime, and entrypoint verifiers |
| 00002 | Product contract canonical data; D-005; G-004–G-006; P-002 | None | `plugins/database` migrations, pool, transaction, catalog identity | `test:postgres:foundation`, `test:postgres:production-boundary`; Task 00002 PostgreSQL journal |
| 00003 | Product contract Authority; D-004; G-003, G-005; R-003; P-001/P-002 | Authentication boundary only | `plugins/identity`, `plugins/catalog` | identity unit/HTTP and `test:postgres:identity-catalog` matrices; live provider remains deployment input |
| 00004 | Product contract Grid/Draft/Collaboration; D-003–D-005, D-007; G-007 | None | `plugins/capability` | capability unit and `test:postgres:capability-actions` success/deny/conflict/rollback matrix |
| 00005 | Product contract canonical objects, fields, relations; D-005; G-004–G-005 | r003 column/relation panels | `plugins/files`, confirmed migrator operations | files/compiler tests and `test:postgres:files-ddl` DDL/authority/rollback matrix |
| 00006 | Creative shell and accessibility baseline; D-003, D-007 | r003 spreadsheet canvas | `plugins/ui`, `plugins/grid` adapter | component/browser checks and `output/playwright/task-00006` desktop/narrow evidence |
| 00007 | Product hierarchy; creative Explorer/spreadsheet shell | r005-spreadsheet-file-explorer | `plugins/explorer` plus feature routes | explorer route/model tests and `output/playwright/task-00007` walkthrough |
| 00008 | Product field/edit/draft/relation contract | r003-spreadsheet-table-canvas | `plugins/grid`, capability/files seams | grid/editor tests, `test:postgres:grid`, `output/playwright/task-00008` |
| 00009 | Command-surface Context and accessibility baseline | r004-spreadsheet-command-surface | `plugins/commands`, UI composition | command/focus/keyboard tests and `output/playwright/task-00009` |
| 00010 | Product committed collaboration, saved views, shared row order; D-006 | r006/r007 saved views and live status | `plugins/realtime`, `plugins/saved-views` | realtime unit and `test:postgres:realtime-views` matrix; `output/playwright/task-00010` two-session evidence |
| 00011 | Product values-only import/current-result CSV export | r007 import and File export | `plugins/import-export`, worker seam | parser/service tests, `test:postgres:import-export`, `output/playwright/task-00011`; live Google credentials remain conditional |
| 00012 | Product durable jobs/outbox/activity; D-006 | r007-integrated-views-activity | `plugins/operations`, worker/migrator consumers | operation tests, `test:postgres:operations`, `output/playwright/task-00012` |
| 00013 | Product governed MCP/harness; D-003, D-004, D-007; G-007 | None | `plugins/mcp`, shared capability contracts | MCP contract and `test:postgres:mcp-parity` matrix; Task 00013 transcript/result |
| 00014 | Brief completion criteria; every decision/gap; P-001/P-002 limits; PostgreSQL-native authentication and human-accessible review | accepted r003–r007 cumulative surface plus sign-in/sign-out, immediately editable blank spreadsheet, unnamed-coordinate value entry, sparse-row retention, retained first-row recovery, blur autosave, distinct cell/named-header/whole-column selection, column drag/drop, WYSIWYG formatting, and neutral Price display | feature plugins plus PostgreSQL `LOGIN` authentication, durable application sessions and invalid-value drafts, serialized blur autosave, stable unnamed metadata over hidden JSON, persistent hidden row ranks, logical selection/presentation projection, reproducible local review setup, fixture removal, hidden durable row identity, tab-local column layout/presentation, and explicit release/operations tooling | Fresh executable `verify:release`, `npm run verify`, `test:postgres:all`, signed-out-to-signed-in browser acceptance without fixture/session injection, named blank-file create/edit/physical-rename persistence, sparse unnamed-cell draft reload, exact-one-row promotion, multi-cell blur autosave, exact body-cell/named-header/whole-column states, header-only WYSIWYG formatting, persistent header reorder, neutral two-decimal Price display, operational/restore/load evidence, and desktop/narrow/Safari/VoiceOver package |

## Coverage rules

- Every accepted Context section maps to at least one task above; deferred
  product surfaces remain deferred and do not become silent release scope.
- Every D-001–D-009 decision and G-001–G-010 answer is preserved either by the
  foundation rows or the final release audit. Frozen Proof conclusions are not
  edited by implementation results.
- Task files hold exact implementation, verification, and agent-acceptance
  notes. `tasks/status.md` is the current execution ledger; this matrix is the
  cross-source index and never overrides a failed or blocked task result.
- Corrective Task 00014 is agent-verified after its seventh human-review
  feedback pass. Fresh executable Browser and PostgreSQL proof covers saved-row
  recommit, unnamed-cell hidden-JSON drafts at sparse ranked positions, exact-
  one-row promotion, multi-cell blur autosave, bidirectional header reorder, distinct cell/named-
  header/whole-column selection, header-only formatting, and neutral Price
  through the running normal PostgreSQL-native path. Final human acceptance
  remains pending.
  A test double proves adapter behavior but never a human-accessible
  authentication target, stale evidence is not executable acceptance, and an
  isolated source snapshot is not mislabeled a clean Git checkout.
