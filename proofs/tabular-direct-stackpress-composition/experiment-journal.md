# Experiment Journal

## Retained

- One explicit Node HTTP bootstrap combines Ingest and Reactus.
- Reactus production `build()` and `serve()` paths are used rather than a fake
  renderer.
- One PGlite resource is adapted through Inquire and owns the Proof's
  transactional migration and capability work.
- The cookie contains only an opaque random session ID. Subject, database role,
  CSRF token, expiry, and activity timestamps remain server-side.
- Browser mutations require exact-origin and session-bound synchronizer tokens.
- Web and MCP-shaped adapters retain separate identity/validation policies while
  sharing the named capability.

## Changed During Research

- Reactus's default inline hydration-props substitution is not used for
  user/database-controlled strings. The server passes only allowlisted shell
  values; action JSON carries changing record data.
- lib Session remains only the cookie transport controller. PGlite-backed
  session records determine whether a cookie represents an active principal.
- lib EventEmitter is used only for same-process ownership. It is not a durable
  operation queue.

## Rejected

- Rewriting the old `stackpress/pglite` Proof and retaining its result label.
- Treating a parsed cookie as authenticated identity.
- Passing arbitrary table/record strings into Reactus hydration props.
- Using a static HTML page as evidence of Reactus build and hydration.
- Generating fixed stores or runtime-table models.
