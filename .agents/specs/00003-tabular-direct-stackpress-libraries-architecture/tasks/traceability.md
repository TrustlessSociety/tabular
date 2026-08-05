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
| 00014A | Task 00014 final-review keyboard rejection; grid interaction Context | Active-cell focus continuity across load, navigation, editing, cancellation, and live refresh | `plugins/grid` adapter and `plugins/ui` workbench | Focused keyboard/focus tests, complete fast suite, clean build, static validators, and signed-in Browser acceptance |
| 00014B | Task 00014 final-review command and formatting rejection; command/grid Context | Whole-header-row selection, target-aware context menus, header formatting, relations, and transient sorting | `plugins/commands`, `plugins/grid`, and `plugins/ui` | Focused component/registry/workbench tests, complete fast suite, clean build, static validators, and signed-in Browser acceptance |
| 00014C | Task 00014 final-review insertion rejection; row-order and DDL Context | Inert blank-row insertion and requested-side column insertion | `plugins/grid`, `plugins/ui`, and existing files/DDL boundary | Focused insertion tests, complete fast suite, clean build, static validators, and signed-in Browser acceptance |
| 00014D | Task 00014 final-review insertion-parity rejection; spreadsheet interaction Context | Visible header emphasis, one-sided row-rank allocation, and immediate tab-local blank-column insertion | `plugins/grid` and `plugins/ui` | Focused presentation/rank/insertion tests, complete fast suite, clean build, static validators, and signed-in Browser acceptance |
| 00014E | Task 00014 final-review drag/delete rejection; spreadsheet command and grid Context | Exact blank-header drop boundaries, blank-column deletion, caret/menu cleanup, and row-1 coordinate alignment | `plugins/grid`, `plugins/ui`, and `plugins/commands` | Technical verification and blank deletion/menu/numbering Browser checks passed; exact pointer-driven drag acceptance passed 2026-08-05 |
| 00014F | User-directed production icon inventory and correction screenshots; creative and command Context | Shared SVG vocabulary, exact Borders/alignment diagrams, and distinct import, Saved Views, Activity, source, warning, and result marks | `plugins/ui`, `plugins/commands`, `plugins/saved-views`, `plugins/import-export`, `plugins/operations`, and `plugins/explorer` | 26 focused render tests, all 251 full-suite tests, clean production/static verification, reduced-motion review, and signed-in desktop/narrow Browser evidence passed 2026-08-05 |
| 00014G | Task 00014F final-review density correction and supplied screenshots | Text-only Border section headings, color control below its label, and intrinsic three-choice popover width | `plugins/commands` | 6 focused command tests, all 251 full-suite tests, clean production/static verification, and signed-in desktop/narrow Browser evidence passed 2026-08-05 |
| 00014H | Task 00014G final-review color/interaction correction and supplied palette screenshot | Exact shared text/fill/border palette order and initially-open Border visible accordion | `plugins/commands` | 8 focused command tests, all 253 full-suite tests, clean production/static verification, Agent Workspace validation, and signed-in desktop/narrow Browser evidence passed 2026-08-05 |
| 00014I | Task 00014H final-review simplification | Remove deferred Conditional formatting from standalone and narrow fill/background color surfaces | `plugins/commands` | 8 focused command tests, all 253 full-suite tests, clean production/static verification, Agent Workspace validation, and signed-in desktop/narrow Browser evidence passed 2026-08-05 |
| 00014J | Task 00014H final-review Border/custom-color correction | Distinct rendered dashed, dotted, and double cell edges plus one shared, deduplicated, page-session custom-color row | `plugins/commands` and `plugins/grid` | 22 focused command/adapter tests, all 255 full-suite tests, clean production/static verification, Agent Workspace validation, and signed-in desktop/narrow Browser evidence passed 2026-08-05 |

## Coverage rules

- Every accepted Context section maps to at least one task above; deferred
  product surfaces remain deferred and do not become silent release scope.
- Every D-001–D-009 decision and G-001–G-010 answer is preserved either by the
  foundation rows or the final release audit. Frozen Proof conclusions are not
  edited by implementation results.
- Task files hold exact implementation, verification, and agent-acceptance
  notes. `tasks/status.md` is the current execution ledger; this matrix is the
  cross-source index and never overrides a failed or blocked task result.
- Parent Task 00014 and corrective side quests 00014A through 00014J are
  agent-verified. Side quest 00014E passed its exact pointer-driven Browser drag
  acceptance, and 00014F passed production/static verification plus desktop and
  narrow Browser review on 2026-08-05. Side quest 00014G passed its production,
  desktop, and narrow checks the same day. Side quest 00014H then passed exact
  palette-order, single-open accordion, production, desktop, and narrow checks.
  Side quest 00014I then passed removal from both fill/background rendering
  paths with production, desktop, and narrow checks. Side quest 00014J passed
  distinct dashed/dotted/double projection, shared custom-color reuse, narrow
  containment, and refresh-reset checks. Final human acceptance remains
  separate and pending.
- Fresh executable Browser and PostgreSQL proof covers saved-row recommit,
  unnamed-cell hidden-JSON drafts at sparse ranked positions, exact-one-row
  promotion, multi-cell blur autosave, selection modes, header formatting, and
  neutral Price through the running normal PostgreSQL-native path.
  A test double proves adapter behavior but never a human-accessible
  authentication target, stale evidence is not executable acceptance, and an
  isolated source snapshot is not mislabeled a clean Git checkout.
