import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { server } from 'stackpress/http';
import { connect } from 'stackpress/pglite';
import { createDatabase, closeDatabase, one, rows } from '../lib/database.mjs';
import { writeEvidence } from '../lib/evidence.mjs';
import {
  DATA_FEATURES,
  PRODUCTION_TRANSLATION,
  WIREFRAME_BACKING
} from './coverage.mjs';
import { createSurfaceAdapter, setupDataGuide, TabularKernel } from './service.mjs';

test('P-002 Stackpress capability and PGlite implementation guide', async () => {
  const db = await createDatabase();
  try {
    const engine = connect(db);
    const adapterCheck = await engine.query('SELECT current_database() AS name');
    assert.equal(adapterCheck.length, 1);
    assert.equal(engine.dialect.name, 'pgsql');

    await setupDataGuide(db);
    const kernel = new TabularKernel(db);
    const adapters = {
      page: createSurfaceAdapter('page', kernel),
      mcp: createSurfaceAdapter('mcp', kernel)
    };
    const app = server();
    let configured = false;
    let listening = false;
    app.on('config', async ({ ctx }) => {
      ctx.register('database', engine);
      configured = true;
    });
    app.on('listen', async (_event) => {
      app.on('tabular.capability', async ({ req, res }) => {
        const input = req.data.get();
        res.results(await adapters[input.surface](input));
      });
      listening = true;
    });
    await app.resolve('config');
    await app.resolve('listen');
    assert.equal(configured, true);
    assert.equal(listening, true);

    const invoke = async (surface, input) => (
      await app.resolve('tabular.capability', { ...input, surface })
    ).results;

    const systemVersion = await one(db, 'SELECT version FROM tabular.system_version');
    assert.equal(systemVersion.version, 1);
    await assert.rejects(
      kernel.migrateSystemSchema(2, { failAfterDdl: true }),
      /forced-migration-failure/
    );
    assert.equal((await one(db, 'SELECT version FROM tabular.system_version')).version, 1);
    assert.equal((await one(
      db,
      `SELECT count(*)::integer AS count FROM information_schema.columns
       WHERE table_schema = 'tabular' AND table_name = 'outbox'
         AND column_name = 'published_at'`
    )).count, 0);
    assert.deepEqual(await kernel.migrateSystemSchema(2), {
      status: 'migrated', from: 1, version: 2
    });
    assert.deepEqual(await kernel.migrateSystemSchema(2), { status: 'current', version: 2 });
    const initialReconcile = await kernel.reconcileObject('obj-orders-v1');
    assert.equal(initialReconcile.status, 'current');

    const pageDiscovery = await invoke('page', {
      actor: 'alice', operation: 'discover', resource: '*'
    });
    const mcpDiscovery = await invoke('mcp', {
      actor: 'alice', operation: 'discover', resource: '*'
    });
    assert.deepEqual(pageDiscovery, mcpDiscovery);
    assert.equal(pageDiscovery.objects.some((object) => object.stable_id === 'obj-orders-v1'), true);

    const pageRead = await invoke('page', {
      actor: 'alice', operation: 'read', resource: 'operations.orders'
    });
    const mcpRead = await invoke('mcp', {
      actor: 'alice', operation: 'read', resource: 'operations.orders'
    });
    assert.deepEqual(pageRead, mcpRead);
    assert.deepEqual(pageRead.rows.map((row) => row.id), [1, 3]);
    assert.equal(pageRead.rows[0].amount_with_tax, 14000);

    const applicationDenied = await invoke('page', {
      actor: 'charlie', operation: 'read', resource: 'operations.orders'
    });
    assert.deepEqual(applicationDenied, {
      status: 'denied', source: 'application-policy'
    });

    const committed = await invoke('page', {
      actor: 'alice', operation: 'edit', resource: 'operations.orders',
      target: { id: 1 }, expectedVersion: 1, value: 13000
    });
    assert.equal(committed.status, 'committed');
    assert.equal(committed.row.version, 2);
    assert.equal(committed.row.amount_with_tax, 14560);

    const stale = await invoke('mcp', {
      actor: 'alice', operation: 'edit', resource: 'operations.orders',
      target: { id: 1 }, expectedVersion: 1, value: 15000
    });
    assert.deepEqual(stale, { status: 'conflict', actualVersion: 2 });
    const rlsDenied = await invoke('mcp', {
      actor: 'bob', operation: 'edit', resource: 'operations.orders',
      target: { id: 1 }, expectedVersion: 2, value: 99999
    });
    assert.deepEqual(rlsDenied, { status: 'denied', source: 'postgresql-policy' });

    const drafted = await invoke('page', {
      actor: 'alice', operation: 'draft', resource: 'operations.orders',
      target: { id: 1 }, expectedVersion: 2,
      patch: { customer: '', amount: '-2' }
    });
    assert.equal(drafted.status, 'drafted');
    assert.equal(drafted.draft.state, 'invalid');
    assert.deepEqual(Object.keys(drafted.draft.errors).sort(), ['amount', 'customer']);
    const unchangedAfterDraft = await one(
      db,
      'SELECT customer, amount::float8 AS amount FROM operations.orders WHERE id = 1'
    );
    assert.equal(unchangedAfterDraft.customer, 'Northstar Market');
    assert.equal(unchangedAfterDraft.amount, 13000);

    assert.deepEqual(await kernel.identityPolicy('operations', 'orders'), {
      mode: 'editable', key: 'single', columns: ['id']
    });
    assert.deepEqual(await kernel.identityPolicy('operations', 'readonly_feed'), {
      mode: 'read-only', reason: 'no-stable-key'
    });

    const installed = await kernel.installUnstructuredColumn();
    assert.deepEqual(installed, {
      status: 'installed', column: '__tabular_v2_cells', collisionAvoided: true, version: 2
    });
    assert.equal((await one(
      db,
      `SELECT "__tabular_v1_cells" AS legacy FROM operations.orders WHERE id = 1`
    )).legacy, 'legacy-user-column');
    const unstructured = await invoke('page', {
      actor: 'alice', operation: 'unstructured-edit', resource: 'operations.orders',
      target: { id: 1 }, columnId: 'temporary_note', value: 'Call before delivery'
    });
    assert.equal(unstructured.status, 'committed');
    assert.equal(unstructured.row.cells.temporary_note, 'Call before delivery');
    assert.deepEqual(await kernel.copyUnstructured({
      actor: 'alice', target: { id: 1 }, columnId: 'temporary_note'
    }), { status: 'authorized', value: 'Call before delivery' });
    const unstructuredCsv = await kernel.exportUnstructuredCsv({
      actor: 'alice', columnId: 'temporary_note'
    });
    assert.equal(unstructuredCsv.rowCount, 2);
    assert.match(unstructuredCsv.csv, /^order_number,temporary_note\n/);
    assert.equal(unstructuredCsv.csv.includes('Call before delivery'), true);
    await assert.rejects(
      kernel.promoteUnstructured('temporary_note', 'customer'),
      /already exists/
    );
    assert.deepEqual(await kernel.copyUnstructured({
      actor: 'alice', target: { id: 1 }, columnId: 'temporary_note'
    }), { status: 'authorized', value: 'Call before delivery' });
    const promoted = await kernel.promoteUnstructured('temporary_note', 'notes');
    assert.equal(promoted.status, 'promoted');
    const afterPromotion = await one(
      db,
      `SELECT notes, "__tabular_v2_cells" AS cells
       FROM operations.orders WHERE id = 1`
    );
    assert.equal(afterPromotion.notes, 'Call before delivery');
    assert.equal('temporary_note' in afterPromotion.cells, false);

    const saved = await invoke('page', {
      actor: 'alice', operation: 'save-view', resource: 'operations.orders',
      name: 'Large orders', definition: { filters: [{ column: 'amount', op: 'ge', value: 5000 }], sort: ['amount:desc'] }
    });
    assert.equal(saved.status, 'saved');
    assert.equal(saved.view.visibility, 'private');
    assert.deepEqual(await kernel.publishView('alice', saved.view.id, 'orders_ready'), {
      status: 'denied', source: 'table-ownership'
    });
    assert.equal(await kernel.canPublishView('owner'), true);
    const published = await kernel.publishView('owner', saved.view.id, 'orders_ready');
    assert.equal(published.securityInvoker, true);
    assert.deepEqual(published.compiledDefinition, saved.view.definition);
    const viewOptions = await one(
      db,
      `SELECT c.reloptions FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'operations' AND c.relname = 'orders_ready'`
    );
    assert.equal(viewOptions.reloptions.includes('security_invoker=true'), true);
    const aliceSharedRows = await db.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE tab_alice');
      return rows(tx, 'SELECT id FROM operations.orders_ready ORDER BY id');
    });
    assert.deepEqual(aliceSharedRows.map((row) => row.id), [1]);

    const exported = await invoke('mcp', {
      actor: 'alice', operation: 'export', resource: 'operations.orders',
      query: { filters: [{ column: 'amount', op: 'ge', value: 5000 }], sort: ['amount:desc'] }
    });
    assert.equal(exported.rowCount, 1);
    assert.match(exported.csv, /^order_number,customer,amount\n/);
    assert.equal(exported.csv.includes('ORD-1049'), false);
    assert.equal(exported.csv.includes('ORD-1050'), false);

    const pageContract = await invoke('page', {
      actor: 'alice', operation: 'frontend-contract', resource: '*'
    });
    const mcpContract = await invoke('mcp', {
      actor: 'alice', operation: 'frontend-contract', resource: '*'
    });
    assert.deepEqual(pageContract, mcpContract);
    assert.equal(pageContract.contract.version, '1.0.0');
    assert.equal(pageContract.contract.arbitrarySql, false);
    assert.equal(pageContract.contract.arbitraryDdl, false);
    assert.equal(pageContract.contract.limits.maxRows, 40);
    assert.deepEqual(await adapters.mcp({ actor: 'alice', operation: 'read', sql: 'SELECT 1' }), {
      status: 'denied', source: 'arbitrary-database-input'
    });

    const staged = await kernel.stageImport({
      actor: 'alice', sourceKind: 'csv', fingerprint: 'sha256:q3-orders-v1',
      schemaName: 'operations', tableName: 'q3_import',
      rows: [{ value: '001' }, { value: 'Northstar' }],
      warnings: [{ coordinate: 'A1', code: 'leading-zero-preserved' }]
    });
    const restaged = await kernel.stageImport({
      actor: 'alice', sourceKind: 'csv', fingerprint: 'sha256:q3-orders-v1',
      schemaName: 'operations', tableName: 'q3_import',
      rows: [{ value: '001' }, { value: 'Northstar' }],
      warnings: [{ coordinate: 'A1', code: 'leading-zero-preserved' }]
    });
    assert.equal(restaged.run.id, staged.run.id);
    const importCommit = await kernel.commitImport(staged.run.id);
    assert.equal(importCommit.status, 'committed');
    assert.equal(importCommit.rows, 2);
    assert.deepEqual(await kernel.commitImport(staged.run.id), {
      status: 'already-committed', importId: staged.run.id
    });

    const job = await kernel.enqueueJob('import-report', { importId: staged.run.id });
    const duplicateJob = await kernel.enqueueJob('import-report', { importId: staged.run.id });
    assert.equal(duplicateJob.id, job.id);
    let claimed = await kernel.claimJob('worker-a');
    assert.equal(claimed.id, job.id);
    assert.equal((await kernel.failJob(job.id, 'failure-1')).state, 'ready');
    claimed = await kernel.claimJob('worker-b');
    assert.equal(claimed.attempts, 2);
    assert.equal((await kernel.failJob(job.id, 'failure-2')).state, 'ready');
    claimed = await kernel.claimJob('worker-c');
    assert.equal(claimed.attempts, 3);
    const dead = await kernel.failJob(job.id, 'failure-3');
    assert.equal(dead.state, 'dead');
    assert.equal(await kernel.claimJob('worker-d'), null);
    const outbox = await rows(db, 'SELECT topic, dedupe_key FROM tabular.outbox ORDER BY id');
    assert.equal(outbox.some((entry) => entry.topic === 'tabular.order.changed'), true);
    assert.equal(outbox.some((entry) => entry.topic === 'tabular.import.committed'), true);
    const claimedOutbox = await kernel.claimOutbox();
    assert.equal(claimedOutbox.state, 'publishing');
    const publishedOutbox = await kernel.completeOutbox(claimedOutbox.id);
    assert.equal(publishedOutbox.state, 'published');
    assert.equal(Boolean(publishedOutbox.published_at), true);

    const foreignKey = await one(
      db,
      `SELECT count(*)::integer AS count FROM pg_constraint
       WHERE conrelid = 'operations.orders'::regclass AND contype = 'f'`
    );
    assert.equal(foreignKey.count, 1);
    const generated = await one(
      db,
      `SELECT is_generated FROM information_schema.columns
       WHERE table_schema = 'operations' AND table_name = 'orders'
         AND column_name = 'amount_with_tax'`
    );
    assert.equal(generated.is_generated, 'ALWAYS');

    const beforeDrift = await kernel.reconcileObject('obj-orders-v1');
    assert.equal(beforeDrift.status, 'current');
    await db.exec('ALTER TABLE operations.orders RENAME COLUMN customer TO customer_name');
    const drift = await kernel.reconcileObject('obj-orders-v1');
    assert.equal(drift.status, 'drifted');
    assert.equal(drift.stableId, 'obj-orders-v1');
    assert.equal(drift.silentlyRebound, false);

    const identity = await one(db, 'SELECT current_user, session_user');
    assert.equal(identity.current_user, identity.session_user);
    const journal = await rows(
      db,
      `SELECT actor, surface, operation, outcome, request_digest, detail
       FROM tabular.journal ORDER BY id`
    );
    assert.equal(journal.length > 10, true);
    const journalText = JSON.stringify(journal);
    assert.equal(journalText.includes('Call before delivery'), false);
    assert.equal(journalText.includes('99999'), false);

    assert.equal(DATA_FEATURES.length, 12);
    assert.deepEqual(DATA_FEATURES.map((feature) => feature.id),
      Array.from({ length: 12 }, (_, index) => `D-${String(index + 1).padStart(3, '0')}`));
    assert.equal(DATA_FEATURES.every((feature) => feature.status && feature.evidence), true);
    assert.equal(WIREFRAME_BACKING.length, 58);
    assert.equal(new Set(WIREFRAME_BACKING.map((entry) => entry.id)).size, 58);
    assert.equal(PRODUCTION_TRANSLATION.length >= 8, true);

    let report = { status: 'pending', required: 'Fresh rendered guide report review.' };
    try {
      report = JSON.parse(await readFile(new URL('./browser-results.json', import.meta.url), 'utf8'));
    } catch {
      // Rendered guide verification is intentionally separate.
    }

    const openFeatureIds = DATA_FEATURES
      .filter((feature) => feature.status.includes('gap'))
      .map((feature) => feature.id);
    await writeEvidence(new URL('./results.json', import.meta.url).pathname, {
      proof: 'Spec 00002 P-002',
      disposition: report.status === 'proved' ? 'proved-with-visible-gaps' : 'inconclusive',
      runtime: {
        stackpress: '0.10.8',
        adapter: '@stackpress/inquire-pglite 0.10.8',
        pglite: '0.3.15',
        event: 'tabular.capability'
      },
      dataFeatureCoverage: DATA_FEATURES,
      openFeatureIds,
      wireframeBacking: WIREFRAME_BACKING,
      productionTranslation: PRODUCTION_TRANSLATION,
      signals: {
        actualStackpressPgliteAdapter: true,
        configListenLifecycle: true,
        noPerTableGeneratedModel: true,
        catalogStableIdentityAndDrift: true,
        denyDefaultAndForcedRls: true,
        pageMcpCapabilityParity: true,
        expectedVersionConflict: true,
        persistentInvalidDraft: true,
        systemSchemaUpgradeAndRollback: true,
        collisionSafeOwnerInstalledUnstructuredColumn: true,
        failedPromotionPreservesUnstructuredValues: true,
        unstructuredCopyAndExport: true,
        transactionalUnstructuredPromotion: true,
        generatedColumnAndCrossSchemaForeignKey: true,
        ownershipCheckedCompiledSecurityInvokerSharedView: true,
        authorizedCurrentResultCsvExport: true,
        idempotentImportCommit: true,
        idempotentJobsAndPostCommitOutboxDispatch: true,
        cappedRetryAndDeadLetter: true,
        versionedStructuredPageMcpContract: true,
        redactedJournal: true,
        roleResetObserved: true
      },
      report
    });
  } finally {
    await closeDatabase(db);
  }
});
