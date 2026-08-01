# P-002 experiment journal

## 2026-08-01

1. Installed exact isolated dependencies: `@stackpress/inquire` 0.10.8,
   `@stackpress/inquire-pg` 0.10.8, and `pg` 8.16.3.
2. Pulled the official `postgres:18` image and started the explicitly named
   disposable container `tabular-spec3-pg18-proof` on loopback port 55432.
3. Confirmed readiness inside the container, then ran the Node test suite.
4. The first proof run passed all eight signal groups against PostgreSQL 18.4.
5. `npm audit --json` reported 0 vulnerabilities across the isolated graph.
6. Stopped the container. Because it was started with `--rm`, Docker removed
   the container; a final exact-name check returned no container.

## Observed failure behavior

- A forced callback exception rolled back and left no role or timeout state in
  the pooled connection.
- A 40ms statement timeout cancelled `pg_sleep` with SQLSTATE 57014; a fresh
  role transaction then succeeded.
- A deliberately broken migration rolled back both its DDL and migration row.
- Two equal-version writers produced exactly one commit and one conflict.
- A second job failure at `max_attempts = 2` moved the job to `dead`.
