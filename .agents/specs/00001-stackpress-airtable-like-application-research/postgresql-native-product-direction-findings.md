# PostgreSQL-Native Product Direction Findings

Access date: 2026-07-24.

This file records R-020 and the user-accepted direction change from a generic Google-Sheets replacement toward a friendlier PostgreSQL table editor. It is research-only and does not authorize implementation.

> Closeout note: the Frozen [product contract](../../context/tabular-product-contract.md) and [final synthesis](final-synthesis.md) incorporate later Proof and grill decisions and supersede this 2026-07-24 snapshot wherever they differ.

Source material is preserved in the [Mathesar-like direction and FRUI inspiration packet](../../resources/2026-07-24-mathesar-frui-direction.md).

## Direction

The current product baseline is:

> A spreadsheet interface for creating and working with real PostgreSQL
> databases.

Mathesar is the closest conceptual baseline. Tabular should retain direct
PostgreSQL behavior while improving the first-use, schema-authoring, data-entry,
and error-recovery experience.

This supersedes the earlier recommendation that every sheet use canonical
generic cell rows. A Tabular spreadsheet now maps to a real PostgreSQL table;
headers map to real columns; completed rows map to real records; and relations
map to real foreign keys. Stackpress Idea generation remains for stable
application/control models and is not run for every user-created table.

## Competitor Pattern Disposition

| Source | Retain | Do not inherit |
| --- | --- | --- |
| Mathesar | Direct PostgreSQL schemas/tables/permissions; simplified type categories; optional access to exact PostgreSQL details | Database-oriented setup friction and rough primary UI |
| Supabase Studio | Staged inserts/updates/deletes, diff review, and one transactional commit | Developer-dashboard vocabulary as the default experience |
| NocoDB | Spreadsheet grid, record drawer, typed editors, saved views, and revision visibility | Immediate inline persistence and broad Airtable/platform scope |
| Directus | Separate storage schema, input interface, display format, validation, and conditions | CMS-first collection/item vocabulary and multi-step field configuration |
| Baserow | Familiar grid, paste/import, row identity reconciliation, views, and approachable field choices | Application builder, automation breadth, and synchronization as the canonical write model |
| Stackpress/FRUI | Independent field/input and output-format families | Build-time Idea generation or FRUI component names as the runtime user-table schema |

## Primary Interaction Contract

1. A file-first explorer is the staff-facing entry path: Acme Inc. → folder → file. Folders are organization only, not PostgreSQL database or schema boundaries.
2. New file opens a blank, renameable spreadsheet directly. In a live product, that file maps to a real PostgreSQL table; its PostgreSQL identifier derives from the title until Table settings explicitly overrides it.
3. The always-visible header surface represents columns, not a data row.
4. Double-clicking an empty header asks only for a name and creates a draft text column.
5. The header context menu exposes semantic field selection, required/default/
   unique rules, and progressive advanced PostgreSQL configuration.
6. Clicking a body cell starts or resumes a draft record.
7. A draft becomes a real row only after required inputs are present and the database accepts the insert.
8. Existing tables can be opened without conversion into a proprietary data model.

Schema mutations should be explicit actions with a preview or recoverable
revision boundary. The UI may make the common path feel immediate, but it must
not hide destructive casts, dropped constraints, or incompatible existing
values.

## Four Independent Column Axes

Tabular should not collapse all column behavior into one `type` property.

| Axis | Owns | Examples |
| --- | --- | --- |
| Storage type | Real PostgreSQL representation | `text`, `numeric`, `boolean`, `date`, `timestamptz`, foreign key |
| Field type | How a user enters or selects a value | text, email, price, switch, select, relation |
| Format type | How a stored value is rendered | plain text, currency, link, yes/no, relative date, tags |
| Constraint policy | What the database and draft validator permit | required, unique, default, check, reference |

The field choice provides safe storage and format defaults. Advanced users may
change the PostgreSQL type or format independently when the combination remains
valid.

## Recommended First Field Registry

| Field type | Default PostgreSQL shape | Default format | Notes |
| --- | --- | --- | --- |
| Text | `text` | Plain text | Default for a newly named column |
| Long text | `text` | Wrapped or clipped text | Same storage, different editor/display |
| Email | `text` plus validation | Email link | Validation policy must be explicit |
| URL | `text` plus validation | Link | Do not fetch or preview automatically |
| Phone | `text` | Phone link | Preserve punctuation and leading zeroes |
| Number | `numeric` | Number | Advanced integer/decimal/precision choices |
| Price | `numeric` plus currency metadata | Currency | Currency is presentation metadata unless a later money model is accepted |
| Switch | `boolean` | Yes/no | Toggle editor; configurable labels may be metadata |
| Select | `text` plus check or lookup | Label/badge | Native PostgreSQL enum is an advanced option, not the default |
| Date | `date` | Date | Locale-sensitive format metadata |
| Date and time | `timestamptz` | Date/time | Time zone policy must be explicit |
| Time | `time` | Time | No implied date |
| Relation | Foreign key | Related-record label | Searchable record picker |
| Computed | Generated column | Type-compatible format | Read-only immutable same-row expression |

The initial registry deliberately stays smaller than FRUI. Color, country,
rating, tags, JSON, Markdown, code, files, images, lists, and rich text are
candidate later field/editor types. Their presence in FRUI is inspiration, not
automatic first-release scope.

## Recommended First Format Registry

`plain`, `clipped`, `wrapped`, `number`, `currency`, `link`, `email-link`,
`phone-link`, `yes-no`, `date`, `date-time`, `relative-time`, `label`, `badge`,
and `related-record`.

Later candidates include color swatch, tags, Markdown, code/JSON, image,
rating, collection/list, and template output. Formatters are display-only: they
must not silently mutate the stored value.

Tabular owns the registry vocabulary and compatibility rules. A later React
adapter may render a registry entry with FRUI, another component set, or a
custom cell editor without changing the PostgreSQL schema contract.

## Persistent Draft Record Model

Incomplete input should not create partially valid rows in the target table.
A Tabular-owned system schema can hold drafts with:

```text
draft ID
target database/schema/table identity
new-row or existing-row target identity
actor and session
JSON value patch keyed by stable column identity
base row version for updates
validation state and cell errors
draft revision
created/updated/expiry timestamps
```

Promotion is one transaction:

1. resolve the current target schema;
2. apply defaults and generated-column rules;
3. validate required and semantic field rules;
4. attempt the real PostgreSQL insert or update;
5. translate constraint errors back to cells;
6. record action/audit history and clear or mark the draft committed;
7. publish changes only after commit.

The database remains the final validator. Draft validation improves feedback
but cannot replace constraints, triggers, permissions, or row-level security.

## Saved Views And Metadata

Keep filter, sort, group, hidden columns, visual order, widths, frozen columns,
format overrides, and personal/shared scope as Tabular metadata. They do not
rewrite the PostgreSQL table. An explicit later action may publish a compatible
saved view as a real PostgreSQL view.

## First Product Boundary

Keep:

- file/folder exploration with friendly labels, list/grid views, scoped search,
  and progressive PostgreSQL identity in settings rather than primary
  database/schema/table navigation;
- grid-first schema and record editing;
- semantic field and format registries;
- PostgreSQL-native computed fields;
- progressive PostgreSQL details;
- a direct blank-file flow and a values-only, new-file-only CSV/XLSX/Google
  Sheets import with preview;
- relations through foreign keys and record pickers;
- persistent drafts, constraint translation, and action history;
- direct SQL/database access outside Tabular.

Retain as pending product-policy and later UX work, not as approved wireframe
requirements:

- saved grid views; and
- a row detail drawer.

Defer:

- Kanban, calendar, gallery, dashboards, and application builders;
- automations, webhooks, plugins, public APIs, and AI;
- anonymous/public sharing;
- multiple database engines;
- full PostgreSQL administration such as backups, replication, vacuum, and
  extension management;
- spreadsheet formula compatibility, which is assigned to a later spec.

## Impact On Earlier Research

- The generic cell-row recommendation in `domain-capability-model.md`,
  `postgresql-storage-comparison.md`, and the earlier final synthesis is
  historical evidence, not the current target.
- P-001 in its original form is invalidated. P-007 later proved the bounded
  direct-table, metadata, draft, drift, constraint, and permission contract.
- P-002 later proved the reframed table/key/column grid contract.
- P-004 and P-005 later proved the reframed revision and authorization
  boundaries.
- P-003 is deferred to a later formula spec. The value-only P-006 proof passed.

## Later Resolutions

1. G-026 is accepted: current imports preserve exact values only; formula
   compatibility belongs to a separate later spec.
2. G-027's low-friction registry is accepted; policy-gated families belong to
   a separate later spec.
3. G-028's direction is accepted and its bounded technical contract was
   verified by P-007.
4. Q-001 through Q-016 accepted the PostgreSQL-native authority, hierarchy, saved-view, collaboration, operations, governed MCP, unstructured-cell, and complete first-slice boundaries.
