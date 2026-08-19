# Playwright acceptance suite

The specs in `tests/acceptance/playwright` exercise public browser behavior:
authentication, session revocation, file discovery, view preferences, import
entry, live spreadsheet rendering, command menus, activity, and a narrow
viewport smoke path.

Run the headless suite from the project root:

```sh
npx playwright install chromium
npm run test:acceptance
```

By default Playwright starts `npm run dev` on `127.0.0.1:3100`. That process uses
the disposable in-memory PGlite dataset and the documented local-review login.
No PostgreSQL service is required and the database disappears when the run
ends.

To test an already running deployment that contains the same demo acceptance
dataset, provide its exact origin and visible login credentials. When an
external origin is supplied, the suite does not start a local server:

```sh
TABULAR_PLAYWRIGHT_BASE_URL=https://tabular.example \
TABULAR_ACCEPTANCE_USERNAME=reviewer \
TABULAR_ACCEPTANCE_PASSWORD=secret \
npm run test:acceptance
```

Use `npm run test:acceptance:headed` for interactive debugging. Failure traces,
screenshots, and videos are written to the git-ignored `test-results` folder.
