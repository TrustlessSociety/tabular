import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createDatabase, closeDatabase, one } from '../lib/database.mjs';
import { writeEvidence } from '../lib/evidence.mjs';
import { EXPECTED_WIREFRAME_IDS, FEATURE_EVIDENCE } from './coverage.mjs';
import { LogicalSelectionModel } from './logical-selection.mjs';
import {
  BrowserGuideService,
  normalizeIdentifier,
  setupBrowserGuide
} from './service.mjs';

const sourceFiles = [
  'index.html', 'app.js', 'style.css',
  'r003.html', 'r003.js', 'r003.css', 'logical-selection.mjs'
];

test('P-001 feature manifest covers every accepted wireframe ID with source anchors', async () => {
  assert.equal(FEATURE_EVIDENCE.length, 58);
  assert.deepEqual(
    FEATURE_EVIDENCE.map((entry) => entry.id),
    EXPECTED_WIREFRAME_IDS
  );
  assert.equal(new Set(FEATURE_EVIDENCE.map((entry) => entry.id)).size, 58);
  const source = (
    await Promise.all(sourceFiles.map((file) => readFile(new URL(file, import.meta.url), 'utf8')))
  ).join('\n');
  for (const entry of FEATURE_EVIDENCE) {
    assert.match(source, new RegExp(entry.sourceAnchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(entry.automatedCheck);
    assert.match(entry.status, /^(blocking|guide|demonstrated|demonstrated-with-prior-evidence)$/);
    assert.ok(entry.evidence);
  }
});

test('R-003 logical selection survives virtual unmounts and order changes', () => {
  const rowIds = Array.from({ length: 1000 }, (_, index) => `row-${index + 1}`);
  const columnIds = Array.from({ length: 10 }, (_, index) => `column-${index + 1}`);
  const selection = new LogicalSelectionModel(rowIds, columnIds);

  selection.selectRange('row-2', 'column-2', 'row-900', 'column-5');
  const selected = selection.snapshot();
  assert.equal(selected.cellCount, 3596);
  assert.deepEqual(selected.anchor, { rowId: 'row-2', columnId: 'column-2' });
  assert.deepEqual(selected.focus, { rowId: 'row-900', columnId: 'column-5' });
  assert.equal(selection.project(rowIds.slice(890, 910)).length, 40);
  assert.equal(rowIds.slice(890, 910).includes(selected.anchor.rowId), false);

  selection.setOrder(rowIds, [
    'column-1', 'column-5', 'column-2', 'column-3', 'column-4',
    'column-6', 'column-7', 'column-8', 'column-9', 'column-10'
  ]);
  assert.deepEqual(selection.snapshot().anchor, selected.anchor);
  assert.deepEqual(selection.snapshot().focus, selected.focus);
  assert.equal(selection.snapshot().cellCount, 1798);

  const mixed = selection.presentationState((rowId, columnId) =>
    rowId === 'row-2' && columnId === 'column-2');
  assert.deepEqual(mixed, { pressed: 'mixed', disabled: false });

  selection.selectRow('row-500');
  assert.equal(selection.snapshot().kind, 'row');
  assert.equal(selection.snapshot().cellCount, 10);
  selection.selectColumn('column-3');
  assert.equal(selection.snapshot().kind, 'column');
  assert.equal(selection.snapshot().cellCount, 1000);
});

test('P-001 PGlite explorer, editing, drafts, reordering, presentation, and import', async () => {
  const db = await createDatabase();
  try {
    await setupBrowserGuide(db);
    const service = new BrowserGuideService(db);

    const hierarchy = await service.hierarchy();
    assert.equal(hierarchy.connection.label, 'Acme Inc.');
    assert.deepEqual(hierarchy.schemas.map((schema) => schema.label), ['Operations', 'Finance']);
    const operations = await service.files('operations');
    assert.equal(operations.length, 5);
    assert.equal(operations[0].column_count >= 0, true);

    assert.equal(normalizeIdentifier('Q3 orders'), 'q3_orders');
    const renamed = await service.renameFile('customer-orders', 'Customer Orders July');
    assert.equal(renamed.table_name, 'customer_orders_july');
    const settings = await service.updateTableSettings('customer-orders', {
      displayName: 'Customer Orders',
      folder: 'operations',
      tableName: 'ops_orders'
    });
    assert.equal(settings.table_name, 'ops_orders');
    const renamedAgain = await service.renameFile('customer-orders', 'Orders 2026');
    assert.equal(renamedAgain.table_name, 'ops_orders');

    const initial = await service.state('customer-orders');
    const invalid = await service.editCell(
      'customer-orders',
      '1',
      'email',
      'not-an-email',
      initial.records[0].version
    );
    assert.equal(invalid.status, 'invalid');
    assert.equal(invalid.token, '#VALUE!');
    const unchangedEmail = await one(
      db,
      'SELECT email FROM operations.customer_orders WHERE id = 1'
    );
    assert.equal(unchangedEmail.email, 'ap@northstar.co');

    const committed = await service.editCell(
      'customer-orders',
      '1',
      'email',
      'new@northstar.co',
      initial.records[0].version
    );
    assert.equal(committed.status, 'committed');
    assert.equal(committed.version, initial.records[0].version + 1);
    const undone = await service.undo('customer-orders');
    assert.equal(undone.status, 'undone');
    const afterUndo = await one(
      db,
      'SELECT email FROM operations.customer_orders WHERE id = 1'
    );
    assert.equal(afterUndo.email, 'ap@northstar.co');
    const redone = await service.redo('customer-orders');
    assert.equal(redone.status, 'redone');
    const afterRedo = await one(
      db,
      'SELECT email FROM operations.customer_orders WHERE id = 1'
    );
    assert.equal(afterRedo.email, 'new@northstar.co');

    const draft = await service.editCell('customer-orders', 'draft-1001', 'status', 'Ready');
    assert.equal(draft.status, 'draft-invalid');
    assert.match(draft.errors.order_id, /required/);
    assert.match(draft.errors.customer, /required/);

    const reordered = await service.reorderColumn('customer-orders', 'future_h', 2);
    assert.deepEqual(reordered.gaps, [2]);
    const restored = await service.reorderColumn('customer-orders', 'future_h', 8);
    assert.deepEqual(restored.gaps, []);

    const presentation = await service.setPresentation('customer-orders', {
      zoom: 125,
      frozenRows: 1,
      viewMode: 'grid'
    });
    assert.equal(presentation.zoom, 125);
    assert.equal(presentation.frozenRows, 1);
    const capacity = await service.addRows('customer-orders', 250);
    assert.equal(capacity.logicalRows, 1250);

    const rangePlan = await service.prepareRangeAction(
      'customer-orders',
      'clear',
      ['record:1', 'record:2'],
      ['customer', 'email']
    );
    assert.equal(rangePlan.status, 'planned');
    assert.equal(rangePlan.cell_count, 4);
    assert.equal(rangePlan.rowCount, 2);
    assert.equal(rangePlan.columnCount, 2);
    const storedRangePlan = await one(
      db,
      `SELECT operation, row_ids, column_ids, cell_count, status
       FROM tabular.selection_action_plans WHERE id = $1`,
      [rangePlan.id]
    );
    assert.deepEqual(storedRangePlan.row_ids, ['record:1', 'record:2']);
    assert.deepEqual(storedRangePlan.column_ids, ['customer', 'email']);
    assert.equal(storedRangePlan.status, 'planned');

    const updatedColumn = await service.updateColumn('customer-orders', 'status', {
      label: 'Order status',
      fieldType: 'select',
      formatType: 'badge',
      required: true,
      uniqueValues: false,
      pgName: 'Order Status',
      storageType: 'text',
      options: ['Processing', 'Ready', 'Shipped', 'Cancelled']
    });
    assert.equal(updatedColumn.pg_name, 'status');
    assert.equal(updatedColumn.config.proposedPgName, 'order_status');
    assert.deepEqual(updatedColumn.config.options, ['Processing', 'Ready', 'Shipped', 'Cancelled']);

    const blank = await service.createBlankFile('operations');
    assert.equal(blank.display_name, 'Untitled File');
    const blankState = await service.state(blank.id);
    assert.equal(blankState.records.length, 0);
    assert.equal(blankState.columns.every((column) => column.field_type === 'text'), true);

    const imported = await service.importValues({
      sourceKind: 'csv',
      fileName: 'Q3 orders',
      tableName: 'q3_orders',
      folder: 'operations'
    });
    assert.equal(imported.status, 'committed');
    assert.equal(imported.importedRows, 248);
    const importedState = await service.state(imported.file.id);
    assert.equal(importedState.columns.filter((column) => column.label).length, 6);
    assert.equal(importedState.records.length, 40);
    assert.equal(importedState.records[0].display.order_id, 'Q3-001');
    const importRun = await one(
      db,
      `SELECT state, warnings, fingerprint FROM tabular.import_runs
       WHERE id = 'import-q3-orders'`
    );
    assert.equal(importRun.state, 'committed');
    assert.equal(importRun.warnings.length, 1);

    const summary = await service.actionSummary('customer-orders');
    assert.equal(summary.total >= 4, true);
    for (let index = 0; index < 105; index += 1) {
      await service.recordAction(
        'customer-orders',
        'presentation',
        { fileId: 'customer-orders', state: { zoom: 100 + index } },
        { fileId: 'customer-orders', state: { zoom: 99 + index } }
      );
    }
    const boundedHistory = await service.actionSummary('customer-orders');
    assert.equal(boundedHistory.total, 100);

    let browser = {
      status: 'pending',
      required: 'Fresh Playwright desktop and narrow interaction evidence.'
    };
    try {
      browser = JSON.parse(await readFile(new URL('./browser-results.json', import.meta.url), 'utf8'));
    } catch {
      // Browser verification is a separate command-backed pass.
    }

    const blockingFeatureIds = FEATURE_EVIDENCE
      .filter((entry) => entry.status === 'blocking')
      .map((entry) => entry.id);
    await writeEvidence(new URL('./results.json', import.meta.url).pathname, {
      proof: 'Spec 00002 P-001',
      disposition: browser.status === 'proved' ? 'proved-with-open-gaps' : 'inconclusive',
      database: '@electric-sql/pglite 0.3.15',
      stackpress: '0.10.8 (ownership research; browser service is intentionally framework-neutral)',
      featureCoverage: FEATURE_EVIDENCE,
      blockingFeatureIds,
      automatedSignals: {
        completeWireframeIdManifest: true,
        pgliteBackedExplorer: true,
        identityOverrideBoundary: true,
        invalidValuePreservedAsDraft: true,
        committedEditUsesExpectedVersion: true,
        currentSessionUndoRedoAnd100StepBound: true,
        incompleteRowDraftListsRequiredColumns: true,
        interiorColumnGapDetectedAfterReorder: true,
        sessionPresentationStateExplicit: true,
        columnAxesRemainIndependent: true,
        blankFileCreatesNoNamedColumns: true,
        importCreatesNewTableTransactionally: true,
        logicalSelectionSurvivesVirtualUnmountAndOrderChange: true,
        rangeActionTargetsPersistedInPGlite: true
      },
      browser
    });
  } finally {
    await closeDatabase(db);
  }
});
