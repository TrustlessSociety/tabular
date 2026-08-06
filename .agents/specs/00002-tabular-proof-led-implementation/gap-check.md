# Post-Proof Gap Check

## State

Executed on 2026-07-31, refreshed after the 2026-08-01 auto-resolution and
focused R-003 passes, then closed after user approval of r007 Round 2. The check
found no missing stable IDs or unresolved planning blockers. The user authorized
Freeze on 2026-08-01 after reviewing this closeout.

## Finding Dispositions

Every finding receives one disposition:

- **No gap:** evidence and production translation are sufficient for planning.
- **Resolved by guide:** the Proof establishes a recommended pattern and its
  limits; record the decision in `decisions.md`.
- **Blocking gap:** production planning would guess at a material behavior;
  resolve it before Freeze.
- **Accepted implementation validation:** the design is clear but must be
  revalidated against the production target during a later task.
- **Deferred follow-on spec:** the behavior is outside this first slice and has
  an explicit owner/spec trigger.
- **Rejected or superseded:** the feature/approach conflicts with Context or an
  accepted boundary and must not enter the task plan.

## Checks

### GC-001: Atomic Feature Coverage

- Audit every `W-*` row and every semicolon-separated sub-item.
- Audit every `D-*` row for a Proof or explicit gap disposition.
- Reject aggregate pass claims when chapter evidence is missing.
- Record missing, contradictory, static-only, or stale evidence as G-001 findings.

### GC-002: Interaction-To-Domain Trace

- Map every stateful user action to a named domain capability, query, or
  deliberate session-only behavior.
- Check success, validation, denial, conflict, rollback, retry, abandon, and
  destructive-confirmation paths where applicable.
- Flag duplicated rules between browser and Stackpress adapters.

### GC-003: Canonical Ownership And Schema Safety

- Confirm PostgreSQL remains canonical for native objects and authority.
- Confirm Tabular system-schema ownership stays limited to accepted metadata,
  drafts, views, journal, jobs/outbox, and provenance.
- Review identifier safety, stable identity, DDL transaction boundaries,
  schema drift, key variation, unstructured promotion, and relations.

### GC-004: PGlite Translation Limits

- List every claim not established for a PostgreSQL server target.
- Include pool role reset, network identity, multi-process behavior, external
  DDL races, target-version differences, scale, backup/restore ownership, and
  deployment operations.
- Turn clear rechecks into later verification tasks; keep architectural unknowns
  as blocking Gaps.

### GC-005: Authority, Privacy, And Cross-Surface Parity

- Check deny-default Tabular capabilities and native grants/RLS intersection.
- Check no owner/superuser/BYPASSRLS widening, no context loss across web/MCP,
  caller-filtered discovery, redacted activity, and structured-only mutations.
- Flag any feature that cannot explain who is allowed to invoke it.

### GC-006: Accessibility, Responsive, And Human Review

- Review desktop and narrow primary journeys and named error/overlay states.
- Check keyboard reachability, focus restoration, logical grid navigation, ARIA
  counts/indices, icon names, viewport clamp, and internal-only grid overflow.
- Separate browser evidence from required native assistive-technology validation.

### GC-007: Import, Export, Jobs, And Recovery

- Trace source fingerprint/provenance, exact values, warnings, staging, retry,
  changed source, transactional new-table commit, abandon, CSV authorization,
  job claiming/retry/dead-letter visibility, and retention ownership.
- Keep live Google auth/download and production worker behavior explicit.

### GC-008: Accepted Scope And Deferred Leakage

- Confirm unavailable wireframe items remain honest and deferred features have
  not entered the first-slice implementation plan.
- Check formulas, rich content, non-CSV export, public/integration surfaces,
  frontend delivery, Qdrant, and cross-database relations against their later
  spec triggers.

### GC-009: Stackpress Ownership And Build Readiness

- Assign each retained responsibility to Stackpress coordinator/scaffold, fixed
  Idea schema, runtime plugin/capability, page/event handler, handwritten view,
  MCP adapter, or verification phase.
- Confirm dynamic user tables do not trigger per-table generation.
- Identify the smallest safe production foundation and ordering constraints,
  but do not create task files until the spec is Frozen and the user requests
  implementation planning.

### GC-010: Guidebook Quality

- Confirm both READMEs are runnable from a clean checkout.
- Confirm each retained pattern includes rationale, example, failure case,
  limitations, and production translation.
- Flag clever prototype shortcuts that would mislead production work.

## Closeout Record

## Closeout Results

| Finding | Check | Disposition | Affected IDs/Gaps | Evidence | Owner / next action |
| --- | --- | --- | --- | --- | --- |
| F-001 | GC-001 | Resolved by accepted policy/design | W-015, W-025; visible D-007/D-010; G-001 | approved r007 specs/notes plus refreshed matrix | Preserve accepted policies and visible contracts in Context/tasks |
| F-002 | GC-002 | Resolved by guide | G-002, G-004 | P-001 bounded history; R-003 PGlite range plan; Frozen P-002/P-004 atomic action backings | Keep named stable-ID actions and one canonical batch transaction |
| F-003 | GC-003 | Resolved by guide | G-003 | P-002 results, `service.mjs`, `ownership-map.md` | Catalog runtime owner; fixed system schema only |
| F-004 | GC-004 | Accepted implementation validation | G-010, D-012 | `production-translation.md`; eight result rows | Re-run on target PostgreSQL/pool/worker/deployment |
| F-005 | GC-005 | Resolved by guide + target validation | G-005 | deny-default, forced RLS, grants, role reset, redacted journal | Re-prove authenticated role mapping and pool cleanup |
| F-006 | GC-006 | Resolved by guide + target validation | W-013, W-038, W-054, G-008 | R-003 2,697-cell range with unmounted anchor; reset replay; mixed state; ARIA counts/indices; 390px review | Re-run VoiceOver and accepted browser matrix on production renderer |
| F-007 | GC-007 | Resolved by guide + target validation | W-052, G-007 | visible import recovery; 248/6 result; idempotent commit; same-query CSV | Later live Google, file scale, and worker rechecks |
| F-008 | GC-008 | No gap | W-034, W-037, W-058 | Honest disabled/deferred/negative inventory | Preserve absence in first slice |
| F-009 | GC-009 | Resolved by guide + accepted visible design | D-007, D-010, G-009, G-011, G-012 | compiled view/owner membership/job-outbox evidence plus approved reachable r007 surfaces | Re-prove persistence, workers, retention, and authority on target |
| F-010 | GC-010 | No gap | P-001, P-002 | Both READMEs, journals, results, screenshots | Retain Proof code as reference, not scaffold source |
| F-011 | Dependency audit | Accepted implementation validation | shared Proof dependency tree | pinned PGlite/Stackpress/Tabulator installs; latest install reported 4 moderate/2 high | Review/update dependencies in production scaffold; no auto-fix here |
| F-012 | GC-001-GC-007 | Resolved by accepted truth + new proof evidence | W-021, W-030, W-035-W-037, W-039-W-041, W-052; D-002-D-006, D-008-D-011 | exact rendered choices; prior Frozen evidence; transactional migration/promotion; compiled query; idempotent operations | Retain dispositions and production rechecks |
| F-013 | GC-010 | No gap after correction | P-002 rendered report | per-contract status/evidence labels; 22-signal run state; two visible gaps honestly retained at Proof closeout and later closed by r007 | Never collapse mixed dispositions into an aggregate pass claim |
| F-014 | GC-001, GC-002, GC-006 | Resolved by accepted R-003 guide + target validation | W-013, W-020, W-038, W-054; G-002, G-008 | Tabulator 6.5 adapter; stable-ID logical model; PGlite action plan; virtual/narrow screenshots; three passing P-001 tests | Promoted; retain native AT and scale rechecks |
| F-015 | GC-001, GC-002, GC-006, GC-007 | No blocker after accepted r007 closure | W-015, W-025, D-007, D-010; G-001, G-006, G-009, G-012 | permissive string policy; shared hidden-rank order; Files/Views and File dialogs; reachable System activity; 16 responsive checks; zero console warnings/errors | Frozen; do not relabel wireframe simulations as database proof |
| F-016 | GC-008 | Deferred follow-on refinements | G-013 | r007 accepted defaults/non-blocking follow-ups | Scope explorer preference/sort/filter, combined New, rename/migrate UI, or acknowledged filtering only when requested |

## Important Discoveries

1. Rendered review found two defects that service-only checks missed: the
   imported file initially opened empty, and coordinate-only error state leaked
   between files. The guide now commits 248 rows/six fields and scopes transient
   state by file.
2. P-002 failed until edit roles received version-column permission, the
   migration principal could bypass forced RLS, and it received schema `CREATE`
   for shared-view publication. These are now explicit guidebook rules.
3. A shared Stackpress named event is an ownership boundary, not an authority
   boundary. Surface policies and PostgreSQL authority remain independent.
4. The minimal browser implementation triggered conditional research R-003.
   Focused comparison and rendered evidence now recommend pinned Tabulator 6.5
   behind a stable-ID logical-selection adapter, with vertical virtualization
   only in the first slice.
5. Accepted Context and Frozen Spec 00001 evidence closed undo depth,
   constraint rollback, and import recovery without duplicating those proofs.
   P-001 supplied the missing current wireframe states and retained provenance.
6. P-002's first report labeled every data card “Executable contract,” even for
   Guide, target-validation, and visible-gap rows. Rendered review caught the
   overclaim; cards now expose their actual status and evidence.
7. The auto-resolution pass separated business ownership from migration
   authority, proved collision-safe hidden JSON installation and transactional
   schema upgrade rollback, and strengthened saved-view/export/job/outbox
   contracts without inventing the two absent UI surfaces.
8. Approved r007 closes those UI surfaces through the real Browse/Table graph:
   Files/Views discovery and File-menu dialogs replace the rejected persistent
   bar, while System activity exposes queued work and recovery without a
   workflow-index dependency.
9. W-025 needs two ownership lanes: row order is shared table presentation
   backed by a collision-safe hidden rank and real-time/queued delivery; column
   order and other presentation remain tab state until saved privately or
   shared through a view.
10. The remaining r007 questions are optional refinements with working accepted
    defaults, not hidden first-slice blockers.

## Context Promotion Review

Rounds 2 and 3 plus r007 Round 2 were accepted on 2026-08-01. Their reusable
runtime, authority, migration, browser-state, validation, ordering, saved-view,
operations, evidence, renderer, logical-selection, vertical-virtualization,
and production-recheck rules are promoted across the Tabular Context files.

## Freeze Decision

**Frozen 2026-08-01.** W-015, W-025, D-007, and D-010 are closed by accepted
reusable product policy plus approved r007 visible design. Native assistive
technology and the other target rechecks remain implementation validations, not
architecture gaps. Production task planning waits for a user request;
scaffolding and implementation wait for an accepted task plan.
