# Interfaces, Extensibility, And Operations

> Direction update (2026-07-24): generic workbook/cell terminology below is
> historical. Apply the reusable surface, event, job, and outbox patterns to
> real PostgreSQL table/schema operations and Tabular-owned drafts. See
> `postgresql-native-product-direction-findings.md`.

Access date: 2026-07-24.

This file completes R-011 and the operational part of R-008/R-012. It recommends
boundaries; it does not accept an external API or job dependency.

## Source Patterns

| Source | Evidence | Transferable conclusion |
| --- | --- | --- |
| NocoDB | Pinned [`AppHooksService`](https://github.com/nocodb/nocodb/blob/b464046cd489d31ffed515e149f351a42a433c5d/packages/nocodb/src/services/app-hooks/app-hooks.service.ts) defines a broad typed event catalog spanning data, metadata, imports, comments, webhooks, integrations, and extensions. | A stable domain event vocabulary is useful, but event emission alone is not delivery, authorization, or durability. |
| Grist | Pinned [`DocApi.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/server/lib/DocApi.ts) applies viewer/editor/owner middleware before table and action APIs. [`WebhookQueue.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/server/lib/WebhookQueue.ts) has bounded FIFO delivery, Redis backup, retries, overflow, and statistics. Custom widgets declare `none`, `read table`, or `full` access in [`CustomWidget.ts`](https://github.com/gristlabs/grist-core/blob/e9b287491d6aea9600d1c495fdf240dde84400cb/app/common/CustomWidget.ts). | External surfaces and embedded extensions require explicit scope, resource policy, queueing, and failure visibility. |
| Baserow | Pinned webhook [`registries.py`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/backend/src/baserow/contrib/database/webhooks/registries.py) schedules delivery after transaction commit. [`tasks.py`](https://github.com/baserow/baserow/blob/bc8c5e825c4a8cf95197284f99e611ed709d832e/backend/src/baserow/contrib/database/webhooks/tasks.py) bounds per-webhook queues, serializes calls, retries with backoff, records calls, and disables repeated failures. Its app startup registers action, field, view, formula, exporter, webhook, and plugin types. | Registry extensibility and durable work are separate; extensions should contribute typed definitions while jobs enforce execution policy. |
| Stackpress | Accepted context defines named events as shared capabilities and pages/API/MCP/CLI/desktop/plugins as adapters with distinct caller policy. The local API webhook listener sends directly during an event and does not establish an outbox/durable retry contract. | Use Stackpress for trusted plugin and surface composition, then add application-owned capability, outbox, job, and parity contracts. |

## First-Boundary Surface Matrix

| Surface | Recommended first disposition | Reason |
| --- | --- | --- |
| Custom web grid | Required | Primary staff workflow; needs bespoke window/edit/clipboard behavior |
| Generated admin | Required only for safe fixed control models | Useful for membership/config/job support, not direct generic cells |
| Import UI | Required | Preview, warnings, acknowledgement, retry, commit, and abandon are accepted flow |
| Internal named events | Required | One capability authority for page and future adapters |
| Realtime invalidation | Required, post-commit and filtered | Keeps active grids current without making delivery canonical |
| Public/general REST API | Deferred | Not implied by import; P-005 proved the page/API parity baseline, and any later adapter must satisfy the same contract |
| Webhooks/automation | Deferred, outbox-ready only | Delivery policy, secrets, scopes, retries, and replay need a separate product decision |
| MCP/AI tools | Deferred | Qdrant/AI are later and cell data may be sensitive |
| CLI spreadsheet operations | Operator-only diagnostics/migrations if later needed | CLI caller policy differs from staff product access |
| Desktop/offline | Deferred | Browser/server product is the current boundary |
| User-authored plugins/code | Deferred | Requires sandbox, trust, permissions, resource limits, versioning, and review |
| Trusted deploy-time Stackpress plugin | Allowed | Application code under normal review and deployment authority |
| CSV/XLSX export | Recommend a later cutover-safety decision | Useful escape hatch, but fidelity and product scope were not accepted |

No generated cell model listener should be automatically exposed through API or
MCP. Future adapters call the same application capability but retain their own
identity, scopes, rate limits, serialization, and audit fields.

## Extensibility Layers

1. **Framework/deploy-time extension:** trusted Stackpress plugins, config,
   events, adapters, and custom pages. This is available now.
2. **Application feature registry:** trusted definitions for formula functions,
   import parsers, format codecs, view types, or exporters. Registrations are
   versioned and server-owned; they do not execute workbook-provided code.
3. **User automation/extension:** future-only sandbox with manifests, requested
   capabilities, resource limits, secrets, lifecycle/version policy, audit,
   review, and kill switch.

Do not confuse a registry entry with permission to invoke it, and do not model
future user extensions as arbitrary Stackpress plugins running in-process.

## Background Work

Application-owned durable jobs are required for:

- Google/XLSX/CSV extraction, validation, staging, and cleanup;
- large formula dependency recomputation;
- snapshot/compaction and retention work;
- attachment inspection/storage when later enabled;
- export generation when later enabled;
- outbox delivery, retries, and dead-letter handling.

Direct cell edits may synchronously recompute a small bounded dependency closure.
When thresholds are exceeded, commit the source edit and dependency invalidation,
mark affected results `recalculating`, then enqueue a versioned job. A stale job
must not overwrite a newer formula/revision.

Every job records tenant/resource, type/version, input digest, idempotency key,
requested actor, status/progress, attempt, lease/heartbeat, timestamps, error,
result/report locator, and cancellation policy. Job execution is deny-default
and resource-scoped even when the queue is private.

## Transaction And Side-Effect Rule

```text
transaction:
  canonical mutation
  action/delta
  redacted audit
  outbox record
commit
worker:
  claim outbox/job
  deliver/recompute
  record attempt/result
```

This rule applies to realtime invalidation, future webhooks, emails, indexing,
and heavy recomputation. Delivery is at-least-once unless a destination offers a
stronger contract; consumers use event/action IDs for deduplication.

## Operational Layers

| Layer | Minimum research recommendation |
| --- | --- |
| Application recovery | Per-action deltas, scoped undo, workbook snapshots, authorized restore |
| Database recovery | PostgreSQL backups and tested PITR; separate from product restore |
| Source recovery | Retain original import object/digest and fidelity report under an accepted retention policy |
| Observability | Request/action/job/import IDs; structured errors; query/window latency; batch size; conflicts; formula queue/fan-out; outbox lag; import warning counts |
| Security | Secret isolation, SSR snapshot minimization, audit redaction, permission-filtered reads/events, unsafe formula/link/attachment handling |
| Deployment | One PostgreSQL transaction resource per operation; explicit worker lifecycle; migrations separate from record revisions |

Stackpress supplies mechanisms for config, PostgreSQL transactions, events,
sessions, rendering, and adapters. It does not currently guarantee the target's
job system, outbox, tracing, default-deny resource policy, or record history.

## Rejected Transfers

- invoking network webhooks inside the canonical edit transaction;
- treating an in-memory event listener as a durable job;
- exposing every named event to every configured surface;
- running user spreadsheet code in trusted application process;
- relying on client-hidden controls for authorization;
- reusing schema revisions as workbook history;
- placing secrets or unnecessary session/request data in hydrated props;
- allowing failed side effects to roll back an already-valid canonical edit.

## Proof Reconciliation

P-005 proved shared page/API capability invocation, caller propagation,
deny-default policy, PostgreSQL role/RLS enforcement, and redacted audit
behavior. P-006 proved the retained value-only import transaction, idempotency,
failure, and recovery contract. P-003 is deferred with formula compatibility to
a later spec. Exact queue/vendor selection and production workload sizing
belong in a later approved implementation spec.
