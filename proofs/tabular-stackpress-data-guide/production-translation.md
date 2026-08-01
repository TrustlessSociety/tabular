# PGlite To Production Translation

| Proved here | Production recheck | Acceptance evidence |
| --- | --- | --- |
| PGlite SQL, catalogs, constraints, and transactions | target PostgreSQL server version | server integration suite |
| one embedded database resource | checked-out pool client per transaction | checkout/reset/release tests |
| `SET LOCAL ROLE` in one process | authenticated role mapping and failure cleanup | denial and pool-leak tests |
| single-process expected versions | concurrent workers and external writers | race suite with two connections |
| local catalog reconciliation | external DDL and object replacement | drift and restore drills |
| fixture Google-shaped import | OAuth, download, source recheck, revocation | integration sandbox evidence |
| local outbox/job claiming | crash recovery, contention, alerts, retention | worker operations suite |
| versioned transactional system migration | target migration lock, deploy ordering, rollback policy | failed deploy and idempotent rerun drill |
| collision-safe hidden JSON installation | concurrent installers and external name creation | two-connection collision suite |
| owning-role membership publication gate | authenticated membership refresh and pool cleanup | allow/deny integration suite |
| allowlisted shared read/export compiler | production query planner, limits, cancellation | parity and load suite |
| static guide report | accepted hosting, secrets, migrations, backup, rollback | deployment runbook drill |

These are accepted implementation validations only when the architecture is
already determined. Any item that changes the architecture remains blocking.
