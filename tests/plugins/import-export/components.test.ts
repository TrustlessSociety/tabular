//node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

//client
import type {
  ImportMapping,
  ImportPreview,
  ImportWarning,
  ImportWizardProps
} from '../../../src/plugins/import-export/components/import-wizard.js';
import { ImportWizard } from '../../../src/plugins/import-export/components/import-wizard.js';

/**
 * Return the no operation result.
 */
const noOperation = () => undefined;

const mappings: ImportMapping[] = [
  ['customer', 'Customer', 'text', 'Text', 'text'],
  ['email', 'Email', 'email', 'Email', 'text'],
  ['status', 'Status', 'select', 'Select', 'text + check'],
  ['total', 'Total', 'price', 'Price', 'numeric'],
  ['paid', 'Paid', 'checkbox', 'Checkbox', 'boolean'],
  ['ordered-at', 'Ordered at', 'date-time', 'Date and time', 'timestamptz']
].map(([id, sourceColumn, field, label, storage]) => ({
  id,
  sourceColumn,
  field,
  fieldOptions: [{ value: field, label }, { value: 'text', label: 'Text' }],
  storage
}));

const preview: ImportPreview = {
  columns: ['Customer', 'Email', 'Status', 'Total', 'Paid', 'Ordered at'],
  rows: [
    ['Northstar Market', 'ap@northstar.co', 'Processing', '1,280.00', 'true', '2026-07-24 10:32'],
    ['Harbor Goods', 'orders@harborgoods.ph', 'Ready', '845.50', 'false', '2026-07-24 09:18']
  ]
};

const warnings: ImportWarning[] = [
  {
    id: 'cached-formulas',
    title: '3 formula cells use cached values.',
    detail: 'Their formula definitions will not be imported.',
    count: 3
  },
  {
    id: 'date-tokens',
    title: '2 date tokens need confirmation.',
    detail: 'They are displayed using the source token and inferred value.',
    count: 2
  }
];

const baseProps: ImportWizardProps = {
  step: 'choose-source',
  folderLabel: 'Operations',
  selectedSource: 'csv',
  source: {
    kind: 'csv',
    name: 'Q3-orders.csv',
    rowCount: 248,
    columnCount: 6,
    sizeLabel: '38 KB',
    metadata: '248 rows · header row detected · UTF-8'
  },
  sourceAvailability: {
    'google-sheets': {
      disabled: true,
      reason: 'Google credentials are unavailable in this environment.'
    }
  },
  mappings,
  preview,
  warnings,
  identity: {
    fileName: 'Q3 orders',
    tableName: 'q3_orders',
    folderId: 'operations'
  },
  folderOptions: [{ id: 'operations', label: 'Operations' }],
  summary: {
    records: '248 exact-value rows',
    columns: '6 mapped fields',
    warnings: '5 attributable items'
  },
  targetQualifiedName: 'operations.q3_orders',
  status: { kind: 'ready' },
  onSelectSource: noOperation,
  onChooseFile: noOperation,
  onConnectGoogle: noOperation,
  onMappingChange: noOperation,
  onIdentityChange: noOperation,
  onFolderChange: noOperation,
  onBack: noOperation,
  onCancel: noOperation,
  onNext: noOperation,
  onImport: noOperation,
  onRetry: noOperation,
  onCancelImport: noOperation,
  onOpenImportedTable: noOperation,
  onBackToFiles: noOperation
};

/**
 * Renders a controlled wizard state without adding a browser runtime.
 */
function renderWizard(overrides: Partial<ImportWizardProps>) {
  return renderToStaticMarkup(createElement(ImportWizard, { ...baseProps, ...overrides }));
}

test('choose-source is an exact semantic one-time values-only step', () => {
  const html = renderWizard({ step: 'choose-source' });

  assert.match(html, /aria-label="Import progress"/);
  assert.match(html, /aria-current="step"[^>]*><span[^>]*>1<\/span><span>Choose source<\/span>/);
  assert.equal(html.match(/type="radio"/g)?.length, 3);
  assert.match(html, /type="radio" name="import-source" checked="" value="csv"/);
  assert.match(html, /type="radio" disabled=""[^>]*name="import-source" value="google-sheets"/);
  assert.match(html, /Google credentials are unavailable in this environment/);
  assert.match(html, /type="file" accept="\.csv,text\/csv" name="import-source-file"/);
  assert.match(html, /class="import-source-icon"[\s\S]*?data-icon="file-spreadsheet"/);
  assert.match(html, /class="import-wizard-notice-icon"[\s\S]*?data-icon="warning"/);
  assert.match(html, />Q3-orders\.csv</);
  assert.match(html, />CSV · 248 rows · 6 columns · 38 KB</);
  assert.match(html, /Values only\./);
  assert.match(html, /Tabular will not keep the source synchronized/);
  assert.match(html, />Cancel<\/button>/);
  assert.match(html, />Preview values<\/button>/);
});

test('preview exposes all mappings, exact sample tokens, warnings, and recoverable Back', () => {
  const html = renderWizard({ step: 'preview-values' });

  assert.match(html, /aria-current="step"[^>]*><span[^>]*>2<\/span><span>Preview values<\/span>/);
  assert.match(html, />Preview values and fields</);
  assert.equal(html.match(/name="mapping-/g)?.length, 6);
  assert.match(html, />Customer<\/th>/);
  assert.match(html, />Ordered at<\/th>/);
  assert.match(html, />Northstar Market<\/td>/);
  assert.match(html, />1,280\.00<\/td>/);
  assert.match(html, /aria-label="Import warnings"/);
  assert.match(html, /data-icon="warning"/);
  assert.match(html, /3 formula cells use cached values/);
  assert.match(html, /2 date tokens need confirmation/);
  assert.match(html, />Back<\/button>/);
  assert.match(html, />Review import<\/button>/);
});

test('source-shape errors never claim values are ready or enable review', () => {
  const html = renderWizard({
    step: 'preview-values',
    canContinue: false,
    warnings: [{
      id: 'row-width',
      title: 'CSV row has 3 fields; expected 2',
      detail: 'This issue must be resolved before import.',
      count: 1
    }]
  });

  assert.doesNotMatch(html, />Values ready</);
  assert.match(html, /<button type="button" class="import-button import-button-primary" disabled="">Review import<\/button>/);
  assert.match(html, /CSV row has 3 fields; expected 2/);
});

test('mapping errors expose a stable focus target and a linked inline alert', () => {
  //Attach the server-attributed failure to one source column so the rendered
  //control must become both the focus target and the error owner.
  const errorMappings = mappings.map((mapping, index) => index === 0
    ? { ...mapping, error: '3 values: Expected an integer token.' }
    : mapping);
  const html = renderWizard({
    step: 'preview-values',
    mappings: errorMappings,
    status: {
      kind: 'error',
      title: '3 values need attention',
      message: 'Choose a compatible PostgreSQL field type for the highlighted source column.'
    }
  });

  //The stable mapping ID is the exact target ImportPage focuses after failed
  //validation, while aria-describedby associates the attributable message.
  assert.match(
    html,
    /<select id="mapping-customer"[^>]*aria-invalid="true"[^>]*aria-describedby="mapping-customer-error"/
  );
  assert.match(
    html,
    /<small id="mapping-customer-error" role="alert">3 values: Expected an integer token\.<\/small>/
  );
  assert.match(html, /<select id="mapping-email"[^>]*aria-invalid="false"/);
});

test('import review preserves identity order and the actual schema-qualified target', () => {
  const html = renderWizard({ step: 'import' });

  assert.match(html, /aria-current="step"[^>]*><span[^>]*>3<\/span><span>Import<\/span>/);
  assert.match(html, />Ready to import</);
  assert.match(
    html,
    /<span>File name<\/span><input[^>]*name="import-file-name"[\s\S]*<span>Table name<\/span><input[^>]*name="import-table-name"[\s\S]*<span>Folder<\/span><select[^>]*name="import-folder"/
  );
  assert.match(html, />248 exact-value rows</);
  assert.match(html, />6 mapped fields</);
  assert.match(html, />5 attributable items</);
  assert.match(html, />operations\.q3_orders<\/strong>/);
  assert.match(html, /class="import-database-icon"[\s\S]*?data-icon="database"/);
  assert.doesNotMatch(html, /public\.q3_orders|Department/);
  assert.match(html, />Import values<\/button>/);
});

test('error, progress, success, and cancellation stay explicit and recoverable', () => {
  const error = renderWizard({
    step: 'preview-values',
    status: {
      kind: 'error',
      title: '2 mappings need attention',
      message: 'Choose a field for each highlighted source column, then retry the preview.'
    }
  });
  assert.match(error, /role="alert"/);
  assert.match(error, /2 mappings need attention/);
  assert.match(error, />Back<\/button>/);
  assert.match(error, />Revise mapping<\/button>/);

  const progress = renderWizard({
    step: 'import',
    status: {
      kind: 'progress',
      message: 'Preparing exact-value rows',
      completedRows: 124,
      totalRows: 248,
      cancelable: true
    }
  });
  assert.match(progress, /<progress aria-label="Import progress" max="248" value="124"><\/progress>/);
  assert.match(progress, />124 of 248 rows prepared</);
  assert.match(progress, />Cancel import<\/button>/);

  const finishing = renderWizard({
    step: 'import',
    status: {
      kind: 'progress',
      message: 'Committing one transaction',
      completedRows: 248,
      totalRows: 248,
      cancelable: false
    }
  });
  assert.match(finishing, /Finishing import/);
  assert.match(finishing, /disabled="" title="The transaction is finishing and can no longer be canceled\."/);

  const success = renderWizard({
    step: 'import',
    status: {
      kind: 'success',
      title: '248 records imported',
      message: 'The new table is ready in Operations.'
    }
  });
  assert.match(success, />Open imported table<\/button>/);
  assert.match(success, /class="import-result-icon"[\s\S]*?data-icon="success"/);
  assert.match(success, />Back to files<\/button>/);

  const canceled = renderWizard({
    step: 'import',
    status: {
      kind: 'canceled',
      title: 'Import canceled',
      message: 'No table was created. Your reviewed source is still available.'
    }
  });
  assert.match(canceled, /No table was created/);
  assert.match(canceled, /class="import-result-icon"[\s\S]*?data-icon="canceled"/);
  assert.match(canceled, />Start a new import<\/button>/);
  assert.match(canceled, />Back to files<\/button>/);
});

test('responsive styles preserve the bounded 1040 and 390 pixel layouts', () => {
  const css = readFileSync(new URL('../../../public/styles/import.css', import.meta.url), 'utf8');

  assert.match(css, /@media \(max-width: 1040px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /\.import-preview-wrap[\s\S]*overflow: auto/);
  assert.match(css, /\.import-wizard-panel-footer,[\s\S]*flex-direction: column/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /transition:\s*all|outline:\s*none/);
});
