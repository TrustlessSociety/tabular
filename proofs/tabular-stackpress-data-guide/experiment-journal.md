# Experiment Journal

## 2026-07-31 — actual Stackpress PGlite adapter

`stackpress/pglite` could not load until its peer adapter
`@stackpress/inquire-pglite` was installed explicitly at 0.10.8. The retained
Proof imports the real named `connect` export and asserts the PostgreSQL dialect.
Production dependency selection must review the reported audit findings rather
than applying an unbounded automatic fix in this Proof package.

## 2026-07-31 — lifecycle callback shape

An anonymous zero-argument `listen` callback was treated by Stackpress as a lazy
module import and failed inside `ImportRouter`. Accepting the event argument
routed it through the normal action listener. This callback shape is now a
guidebook rule.

## 2026-07-31 — version-column privilege

Granting update only on the visibly edited `amount` column was insufficient:
the optimistic-concurrency statement also increments `version`. The caller role
therefore needs explicit update permission on every column in the mutation
statement. The failure is retained as the rationale for capability-specific
column grants.

## 2026-07-31 — forced RLS and migration authority

Transactional unstructured promotion updated no rows when it ran as the table
owner under forced RLS. The retained design uses a dedicated non-caller
migration owner with `BYPASSRLS`, resets that role before writing Tabular
metadata, and never exposes it through page or MCP adapters. Pool leakage and
authenticated identity are still production-target validations.

## 2026-07-31 — shared-view publication

The migration owner could not create the `security_invoker` view until granted
`CREATE` on the target schema. The smallest retained permission is schema
`CREATE` for that migration principal plus explicit view grants to caller roles.

## 2026-08-01 — business ownership versus migration authority

The first role model let one privileged principal appear to own business data,
run system migrations, promote fields, and publish views. The retained model
separates a non-login business owner from the non-caller migrator. Publication
also checks membership in the owning role before the migrator executes DDL.

## 2026-08-01 — collision-safe unstructured installation

The fixture now contains a user-owned `__tabular_v1_cells` text column before
Tabular installation. The installer detects the collision, selects the next
versioned hidden JSON name, and records that choice. Failed promotion into an
existing real column rolls back without deleting the unstructured value.

## 2026-08-01 — migration and operations recovery

A forced version-2 migration failure proves that both its DDL and version row
roll back; a successful retry and a second no-op run prove idempotent re-entry.
Jobs now deduplicate equivalent work, and outbox records have safe claim and
published transitions rather than only an inserted-row assertion.

## 2026-08-01 — one compiled current-result query

The grid read, CSV export, and shared saved-view publication now consume
allowlisted structured filters and sorts. Export is proved against a filtered
result containing an otherwise authorized low-value row, so table-wide export
cannot accidentally satisfy the test. Page and MCP adapters reject arbitrary
SQL and DDL-shaped input before invoking the shared kernel.
