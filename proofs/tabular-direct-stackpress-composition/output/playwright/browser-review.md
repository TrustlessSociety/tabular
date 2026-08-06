# P-001 browser review

Reviewed on 2026-08-01 with HeadlessChrome 150.0.0.0 through the Playwright CLI
against the proof's production-style Reactus build and Ingest server.

## Viewports

| Viewport | Evidence | Result |
| --- | --- | --- |
| Desktop | `p001-desktop-csrf-denial.png` | Invalid CSRF mutation was visibly denied with HTTP 403. |
| Desktop | `p001-desktop-authorized.png` | Authorized rename committed and rendered `Roadmap 2026`, version 2. |
| 390 x 844 | `p001-narrow-authorized.png` | Authorized state remained readable and operable. Document width was 390px with no horizontal overflow. |

## Browser ledger

- Hydrated heading: `Direct Stackpress libraries`.
- Expected browser error: one failed `POST /proof/rename` with HTTP 403 from
  the deliberate invalid-CSRF test.
- Unexpected console errors: 0.
- Console warnings: 0.
- The initial favicon 404 was removed by serving `/favicon.ico` as HTTP 204,
  then the clean-browser flow was repeated.
- Accessible snapshots exposed the page heading, login action, rename input,
  authorized and invalid-CSRF actions, persisted record, identity, and status
  messages using native controls or labelled regions.

## Human review boundary

These screenshots are evidence for reviewer acceptance; the proof does not
self-approve the visual result.
