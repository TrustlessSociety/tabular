# Ownership Map

| Responsibility | Production owner | Proof example | Must not own |
| --- | --- | --- | --- |
| Stackpress lifecycle | app coordinator/scaffold | `config`, `listen` | table-specific domain rules |
| PGlite/PostgreSQL resource | database plugin | registered adapter | caller authorization policy |
| Fixed Tabular records | fixed Idea schema or migrations | versioned `tabular.*` tables | user table definitions |
| Dynamic objects | catalog repository/runtime capability | `tabular.objects` + PostgreSQL catalogs | generated model/client per table |
| Domain mutations | runtime plugin named capability | `tabular.capability` | HTML rendering |
| Page surface | page handler + handwritten view | `surface: page` adapter | duplicated authorization logic |
| MCP surface | MCP structured adapter | `surface: mcp` adapter | raw SQL or raw DDL |
| Business object ownership | non-login owning role | `tab_owner` | caller sessions or migrator identity |
| PostgreSQL migration authority | non-caller migrator | `tab_migrator` with bounded `BYPASSRLS` | page/MCP caller access |
| PostgreSQL authority | grants, RLS, constraints | caller roles and forced RLS | application-only imitation |
| Browser-only state | handwritten client/view | selection and overlay geometry | canonical database data |
| Verification | Stackpress verification phase | fresh tests and report review | source-only readiness claims |

## Smallest Safe Foundation Order

1. Scaffold the app and register one PostgreSQL resource during `config`.
2. Install the versioned Tabular system schema with transactional, idempotent migrations.
3. Add caller identity mapping and deny-default capability policy.
4. Add catalog discovery and stable reconciliation before mutations.
5. Add read/edit/draft capability envelopes and page/MCP adapters.
6. Add collision-safe unstructured storage, then owner-approved DDL and view
   publication through a separate migration role.
7. Add imports, outbox, workers, observability, and recovery.
8. Re-run the accepted browser contract and production-target verification.
