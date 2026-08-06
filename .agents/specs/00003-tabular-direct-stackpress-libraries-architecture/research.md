# Research

## State

Bounded research was completed on 2026-08-01 from official package repositories,
security guidance, PostgreSQL 18 documentation, and current clean local clones.
P-001 and P-002 separately provide the executable target evidence.

- R-001: Complete
- R-002: Complete; executable validation closed by P-001/P-002
- R-003: Complete
- R-004: Complete

## R-001: Package Identity And Ownership

- Question: What does each requested repository actually install and own?
- Affected Gaps: G-001, G-002, G-004
- Method: inspect official README/package manifests and current local
  `origin/main` clones.
- Status: Complete 2026-08-01

| Repository | Local commit | Package/version | Finding |
| --- | --- | --- | --- |
| `stackpress/ingest` | `477ec47` | `@stackpress/ingest` 0.10.8 | HTTP/WHATWG server, routes, optional plugins, build/deploy route information; depends on lib |
| `stackpress/inquire` | `039a1b5` | Inquire packages 0.10.8 | SQL builders/dialects plus PG/PGlite adapters; depends on lib through core Inquire |
| `stackpress/reactus` | `357569a` | `reactus` 0.10.8 | React template rendering and Vite-backed development/build/serve; depends on lib |
| `stackpress/lib` | `e2cc6b8` | `@stackpress/lib` 0.10.8 | Low-level events, routing/session types, queues, data/fs utilities |

Findings:

- The packages are siblings with a shared low-level dependency; Ingest,
  Inquire, and Reactus are not bundled exports of `@stackpress/lib`.
- `@stackpress/inquire-pg` requires `pg ^8` as a peer dependency.
- `@stackpress/inquire-pglite` requires PGlite `^0.3` as a peer dependency.
- Reactus's npm package name is unscoped `reactus`.
- Direct composition removes umbrella bootstrap, config conventions, plugin
  lifecycle, Idea generation, built-in features, and combined build scripts.
  Tabular must own every removed seam explicitly.

Official sources checked:

- <https://github.com/stackpress/ingest>
- <https://github.com/stackpress/inquire>
- <https://github.com/stackpress/reactus>
- <https://github.com/stackpress/lib>

## R-002: Missing Umbrella Capabilities And Proof Delta

- Question: What must Tabular add or prove when using only the focused packages?
- Affected Gaps: G-002 through G-008
- Method: compare current package docs/source with Context and Frozen Spec 00002
  ownership/evidence.
- Status: Complete for planning on 2026-08-01

Findings:

- Ingest can register routes manually or through its optional plugin loader. A
  full Stackpress plugin architecture is not required for Tabular's direct
  composition.
- No direct Ingest-plus-Reactus example was found in the checked repositories.
  Generic Reactus integrations do not prove request context, hydration/assets,
  error mapping, or graceful shutdown with Ingest.
- Inquire supplies typed builders, raw execution, connections, and transactions.
  It does not supply Tabular models, generated repositories, or a complete
  ordered migration-history/orchestration system.
- `@stackpress/lib` Session is a request/response cookie state primitive. It is
  not by itself a signed, persistent, revocable authenticated-session service.
- lib queues are in-process utilities. They do not replace PostgreSQL-backed
  jobs/outbox, multi-worker claiming, retries, dead letters, or restart recovery.
- Removing built-in auth/API/session/admin is feasible because the accepted
  product requires narrow application-specific surfaces, but their security and
  lifecycle ownership becomes Tabular's responsibility.
- Spec 00002's PGlite database and browser semantics remain useful. Its exact
  `stackpress/pglite`, Idea, lifecycle, plugin, and generated-store evidence is
  insufficient for this package set.

Rejected interpretations:

- Do not treat a transitive dependency on lib as proof that all four requested
  repositories are one installable library.
- Do not use lib request cookies as authentication evidence.
- Do not use `TaskQueue` as durable worker infrastructure.
- Do not repair the old Proof by swapping imports and preserving its result
  label; new architecture requires new evidence and provenance.

## R-003: Provider-Neutral Identity, Session, And CSRF

- Question: What minimum provider-neutral contract allows internal authenticated
  users to reach an effective PostgreSQL role securely without built-in auth or
  session?
- Affected Gap: G-003
- Status: Complete 2026-08-01; exercised by P-001 with a labeled test double

Findings:

- Normalize a verified provider subject into an application identity; never
  derive a database role directly from untrusted claims or cookie content.
- Store an opaque CSPRNG session identifier in the cookie and keep subject,
  current role mapping, CSRF secret, creation/activity/expiry, and revocation
  state server-side. Rotate after authentication or privilege change.
- Production cookies require HTTPS plus `Secure`, `HttpOnly`, a deliberate
  `SameSite` policy, narrow path/domain, bounded lifetime, and no-store responses.
  Trusted-proxy configuration must make the application aware of real HTTPS.
- Browser mutations require exact trusted-origin validation and a session-bound
  synchronizer token compared exactly. SameSite remains defense in depth.
- Logout revokes the server record and clears browser state. Expiry, idle limit,
  provider revocation, and role-remapping invalidate or rotate the session.
- A provider-neutral test double can prove adapter mechanics only; live identity,
  account policy, and provider logout remain target validations.

Sources checked 2026-08-01: OWASP
[Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
and [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## R-004: Build, Deploy, Database, And Worker Topology

- Question: What process and artifact topology composes Ingest, Reactus,
  migrations, PostgreSQL pooling, and workers safely?
- Affected Gaps: G-005, G-006
- Status: Complete 2026-08-01; mechanisms exercised by P-001/P-002

Findings:

- Select Ingest's Node HTTP adapter as the first target. The application owns
  bootstrap, route registration, error mapping, readiness, signals, and cleanup.
- Run Reactus `build()` before deployment and package `.build/pages`,
  `public/client`, and `public/assets`; production routes serve the hashed client
  and asset files while Reactus `serve()` renders built pages.
- Reactus 0.10.8 embeds serialized hydration props in an inline JSON script
  without neutralizing `<`. Restrict it to allowlisted shell-bootstrap values;
  user/database strings travel through authenticated JSON actions.
- Use separate observable web and worker entrypoints with separate pools. A
  one-shot migrator runs before serving traffic with elevated deployment-only
  authority and a transaction-scoped advisory lock.
- Readiness checks config, build artifacts, migration state, and database
  connectivity. Shutdown stops new HTTP/job work, drains bounded in-flight work,
  releases or expires leases, resets/destroys clients as needed, and closes pools.
- Deployment, live cancellation plumbing, pool sizing, load, backup/restore,
  secrets, and monitoring remain named target validations, not architecture gaps.

PostgreSQL sources checked 2026-08-01: [`SET LOCAL`](https://www.postgresql.org/docs/18/sql-set.html),
[advisory locks](https://www.postgresql.org/docs/18/functions-admin.html),
[`SKIP LOCKED`](https://www.postgresql.org/docs/18/sql-select.html), and
[explicit locking/deadlocks](https://www.postgresql.org/docs/18/explicit-locking.html).

## Research Expansion Rule

Do not broaden this into general framework or vendor selection. Record any new
topic with its affected Gap before source review. Research answers contracts;
P-001 and P-002 answer integration behavior.
