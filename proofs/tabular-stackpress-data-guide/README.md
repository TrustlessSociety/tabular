# P-002 Stackpress And Data Implementation Guidebook

This Proof demonstrates the difficult Tabular runtime contracts through a real
Stackpress named event and the `stackpress/pglite` adapter. It is executable
learning for production implementation, not production scaffolding.

## Run

```bash
cd proofs
npm run proof:p102
npm run serve:p102
```

Open `http://127.0.0.1:4313`. Stop the server after browser review.

## Guide Chapters

1. Dynamic catalog and transactional versioned Tabular system schema.
2. Stable object identity and external-DDL reconciliation.
3. Caller identity, deny-default capabilities, grants, and forced RLS.
4. Expected-version edits, persistent invalid drafts, and redacted journal.
5. Collision-safe owner-installed unstructured cells and transactional promotion.
6. Native generated columns, cross-schema relations, and row identity policy.
7. Private saved views and shared `security_invoker` views.
8. Current-query authorized CSV, idempotent import/jobs, outbox claiming,
   retries, and dead letters.
9. Page/MCP parity through one `tabular.capability` event and versioned contract.
10. PGlite-to-production translation.

`coverage.mjs` maps all 12 product-contract IDs and all 58 wireframe features to
runtime or browser ownership. `results.json` records the executable evidence.

## Rules Learned By Failure

- Runtime tables stay catalog-driven. Do not generate Idea models or clients per
  user table.
- Application capability checks deny by default and run before PostgreSQL; they
  cannot widen grants or RLS.
- A role that updates a versioned record needs explicit permission for the
  version column as well as the edited field.
- Forced RLS blocks the business table owner too. Schema migrations and
  whole-table promotions use a separate, non-caller migrator with `BYPASSRLS`;
  business objects remain owned by the non-login business owner.
- Publishing a shared PostgreSQL view requires both owning-role membership and
  a narrowly scoped migrator with schema `CREATE`; callers receive neither.
- Shared views use `security_invoker = true`, so a view never becomes an
  authority bypass.
- Treat the hidden unstructured-column name as a versioned installation choice.
  A pre-existing user column is never overwritten or silently adopted.
- Compile saved-view and export definitions from allowlisted structured input.
  The grid read and CSV export share the same caller-authorized query compiler.
- System migrations, unstructured promotion, and publication are transactional;
  forced failure, rollback, and idempotent re-entry are executable evidence.
- Jobs use stable deduplication keys, while outbox rows have explicit claim and
  completion states. A retry loop without those transitions is not sufficient.
- Reset the migration role before writing Tabular-owned catalog records; prove
  the connection identity is restored after every transaction.
- Stackpress interprets an anonymous zero-argument event handler as a lazy
  import. Lifecycle handlers must accept the event argument.

## Production Translation

Keep the capability envelope, catalog identity, authority intersection,
transactional outbox, structured mutation contract, and role separation.
Re-prove server PostgreSQL version behavior, pool checkout/reset/release,
authenticated identity mapping, multi-process conflicts, external DDL races,
live Google authorization/download, worker crashes, retention, backup, and
deployment before production claims are made.

## Boundaries

- PGlite proves embedded PostgreSQL-shaped behavior, not a network server or
  pooled connection lifecycle.
- The fixture uses role names as identity evidence; production must derive roles
  from authenticated application identity.
- Arbitrary SQL and arbitrary DDL are deliberately absent from the page/MCP
  contract.

The generated report retains D-007 and D-010 as visible product-design gaps.
Their domain contracts are demonstrated; the guide does not invent saved-view
or operations-admin screens that are absent from accepted Context.
