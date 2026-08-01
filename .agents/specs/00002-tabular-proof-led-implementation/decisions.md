# Decisions And Gaps

## Accepted From The Request And Context

### D-001: Use Exactly Two Proof Suites

P-001 is the browser/interaction guidebook. P-002 is the Stackpress/data
guidebook. Feature chapters stay inside these two auditable suites.

### D-002: Both Proofs Use PGlite

Every stateful chapter executes against PGlite. UI-only state cannot be the sole
evidence for persistence, constraint, authority, transaction, or recovery.

### D-003: Proofs Are Coding Guidebooks, Not Product Foundations

The useful output is executable learning, failed approaches, boundary notes,
and production translation. Prototype code has no architecture authority by
itself and is not promoted wholesale.

### D-004: Feature Coverage Is Atomic And Traceable

The stable feature ID is the unit of closeout. A grouped row is complete only
when every sub-item has evidence or an explicit disposition. A source anchor or
aggregate passing test is not enough.

### D-005: Proofs Precede Production Planning

Scaffolding and task planning wait for Proofs, gap check, accepted findings,
and Freeze. The four user-owned scaffold values do not block the Proofs.

## Decisions Discovered By The Proofs

Round 2 decisions D-006 through D-016 and Round 3 decisions D-017 through D-019
were accepted on 2026-08-01 and promoted to Context. The final r007
product/design closure added D-020 through D-023 on the same date.

### D-006: Dynamic User Tables Stay In The Runtime Catalog Lane

Fixed Tabular control records may use generated Stackpress stores. User tables
and views are catalog-driven runtime objects; no model/client is generated per
user table.

### D-007: One Named Capability Does Not Replace Authorization

Page and MCP adapters share `tabular.capability`, but each surface keeps caller
identity, validation, output mapping, and deny-default policy. PostgreSQL
grants, RLS, constraints, and triggers remain final authority.

### D-008: Migration Authority Is Separate From Caller Authority

DDL, whole-table promotion, and shared-view publication use a dedicated
non-caller migration principal. Its required `BYPASSRLS` ability may never be
propagated to a page/MCP caller; target-pool reset remains a later validation.

### D-009: Browser State Keys Include File Identity

Selection, edit, validation, and undo state cannot use coordinates alone.
Rendered import testing proved file identity is required to prevent error-state
leakage between sheets.

### D-010: Stackpress Lifecycle Handlers Accept The Event Argument

Stackpress treats an anonymous zero-argument event callback as a lazy import.
Lifecycle handlers accept the event argument even when otherwise unused.

### D-011: Every PGlite Claim Has A Production Recheck

PGlite establishes the local programming model only. Target server, pool,
identity, workers, external DDL/services, native assistive technology, and
deployment operations retain explicit rechecks.

### D-012: Business Ownership And Migration Authority Stay Separate

User-table ownership belongs to a non-login business role. Transactional system
migrations, hidden-field promotion, and owner-approved publication use a
non-caller migrator. Owning-role membership is checked before publication; the
migrator is never exposed through page or MCP adapters.

### D-013: System Migrations Are Transactional And Idempotent

Every system-schema version records its migration in the same transaction as
its DDL. A failed migration leaves neither the DDL nor the version row behind,
and rerunning an applied version is a no-op.

### D-014: Hidden Unstructured Storage Is Collision-Safe

Installation inspects the table before choosing a versioned hidden JSON column.
A pre-existing user column is never adopted, changed, or overwritten. Promotion
removes the JSON value only after the real-column transaction succeeds.

### D-015: Reads, Exports, And Published Views Share A Query Compiler

Allowlisted structured filters and sorts compile to parameterized read/export
queries and a validated SQL-compatible saved-view definition. Arbitrary SQL and
DDL-shaped input are rejected at both page and MCP surfaces.

### D-016: Evidence Dispositions Must Be Rendered Honestly

The human-readable guide reports each feature's actual disposition and evidence.
An aggregate passing badge may not label Guide, prior-evidence, target-validation,
or visible-gap rows as executable contracts.

### D-017: Logical Selection Is Renderer-Independent

Stable row and column identities are the selection authority. The grid adapter
projects that logical target into mounted cells and restores it after virtual
unmounts, data reloads, column order changes, and other renderer resets.

### D-018: Pin Tabulator 6.5.0 Behind A Grid Adapter

Tabulator is the recommended first-slice renderer candidate because its MIT,
vanilla, vertical-virtualization, range, row, column, and keyboard-selection
contracts fit the Proof. Renderer APIs may not leak into domain actions or own
selection persistence.

### D-019: Begin With Vertical Virtualization Only

Use ordinary internal horizontal scrolling with the current columns mounted.
Tabulator's experimental horizontal virtual DOM is not a first-slice dependency;
reconsider it only from measured column-scale need and target validation.

### D-020: URL And Phone Stay Permissive Strings

URL and Phone editors accept entered strings without strict application-level
rejection. Best-effort formatters may improve display or link behavior but may
not silently rewrite the stored string. PostgreSQL constraints/triggers remain
authoritative; rejected values stay correctable drafts.

### D-021: Row Order Is Shared; View Presentation Has Explicit Ownership

Committed row moves update shared table presentation order, publish in real
time when available, and fall back to durable queued maintenance for rank
compaction or delivery. Owner-authorized installation uses a collision-safe
Tabular-hidden rank column; `__tabular_row` is a logical naming hint, never a
license to adopt a conflicting user column or claim physical PostgreSQL order.

Column order/visibility, filters, sorting, and cell presentation stay current-
tab state until saved. Private views persist them for their owner; Shared views
publish them to authorized collaborators.

### D-022: Saved Views Belong To Folder Discovery And File

An open folder has Files and Views tabs. View rows show their source/access and
open the source table in a new tab. The spreadsheet has no persistent saved-
view bar: File → Views opens Personal/Shared lists or a no-views creation state;
File → New view opens creation directly. Shared creation requires table-owner
or owning-role membership, and active-view context stays compact in the
breadcrumb/title. The Views tab lists Tabular saved views; native PostgreSQL
views remain canonical read-only files under Files.

### D-023: System Activity Is A Reachable Permission-Filtered Surface

Browse and Table expose an icon-only, accessibly named System activity link.
The page shows running, queued, attention, and completed work; operation detail;
dead-letter review/retry/acknowledgement; and administrator retention.
Acknowledgement retains the auditable record. Contents and actions remain
caller-authorized, and desktop cells fill their dynamic row height.

## Assumption Results

- A-001, one integrated browser Proof: **supported with target validation**.
  R-003 supplies the virtualized logical-selection adapter; r007 supplies the
  accepted presentation persistence policy; native assistive technology remains
  a separate target validation.
- A-002, one shared Stackpress/data Proof: **supported**. Page and MCP share a
  named capability without per-table generation.
- A-003, PGlite for discovery only: **supported**. Eight production translation
  categories are explicit and are not mislabeled as proved.

## Post-Proof Gap Dispositions

### G-001: Atomic Feature Coverage

- Status: **Resolved by Proofs plus accepted product/design decisions**
- All 58 `W-*` and 12 `D-*` IDs carry an honest rendered and machine-readable
  disposition. R-003 closes the renderer/selection rows; approved r007 closes
  W-015, W-025, and the visible D-007/D-010 surfaces.

### G-002: Browser State And Domain Actions

- Status: **Resolved by guide**
- Resolved: typed edit/draft/commit, file-scoped state, overlays, persistence,
  searchable relation entry, exact command/presentation choices, named
  capability ownership, and the prior transactional batch pattern.
- R-003 adds stable-ID range/row/column selection independent of mounted DOM and
  a PGlite-backed aligned-action plan. Frozen P-002 supplies atomic mutation.

### G-003: Dynamic PostgreSQL Objects

- Status: **Resolved by guide**
- Catalog stable identity, identifiers, drift, system-schema records, and
  transactional promotion are demonstrated without per-table generation.

### G-004: Drafts, Validation, Conflicts, And Undo

- Status: **Resolved by guide and prior evidence**
- Resolved: persistent invalid drafts, expected versions, redacted journal,
  PostgreSQL rejection, 100-step current-session history, disabled fresh state,
  and Frozen P-004 authority/version rechecks for canonical mutation undo.
- Range clear has an aligned target envelope; canonical execution uses the
  existing atomic batch pattern. Multi-cell paste remains adapter work, not an
  unresolved architecture contract.

### G-005: PostgreSQL Authority Across Page And MCP

- Status: **Resolved by guide; accepted implementation validation remains**
- Deny-default parity, caller roles, forced RLS, column grants, structured-only
  operations, and redacted activity are demonstrated.
- Recheck: authenticated identity mapping and pool role cleanup on target.

### G-006: Presentation And Layout Ownership

- Status: **Resolved by guide and accepted policy**
- Exact menus, font sizes, palettes, borders, action history, reorder behavior,
  and mixed range feedback are demonstrated. Shared row rank and real-time/
  queued delivery are distinct from current-tab/private/shared-view ownership
  of column/presentation state.

### G-007: Import And Export Integrity

- Status: **Resolved by guide; target validations remain**
- Resolved: reviewed values-only transaction, 248-row/6-field result integrity,
  fingerprints, warnings, idempotent commit, visible progress/retry/failure/
  changed-source/abandon, and same-query authorized CSV export.
- Recheck: live Google OAuth/download/revocation and production file scale.

### G-008: Accessibility With Virtualization And Overlays

- Status: **Resolved by guide plus accepted implementation validation**
- Resolved: names, indices/counts, cell focus, keyboard context menu, overlay
  clamp, and narrow overflow.
- R-003 proves virtualization-independent logical/range selection, stable
  mounted indices/totals, and narrow internal overflow.
- Recheck: VoiceOver and accepted production browser matrix.

### G-009: Saved Views, Jobs, Outbox, And Admin State

- Status: **Resolved by guide plus approved visible design**
- Domain boundaries pass, including allowlisted saved-view compilation,
  owning-role publication, security-invoker views, idempotent jobs, safe
  job/outbox claiming, retry, dead letters, and outbox completion.
- r007 supplies reachable Files/Views and File-menu discovery, view creation,
  active-view context, permission-filtered activity, job/dead-letter detail,
  retry/acknowledgement, and retention controls. Production retention and worker
  behavior remain target validations.

### G-010: PGlite Production Limits

- Status: **Accepted implementation validation**
- The translation ledger covers server version, pools, role reset, identity,
  concurrency, external DDL/services, workers, assistive technology,
  deployment, backup, and rollback.

### G-011: Stackpress Responsibility Ownership

- Status: **Resolved by guide**
- `ownership-map.md` assigns coordinator/scaffold, fixed Idea, runtime
  capability, page/view, MCP, PostgreSQL, browser, and verification work.

### G-012: Safe Production Task Sequence

- Status: **Ready for implementation planning on request**
- The foundation order and interaction/data boundaries are known. No task files
  were made because the user has not requested post-Freeze implementation
  planning.

### G-013: Optional Explorer And Operations Refinements

- Status: **Deferred follow-on refinements; not Freeze blockers**
- Persisted list/grid preference, explicit explorer sort, a high-volume Views
  table filter, a combined New menu, a separate PostgreSQL rename/migrate UI,
  and a dedicated acknowledged-dead-letter filter may be scoped later.
- The accepted first slice already has deterministic defaults and does not need
  those refinements to implement W-015/W-025 or D-007/D-010.
