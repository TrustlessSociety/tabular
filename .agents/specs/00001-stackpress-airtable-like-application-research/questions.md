# Product-Policy Grill Questions

## Session State

- Spec: `00001-stackpress-airtable-like-application-research`
- Grill state: Frozen
- Current question: None
- Counts: 0 asked; 0 partial; 0 queued; 0 answered; 23 accepted; 0 deferred; 1 superseded
- Rule: ask only `asked`; explain it, label recommendations unaccepted, and preserve exact answers.
- User instruction: "Can you try again? and moving forward along with the question, provide a description/explanation and recommended answer?"
- Decision default: infer native PostgreSQL/Mathesar behavior; add Tabular behavior only for accepted spreadsheet or application-owned needs.

## Accepted Answers

### Q-016: Complete First Implementation Slice

- Status: accepted-decision; Source: gap
- Question: Which accepted capabilities must be delivered together as the complete first implementation slice, and which capabilities must remain outside it?
- Description: This is the final scope gate. It converts the accepted PostgreSQL-native product, spreadsheet behavior, operational policy, and governed interface decisions into one bounded implementation handoff. It does not authorize implementation inside this research-only spec.
- Agent default: Suggested default, accepted by the user: **deliver the PostgreSQL-native Tabular core as one first slice.**
  - Platform: register existing PostgreSQL servers/databases; use a separate pool and versioned Tabular system schema per database; map internal identities to existing roles; browse `server → database → schema → table/view`; introspect existing objects; and expose only authorized schema, table, column, relation, grant, and revoke actions. Keep cluster/database/role/extension/default-privilege administration operator-owned.
  - Spreadsheet UX: implement the approved browse/create/import/rename/grid/settings/relation/draft flows over real PostgreSQL tables; the accepted field/format registry; accessible virtualized typed editing, clipboard, filters, sorts, saved views, persistent drafts, validation, conflicts, atomic paste, and session undo/redo. Include the accepted owner-enabled per-row PostgreSQL `jsonb` column for permanent unstructured cells, with explicit promotion to real columns.
  - Data movement and operations: provide exact-value new-table CSV/XLSX/Google Sheets import with preview, warnings, jobs, retries, and abandon; export only the authorized current grid as CSV; keep metadata, drafts, action journal, and PostgreSQL-backed jobs/outbox in the Tabular schema; use operator-selected retention, thresholds, logs, metrics, and admin state; leave backup/restore/PITR/RPO/RTO to PostgreSQL operators.
  - Interfaces: ship the web UI and governed MCP/harness over the same capabilities and effective PostgreSQL role. Include bounded discovery/reads and the versioned caller-authorized `get_frontend_contract` meta tool. Permit structured MCP writes only when explicitly allowlisted through the harness and the same validation, concurrency, and journal path; do not expose arbitrary SQL/DDL by default. Allow only reviewed deploy-time Stackpress plugins.
  - Exclude: public/general API, webhooks, automation, user code/plugins, marketplace, CLI, desktop, anonymous/public sharing, raw SQL/DDL MCP by default, spreadsheet formula compatibility, rich/policy-gated content and attachments, replayable/cross-user history or undo, non-CSV export, broad PostgreSQL administration or recovery, cross-database relations, and frontend code generation/build/hosting/deployment. Route deferred work to separate later specs.
- User answer: "okay then I accept the default for q-016"
- Normalized decision: The complete first implementation slice is the accepted PostgreSQL-native Tabular core and its stated exclusions. The grill pass is Frozen with no queued or partial questions.
- Evidence answer: Q-001 through Q-016-F2 and the verified Proof results define this boundary. Decision update: G-001, G-010, G-011, and G-018.

### Q-016-F2: Per-Row PostgreSQL Unstructured Data

- Status: accepted-decision; Source: user; Question: Should permanent unstructured cells be stored in an opt-in, Tabular-UI-hidden `jsonb` column on each target PostgreSQL row rather than in a permanent sidecar table, while the Tabular system schema holds only pre-insert drafts and metadata?
- Agent default: Suggested default, accepted by the user: **Yes—prefer one owner-enabled physical `jsonb` column over a permanent sidecar data plane.** User answer: "yes"
- Normalized decision: Use a collision-safe, versioned per-row `jsonb` column keyed by stable Tabular column IDs and hidden only in Tabular's grid. New rows remain drafts until PostgreSQL accepts them; existing rows use native `UPDATE`, RLS, version, and journal checks. Installation is explicit and owner-authorized; no-key tables remain read-only without an owner-approved identity migration. Unstructured cells remain display/edit/copy/export values without structured sort/filter/relation/constraint semantics until transactional promotion to a real column. Do not support a permanent sidecar alternative in the first slice. Decision update: D-016 and G-002/G-003/G-009/G-028.

### Q-015-F1: MCP Frontend Contract

- Status: accepted-decision; Source: gap; Question: Should first-slice MCP expose a versioned, caller-authorized frontend contract derived from PostgreSQL schema plus Tabular field, format, view, filter, and sort metadata?
- Agent default: Suggested default, accepted by the user: **Yes.** Add a framework-neutral `get_frontend_contract` MCP meta tool with authorized PostgreSQL structure, Tabular presentation metadata, supported filter/sort operators and limits, allowlisted operations, and version/concurrency facts; never treat metadata as authorization or include frontend generation/deployment.
- User answer: "I accept your recommendations then for Q-015"
- Normalized decision: Expose the versioned frontend contract through governed MCP, filtered through the caller's mapped role, column privileges, metadata sensitivity, and RLS. Generated apps must use governed query/mutation tools. Decision update: G-011, G-027, and G-028.

### Q-015: First-Slice Extension Surfaces

- Status: accepted-decision; Source: gap; Question: Which application and extension surfaces should Tabular expose in the first product slice?
- Agent default: Suggested default, accepted by the user: expose the Tabular web UI and governed MCP/harness over shared server capabilities and the effective PostgreSQL role; allow bounded MCP discovery/reads and explicitly allowlisted structured writes, with no arbitrary SQL/DDL by default; keep reviewed deploy-time plugins trusted; defer other surfaces.
- User answer: "I accept your recommendations then for Q-015"
- Prior clarification: "oh sorry, before i answer, can we discuss another use case? since we collect the input field, output format, sortables, filterables, etc. I also wanted to expose this in the MCP like a meta tool in the case someone wants to design an actual frontend app based on the data and columns from Tabular. What do you think about this?"
- Normalized decision: The answer applies to Q-015 and its Q-015-F1 frontend-contract follow-up. Defer public/general API, webhooks, automation, user code/plugins, marketplace, CLI, desktop, anonymous integrations, and frontend generation/deployment. Decision update: G-010 and G-011.

### Q-014: PostgreSQL Provisioning And Selection

- Status: accepted-decision; Source: gap; Question: How should PostgreSQL servers, databases, schemas, roles, and initial grants be registered, provisioned, and selected in Tabular?
- Agent default: Suggested default, accepted by the user: **register existing infrastructure; expose only scoped native actions.** User answer: "Accepted"
- Normalized decision: Administrators register existing servers/databases; each database has a separate pool and versioned Tabular system schema. Identities map to existing PostgreSQL roles and use schema-qualified SQL. Native `CREATE SCHEMA` and explicit `GRANT`/`REVOKE` require the effective PostgreSQL authority. Server/database/role/extension/default-privilege administration remains operator-owned and outside the first slice. Decision update: G-018 and G-019.

### Q-013: PostgreSQL Relation Targets And Referential Actions

- Status: accepted-decision; Source: gap; Question: Which PostgreSQL objects may be relation targets, and what happens when referenced rows, columns, or tables change or are deleted?
- Agent default: Suggested default, accepted by the user: **expose native foreign-key behavior.** User answer: "recommended"
- Prior clarification: "does pg support relations cross schema in the same database?"
- Normalized decision: Relations use native foreign keys between eligible ordinary/partitioned tables in one database, including across schemas; views and cross-database targets are excluded. Primary/unique keys, composite constraints, existing actions, grants/RLS, and PostgreSQL dependencies remain authoritative. New actions default to `NO ACTION`; destructive alternatives are explicit. Drift is visible and never silently rebound. Decision update: G-004.

### Q-012: Background-Work Operations Policy

- Status: accepted-decision; Source: gap; Question: What service levels, retention periods, and operator alerts should apply to Tabular background work?
- Agent default: Suggested default, accepted by the user: **operator-configured objectives, no contractual first-slice SLA.** User answer: "Recommended answer"
- Normalized decision: Configure timeout, concurrency, capped retries/backoff, administrator-selected retention, and stuck/backlog thresholds per job type. Users see progress/cancellation/results/failures; exhausted work dead-letters visibly. Operators receive structured logs, metrics, and admin-state alerts for failures, dead letters, expired heartbeats, and excessive queue age. External alert integrations remain deferred. Decision update: G-016.

### Q-011: Saved-View Ownership And PostgreSQL Publication

- Status: accepted-decision; Source: gap; Question: Who owns saved views, who may share them, and when may one become a real PostgreSQL view?
- Agent default: Suggested default, accepted by the user: **private by default, owner-published explicitly.** User answer: "accepted"
- Normalized decision: Any current target `SELECT` holder may own a private Tabular saved view. Only the target table owner/owning-role member may publish a shared view, which always executes under each viewer's current authority. PostgreSQL publication is explicit and requires an SQL-compatible definition, effective `CREATE` on the destination schema, source privileges, and security-invoker behavior; visual configuration stays Tabular metadata. Decision update: G-005.

### Q-010: Unsupported Import Blockers And Hyperlinks

- Status: accepted-decision; Source: gap; Question: Which detected unsupported source features should block a value-only import, and how should hyperlinks be handled?
- Agent default: Suggested default, accepted by the user: **block only value-integrity or safety failures.** User answer: "Recommended answer"
- Normalized decision: Block malformed/unsafe or changed sources, missing/error formula results without exact values, unrepresentable values, ambiguous required mappings or commits, and database permission/constraint failures. Warn when unsupported behavior still leaves exact values. Import hyperlink display/literal values as plain data, report attached targets, and never activate them silently. Decision update: G-025.

### Q-009: First-Slice Export Boundary

- Status: accepted-decision; Source: gap
- Question: Should the first slice provide only a PostgreSQL-authorized CSV download of the current grid result while broader export forms remain deferred?
- Agent default: Suggested default, accepted by the user: **Yes.** User answer: "accepted. "Defer XLSX, Google Sheets, JSON, schema/DDL, history, and multi-table export; operators can use PostgreSQL tools for those needs." - can we actually remember to do these in another spec?"
- Normalized decision: First-slice Tabular exports the current authorized grid result as CSV with headers, respecting the effective PostgreSQL role, grants, column access, and RLS. A separate follow-up **Tabular Export and Interchange** spec must cover XLSX, Google Sheets, JSON, schema/DDL, history, and multi-table export after Spec 00001 freezes. Decision update: G-010/G-019; deferred-spec trigger in `status.md`.

### Q-008: Restore Authority And Recovery Objectives

- Status: accepted-decision; Source: gap
- Question: Should database operators exclusively own first-slice backup, restore, PITR, RPO, and RTO through PostgreSQL or provider tools, with no Tabular restore UI?
- Agent default: Suggested default, accepted by the user: **Yes.** User answer: "Recommended answer. since this is pg, operators can make up their own backup strategy, in which out of scope for this project."
- Normalized decision: PostgreSQL/database operators own their backup, restore, PITR, RPO, and RTO strategy outside Tabular. Tabular has no restore UI or recovery-objective policy; future targeted row/table restore would require a separate spec. Decision update: G-008/G-016.

### Q-008-F1: Tabular Change Journal And PostgreSQL-Backed Queue

- Status: accepted-decision; Source: user follow-up
- Question: Should Tabular durably record its change actions and PostgreSQL-backed queue/outbox work while PostgreSQL/operator facilities remain authoritative for external changes and recovery?
- Agent default: Suggested default, accepted by the user: **Yes.** User answer: "accepted"
- Normalized decision: Keep a durable action journal for Tabular-originated UI/import/MCP/harness writes and PostgreSQL-backed job/outbox tables with atomic recording where possible, idempotency, safe claiming, retries, visible dead letters, and administrator-selected retention. PostgreSQL logging/pgAudit, CDC, or triggers cover operator-selected external-write auditing; PostgreSQL/operators own disaster recovery. Full replayable history and targeted restore remain deferred. Decision update: D-014/G-008/G-016/G-028.

### Q-007: Undo And History Scope

- Status: accepted-decision; Source: gap
- Question: Who may use undo/history, at what scope, and for how long?
- Agent default: Suggested default, accepted by the user: own current-session cell/data/format actions, 100 steps, with current authority/version rechecks. User answer: "Recommended answer"
- Normalized decision: Provide 100-step current-session undo/redo for the actor's own actions; block conflicts, clear redo on new action, and defer durable replayable Version history and cross-user undo. Decision update: G-008 and G-019.

### Q-006: Concurrent Record Changes

- Status: accepted-decision; Source: gap
- Question: What happens when another user changes the same record first?
- Agent default: Accepted: expected-version transaction and explicit conflict resolution. User answer: "Recommended answer"
- Normalized decision: Never overwrite stale edits; preserve/show conflicts, require explicit resolution, and make multi-cell paste atomic. Decision update: G-008.

### Q-005-F2: PostgreSQL-And-Mathesar-Aligned Audit Policy

- Status: accepted-decision; Source: user follow-up
- Question: Should Tabular leave PostgreSQL/pgAudit retention to operators?
- Agent default: Suggested default, accepted by the user: **Yes.** User answer: "yes accepted. with the exception of related spreadsheet functionality as represented in the wireframes needed and not natively supported by pg, try to infer decisions based on what pg natively supports."
- Prior answer: "Recommended answer. "retain security audit for 365 days by default" if that's what pg does by default then fine." Prior clarification: "To be clear, as close to pg as possible. The scope of users will be internal to the company in order to centralize a company's data all together, making it easier for AI via MCP+harness to access. In other words this is just a more user friendlier version of Mathesar. Question: what is the stance of Mathesar regarding the question you are asking?"
- Normalized decision: Operators control PostgreSQL/pgAudit retention; Tabular stores only feature-required records under administrator-selected retention.
- Accepted rule: infer PostgreSQL unless approved spreadsheet/app needs require Tabular. Decision update: G-007 and G-016.

### Q-004: External And Public Access

- Status: accepted-decision; Source: gap
- Question: Should the first slice support outside guests or public/anonymous links?
- Agent default: Suggested default, accepted by the user: **No.** User answer: "recommended answer. but question: it's technically possible with grant all? or does even that imply they still need to be a pg user?"
- User clarification: "oh sorry i meant grant [topic] to *"
- Normalized decision: Limit the first slice to authenticated internal staff; defer outside guests and public/anonymous links. Technical answer: `TO PUBLIC` grants every role; direct connections need `LOGIN`; `ALL` is object-scoped and does not bypass ordinary-role RLS.
- Decision update: G-007 and G-019.

### Q-003: PostgreSQL-Native Grant Scopes

- Status: accepted-decision; Source: gap
- Question: Should Tabular directly expose PostgreSQL-native grant scopes through its accepted hierarchy?
- Agent default: Suggested default, accepted by the user: **Yes.** User answer: "yes"
- Normalized decision: Expose actual PostgreSQL authority; never replace or widen it.
- Decision update: G-007 and G-019 in `decisions.md`.

### Q-003-F2: Literal PostgreSQL Explorer Hierarchy

- Status: accepted-decision; Source: user follow-up
- Question: Should the explorer map `server → database → schema folder → table/view file`?
- Agent default: Suggested default, accepted by the user: **Yes.** User answer: "yes. recommended answer"
- Prior user clarification: "oh sorry i meant databases, schemas, tables. Can we hash this out?"
- Normalized decision: Use that hierarchy literally; visual collections are non-authoritative.
- Supersedes: the r005 rule that folders are visual-only and not schemas.
- Decision update: G-004, G-007, G-018, and G-019 in `decisions.md`.

### Q-002: Remaining Tabular Authorization

- Status: accepted-decision; Source: gap
- Question: Which actions still require Tabular-specific authorization after PostgreSQL privileges?
- User answer: "oh yea so for the tabular system schema (metadata) specifically, it would be weird that you have "grant" on a table, but dont have "grant" on it's relative metadata if that makes sense. for example a "read grant" should imply access to its relative drafts, history, and audit records. Does that make sense?"
- Normalized decision: Derive metadata access from PostgreSQL; use Tabular only where necessary.
- Follow-up: Q-002-F1 accepted; Q-003 defines native grant scopes. Decision update: G-007, G-008, G-019, and G-028.

### Q-002-F1: Inherited Metadata Visibility

- Status: accepted-decision; Source: user; Question: Should target `SELECT` include ordinary metadata, the viewer's own drafts, and redacted current-authorized history/activity, while sensitive metadata requires additional PostgreSQL authority?
- Agent default: Suggested default, accepted by the user: **Yes.** User answer: "yes"
- Normalized decision: `SELECT` implies ordinary metadata, own drafts, and current-authorized redacted activity; sensitive records require more authority.
- Decision update: G-007, G-008, G-019, and G-028 in `decisions.md`.

### Q-001-F2: PostgreSQL Import Authority

- Status: accepted-decision; Source: user; Question: Should Tabular authorize a new-file import through the user's effective PostgreSQL permission to create and own the destination table, while Tabular separately governs source parsing, staging, and job execution?
- Agent default: Suggested default, accepted by the user: **Yes.** Require effective `USAGE, CREATE` on the target schema, create under the effective role or an explicitly selected owner, and keep parsing/staging job controls application-owned without server-file roles. User answer: "yes"
- Normalized decision: New-file import requires effective PostgreSQL authority to create and own the destination table. Tabular owns parsing, staging, provenance, and job orchestration.
- Decision update: G-007, G-010, G-019, and G-024 in `decisions.md`.

### Q-001-F1: PostgreSQL And Tabular Authority

- Status: accepted-decision; Source: user; Question: Should PostgreSQL authority govern database access, with Tabular only for app-owned behavior?
- Description: PostgreSQL governs objects, DDL/DML, and rows through RLS; Tabular governs only its own metadata/workflows and safe effective-role use.
- Agent default: Accepted PostgreSQL-first hybrid: preserve real roles/grants, execute as the restricted role, and never use owner/superuser/`BYPASSRLS` to widen access. User answer: "For roles/permissions that pg does support I want to use that. I want Tabular like Mathesar and a spreadsheet hybrid, staying close to the functionality of pg as best as possible. for things like import wouldn't `GRANT USAGE ON SCHEMA schema_name TO username;` or something like that suffice?"
- Normalized decision: Use PostgreSQL wherever supported; add Tabular only where necessary.
- Evidence answer: G-007 and P-005; role switching/pool reset remain acceptance work. Follow-up: Q-001-F2 tests the import example before role naming resumes.
- Decision update: G-007 and G-019 in `decisions.md`.

### Q-001: First-Slice Role Bundles

- Status: accepted-decision; Source: gap; Question: Which role bundles should exist in Tabular's first product slice?
- Agent default: Superseded by Q-001-F1; not accepted. User answer: "i wanted to actually use pg's roles/grants. is that not recommended? what do you think?"
- Normalized decision: Do not impose fixed Tabular database-role bundles. Surface actual PostgreSQL roles, memberships, grants, ownership, and RLS. Any app-only authorization is resolved separately in Q-002.
- Evidence answer: G-017 limits the audience to internal company staff. P-005 verifies named capability enforcement intersected with PostgreSQL denial, but neither result chooses the product's role bundles.
- Follow-up: Q-001-F1 and Q-001-F2 accepted; Q-002 handles app-only authority. Decision update: G-007 and G-019.

## Superseded Questions

### Q-016-F1: Values In Unnamed Grid Columns

- Status: superseded; Source: gap; Question: When a user enters or pastes a value into an unnamed grid coordinate, should Tabular stage a pending Text column plus value drafts and require authorized column creation before writing either a new or existing row to PostgreSQL?
- User answer: "What im envisioning is that the values entered outside of a defined column (unstructured data) would be stored in the Tabular metadata as maybe a json value that collects all the unstructured data. when a file loads, it would left join with that table to bring that data back. Let me know what you think about that?"
- Additional clarification: "It can also be like a "_hidden_column" that would be stored per row."
- Superseded by: Q-016-F2's accepted per-row PostgreSQL `jsonb` column; no permanent sidecar data plane. Decision update: D-016 and G-002/G-003/G-009/G-028.
