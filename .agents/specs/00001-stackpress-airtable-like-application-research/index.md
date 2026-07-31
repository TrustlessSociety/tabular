# Spec 00001: Stackpress PostgreSQL-Native Tabular Research

Status: Frozen on 2026-07-31; research, applicable Proofs, product-policy grill,
context promotion, and replacement discovery handoff complete.

This is the entry point for a research-only spec about a spreadsheet-friendly
PostgreSQL table editor built with Stackpress. The current accepted direction
uses Mathesar as a conceptual baseline: spreadsheets map to real PostgreSQL
tables, headers to columns, completed rows to records, and relations to foreign
keys. Earlier generic-spreadsheet research remains useful evidence but no longer
defines the canonical data model. This package does not authorize product
implementation or production code changes.

## Files

- [Brief](brief.md): load for the preserved user goal, scope, sources, non-goals, deliverables, and completion criteria.
- [Status](status.md): load for Freeze readiness, work-item state, blockers, and the next action.
- [Decisions](decisions.md): load for accepted setup decisions, working assumptions, and open Gaps.
- [Product-Policy Grill Questions](questions.md): load for the Frozen
  one-question-at-a-time decision ledger and exact user answers.
- [Approved Wireframe Reconciliation](approved-wireframe-reconciliation.md): load for the accepted r001–r005 visual workflow, the Gaps it narrows, and the production-policy questions it leaves open.
- [Research](research.md): load before investigating sources or recording models, patterns, snippets, and comparative findings.
- [Source Inventory](source-inventory.md): load for pinned revisions, licenses, inspected paths, architecture maps, and bounded inventory conclusions.
- [PostgreSQL-Native Product Direction Findings](postgresql-native-product-direction-findings.md): load first for the current Mathesar-like direction, competitor pattern disposition, FRUI-inspired field/format registries, persistent drafts, and impact on earlier research.
- [Computed Columns And FRUI Support Findings](computed-columns-and-frui-support-findings.md): load for PostgreSQL generated-column boundaries, low-friction field/format families, FRUI risk findings, and the accepted metadata/draft direction.
- [Initial Findings](initial-findings.md): load for the foundational cross-source model, pattern, and Stackpress-fit synthesis.
- [Import And Formula Findings](import-formula-findings.md): load as historical rich-fidelity research and for exact-value source evidence.
- [Import Fidelity Contract](import-fidelity-contract.md): load for historical rich-fidelity evidence and the reusable retry/abandon state machine; current import is values-only.
- [Formula Compatibility Matrix](formula-compatibility-matrix.md): load only for later formula-spec research; P-003 is deferred from Spec 00001.
- [PostgreSQL Storage Comparison](postgresql-storage-comparison.md): load for the cell-row, row-document, bounded-block, and whole-document comparison plus the research recommendation and Proof boundary.
- [Security, Collaboration, And History Findings](security-collaboration-findings.md): load for the tenancy, permission, sharing, audit, optimistic concurrency, undo, revision, recovery, and Stackpress-ownership comparison.
- [UI And Grid Interaction Findings](grid-interaction-findings.md): load for windowing, selection, editing, keyboard, clipboard, saved-view, accessibility, and P-002 conclusions.
- [Domain And Stackpress Capability Model](domain-capability-model.md): load for the recommended semantic model, PostgreSQL boundary, command envelope, and native/adapt/application/framework-gap map.
- [Interfaces, Extensibility, And Operations](interfaces-and-operations-findings.md): load for the surface matrix, extension layers, jobs, outbox, recovery, observability, and deferred-interface boundary.
- [Product Discovery Handoff](product-discovery-handoff.md): load for the accepted audience, first product slice, entities, flows, native authority, admin duties, custom behavior/pages, exclusions, and scaffold gate.
- [Snippet Catalog](snippet-catalog.md): load for short pseudocode extracts, provenance, reuse constraints, and Stackpress translations.
- [Final Research Synthesis](final-synthesis.md): load for the accepted product/architecture, pattern dispositions, Proof results and limits, deferred work, and Frozen closeout.
- [Proofs](proofs.md): load when research exposes technical uncertainty that source reading cannot resolve.

## Current Direction Source

- [Preserved user direction, official product sources, and pinned FRUI inventory](../../resources/2026-07-24-mathesar-frui-direction.md)

## Operating Boundary

- Research and evidence collection come before implementation planning.
- P-001 is invalidated, P-003 is deferred, and the five applicable Proofs are
  complete with evidence under root `proofs/`.
- Accepted reusable truth is promoted into
  [the PostgreSQL-native product contract](../../context/tabular-product-contract.md)
  and the reconciled creative context. Historical research and disposable Proof
  detail remain spec-local.
- A later implementation effort must use a separately approved implementation spec after this research package is Frozen.
