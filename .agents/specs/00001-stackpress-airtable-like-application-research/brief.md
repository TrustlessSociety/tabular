# Brief

## Preserved User Goal

> Basically i want to create an app like airtables except written in stackpress.

The requested research sources are:

- [nocodb/nocodb](https://github.com/nocodb/nocodb)
- [gristlabs/grist-core](https://github.com/gristlabs/grist-core)
- [gristlabs/grist-static](https://github.com/gristlabs/grist-static)
- [baserow/baserow](https://github.com/baserow/baserow)
- `/Users/cblanquera/server/projects/stackpress/stackpress/.agents`

> I want the research to look for models, patterns, proofs, code snippets and other things that maybe useful for this project.

## Accepted Product Background

The company currently uses Google Sheets for most operational work. Maintaining a synchronized knowledge base across those spreadsheets would require substantial infrastructure, so the intended product is a native spreadsheet application that teams use instead of receiving separate department-specific platforms.

The current flow is:

```text
Google Sheets / XLSX / CSV
  -> one-time import
  -> PostgreSQL
  -> native spreadsheet application
```

Imported content must not be converted into department-specific Stackpress
models. The first boundary preserves exact typed values and source/parsing
provenance. Formula cells become their latest source-calculated or cached value
as ordinary data.

Qdrant and AI ingestion are a later phase. The current design should preserve stable identifiers, revisions, provenance, permissions, and a future change-event boundary, but it must not implement or depend on Qdrant, embeddings, or vector-specific schema.

## Accepted Direction Update: 2026-07-24

The product is now based conceptually on Mathesar rather than a generic
spreadsheet engine:

> A spreadsheet interface for creating and working with real PostgreSQL
> databases.

Creating a spreadsheet creates a real PostgreSQL table. Headers represent real
columns, completed rows represent real records, and relations represent real
foreign keys. The main product differentiation is a much friendlier grid,
semantic field configuration, progressive PostgreSQL controls, persistent draft
rows, and human-readable database errors.

Field and output-format types should take inspiration from
<https://frui.js.org/> and the independent field/list/view families used by
Stackpress Idea metadata. FRUI is inspiration only: this direction does not
accept a runtime dependency, copy FRUI's APIs, or make component names part of
the database contract.

PostgreSQL-native computed fields may use generated columns for deterministic
same-row expressions. Spreadsheet formula definitions, evaluation, and
compatibility belong to a separate later spec.

The user accepted the system-schema direction for Tabular metadata, saved
views, drafts, and action history. These records reconcile against live
PostgreSQL introspection and do not replace the target tables as canonical
truth.

The first slice includes the low-friction field and format families classified
in R-021. Markdown rendering, rich text, nested structured values, files,
images, and gallery-style formats are explicitly planned for a separate later
spec that must define their sanitization, storage, authorization, delivery,
cleanup, and retention policies.

This direction supersedes the generic cell-row storage recommendation. Earlier
formula/format/comment research remains historical evidence for later specs;
the first import boundary is exact values only.

## Accepted Final Slice: 2026-07-31

The complete first implementation slice is the PostgreSQL-native Tabular core:

- register existing servers/databases; use one pool and versioned Tabular
  system schema per database;
- map internal identities to existing PostgreSQL roles and preserve native
  grants, ownership, column privileges, and RLS;
- browse `server/connection → database → schema folder → table/view file`;
- expose authorized schema/table/column/grant/revoke and native foreign-key
  actions without becoming a full PostgreSQL administration console;
- provide the approved accessible virtualized grid, typed fields/formats,
  clipboard, atomic paste, filters, sorts, saved views, persistent drafts,
  explicit conflicts, and 100-step current-session undo/redo;
- store permanent unstructured cells in an explicitly installed per-row
  PostgreSQL `jsonb` column until transactional promotion into a real column;
- import exact values from CSV/XLSX/Google Sheets into a new table and export
  only the authorized current grid as CSV;
- keep metadata, drafts, action journal, and PostgreSQL-backed jobs/outbox in
  the Tabular system schema; and
- expose the web UI and governed MCP/harness, including the versioned
  caller-authorized `get_frontend_contract` tool.

The first slice excludes public/general API, webhooks, automation, user
code/plugins, marketplace, CLI, desktop, anonymous/public sharing, arbitrary
SQL/DDL MCP, spreadsheet formula compatibility, rich content and attachments,
replayable/cross-user history or undo, non-CSV export, broad PostgreSQL
administration/recovery, cross-database relations, frontend
generation/build/hosting/deployment, Qdrant, and vector indexing.

The accepted reusable contract is promoted to
`../../context/tabular-product-contract.md`.

## Research Objective

Produce an evidence-backed design research packet for a spreadsheet-friendly
PostgreSQL table editor on Stackpress. Explain what can be learned from the
named projects, what is transferable, what should be rejected or adapted, and
which remaining uncertainties need isolated Proofs before an implementation
spec can be trusted.

The result should make it possible to choose a coherent spreadsheet, import, formula, and PostgreSQL model without treating the repository folder name, Airtable, or any one source repository as the product definition.

## Scope

- Repository and package architecture relevant to collaborative spreadsheet products.
- Direct mapping among databases, schemas, tables, columns, records,
  relationships, PostgreSQL constraints, Tabular metadata, and persistent
  drafts.
- Semantic field/input types, independent output formats, validation, and
  progressive access to exact PostgreSQL types.
- PostgreSQL persistence, query, DDL, migration, indexing, schema-drift, draft,
  and revision strategies that do not require per-table Stackpress generation.
- Grid and view interaction patterns, bulk editing, clipboard behavior, import/export, and other high-value workflows discovered in source.
- PostgreSQL-native computed columns and derived-view boundaries.
- One-time Google Sheets, XLSX, and CSV exact-value import, including preview,
  typed values, source parsing provenance, staging, retry, rollback, and
  attributable warnings.
- Authentication, authorization, sharing, multitenancy, audit, collaboration, concurrency, history, and recovery patterns where present.
- API, webhook, automation, plugin, extension, and integration boundaries where present.
- Tests, fixtures, migrations, architectural records, failure-handling code, and operational patterns that reveal contracts more clearly than README-level descriptions.
- Stackpress fit across Idea/schema modeling, generated clients, SQL/storage, named events, pages/admin, API/MCP, views, sessions, plugins, and lifecycle ownership.
- Future-only provisions for downstream AI indexing without adding Qdrant or vector dependencies to the current phase.
- Candidate Proofs for uncertainties that remain after source research.
- Short, high-signal code snippets with exact provenance and license-aware reuse notes.

## Non-Goals

- Implementing the target application or creating production application code.
- Committing to complete Airtable feature parity.
- Ongoing synchronization with Google Sheets after import.
- Importing or executing spreadsheet formulas, formatting, comments, or notes;
  these require separate later specs.
- Structuring each spreadsheet into department-specific domain models.
- Required preservation of merged cells, data validation, named ranges, protected ranges, conditional formatting, charts, or other advanced workbook features, except when research shows one is necessary to preserve required formula semantics.
- Implementing Qdrant ingestion, embeddings, vector search, or an AI knowledge-base pipeline.
- Reproducing another project's UI, branding, source code, or internal architecture wholesale.
- Treating Mathesar or FRUI as an implementation dependency or copying their UI
  and APIs wholesale.
- Turning Tabular into a full PostgreSQL server-administration replacement.
- Treating repository popularity, README claims, or surface-level feature lists as sufficient evidence.
- Selecting a final architecture before cross-source synthesis and Stackpress fit analysis.
- Creating prototypes before a candidate Proof is justified by research and approved for execution.

## Source Boundaries

1. Pin each GitHub repository to an inspected commit SHA and record the access date before citing findings.
2. Start Stackpress research at `/Users/cblanquera/server/projects/stackpress/stackpress/.agents/context/index.md` and follow its routing guidance.
3. Inspect Stackpress source outside `.agents` only when the KB routes to it or exact code is necessary to validate a research question; record why the expansion was needed.
4. Record secondary documentation or linked repositories only when needed to interpret a named source, and keep them distinguishable from the primary source set.
5. Record license and provenance constraints before recommending direct reuse of any code.
6. Use current official Google, Microsoft, IETF, and PostgreSQL documentation when file-format or platform contracts are material to import fidelity.

## Expected Deliverables

- A source inventory with revisions, relevant paths, and rejected leads.
- A cross-source model map showing semantic similarities and meaningful differences.
- An import-fidelity matrix for Google Sheets, XLSX, and CSV.
- A formula-compatibility matrix that distinguishes exact support, mapped equivalents, unsupported formulas, volatile/external formulas, and formulas preserved with source cached values.
- A PostgreSQL storage comparison covering cell, row, and bounded block granularity without per-department schema.
- A pattern matrix showing context, benefits, tradeoffs, and likely Stackpress placement.
- A Stackpress capability-fit analysis that distinguishes native support, adaptation, new application logic, and unresolved gaps.
- An app-discovery handoff covering audience, core entities, main flows, auth and roles, admin responsibilities, custom behavior, custom pages, project shape, and still-unresolved scaffold values.
- A provenance-rich snippet catalog containing only the shortest useful excerpts or pseudocode when direct reuse is inappropriate.
- A Proof queue tied to unresolved Gap IDs, with explicit signals and non-goals.
- A final synthesis recommending a research-backed starting architecture and product slice for a later implementation spec.

Create optional research files such as `source-*.md`, `model-map.md`, `pattern-matrix.md`, `stackpress-fit.md`, or `snippet-catalog.md` only when the recorded evidence would make `research.md` unclear or oversized.

## Completion Criteria

- Every named source has been inspected at a recorded revision.
- Material claims cite exact repository paths, docs, tests, migrations, or code evidence.
- Models and patterns are compared across sources rather than listed independently.
- Each recommended pattern explains whether Stackpress supplies it, can adapt it, or needs new application logic.
- Useful snippets include source, revision, path, purpose, reuse guidance, and license notes.
- Negative findings, rejected patterns, and unresolved risks are preserved.
- Every material Gap is answered, accepted, deferred, or explicitly approved as unresolved.
- Proofs are either not required or are fully specified and resolved under the local SDD workflow.
- Accepted reusable findings receive a context-promotion review before Freeze.
