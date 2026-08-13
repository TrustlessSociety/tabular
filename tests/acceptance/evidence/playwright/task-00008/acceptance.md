# Task 00008 acceptance

Status: passed.

The final proof ran the real local Stackpress web process against a freshly reset disposable PostgreSQL 18.4 database in a fresh Playwright browser. It used 1440 x 900 desktop and 390 x 844 narrow viewports. The retained proof template contains no session secrets; disposable credentials were materialized only into a mode-0600 file under `/tmp`.

## Browser proof

- Unauthenticated grid access returned `401 invalid_session`; authenticated mutations carried the session, exact origin, and CSRF token.
- Three native PostgreSQL rows mounted without a warmed asset cache. Exact decimal, price, switch, date-time, generated-value, and linked email/URL/phone output passed across all ten accepted fields.
- A PostgreSQL check-constraint rejection showed bounded, non-overlapping cell and row explanations, retained raw input in a persistent draft, recovered both the raw value and stored database issue after reload, and promoted the corrected value.
- A new-row draft projected errors only onto the two failing composite-relation cells. A delayed-create unit proof confirmed rapid corrections serialize behind one draft creation and reuse its current handle/version.
- A deliberately aborted `record.patch` produced `#ERROR!`, retained the raw value, and safely abandoned the persistent draft on Cancel.
- One contiguous rectangular range supported scalar copy/paste and fill; selection survived rerender, undo, and redo.
- Insert, server defaults, atomic relation tuple correction, delete confirmation, complete-row undo/redo, post-delete selection, dialog focus trap, and Escape focus restoration passed.
- Text/default/required, display rename, number, select options, and generated read-only column flows passed through review, explicit owner confirmation, and the separate migrator.
- A keyless target was rejected. The accepted composite relation explicitly mapped non-adjacent source columns to `crm.customers(tenant_id, customer_code)`, used independent picker/output templates, hydrated an existing reference outside the first 50 choices, remotely searched beyond that page, excluded an RLS-restricted customer from typed search, and refreshed after a live target-label edit.
- Blank desktop and narrow grids supported inline header naming before column settings. Advanced settings started collapsed, panel focus was contained, and Escape restored the originating header.
- A reader-role schema change returned the actionable owning-role denial while retaining the populated form.
- At 390 px, primary editing passed, document/body width stayed exactly 390 px, and the full-height column panel and action stayed inside the viewport.
- DOM audit found no duplicate IDs, unnamed buttons, or unnamed links. Unexpected browser/runtime signals: none.

## PostgreSQL audit

- All six DDL requests reached `applied`: four creates, one configure, and one relation create. The relation target contained 61 rows, including 60 owner-visible choices and one RLS-restricted row.
- Final row count remained three after insert/delete/undo/redo. Quantities were `7`, `6`, and `6`; exact unit price remained `7.250000000000000000`.
- The live composite constraint was `FOREIGN KEY (customer_tenant, customer_code) REFERENCES crm.customers(tenant_id, customer_code)`.
- Journal evidence included direct/range edits, persistent draft actions, promotion/deletion, row deletion, undo, and redo.
- Draft cleanup ended with zero active drafts, two promoted drafts, and one deliberately abandoned network-failure draft.

## Regression verification

- `npm run verify`: passed 70/70 tests, type checking, production builds, artifact and architecture guards, built runtime verification, and all three entrypoint checks.
- Focused PostgreSQL 18 suites passed for Task 00004 history/concurrency semantics and Task 00008 native grid editing.

## Retained screenshots

- `grid-desktop.png`
- `field-matrix-desktop.png`
- `invalid-draft-desktop.png`
- `draft-recovered-desktop.png`
- `range-draft-desktop.png`
- `delete-confirmation-desktop.png`
- `relation-ineligible-desktop.png`
- `relation-impact-desktop.png`
- `permission-denied-desktop.png`
- `blank-header-desktop.png`
- `grid-narrow.png`
- `column-settings-narrow.png`
- `blank-header-narrow.png`

Machine-readable results are in `acceptance-result.json`; the executable retained template is `acceptance-proof.mjs`.
