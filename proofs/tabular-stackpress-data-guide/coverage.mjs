export const DATA_FEATURES = [
  ['D-001', 'catalog-system-schema', 'guide', 'Catalog-driven tables/views and read-only identity policy.'],
  ['D-002', 'catalog-system-schema', 'demonstrated', 'Version 1 to 2 transactional migration, rollback, and idempotent re-entry.'],
  ['D-003', 'catalog-reconciliation', 'demonstrated-with-prior-evidence', 'P-002 rename drift plus Frozen Spec 00001 P-007 rename/drop/type reconciliation.'],
  ['D-004', 'unstructured-promotion', 'demonstrated', 'Collision-safe install, edit/copy/export, failed promotion rollback, and successful promotion.'],
  ['D-005', 'identity-capabilities', 'guide-with-target-validation', 'Role membership/ownership publication gate, deny-default policy, grants/RLS, redaction; production identity remains a target recheck.'],
  ['D-006', 'query-concurrency', 'demonstrated-with-prior-evidence', 'Single/no-key and expected-version checks plus Frozen Spec 00001 P-007 composite-key proof.'],
  ['D-007', 'saved-views', 'domain-demonstrated-visible-gap', 'Allowlisted definition compilation, owning-role publication, and security-invoker view; visible controls remain open.'],
  ['D-008', 'ddl-relations', 'demonstrated-with-prior-evidence', 'Generated/cross-schema FK fixture plus Frozen Spec 00001 P-007 composite/dependency proof.'],
  ['D-009', 'export', 'demonstrated', 'CSV is produced from the same caller-authorized filter/sort query as the grid read.'],
  ['D-010', 'jobs-outbox', 'domain-demonstrated-visible-gap', 'Idempotent enqueue, safe claim, capped retry/dead letter, committed outbox claim/completion; visible admin state remains open.'],
  ['D-011', 'mcp-frontend-contract', 'guide-with-target-validation', 'Structured page/MCP adapters deny raw SQL/DDL and share a versioned capability contract; production MCP transport remains a target recheck.'],
  ['D-012', 'production-translation', 'target-validation', 'Server pools, identity, external races/services, workers, AT, deployment, backup, and rollback remain explicit rechecks.']
].map(([id, chapter, status, evidence]) => ({ id, chapter, status, evidence }));

const browserBackings = {
  'W-001': 'tabular.discover', 'W-002': 'tabular.discover', 'W-003': 'tabular.discover',
  'W-004': 'tabular.discover', 'W-005': 'tabular.capabilities', 'W-006': 'route/view adapter',
  'W-007': 'browser-only layout', 'W-008': 'tabular.table.create', 'W-009': 'tabular.metadata.rename',
  'W-010': 'tabular.metadata.identity', 'W-011': 'tabular.table.settings', 'W-012': 'tabular.read-window',
  'W-013': 'browser logical selection', 'W-014': 'tabular.action', 'W-015': 'tabular.field-registry',
  'W-016': 'tabular.edit', 'W-017': 'tabular.column.create', 'W-018': 'tabular.format-metadata',
  'W-019': 'tabular.presentation.capacity', 'W-020': 'tabular.batch-edit', 'W-021': 'tabular.action.undo',
  'W-022': 'tabular.error-translation', 'W-023': 'tabular.draft.save', 'W-024': 'tabular.layout.validate',
  'W-025': 'tabular.presentation.reorder', 'W-026': 'tabular.field-registry', 'W-027': 'route/view adapter',
  'W-028': 'tabular.column.settings', 'W-029': 'tabular.field-registry', 'W-030': 'native constraints',
  'W-031': 'tabular.ddl.plan', 'W-032': 'tabular.relation.create', 'W-033': 'browser-only command routing',
  'W-034': 'route/capability disposition', 'W-035': 'tabular.action', 'W-036': 'session presentation state',
  'W-037': 'presentation metadata/deferred', 'W-038': 'browser selection state', 'W-039': 'tabular.presentation.action',
  'W-040': 'tabular.presentation.action', 'W-041': 'tabular.presentation.action', 'W-042': 'tabular.presentation.action',
  'W-043': 'tabular.action', 'W-044': 'tabular.row.action', 'W-045': 'tabular.column.action',
  'W-046': 'browser-only overlay geometry', 'W-047': 'tabular.import', 'W-048': 'tabular.import.source',
  'W-049': 'tabular.import.provenance', 'W-050': 'tabular.import.stage', 'W-051': 'tabular.import.commit',
  'W-052': 'tabular.import.recover', 'W-053': 'tabular.read-window', 'W-054': 'browser logical selection',
  'W-055': 'surface adapter parity', 'W-056': 'browser-only overlay geometry', 'W-057': 'browser-only visual language',
  'W-058': 'negative capability inventory'
};

export const WIREFRAME_BACKING = Object.entries(browserBackings).map(([id, backing]) => ({
  id,
  backing,
  lane: backing.startsWith('browser-only') ? 'browser' :
    backing.includes('route/view') ? 'page-view' :
    backing.includes('session') ? 'configuration' :
    'runtime-capability'
}));

export const PRODUCTION_TRANSLATION = [
  ['PGlite SQL/catalog/transactions', 'Re-run against the target PostgreSQL server version.'],
  ['One cached PGlite resource', 'Use one checked-out pool client per transaction and prove release/reset.'],
  ['SET LOCAL ROLE in one process', 'Prove authenticated identity mapping, pool role reset, and failure cleanup.'],
  ['Single-process expected versions', 'Exercise concurrent workers, external writers, and external DDL races.'],
  ['Fixture Google-shaped import', 'Add live OAuth, Drive/Sheets download, source version recheck, and revocation.'],
  ['Browser accessibility tree', 'Run native VoiceOver and the accepted production browser matrix.'],
  ['Local jobs/outbox claiming', 'Run worker crash, multi-worker contention, metrics, alerts, and retention tests.'],
  ['Versioned transactional system migration', 'Prove target migration locking, deploy ordering, rollback, and idempotent rerun.'],
  ['Collision-safe hidden JSON installation', 'Exercise concurrent installers and external name creation with two connections.'],
  ['Owning-role publication gate', 'Recheck authenticated membership refresh and pool cleanup on allow/deny paths.'],
  ['Allowlisted shared query compiler', 'Recheck planner behavior, limits, cancellation, and grid/export parity at scale.'],
  ['Static deployment boundary', 'Choose host, secrets, build, migration, backup, and rollback operations later.']
].map(([provedHere, productionRecheck]) => ({ provedHere, productionRecheck }));
