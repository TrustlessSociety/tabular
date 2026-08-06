# Tabular direct PostgreSQL boundary proof

P-002 verifies the production database boundary for the direct Stackpress
library architecture against PostgreSQL 18. It deliberately does not use
PGlite.

## Covered signals

- allowlisted `SET LOCAL ROLE` plus RLS isolation;
- rollback, timeout cancellation, pooled-session reset, and recovery;
- app-owned migration history serialized by a transaction-scoped advisory lock;
- concurrent expected-version write conflict;
- stable PostgreSQL object identity across rename and changed identity after
  drop/recreate;
- durable job claiming with `FOR UPDATE SKIP LOCKED`, retries, dead-letter
  state, stale-lease recovery, and idempotent enqueue;
- equivalent authority outcomes through independent web- and MCP-shaped
  adapters.

## Reproduce

Use a disposable PostgreSQL 18 database. Never point this proof at retained
data: setup drops and recreates the `proof` schema and two proof-only roles.

```sh
npm install
PROOF_DATABASE_URL=postgres://... npm test
```

The passing run writes `results.json`. The package lock pins the exact
dependency graph; `npm audit --json` reported zero vulnerabilities on
2026-08-01.

## Boundary

This proves mechanisms and failure semantics. It does not select production
pool sizes, lease durations, retry backoff, role inventory, observability, or
deployment credentials.
