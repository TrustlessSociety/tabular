# Decisions And Gaps

## Accepted Setup Decisions

### D-001: Research-Only Boundary

The current package is for research. It does not authorize product implementation, framework changes, or disposable prototypes.

Evidence: the user requested a spec for research.

### D-002: Required Primary Sources

The primary source set is NocoDB, Grist Core, Grist Static, Baserow, and the local Stackpress `.agents` knowledge base named in `brief.md`.

Evidence: the user explicitly supplied these sources.

### D-003: Required Evidence Types

Research must seek models, patterns, Proof candidates, code snippets, and other useful implementation evidence. Tests, migrations, fixtures, architecture records, and rejected approaches are in scope when they provide stronger evidence.

Evidence: the user explicitly requested these evidence types and allowed adjacent useful findings.

### D-004: Stackpress Is The Target Foundation

Recommendations must be translated into Stackpress ownership and capability terms. Source-project patterns are inputs, not the target runtime or framework.

Evidence: the requested application is to be written in Stackpress.

### D-005: Internal Spreadsheet Replacement

The target is an internal, friendlier Mathesar-like spreadsheet application that centralizes company data in PostgreSQL for staff and governed AI access through MCP plus a harness. It is not a collection of department-specific platforms.

Evidence: accepted user clarification on 2026-07-23.

### D-006: PostgreSQL Is Canonical And Content Remains Generic

Status: Superseded by D-010 on 2026-07-24.

PostgreSQL remains the authoritative store and user-created tables still must
not trigger Stackpress Idea generation. The earlier requirement that workbook,
sheet, and cell data use one generic spreadsheet data plane is no longer the
accepted canonical model.

Evidence: accepted user clarification on 2026-07-23.

### D-007: Import Is One-Time From Three Sources

The current phase supports one-time import from Google Sheets, CSV, and XLSX. It does not maintain ongoing synchronization with Google Sheets after cutover.

Evidence: accepted user clarification on 2026-07-23.

### D-008: Required V1 Value-Only Import Fidelity

Google Sheets, XLSX, and CSV imports preserve exact typed source values and
provenance. Formula cells become their latest source-calculated/cached value;
formula logic, formatting, comments, and notes move to later specs.
Evidence: updated user direction on 2026-07-24, superseding the 2026-07-23
rich-fidelity requirement.

### D-009: Qdrant Is Future-Only

Qdrant is a later phase and is not part of current implementation or Proof scope. The current phase may preserve future-useful stable IDs, revisions, provenance, permissions, and an event/outbox boundary, but it must not depend on Qdrant or vector-specific schema.

Evidence: accepted user clarification on 2026-07-23.

### D-010: Mathesar-Like PostgreSQL-Native Product Direction

Creating a Tabular spreadsheet creates or exposes a real PostgreSQL table.
Headers are real columns, completed rows are real records, and relations are
real foreign keys. Tabular metadata may describe presentation, field/editor
semantics, formats, views, drafts, and history without replacing the
PostgreSQL table as canonical truth.

Evidence: user accepted the Mathesar-like direction on 2026-07-24.

### D-011: Semantic Fields And Independent Formats

Users choose semantic field/input types rather than selecting from the full
PostgreSQL type catalog. A field choice supplies safe default storage and
format behavior, while storage type, field/editor, output format, and
constraints remain independent axes that advanced users may configure.

Evidence: accepted user direction on 2026-07-24.

### D-012: FRUI Is Inspiration Only

FRUI's separate form/input and view/format families inform the registry
structure. Tabular does not accept a runtime FRUI dependency, copy its component
API, or make FRUI names part of the database contract.

Evidence: the user explicitly said FRUI is inspiration only on 2026-07-24.

### D-013: Incomplete Rows Remain Drafts

Starting a row creates or updates a Tabular-owned persistent draft. The target
PostgreSQL table receives the row only after required inputs are present and
the database accepts the transaction. The database remains the final authority
for constraints, triggers, permissions, and row-level security.

Evidence: accepted user direction on 2026-07-24.

### D-014: Tabular Owns Metadata, Drafts, Journal, And Queue In A System Schema

Tabular-owned UI metadata, saved views, drafts, a journal of Tabular-originated UI/import/MCP/harness changes, and PostgreSQL-backed job/outbox records live in a dedicated system schema.
Bind them to explicitly scoped PostgreSQL objects; reconcile against live introspection; treat OIDs as advisory.
Promote drafts and record related journal/outbox entries atomically where possible, with idempotency, safe claiming, retries, visible dead letters, and administrator-selected retention.
PostgreSQL/operator logging, CDC, triggers, backup, and PITR remain authoritative for external writes and recovery.

Evidence: G-028 accepted on 2026-07-24; Q-008-F1 accepted on 2026-07-31.

### D-015: Approved File-First PostgreSQL Hierarchy UX Contract

The approved file-first workflow now maps server/connection → database → schema folder → table/view file. A schema folder offers adjacent New file and Import actions; New file opens a blank table grid; Import creates a table; and PostgreSQL determines visibility and editability. This supersedes r005's visual-only folder rule.

This is accepted product direction, not production authority for DDL/migrations, relation integrity, durable persistence, imports, or recovery. The r005 artifacts remain visual evidence and their hierarchy assumptions are reconciled through the promoted product contract. Evidence: r005 approval through 2026-07-30 and Q-003-F2 acceptance on 2026-07-31.

### D-016: Permanent Unstructured Cells Use A Per-Row PostgreSQL JSONB Column

An explicit owner-authorized migration may add one collision-safe, Tabular-UI-hidden, versioned `jsonb` column to a target table. It stores permanent unstructured cells per row under native PostgreSQL transactions, grants, RLS, triggers, backup, replication, and audit behavior; stable Tabular column IDs, not grid coordinates, key the values. New rows remain system-schema drafts until PostgreSQL accepts them; naming an unstructured column transactionally promotes its values into a real column. Until promotion, unstructured cells are display/edit/copy/export values without structured sort, filter, relation, or constraint semantics. Do not add a permanent sidecar data plane. Evidence: Q-016-F2 accepted on 2026-07-31.

## Working Assumptions To Verify

### A-001: Airtable-Like Is A Category Boundary

Assumption: “like Airtable” identifies useful collaborative grid and application patterns, not the canonical data model or a commitment to Airtable feature/visual parity. The product is a spreadsheet replacement.

### A-002: Evidence Must Be Revision-Pinned

Assumption: GitHub findings should be reproducible against an inspected commit SHA, with exact paths and access dates recorded.

### A-003: Stackpress KB Is The Read-First Boundary

Assumption: Stackpress research begins in its `.agents` context and references. Source files outside that folder are inspected only when routed or necessary to verify an exact claim.

### A-004: Adaptation Is Preferred Over Blind Reuse

Assumption: models and patterns may be adapted across languages and architectures, but direct code reuse is recommended only after license, coupling, and maintainability review.

## Open Gaps

### G-001: What product slice should define the first implementation target?

- Status: Complete first implementation slice accepted by Q-016
- Owner: User, informed by research
- Accepted answer: the first target is a spreadsheet-friendly PostgreSQL table
  editor. Creating a spreadsheet creates a real table; headers create columns;
  completed drafts create records; relations create foreign keys.
- Accepted composition: prioritize grid-first schema/data editing, semantic fields
  and formats, progressive PostgreSQL controls, paste/CSV import, relations,
  saved views, persistent drafts, constraint translation, and
  action history; include D-016 unstructured cells plus the governed web and MCP/harness surfaces. Defer app-builder, automation, multi-database, general AI/vector infrastructure, and full PostgreSQL-administration scope.
- Evidence: `postgresql-native-product-direction-findings.md`.
- Wireframe direction: folder → file → focused grid; a folder offers direct blank-file creation and a separate new-file-only import path; PostgreSQL hierarchy is progressive configuration, not primary navigation. See `approved-wireframe-reconciliation.md`.
- Remaining question: none; Q-016 accepted the complete composition and exclusions.

### G-002: What canonical domain model should the target application use?

- Status: Direction accepted and verified by P-007
- Owner: User, informed by research and possible Proof
- Accepted direction: use PostgreSQL database, schema, table, column, row,
  constraint, relation, role, and permission concepts as canonical. Tabular owns
  friendly labels, field/editor types, formats, views, drafts, action history,
  import provenance, and other UI metadata; D-016 keeps permanent unstructured values in an owner-enabled per-row PostgreSQL `jsonb` column.
- Superseded answer: the generic workbook/sheet/cell model remains historical
  research and is not the current canonical shape.
- Proof result: P-007 verified schema drift and single, composite, and absent
  primary keys within its recorded runtime limit.

### G-003: At what granularity should generic spreadsheet data be stored in PostgreSQL?

- Status: Superseded by D-010; replacement design verified by P-007
- Owner: Research and possible Proof
- Current evidence: NocoDB performs physical DDL and then records model/column/view metadata; Baserow uses one physical PostgreSQL table per user table plus dynamically generated Django models; Grist stores document data and `_grist_*` metadata together in a SQLite document.
- Accepted answer: each Tabular spreadsheet maps to a real PostgreSQL table.
  Do not generate a Stackpress Idea model or generated client per user table.
  Keep UI-only metadata and incomplete drafts in Tabular-owned system tables; keep D-016 unstructured values in the target row, not a permanent sidecar.
- Superseded answer: canonical cell-row storage, row documents, and bounded
  blocks are retained only as historical alternatives and possible import/cache
  shapes.
- Proof result: P-007 verified DDL rollback, catalog identity, schema drift,
  draft promotion, constraint translation, keys, grants, and forced RLS.

### G-004: Which type, formula, relation, lookup, rollup, and dependency semantics are necessary?

- Status: First-slice registry, computed, and native relation boundaries accepted
- Owner: User, informed by research and possible Proof
- Accepted answer: storage type, field/editor type, output format, and
  constraints are independent. Relations use real foreign keys and searchable
  record pickers. FRUI informs the registry families without becoming a
  dependency.
- Accepted answer: use the low-friction field and format families recorded
  under G-027. Policy-gated rich content, nested structures, and attachments
  belong to a separate later spec.
- Computed-field evidence: PostgreSQL 18 generated columns support immutable
  same-row expressions as virtual or stored read-only columns. Cross-row,
  cross-table, aggregate, volatile, and spreadsheet-compatible formulas remain
  separate concerns.
- Formula answer: PostgreSQL-native computed fields remain in scope. Imported
  spreadsheet formulas are flattened to their latest exact value; compatibility
  and evaluation are deferred to a separate later spec.
- Relation answer: use native foreign keys between eligible tables in one database, including across schemas. Honor primary/unique and composite keys, grants/RLS, dependencies, and existing referential actions; new relations default to `NO ACTION`. Views/cross-database targets and silent drift rebinding are excluded.
- Wireframe direction: Relation uses Column name → Field: Relation → searchable File → relation-picker Display format → Format: Related record → saved-cell Display format. Schema folders are accepted; native relations may cross schemas inside one database but not database boundaries. See `approved-wireframe-reconciliation.md`.

### G-005: How should saved views be represented and executed?

- Status: First-slice representation, ownership, sharing, and publication accepted
- Owner: User, informed by research and possible Proof
- Accepted answer: keep saved views as Tabular metadata. Any target `SELECT` holder may own a private view; only the table owner/owning-role member may publish a shared view, which executes under each viewer's current authority. PostgreSQL publication is explicit and requires an SQL-compatible definition, effective schema `CREATE`, source privileges, and security-invoker behavior; visual metadata does not convert.
- Evidence: `grid-interaction-findings.md`.
- Wireframe boundary: presentation controls are visual-only and do not rewrite PostgreSQL storage.

### G-006: Which query, indexing, migration, and revision patterns remain viable as data grows?

- Status: Direct-table query/edit boundary verified by P-002 and P-007
- Owner: User, informed by research and possible Proof
- Research answer: use existing PostgreSQL primary keys, indexes, constraints,
  roles, and query semantics as the canonical boundary. Tabular must not invent
  indexes or rewrite schema without explicit review. Draft, metadata, and
  action-history indexes belong to the system schema.
- Proof result: bounded reads, key variations, schema drift, DDL rollback, and
  draft/action behavior passed. Large-schema performance remains later
  implementation evidence.

### G-007: What tenancy, permission, sharing, and audit model should the first product support?

- Status: First-slice PostgreSQL-native access and audit boundary accepted
- Owner: User, informed by research
- Accepted answer: use actual PostgreSQL roles, grants, ownership, and RLS wherever supported. Tabular never widens access; PostgreSQL/pgAudit retention is operator-controlled, and Tabular stores only feature-required records under administrator-selected retention.
- Evidence: `security-collaboration-findings.md`.
- Remaining question: none for first-slice authorization/audit; undo and recovery remain G-008.
- Grill record: Q-001 through Q-005-F2 accepted; Q-006 asked.

### G-008: What collaboration, concurrency, undo, history, and recovery semantics are required?

- Status: First-slice collaboration, history, and recovery boundary accepted
- Owner: Research and user
- Accepted concurrency: use expected-version writes, visible stale-write conflicts, atomic multi-cell actions, permission/version rechecks, and post-commit invalidation.
- Evidence: `security-collaboration-findings.md`.
- Accepted visibility: target `SELECT` implies redacted activity; undo is the actor's 100-step current session with authority/version rechecks; durable replay and cross-user undo are deferred.
- Accepted journal: durably record Tabular-originated actions and PostgreSQL-backed job/outbox work under D-014; keep undo, activity/audit, replayable history, external-write logging, and PostgreSQL backup/PITR distinct.
- Accepted recovery: PostgreSQL/database operators own backup, restore, PITR, RPO, and RTO outside Tabular; no first-slice restore UI or product recovery policy. Targeted row/table restore requires a separate later spec.

### G-009: Which grid, editor, clipboard, keyboard, and virtualization patterns are reusable?

- Status: P-002 verified the bounded grid contract
- Owner: User, informed by research and possible Proof
- Research answer: use a custom two-axis virtualized grid with bounded row/column windows, overscan and adjacent prefetch, logical selection independent of mounted DOM, a distinct edit state, stable row/column identities, atomic batch edits, and a focus-managed keyboard contract. Clipboard should carry TSV and HTML plus a versioned internal payload. The virtualized grid must expose ARIA grid roles, logical row/column counts and indices, selection state, and deterministic active-cell focus. Formula-aware paste belongs to the later formula spec.
- Evidence: `grid-interaction-findings.md`.
- Wireframe direction: coordinate and named-header bands, typed double-click editors, explicit commit/cancel, non-reflow overlays, and spreadsheet-like cell/row/header error feedback. D-016 gives unnamed cells stable metadata identities and per-row PostgreSQL JSON storage until explicit column promotion; structured sort/filter/relation/constraint behavior begins only after promotion. See `approved-wireframe-reconciliation.md`.
- Remaining validation: a native VoiceOver pass belongs to implementation
  acceptance; browser keyboard and accessibility-tree evidence passed.

### G-010: Which import, export, API, webhook, automation, and integration capabilities belong in the first boundary?

- Status: Value-only import and PostgreSQL-authorized CSV export accepted
- Owner: User, informed by research and possible Proof
- Accepted import: one-time Google Sheets, CSV, and XLSX value import; formula cells become their source-calculated/cached value. The effective role needs `USAGE, CREATE` on the destination schema and owns the new table unless another owner is explicitly selected.
- Accepted export: CSV with headers for the current grid result, restricted by the effective PostgreSQL role, grants, column access, and RLS; only committed rows and selected columns/filters are included.
- Research answer: import uses a durable identity/state machine, typed value
  staging, preview/report, idempotent chunks, source-version recheck, one
  transactional commit, deterministic recovery, and pre-commit abandon.
  The web UI and governed MCP/harness are accepted first-slice surfaces; the latter permits bounded discovery/reads and explicitly allowlisted structured writes through shared server controls, never arbitrary SQL/DDL by default. General API, webhooks, automation, and marketplace remain deferred.
- Evidence: `import-fidelity-contract.md` and `interfaces-and-operations-findings.md`.
- Wireframe direction: Import is an adjacent folder action that creates a new file/table only, has no import-to-existing-file route, and finishes with File name, Table name, and Folder in that order. See `approved-wireframe-reconciliation.md`.
- Follow-up spec: after Spec 00001 freezes, create **Tabular Export and Interchange** for XLSX, Google Sheets, JSON, schema/DDL, history, and multi-table export. Live Google service integration remains later evidence.

### G-011: What extensibility model should the target application expose?

- Status: First-slice surfaces and MCP frontend contract accepted
- Owner: User, informed by research and possible Proof
- Accepted answer: first-slice surfaces are the Tabular web UI and governed MCP/harness over shared capabilities and the caller's effective PostgreSQL role. MCP supports bounded discovery/reads and explicitly harness-allowlisted structured writes through the same validation, concurrency, and journal path; arbitrary SQL/DDL is not exposed by default. Trusted deploy-time Stackpress plugins remain reviewed application code. Public/general API, webhooks, automation, user code/plugins, marketplace, CLI, desktop, and anonymous integrations are deferred.
- Accepted frontend contract: expose a versioned, framework-neutral, caller-authorized `get_frontend_contract` MCP meta tool derived from PostgreSQL structure and Tabular field/format/view/query metadata. Include supported filter/sort operators and limits plus allowlisted operation and expected-version facts; filter it through current grants, column privileges, metadata sensitivity, and RLS. Metadata never grants authority, and frontend code generation/build/hosting/deployment remains a later spec.
- Evidence: `interfaces-and-operations-findings.md` and `domain-capability-model.md`.

### G-012: Which findings map to native Stackpress capability, adaptation, application logic, or a framework gap?

- Status: Updated direction and retained Proof evidence complete
- Owner: User, informed by research and possible Proof
- Research answer: Stackpress supplies fixed control models, SQL/PostgreSQL
  adapters and transactions, sessions, named events, pages, and lifecycle
  hooks. Application-owned logic must supply database introspection, safe DDL,
  Tabular metadata, semantic field/format registries, drafts, accessible grid,
  permission intersection, constraint translation, action history, and
  post-commit delivery. Generated Idea clients remain unsuitable for
  user-created runtime tables.
- Evidence: `postgresql-native-product-direction-findings.md` and the
  historical `domain-capability-model.md`.

### G-013: What is the relationship between Grist Core and Grist Static for this research?

- Status: Answered by source evidence
- Owner: Research
- Answer: Grist Core is the server-capable Community edition. Grist Static reuses Grist for fully in-browser display and interaction without backend support; its own README states that changes are not stored or shared and that it provides no specific access control. Treat it as a portability and adapter case, not a second independent domain model.

### G-014: Which source patterns should be rejected despite appearing useful?

- Status: Rejection list accepted through Q-016
- Owner: User, informed by research
- Accepted update: direct per-spreadsheet PostgreSQL DDL is now the core product
  behavior, but per-table Stackpress generation remains rejected.
- Research answer: continue to reject lossy importers as fidelity engines;
  whole-workbook JSON as canonical storage; generated CRUD UI as the primary
  grid; browser-only authorization; empty-policy allow; pre-commit publication;
  request-bound imports/webhooks; silent last-write-wins; audit logs as undo;
  backup/PITR as product history; unlicensed formula-engine adoption; and broad
  app-builder, automation, multi-database, general AI/vector, or
  PostgreSQL-administration scope in the first product.
- Evidence: `postgresql-native-product-direction-findings.md` and
  `final-synthesis.md`.

### G-015: Which uncertainties still require executable Proofs after source research?

- Status: Proof selection and execution complete
- Owner: Research, then user approval
- Result: P-001 was invalidated; P-003 was deferred; P-002, P-004, P-005,
  P-006, and P-007 were proved within the explicit limits in `proofs.md`.

### G-016: What operational architecture is needed for background work, search, cache, attachments, and observability?

- Status: First-slice queue, recovery, retention, and operations policy accepted
- Owner: User, informed by research
- Accepted answer: Qdrant/vector indexing are later. Expose stable IDs, revisions, provenance, permissions, and change events; PostgreSQL/pgAudit retention stays operator-controlled. Use the D-014 PostgreSQL-backed journal/job/outbox boundary. PostgreSQL/database operators own backup, restore, PITR, RPO, and RTO outside Tabular.
- Research answer: keep bounded edit validation, dependency discovery, and small recalculation inside the transaction; move large recalculation, imports, exports, snapshots, and delivery to durable jobs. Keep product restore snapshots separate from PostgreSQL backup/PITR. Attachments are deferred.
- Accepted operations: no contractual first-slice SLA. Operators configure job timeouts, concurrency, capped retry/backoff, retention, and stuck/backlog thresholds; users see progress and terminal results; failures/dead letters/expired heartbeats/backlogs surface through structured logs, metrics, and admin state. External alert integrations are deferred.
- Evidence: `interfaces-and-operations-findings.md`.
- Remaining question: none for first-slice background-work operations.

### G-017: Who is the initial audience, and what project shape is intended?

- Status: Answered by user
- Owner: User
- Answer: internal company staff across departments are the initial audience. The product centralizes company data in PostgreSQL behind a friendlier Mathesar-like spreadsheet UI so governed AI can access it through MCP plus a harness.

### G-018: What are the primary user flows, admin responsibilities, custom behaviors, and custom pages?

- Status: PostgreSQL hierarchy and first-slice provisioning/selection accepted
- Owner: User, informed by research
- Accepted visible flows: browse Acme Inc. folders; open a file; create a blank Untitled File in its grid; import values into a new file/table; rename a file; configure Table settings or a column; edit values; and configure relations. Detail: `approved-wireframe-reconciliation.md`.
- Accepted answer: map server/connection → database → schema folder → table/view file in the primary explorer. PostgreSQL governs visibility and editability; optional visual collections remain non-authoritative.
- Accepted provisioning: register existing servers/databases; use a separate pool and Tabular system schema per database; map identities to existing roles; allow native schema/grant changes only with effective authority. Cluster/database/role/extension/default-privilege administration is operator-owned.
- Evidence: `postgresql-native-product-direction-findings.md` and `approved-wireframe-reconciliation.md`.
- Remaining question: none; Q-016 accepted the replacement discovery handoff boundary.

### G-019: What auth model and role boundaries should the first product use?

- Status: PostgreSQL-native internal access and identity/role mapping accepted
- Owner: User, informed by research
- Accepted answer: actual PostgreSQL roles and memberships are canonical; fixed Tabular database-role bundles are not accepted. CSV export executes under the effective role, grants, column access, and RLS.
- Evidence: `product-discovery-handoff.md` and `security-collaboration-findings.md`.
- Remaining question: none for the first-slice external/public boundary.
- Grill record: Q-002/F1 through Q-004 accepted; Q-005 asked in `questions.md`.

### G-020: What app name, package name, brand name, and development port should a later scaffold use?

- Status: Deferred; user-owned scaffold values
- Owner: User
- Assumption to verify: none; the current repository folder name must not be treated as approval of these values.

### G-021: What exact fidelity contract applies to each import source?

- Status: Answered by D-008 and verified by P-006
- Owner: User decision complete; Research and possible Proof for verification
- Accepted answer: preserve typed values plus raw parsing/source provenance.
  Google formula cells use `effectiveValue`; XLSX formula cells use the cached
  result when present; CSV retains the source token and parsed value. Missing,
  stale, erroneous, or unrepresentable values must be reported, not guessed.
- Deferred: formula definitions/evaluation, formatting, comments, and notes.
- Evidence: historical detail remains in `import-fidelity-contract.md`; P-006
  owns the narrowed runtime verification.

### G-022: How is Google Sheets formula compatibility represented and tested?

- Status: Deferred to a separate later formula spec
- Owner: Future spec
- Historical research: `formula-compatibility-matrix.md` preserves the source
  inventory and candidate dispositions for later reuse.
- Evidence: `formula-compatibility-matrix.md`.
- Current boundary: P-003 is deferred and must not execute under Spec 00001.

### G-023: Which PostgreSQL cell, row, or block layout fits the workload?

- Status: Superseded by D-010
- Owner: Research and possible Proof
- Historical answer: canonical cell rows best matched the previous generic
  spreadsheet workload.
- Current answer: real PostgreSQL tables are canonical. Cell rows, row
  documents, and blocks may still be used for import staging, drafts, action
  deltas, or derived caches, but not as the primary business-data store.
- Evidence: `postgresql-native-product-direction-findings.md` and the retained
  historical comparison in `postgresql-storage-comparison.md`.
- Proof result: P-007 verified the real-table replacement direction.

### G-024: What makes a one-time import safe to retry or abandon?

- Status: Research complete and verified by P-006
- Owner: Research and possible Proof
- Research answer: use a durable state machine and a unique identity over workspace, source identity/fingerprint, options, importer version, and IR version. Stage idempotent chunks; recheck Google source version around extraction; commit once under the unique import ID in one transaction; recover ambiguous commit by looking up that ID; allow abandon only before commit; and make committed reversal a separate authorized action.
- Evidence: `import-fidelity-contract.md`.
- Proof result: P-006 verified duplicate retry, source change, failed
  staging/commit rollback, recovery, cleanup, and abandon.

### G-025: Which source features are explicitly unsupported in v1?

- Status: Unsupported set and blocker/warning/hyperlink policy accepted
- Owner: User decision complete
- Accepted unsupported set: formula definitions/recalculation, formatting,
  comments, notes, merged cells, validations, named/protected ranges,
  conditional rules, rich text, hyperlinks, charts/images, pivots/slicers,
  macros/external data, advanced views, smart chips, and other workbook
  behavior beyond exact values.
- Accepted policy: block value-integrity/safety failures; warn when exact values remain despite unsupported behavior. Hyperlink display/literal values import as plain data; attached targets are reported and never activated silently.
- Evidence: `import-fidelity-contract.md`.
- Remaining question: none for first-slice unsupported-import dispositions.

### G-026: Which prior Google Sheets import and formula requirements remain in the first product?

- Status: Answered by user
- Owner: User decision complete
- Accepted answer: import exact typed values only. Formula cells import their
  source-calculated/cached value as ordinary data. Formula behavior and
  compatibility are deferred to a separate later spec.
- PostgreSQL-native computed fields remain in scope because generated columns
  are database schema, not imported spreadsheet formulas.
- Proof impact: P-003 is deferred; the value-only P-006 proof passed.
- Evidence: user direction on 2026-07-24 and `computed-columns-and-frui-support-findings.md`.

### G-027: What exact field and output-format registries should the first product expose?

- Status: Accepted for the first slice; policy-gated families deferred
- Owner: User decision complete
- Accepted fields: text, long text, email, URL, phone, number, price,
  switch/checkbox, select/radio/suggest, date, date-time, time, relation,
  computed, slug/masked text, color, country/currency code, rating, slider,
  tags/text list, code source, and Markdown source stored as plain text.
- Accepted formats: plain, clipped, wrapped, text-transform, number, currency,
  link/email/phone-link, yes/no, date/date-time/time/relative-time, color,
  country/currency label, rating, tags/list, code highlighting, label, badge,
  and related-record.
- Later-spec requirement: Markdown rendering, rich text, nested
  JSON/metadata/spread/tabular values, files, images, galleries, films, and
  carousels require a separate approved spec covering sanitization, content
  shape, upload/storage, authorization, delivery, cleanup, and retention.
- Rejected defaults: raw HTML, FRUI's `eval`-based Formula, and passwords as
  arbitrary user-table fields.
- Boundary: storage, field/editor, format, and constraints remain independent;
  FRUI remains inspiration only. The authorized registry is exposed through the accepted MCP frontend contract.
- Evidence: `computed-columns-and-frui-support-findings.md` and user acceptance
  on 2026-07-24.

### G-028: How do Tabular metadata and drafts bind safely to arbitrary PostgreSQL tables?

- Status: Direction accepted as D-014 and verified by P-007
- Owner: User decision complete; Research and possible Proof for verification
- Accepted answer: keep UI-only metadata, saved views, drafts, and action
  history in a Tabular-owned system schema. Bind them to an explicitly scoped
  connection/database/schema/table identity; treat PostgreSQL OIDs as
  introspection hints rather than durable identity because dump/restore or DDL
  can replace them. Preserve stable Tabular column metadata where possible and
  reconcile it against live introspection.
- Draft answer: store a typed JSON patch plus target identity, expected
  schema version, actor, timestamps, and validation state. Promote a completed
  draft in one transaction and let PostgreSQL constraints, triggers, grants,
  and RLS make the final decision.
- Accepted authorization: derive metadata access from the target object's
  grants; filter history/audit and the MCP frontend contract by current authority and sensitivity.
- Accepted operational extension: D-014 places the action journal and job/outbox records in the system schema; D-016 explicitly keeps permanent unstructured cell values out of that sidecar and in an owner-enabled target-table `jsonb` column.
- Proof result: P-007 verified rename/drop/type drift, key variations,
  transactional DDL, cell-level error mapping, metadata identity, draft
  promotion, and permission intersection without generated Stackpress models.

## Decision Rule

Infer unresolved defaults from PostgreSQL's native behavior and Mathesar's evidenced posture whenever they directly answer the requirement. Add Tabular behavior only for approved spreadsheet wireframes or application-owned needs that PostgreSQL cannot express. Evidence-backed inferences may answer a Gap; ambiguous exceptions remain unaccepted until the user approves them or the spec is Frozen.

The Mathesar-like direction, value-only import boundary, field/format registry,
FRUI inspiration boundary, system-schema direction, per-row unstructured-data
column, PostgreSQL-native policy, and complete first slice are accepted. The
Proof and grill loops are complete. The earlier generic-cell discovery handoff
is superseded. Scaffold, schema, and plugin implementation remain gated by a
separate implementation spec plus user-owned scaffold values.

## Research Records

- [Current PostgreSQL-native product direction](postgresql-native-product-direction-findings.md)
- [Computed columns and FRUI support-risk findings](computed-columns-and-frui-support-findings.md)
- [Source inventory and pinned provenance](source-inventory.md)
- [Cross-source findings and Stackpress fit](initial-findings.md)
- [Import, formula, and PostgreSQL findings](import-formula-findings.md)
- [Versioned Google Sheets formula compatibility matrix](formula-compatibility-matrix.md)
- [PostgreSQL cell-row, row-document, and block comparison](postgresql-storage-comparison.md)
- [Grid interaction and accessibility findings](grid-interaction-findings.md)
- [Domain and capability model](domain-capability-model.md)
- [Interfaces and operations findings](interfaces-and-operations-findings.md)
- [Product discovery handoff](product-discovery-handoff.md)
- [Pseudocode-first snippet catalog](snippet-catalog.md)
- [Final research synthesis](final-synthesis.md)
