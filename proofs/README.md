# Spec 00001 Proofs

These isolated prototypes execute the active Proof queue for Spec 00001. They
are evidence, not production application code.

## Runtime

- Node.js
- Stackpress `0.10.8`
- Stackpress-supported PGlite with PostgreSQL `17.5` semantics
- Playwright CLI for the P-002 rendered-browser pass

Install and run:

```bash
cd proofs
npm install
npm test
```

Run the P-002 browser surface separately with `npm run serve:p002`, then use
the Playwright CLI commands recorded in the spec result ledger.

The local Docker daemon was available, but acquiring a PostgreSQL 18 image was
blocked by Docker Desktop's credential helper. These proofs therefore do not
claim server-based PostgreSQL 18, network, or multi-process behavior.
