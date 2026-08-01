# P-002 production translation

## Adopt

- Own the migration ledger in Tabular and serialize migration application with
  `pg_advisory_xact_lock` inside the same transaction as DDL and version insert.
- Acquire one pool client per authority-scoped transaction, set only an
  allowlisted role with `SET LOCAL ROLE`, and set transaction-local timeouts.
- Roll back on every error. Reset role and settings before returning a client;
  destroy the client if cleanup or state verification fails.
- Encode optimistic mutations as `UPDATE ... WHERE id = ? AND version = ?` and
  make a zero-row result an explicit conflict.
- Persist external object identity by PostgreSQL OID plus connection scope, not
  by mutable display name alone.
- Keep jobs durable in PostgreSQL. Claim with row locks plus `SKIP LOCKED`, use
  bounded attempts, lease expiry, dead-letter state, and unique idempotency
  keys.
- Route web and MCP adapters into the same authority/capability layer while
  authenticating each transport independently.

## Do not copy blindly

- Proof role names, port, password, migration lock key, timeouts, retry timing,
  and lease durations are test fixtures.
- Production role creation and grants belong to controlled deployment
  automation, not application request handling.
- Queue fairness, jittered backoff, dead-letter operations, monitoring, and
  retention need production policy and load evidence.
- OID identity must include the database/cluster connection context because OID
  values are not globally portable identifiers.
