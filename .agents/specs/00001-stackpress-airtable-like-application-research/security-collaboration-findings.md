# Security, Collaboration, And History Findings

> Direction update (2026-07-24): interpret workbook/sheet scopes in this
> historical comparison as connection/database/schema/table scopes where
> applicable. PostgreSQL roles, grants, ownership, constraints, triggers, and
> RLS remain authoritative; Tabular policy may narrow but never widen them.
> See `postgresql-native-product-direction-findings.md`.

Access dates: core comparison 2026-07-24; Mathesar refresh 2026-07-31

This pass compares revision-pinned NocoDB, Grist Core, Baserow, PostgreSQL 18,
and the local Stackpress knowledge base. It answers the research portion of
G-007 and G-008. Product roles, sharing policy, retention, and Proof
learning remain unaccepted for shared context. P-004 and P-005 later proved
their bounded technical contracts.

## Source Evidence

| Source | Observed boundary | Target implication |
| --- | --- | --- |
| Mathesar | The current [user guide](https://docs.mathesar.org/latest/user-guide/) and [access-control guide](https://docs.mathesar.org/latest/user-guide/access-control/) keep business data in PostgreSQL and assign each collaborator a PostgreSQL role. Current documentation and source search at `0c05987885c93cdbe5bf9f7fa49b833d02a312cc` expose no structured audit/history retention setting; [backup/restore issue #2698](https://github.com/mathesar-foundation/mathesar/issues/2698) remains open. | Mathesar imposes no evidenced 365-day product policy. Closest alignment leaves PostgreSQL/pgAudit retention to operators and limits Tabular records to its own feature events. This is an inference from the current documented/repository surface, not an explicit Mathesar guarantee. |
| NocoDB | [`acl.ts`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nocodb/src/utils/acl.ts) separates organization, workspace, and base scopes and maps operations to roles. [`views.service.ts`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nocodb/src/services/views.service.ts) adds resource ownership and locked/personal-view checks after coarse ACL checks. [`audit.ts`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nocodb/src/utils/audit.ts) records actor, request, tenant, resource, operation, and shared-view context while masking sensitive properties. | Keep role names separate from named capabilities. Enforce both scoped capability and resource-state rules on the server. Audit share provenance without retaining secrets. |
| NocoDB | [`types.ts`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nocodb/src/command-registry/types.ts) models typed, versioned operations, inverse commands, snapshots, replay, and user/tab/scope undo logs. The pinned [`useUndoRedo.ts`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nc-gui/composables/useUndoRedo.ts) disables its UI path. | The command model is useful evidence, but the pinned revision does not prove a finished end-user undo experience. |
| Grist Core | [`ACLRuleCollection.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/common/ACLRuleCollection.ts) uses deny-oriented fallbacks and owner-only protection for access rules and full copies. [`GranularAccess.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/server/lib/GranularAccess.ts) authorizes initial user actions and their expanded document actions before persistence, then filters what each client may receive. | Deny on missing/broken policy. Authorize both requested intent and expanded effects; never treat filtered UI state as authorization. |
| Grist Core | [`Sharing.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/server/lib/Sharing.ts) serializes document changes, records action and undo information in the transaction, and broadcasts after commit. [`ActionHistory.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/server/lib/ActionHistory.ts) separates local-unsent, local-sent, and shared action branches. [`AuditEvent.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/server/lib/AuditEvent.ts) keeps security/operational audit distinct from document action history. | Serialize the authoritative mutation, preserve client-linked action history, and publish only committed changes. Keep audit, editable history, and recovery as separate records. |
| Baserow | [`permissions-guide.md`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/docs/technical/permissions-guide.md) defines actor + operation + context checks, hierarchical scopes, query filtering, backend authority, and deny when no manager decides. Enterprise scoped roles in [`permission_manager.py`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/enterprise/backend/src/baserow_enterprise/role/permission_manager.py) are feature/license gated. | Use one central operation/context authorization vocabulary and permission-filtered query paths. Learn from enterprise role structure without assuming it is reusable or required. |
| Baserow | [`undo-redo-guide.md`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/docs/technical/undo-redo-guide.md) and [`handler.py`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/backend/src/baserow/core/action/handler.py) use typed actions, serialized parameters, user/session/scope histories, locks, atomic action groups, and redo invalidation after a later normal action. [`rows/models.py`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/backend/src/baserow/contrib/database/rows/models.py) records before/after row values tied to an action UUID. | Per-user session/scope undo is a viable first interaction model. Undo must re-enter current authorization and transaction rules; redo cannot assume history stayed unchanged. |
| Baserow | [`ws/rows/signals.py`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/backend/src/baserow/contrib/database/ws/rows/signals.py) publishes row/history messages with `transaction.on_commit`. Public-view websocket signals can be disabled in [`ws/signals.py`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/backend/src/baserow/contrib/database/ws/signals.py). Enterprise [`audit_log/models.py`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/enterprise/backend/src/baserow_enterprise/audit_log/models.py) persists actor, workspace, action, command type, parameters, timestamp, and IP. | Realtime delivery follows commit and is not canonical truth. Anonymous sharing expands both authorization and realtime attack surface. Audit capability and licensing must be designed explicitly. |
| PostgreSQL 18 | [Row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html) is default-deny only after RLS is enabled and no policy applies; owners normally bypass it, while `FORCE ROW LEVEL SECURITY` covers owners. Superusers and `BYPASSRLS` roles still bypass it. | RLS can reinforce tenant isolation, but it cannot replace application capability checks. Connection roles, owner behavior, policy races, and tests are part of the design. |
| PostgreSQL 18 | [Read Committed](https://www.postgresql.org/docs/18/transaction-iso.html) can apply a write to a concurrently updated row. Repeatable Read/Serializable failures require a [complete application transaction retry](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html). [PITR](https://www.postgresql.org/docs/18/continuous-archiving.html) restores a whole cluster to a time from a base backup plus WAL. | Use an explicit expected-version predicate for user edits and deliberate retries for transactional conflicts. PITR is operator disaster recovery, not workbook history or user undo. |
| Stackpress | At pinned local revision `a71d683051ba8350fdd12d6b5a33f268fdcc285f`, `architecture-and-composition.md` says named events do not automatically provide caller authorization, transactions, or public exposure. `00013-session-language-contracts.md` says client checks are UX-only, empty session access is allow-all, and guest failures inherit guest permissions. `00010-sql-api-contracts.md` supplies transactions but says generated schema revisions are not live data history. | Stackpress supplies identity/permission matching, named capability events, and SQL transactions. The application must own deny-by-default policy, tenant/resource checks, caller propagation, action history, audit, and edit revisions. |

## Research Answer For G-007

### Tenancy And Role Boundary

Recommended first model, pending user acceptance:

1. Use `workspace -> workbook -> sheet` as the authorization hierarchy.
2. Treat departments as membership/group metadata, not separate schemas or
   implicit tenants.
3. Require authenticated workspace membership for the first boundary, then
   apply optional workbook grants.
4. Define role bundles only as conveniences over named capabilities such as
   `workbook.read`, `workbook.share`, `cell.update`, `comment.create`,
   `history.read`, and `history.restore`.
5. Keep exact role names and grants open. A small owner/admin/editor/viewer
   option is preferable to importing a competitor's role matrix, but comment,
   sharing, import, export, and recovery rights must be decided separately.

### Enforcement Boundary

Each entry surface should supply an authenticated caller and surface identifier
to the same application-owned capability event. That event should:

1. resolve actor, workspace membership, workbook grant, and resource state;
2. deny when no explicit rule allows the operation;
3. permission-filter reads as well as checking mutations;
4. authorize any expanded effects before the transaction commits;
5. execute the canonical mutation and action/audit append atomically;
6. publish a filtered invalidation/change event only after commit.

PostgreSQL RLS is a defense-in-depth option for tenant-bearing tables. It
requires a bounded Proof because application connections may own tables or use a
role that bypasses RLS, and policy lookups can introduce concurrency races.

### Sharing Boundary

Recommend authenticated internal sharing for the first usable cutover. Anonymous
or public links remain deferred until the user accepts:

- token scope, hashing, expiry, revocation, and rotation;
- view-only versus comment/write behavior;
- share-specific query and websocket filtering;
- audit attribution without logging the token;
- download/export and formula/error exposure rules.

### Audit Boundary

Audit should be append-only and distinct from editable workbook history. A
minimum event envelope should carry actor, workspace, surface, capability,
resource IDs, request/action/idempotency ID, base/result revision, outcome,
timestamp, and a redacted change summary. IP and user-agent belong only when
the company's privacy and retention policy accepts them. Secrets, raw tokens,
passwords, and unrestricted cell contents do not belong in generic audit data.

## Research Answer For G-008

### Mutation And Concurrency

The recommended first boundary is optimistic concurrency plus post-commit
realtime invalidation:

- each editable cell or record carries an expected version;
- each committed workbook action receives a monotonic sequence or revision;
- an update predicate includes identity, tenant, and expected version;
- a stale overlapping edit fails visibly instead of silently overwriting;
- non-overlapping edits may commit independently;
- multi-cell actions commit atomically or return an explicit conflict;
- websocket/SSE delivery reports committed results and never acts as storage.

Use PostgreSQL row locks for server transaction integrity where needed, but do
not substitute an internal lock for a client-visible conflict contract.
Serializable transactions, when selected for an invariant, need bounded full
transaction retries and idempotent external side effects.

### History And Undo

Use a durable action record plus cell/row deltas:

- actor, surface, scope, action type, base/result revision, and timestamp;
- changed stable cell IDs with before/after values and formula/format state;
- action-group and optional client/session identifiers;
- inverse or compensating operation metadata;
- links to audit and import provenance by ID, without conflating the records.

The first undo model should be per actor, session/tab, and workbook scope.
Undo must recheck current permission and revision state. If another action has
changed the same target, the system should surface a conflict or create an
explicit restore-as-new-change action; it must not blindly erase another user's
later work. A later normal action invalidates the simple redo chain.

### Recovery Layers

1. User recovery: action history and explicit restore/undo.
2. Workbook recovery: periodic application snapshots plus action replay, if
   retention/volume evidence justifies them.
3. Operator recovery: tested PostgreSQL backups and PITR.

PITR restores an entire cluster, not one workbook, and therefore cannot be the
product's user-facing recovery mechanism. Snapshot cadence, action retention,
audit retention, and single-workbook restore workflow remain user/operations
decisions.

## Stackpress Ownership

| Classification | Responsibility |
| --- | --- |
| Native | Signed session identity, route/event permission patterns, named events, parameterized SQL, transactions, and multi-surface adapters |
| Stackpress adaptation | Explicit non-empty session policy, caller/surface envelope, transaction/retry helper, and post-commit publication convention |
| Application-owned | Workspace/workbook membership, capability map, object/query authorization, share grants, edit versions, action history, audit, undo, snapshots, and filtered collaboration events |
| PostgreSQL-owned defense | Constraints, expected-version update predicate, selected row locks/isolation, optional tested RLS, durable transactions, backups, and PITR |
| Unresolved framework gap | No universal event visibility, authorization, transaction, audit, or record-history registry; generated schema revisions are not spreadsheet edit history |

## Rejected Or Deferred Patterns

- UI-only authorization and client `can()` checks.
- Empty Stackpress session access for a protected product.
- A role string without operation/context and query enforcement.
- Silent last-write-wins for overlapping edits.
- Broadcasting before the database commit.
- Treating schema migrations, audit logs, WAL, or PITR as user undo.
- Blindly reversing a change after another actor modified the same target.
- Anonymous public sharing in the first boundary.
- Full CRDT/offline-first collaboration before P-004 establishes a need.
- Direct reuse of license-gated competitor RBAC/audit code.

## Remaining Decisions And Proof Boundary

- G-007 research is answered; the user still owns exact roles/capabilities,
  public-sharing disposition, audit visibility, and retention.
- G-008 research is answered; the user still owns the required collaboration
  experience, undo/history retention, and recovery objectives.
- G-019 has a research option but no accepted role model.
- P-004 proved expected-version conflicts, action history, permission-aware
  undo/redo, post-commit publication, and bounded reconstruction.
- P-005 proved page/API named-capability parity, deny-default application
  policy, PostgreSQL grants/RLS enforcement, role reset, and redacted audit
  within its one-process runtime limit.
