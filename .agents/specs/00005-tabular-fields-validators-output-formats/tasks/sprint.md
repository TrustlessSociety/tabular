# Accepted Implementation Sprint

## Status

**Accepted 2026-08-13.** The user's implementation-coordinator direction
accepts this plan and fixes task numbers 00001 through 00008.

## Outcome

Implement the Frozen Field/storage catalog, safe output Formats, composable
Tabular-only validators, JSONB object/array values, and existing-value
`#VALUE!` behavior without changing the established PostgreSQL authority,
draft, default, import, or grid interaction contracts.

## Execution recommendation

Use a coordinator with three bounded workers. The pure
validator engine, Field/JSON codecs, and safe Format renderers have enough
independent surface to justify parallel work after one shared foundation task.
The coordinator must own shared contracts, migrations, wiring, task status,
cross-worker review, browser acceptance, and the final release gate.

The coordinator also exclusively owns Task 00001, metadata wiring,
column-settings integration, grid/action wiring, Tasks 00005 through 00008,
final reconciliation, and release verification. Task 00001 must be verified
before any worker begins. At that gate the coordinator publishes stable
interfaces and an exact file allow-list for every worker.

Workers share one worktree, so ownership is strict: a worker may add isolated
modules/tests in its assigned area but must not edit shared contracts or wiring
unless the coordinator explicitly transfers ownership. Tasks touching the
column settings panel, grid table/action path, or migration chain are serialized
through the coordinator.

Required worker assignments:

- `validator_worker`: `gpt-5.6-sol`, reasoning `high`, Task 00002.
- `field_codec_worker`: `gpt-5.6-sol`, reasoning `high`, Task 00003.
- `format_renderer_worker`: `gpt-5.6-sol`, reasoning `high`, Task 00004.

Each worker must read Frozen Spec 00005 and the accepted Context file, remain
inside its coordinator-issued file allow-list, and avoid shared contracts,
migrations, the column settings panel, grid/action wiring, task status, and
other workers' files. Workers must not commit, push, or discard changes. The
coordinator reviews and reruns verification for every worker result before
integration.

## Planned tasks

### 00001: Registry, metadata, and value-contract foundation

Create one typed storage × Field × Format × validator compatibility registry;
versioned validator metadata; JSONB object/array grid/action value contracts;
metadata migration; and recommended defaults. Prove validator metadata produces
no target-table DDL or row changes.

Verification: type/static checks, migration tests, compatibility matrix tests,
metadata round trips, and no-target-DDL assertions.

Acceptance criteria: none; this is non-visual foundation work.

### 00002: Pure validator engine and failure contract

Implement exact, non-coercive rules; locked implied-rule composition; ordered
configured rules; duplicate/contradiction checks; bounded JSON paths; stable
failure IDs; eight-error cap; and NULL/empty/zero/false semantics.

Verification: exhaustive unit/contract tests, exact numeric and temporal cases,
pattern bounds, JSON depth, and Stackpress-regression cases.

Acceptance criteria: none; browser projection is reviewed in Task 00006.

### 00003: JSONB and expanded Field editors/codecs

Implement Metadata, Tags, Text List, Multi-select, and Checkbox List value
codecs/editors; correct Time/Tags/Text List storage defaults; and refine the
accepted scalar Fields. Preserve edit-exit/default behavior and exact values.

Verification: codec round trips, editor lifecycle tests, storage-default tests,
keyboard/focus regression checks, and focused browser inspection.

Acceptance criteria: rendered editing flows for every new Field family.

### 00004: Safe output Format renderers

Implement accepted text, link, numeric, temporal, code, sanitized Markdown,
Metadata, List/Spread/Tags, label, rating, color, and Yes/No renderers with
explicit locale/timezone config and escaped fallback behavior.

Verification: renderer unit/security tests, unsafe protocol/markup cases,
bounded collection tests, and browser screenshots of the Format matrix.

Acceptance criteria: rendered Format gallery in the real grid.

### 00005: Column settings and validator authoring UI

Extend the existing right-side panel with compatible Field/Format config,
native Constraints kept separate, locked implied validators, ordered configured
rule cards, typed parameters, custom messages, and Tabular-only disclosure.
Field/Format/validator selection must never populate cells or defaults.

Verification: component/action tests, compatibility filtering, reorder/remove,
keyboard/accessibility checks, and browser inspection at the acceptance URL.

Acceptance criteria: user can configure several validators and distinguish
Tabular validators from native PostgreSQL constraints.

### 00006: Read/edit/action integration and `#VALUE!`

Wire rule evaluation into loaded/materialized cells and future Tabular edits.
Existing violating values display `#VALUE!` without database mutation; edit
mode shows raw data; correction persists; removal/change restores display;
future invalid values remain correctable drafts.

Verification: action/integration tests, direct-SQL bypass fixture, no-row-mutation
assertions, reload tests, and browser acceptance against real PostgreSQL state.

Acceptance criteria: visible existing-value, edit/correct, rule removal, reload,
and direct-SQL-bypass journeys.

### 00007: Paste, import, defaults, and native-constraint separation

Apply identical codecs/validators to paste, import, and defaults. Infer JSONB
object versus array Field suggestions. Preserve the rule that Field/default
configuration does not materialize values. Confirm native Required, Unique,
foreign-key, type, and trigger failures remain independent.

Verification: import/paste/default integration tests, mixed-invalid bulk cases,
native constraint regressions, and browser workflows.

Acceptance criteria: visible paste/import/default correction flows with no
unexpected cell population.

### 00008: Integrated security, regression, and human acceptance gate

Run the full suite, migration/restart checks, production-target smoke tests,
security payloads, performance bounds, and browser acceptance at the user's
active URL. Remove temporary fixtures and record residual risk.

Verification: repository validation commands, focused and full tests, browser
screenshots/recording, console/network inspection, and clean-worktree review.

Acceptance criteria: user accepts the complete Field, Format, settings,
`#VALUE!`, paste/import/default, and reload experience.

## Ordering and parallel waves

1. Coordinator completes 00001 and publishes stable interfaces/file ownership.
2. Run 00002, 00003, and 00004 in parallel in isolated modules/tests.
3. Coordinator integrates them, then serialize 00005 and 00006 around shared
   settings/grid/action hotspots; non-overlapping test work may stay parallel.
4. Complete 00007 after codecs and action validation are stable.
5. Coordinator alone owns 00008, final reconciliation, and user handoff.

## Plan acceptance record

Accepted by the user's implementation-coordinator direction on 2026-08-13.
`tasks/status.md` and stable task files 00001 through 00008 are authoritative
for implementation tracking. Verification and explicit human visual
acceptance remain separate; no visual task may be marked `accepted` without
the user's review.
