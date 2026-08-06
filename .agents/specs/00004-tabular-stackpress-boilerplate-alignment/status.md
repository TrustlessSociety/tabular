# Status

## Current State

- Spec state: **Proposed 2026-08-06**
- Freeze state: Not Frozen
- User direction: Preserve the boilerplate-alignment work in a new spec
- Current implementation authority: Frozen Spec 00003
- Research state: Initial local comparison complete; focused lifecycle,
  dependency-isolation, and UnoCSS research remains
- Proof state: User-provided guide artifact recorded; one Tabular-specific
  composition Proof proposed
- Decision state: Direct imports, page/build, Provider, `plugins/ui`, and UnoCSS
  ownership are resolved; lifecycle and closeout details remain open
- Implementation plan: Not created; task planning waits for Freeze
- Context promotion: Skipped; no new direction is accepted reusable truth yet
- User journeys: Not applicable at this stage because product behavior must not
  change

## Work Items

| Work item | Status | Next action |
| --- | --- | --- |
| Create and route Spec 00004 | Complete 2026-08-06 | Keep manifest and index current |
| Preserve user direction and source provenance | Complete 2026-08-06 | Keep later corrections synchronized |
| Compare proof and current structure | Updated 2026-08-06 | Finish lifecycle and dependency research |
| Replace reject map with an explicit change contract | Complete 2026-08-06 | Use D-004 through D-009 |
| Resolve proof structure and page/build interpretation | Complete 2026-08-06 | Preserve D-004 through D-007 |
| Decide the future of `plugins/ui` | Complete 2026-08-06 | Remove it through D-010 |
| Verify lifecycle ordering and process-specific phases | Open | Complete R-002 and P-002 |
| Define the exact Provider browser projection | Complete 2026-08-06 | Prove accepted D-008 in P-002 |
| Define bounded static/artifact delivery | Complete 2026-08-06 | Prove D-009 in P-002 |
| Set UnoCSS and conventional CSS ownership | Complete 2026-08-06 | Complete R-003 and prove D-011 |
| Define fresh verification and acceptance gates | Open | Resolve G-007 and G-008 |
| Run context-promotion review | Pending | Run before Freeze |
| Freeze Spec 00004 | Blocked | Resolve all Freeze blockers |
| Create implementation task plan | Not started | Use task workflow only after Freeze |

## Freeze Blockers

- G-003: Which lifecycle phases execute for build, development, web, worker,
  migrator, doctor, and preflight processes?
- G-007: What exact automated gates must pass after each structural wave?
- G-008: Which fresh browser and production-target evidence is required before
  implementation closeout?
- P-002 must be proved, failed with an accepted fallback, or explicitly
  deferred before Freeze.
- Context promotion must be reviewed before Freeze.

## Non-Blockers

- Accepted product behavior and user journeys do not need rediscovery.
- The focused direct-package selection is already authoritative Context.
- Existing PostgreSQL, identity, session, CSRF, migration, worker, and MCP
  boundaries remain inherited requirements rather than new research questions.
- The proof does not need to become production-complete; its role can remain a
  source-shape guide if P-002 validates the Tabular-specific translation.

## Next Authority Gate

Complete lifecycle/UnoCSS source research and P-002, then resolve the G-007
verification matrix and G-008 acceptance evidence before Freeze.
