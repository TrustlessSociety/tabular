# P-001 Direct-Library Composition Guidebook

This Proof answers whether Tabular can compose the focused Stackpress packages
without the umbrella `stackpress` package, Idea, generated stores, or built-in
auth/API/session/admin.

## What It Demonstrates

- Ingest owns Node HTTP routes and request/response adaptation.
- Reactus owns production page/client/style builds, server rendering, and
  hydration.
- Inquire plus PGlite owns SQL execution and transactions.
- A lib `EventEmitter` exposes the named `tabular.capability` seam.
- Tabular code owns migration history, repositories, identity/session/CSRF
  contracts, authorization checks, web/MCP mapping, startup, and cleanup.
- Reactus hydration props are restricted to an allowlisted shell bootstrap.
  User/database strings use JSON actions rather than the inline props script.

## Run

```bash
npm install
npm test
npm run serve -- --port 4173
```

Open `http://127.0.0.1:4173/proof` for the rendered workflow.

## Evidence Boundaries

- `proof-secret`, `Proof alice`, and `tabular_member` are labeled identity test
  doubles. They do not prove a live identity provider.
- Sessions are stored in PGlite and exercise rotation, expiry fields,
  revocation, opaque 256-bit IDs, and synchronizer CSRF tokens. Local HTTP omits
  `Secure`; production HTTPS must require it.
- PGlite proves programming and transaction composition only. Pool lifecycle,
  server roles, multi-connection races, and workers belong to P-002.
- The rendered page is architecture evidence, not the production Tabular UI.

## Result Artifacts

- `results.json`: automated evidence summary.
- `output/playwright/`: curated desktop and narrow screenshots plus browser
  review notes.
- `experiment-journal.md`: approaches retained and rejected.
- `production-translation.md`: responsibilities that production must retain.
