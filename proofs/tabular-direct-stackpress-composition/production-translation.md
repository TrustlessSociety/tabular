# Production Translation

## Retain Conceptually

- explicit application bootstrap and cleanup ownership;
- exact dependency pins and peer dependencies;
- Node HTTP Ingest route boundary for the first target;
- Reactus build outputs under separate page, client, and asset paths;
- allowlisted shell-only hydration props;
- opaque server-side sessions, rotation, expiry, revocation, secure cookie
  policy, synchronizer CSRF tokens, and exact-origin checks;
- one domain capability with independent web and MCP transport adapters;
- transactional migration/version records and handwritten repositories; and
- lib events for in-process composition only.

## Replace Or Extend

- replace proof credentials with the accepted external identity adapter;
- store sessions in production PostgreSQL or an accepted durable session store;
- require HTTPS, `Secure`, trusted-proxy configuration, and production domain
  policy;
- replace PGlite with a per-database PostgreSQL pool through Inquire PG;
- add rate limiting, session anomaly logging, key/secret rotation, and real
  logout/revocation integration;
- run web, migration, and worker entrypoints as separately observable processes;
  and
- serve hashed Reactus assets with the production cache/CDN policy.

## Still Unproved Here

PostgreSQL 18 roles/pools, concurrent connections, external DDL, worker
claiming, live identity, deployment, backup/restore, load limits, and native
assistive technology. P-002 addresses only the PostgreSQL-server subset.
