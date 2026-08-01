import { DATA_FEATURES, PRODUCTION_TRANSLATION, WIREFRAME_BACKING } from './coverage.mjs';

const labels = {
  'catalog-system-schema': 'Catalog + system schema',
  'catalog-reconciliation': 'Stable identity + drift',
  'unstructured-promotion': 'Unstructured promotion',
  'identity-capabilities': 'Identity + capabilities',
  'query-concurrency': 'Query + concurrency',
  'saved-views': 'Saved + shared views',
  'ddl-relations': 'DDL + relations',
  export: 'Authorized export',
  'jobs-outbox': 'Jobs + outbox',
  'mcp-frontend-contract': 'MCP + frontend contract',
  'production-translation': 'Production translation'
};

document.querySelector('#coverage').innerHTML = DATA_FEATURES.map((feature) => `
  <article title="${feature.evidence}"><span>${feature.id}</span><strong>${labels[feature.chapter]}</strong><small>${feature.status.replaceAll('-', ' ')}</small></article>
`).join('');
document.querySelector('#coverage-summary').textContent = `${DATA_FEATURES.length} data contracts · ${WIREFRAME_BACKING.length} wireframe backings · no unmapped IDs`;
document.querySelector('#translations').innerHTML = PRODUCTION_TRANSLATION.map((row) => `
  <tr><td>${row.provedHere}</td><td>${row.productionRecheck}</td></tr>
`).join('');

try {
  const response = await fetch('./results.json', { cache: 'no-store' });
  const result = await response.json();
  const proved = result.signals && Object.values(result.signals).every(Boolean);
  const open = result.openFeatureIds?.length ?? 0;
  document.body.dataset.evidence = proved ? 'proved' : 'pending';
  document.querySelector('#run-state').textContent = proved
    ? `${Object.keys(result.signals).length} executable signals passed${open ? ` · ${open} visible gaps retained` : ''}`
    : 'Evidence incomplete';
  document.querySelector('#captured-at').textContent = `Automated evidence ${new Date(result.capturedAt).toLocaleString()}`;
} catch {
  document.body.dataset.evidence = 'pending';
  document.querySelector('#run-state').textContent = 'Run proof:p102';
}
