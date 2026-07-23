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

## Research Objective

Produce an evidence-backed design research packet that explains what can be learned from the named projects, what is transferable to a Stackpress application, what should be rejected or adapted, and which remaining uncertainties need isolated Proofs before an implementation spec can be trusted.

The result should make it possible to choose a coherent product and technical model for the target application without treating the repository folder name or any one source repository as a product definition.

## Scope

- Repository and package architecture relevant to an Airtable-like product.
- Domain models for workspaces, bases, tables, fields, records, views, relations, formulas, permissions, revisions, and adjacent concepts actually evidenced by the sources.
- Metadata, persistence, query, migration, indexing, and dynamic-schema strategies.
- Grid and view interaction patterns, bulk editing, clipboard behavior, import/export, and other high-value workflows discovered in source.
- Formula, computed-field, dependency, relation, lookup, rollup, validation, and type-system patterns where present.
- Authentication, authorization, sharing, multitenancy, audit, collaboration, concurrency, history, and recovery patterns where present.
- API, webhook, automation, plugin, extension, and integration boundaries where present.
- Tests, fixtures, migrations, architectural records, failure-handling code, and operational patterns that reveal contracts more clearly than README-level descriptions.
- Stackpress fit across Idea/schema modeling, generated clients, SQL/storage, named events, pages/admin, API/MCP, views, sessions, plugins, and lifecycle ownership.
- Candidate Proofs for uncertainties that remain after source research.
- Short, high-signal code snippets with exact provenance and license-aware reuse notes.

## Non-Goals

- Implementing the target application or creating production application code.
- Committing to complete Airtable feature parity.
- Reproducing another project's UI, branding, source code, or internal architecture wholesale.
- Treating repository popularity, README claims, or surface-level feature lists as sufficient evidence.
- Selecting a final architecture before cross-source synthesis and Stackpress fit analysis.
- Creating prototypes before a candidate Proof is justified by research and approved for execution.

## Source Boundaries

1. Pin each GitHub repository to an inspected commit SHA and record the access date before citing findings.
2. Start Stackpress research at `/Users/cblanquera/server/projects/stackpress/stackpress/.agents/context/index.md` and follow its routing guidance.
3. Inspect Stackpress source outside `.agents` only when the KB routes to it or exact code is necessary to validate a research question; record why the expansion was needed.
4. Record secondary documentation or linked repositories only when needed to interpret a named source, and keep them distinguishable from the primary source set.
5. Record license and provenance constraints before recommending direct reuse of any code.

## Expected Deliverables

- A source inventory with revisions, relevant paths, and rejected leads.
- A cross-source model map showing semantic similarities and meaningful differences.
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
