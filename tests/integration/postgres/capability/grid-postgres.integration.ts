//node
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import pg from 'pg';

//client
import type { StableCatalogSnapshot } from '../../../../src/plugins/catalog/helpers/contracts.js';
import type { CapabilityAction } from '../../../../src/plugins/capability/helpers/contracts.js';
import { startWeb } from '../../../../src/bootstrap/application.js';
import { reconcileCatalog } from '../../../../src/plugins/catalog/helpers/reconciliation.js';
import { runMigrations } from '../../../../src/plugins/database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../../../src/plugins/database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../../../src/plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../../src/plugins/database/migrations/index.js';
import { WebCapabilityAdapter } from '../../../../src/plugins/capability/events/web-adapter.js';
import { TestIdentityProvider } from '../../../plugins/identity/provider-double.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TEST_POSTGRES_URL;

/**
 * Assert the disposable target.
 */
function assertDisposableTarget(value: string | undefined): asserts value is string {
  assert.equal(
    process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
    'task00008-disposable',
    'TABULAR_TEST_POSTGRES_DISPOSABLE must explicitly authorize destructive test cleanup'
  );
  assert.ok(value, 'TABULAR_TEST_POSTGRES_URL is required');
  const target = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/tabular_task00008');
  assert.ok(target.port);
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
}

/**
 * Return the migration transaction result.
 */
function migrationTransaction(pool: ManagedPostgresPool) {
  return <Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
    withPostgreSqlTransaction(pool, {
      settings: {
        statement_timeout: '10000',
        lock_timeout: '10000',
        idle_in_transaction_session_timeout: '10000'
      }
    }, callback);
}

test('native PostgreSQL grid editing preserves typed values, authority, drafts, and history', {
  timeout: 180_000
}, async () => {
  assertDisposableTarget(connectionString);
  const admin = new Pool({ connectionString, max: 8, allowExitOnIdle: true });
  const migrator = new ManagedPostgresPool({
    name: 'task00008-migrator',
    connectionString,
    maximum: 2,
    applicationName: 'tabular-task00008-migrator'
  });
  let application: Awaited<ReturnType<typeof startWeb>> | undefined;
  let primaryFailure: unknown;
  const cleanupFailures: Error[] = [];
  try {
    const version = await admin.query(`
      SELECT current_setting('server_version_num')::integer AS number, version() AS label
    `);
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);
    await resetFixture(admin);
    await admin.query(`
      CREATE ROLE tabular_grid_member
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_grid_partial
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    `);
    const migrations = await loadMigrations();
    assert.deepEqual(await runMigrations(migrationTransaction(migrator), migrations), {
      applied: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
      total: 11
    });
    await admin.query(`
      CREATE SCHEMA crm;
      CREATE SCHEMA operations;
      CREATE TABLE crm.customers (
        tenant_id text NOT NULL,
        customer_code text NOT NULL,
        label text NOT NULL,
        owner_role name NOT NULL DEFAULT current_user,
        PRIMARY KEY (tenant_id, customer_code)
      );
      CREATE TABLE operations.orders (
        tenant_id text NOT NULL,
        order_id text NOT NULL,
        customer_tenant text NOT NULL,
        relation_note text NOT NULL DEFAULT 'preserved between relation keys',
        customer_code text NOT NULL,
        owner_role name NOT NULL DEFAULT current_user,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved')),
        quantity bigint NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
        unit_price numeric(38,18) NOT NULL DEFAULT 0,
        placed_on date NOT NULL DEFAULT DATE '2026-08-01',
        cutoff time without time zone NOT NULL DEFAULT TIME '09:30:00',
        starts_at timestamp with time zone NOT NULL DEFAULT TIMESTAMPTZ '2026-08-01T01:02:03Z',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        total numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
        PRIMARY KEY (tenant_id, order_id),
        FOREIGN KEY (customer_tenant, customer_code)
          REFERENCES crm.customers (tenant_id, customer_code)
          ON UPDATE NO ACTION ON DELETE NO ACTION
      );
      CREATE TABLE operations.blank_sheet (
        __tabular_row_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        __tabular_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        __tabular_row text COLLATE "C",
        value text
      );
      ALTER TABLE crm.customers ENABLE ROW LEVEL SECURITY;
      ALTER TABLE crm.customers FORCE ROW LEVEL SECURITY;
      CREATE POLICY customers_owner ON crm.customers
        USING (owner_role = current_user) WITH CHECK (owner_role = current_user);
      ALTER TABLE operations.orders ENABLE ROW LEVEL SECURITY;
      ALTER TABLE operations.orders FORCE ROW LEVEL SECURITY;
      CREATE POLICY orders_owner ON operations.orders
        USING (owner_role = current_user) WITH CHECK (owner_role = current_user);
      INSERT INTO crm.customers (tenant_id, customer_code, label, owner_role) VALUES
        ('acme', 'cust-001', 'Ada Industries', 'tabular_grid_member'),
        ('acme', 'cust-002', 'Turing Trading', 'tabular_grid_member'),
        ('private', 'cust-999', 'Restricted Industries', 'tabular_grid_partial');
      INSERT INTO operations.orders (
        tenant_id, order_id, customer_tenant, customer_code, owner_role,
        status, quantity, unit_price, metadata
      ) VALUES
        ('acme', 'ord-001', 'acme', 'cust-001', 'tabular_grid_member',
         'draft', 2, 12345678901234567890.123456789012345678, '{"source":"seed"}'),
        ('acme', 'ord-002', 'acme', 'cust-002', 'tabular_grid_member',
         'approved', 3, 0.000000000000000001, '{"source":"seed"}'),
        ('partial', 'ord-900', 'private', 'cust-999', 'tabular_grid_partial',
         'draft', 1, 2.000000000000000000, '{"source":"partial"}');
      GRANT USAGE ON SCHEMA crm, operations TO tabular_grid_member, tabular_grid_partial;
      GRANT SELECT, INSERT, UPDATE, DELETE ON crm.customers, operations.orders, operations.blank_sheet
        TO tabular_grid_member;
      GRANT REFERENCES (tenant_id, customer_code) ON crm.customers TO tabular_grid_member;
      GRANT SELECT (tenant_id, order_id, status), UPDATE (status)
        ON operations.orders TO tabular_grid_partial;
    `);

    application = await startWeb({
      env: {
        NODE_ENV: 'test',
        TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
        TABULAR_DATABASE_CONNECTION_ID: 'task00008',
        TABULAR_WEB_DATABASE_URL: connectionString,
        TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '600',
        TABULAR_SESSION_MAX_AGE_SECONDS: '3600',
        TABULAR_POOL_MAXIMUM: '8'
      },
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd(),
      host: '127.0.0.1',
      port: 0
    });
    const stable = await application.database.transaction('web', {}, (database) =>
      reconcileCatalog(database, 'task00008')
    );
    const ordersFile = stableFile(stable, 'operations', 'orders');
    const customersFile = stableFile(stable, 'crm', 'customers');
    const blankFile = stableFile(stable, 'operations', 'blank_sheet');
    const blankKey = stableColumn(stable, blankFile, '__tabular_row_id');
    const blankJson = stableColumn(stable, blankFile, '__tabular_json');
    const blankRank = stableColumn(stable, blankFile, '__tabular_row');
    const blankValue = stableColumn(stable, blankFile, 'value');
    const blankLogical = `col_${'u'.repeat(32)}`;
    await admin.query(`
      INSERT INTO tabular.column_metadata (
        column_id, object_id, catalog_column_id, storage_kind,
        display_name, field_kind, format_kind, hidden, hidden_purpose
      ) VALUES
        ($1, $4, $1, 'postgresql', 'Row ID', 'text', 'plain-text', true, 'row-id'),
        ($2, $4, $2, 'postgresql', 'Unstructured values', 'text', 'plain-text', true, 'unstructured-json'),
        ($3, $4, $3, 'postgresql', 'Row rank', 'text', 'plain-text', true, 'shared-rank'),
        ($5, $4, NULL, 'unstructured-json', '', 'text', 'plain-text', false, NULL)
    `, [blankKey, blankJson, blankRank, blankFile, blankLogical]);
    const columns = {
      tenant: stableColumn(stable, ordersFile, 'tenant_id'),
      order: stableColumn(stable, ordersFile, 'order_id'),
      customerTenant: stableColumn(stable, ordersFile, 'customer_tenant'),
      relationNote: stableColumn(stable, ordersFile, 'relation_note'),
      customer: stableColumn(stable, ordersFile, 'customer_code'),
      owner: stableColumn(stable, ordersFile, 'owner_role'),
      status: stableColumn(stable, ordersFile, 'status'),
      quantity: stableColumn(stable, ordersFile, 'quantity'),
      unitPrice: stableColumn(stable, ordersFile, 'unit_price'),
      placedOn: stableColumn(stable, ordersFile, 'placed_on'),
      cutoff: stableColumn(stable, ordersFile, 'cutoff'),
      startsAt: stableColumn(stable, ordersFile, 'starts_at'),
      metadata: stableColumn(stable, ordersFile, 'metadata'),
      total: stableColumn(stable, ordersFile, 'total')
    };
    const customerColumns = {
      tenant: stableColumn(stable, customersFile, 'tenant_id'),
      code: stableColumn(stable, customersFile, 'customer_code')
    };

    const provider = new TestIdentityProvider();
    const subject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task00008-member',
      displayName: 'Grid Member'
    });
    await application.identity.provisionIdentityRole(subject, 'tabular_grid_member');
    const session = await application.identity.establishBrowserSession(subject);
    const mutation = await application.identity.requireBrowserMutation({
      cookieToken: session.cookieToken,
      csrfToken: session.csrfToken,
      origin: 'https://tabular.test'
    });
    const web = new WebCapabilityAdapter(application.identity, application.capability);
    /**
     * Execute the current value.
     */
    const execute = (action: CapabilityAction) => web.invoke(mutation, { action });

    const emptySheet = await application.grid.load(session.principal, blankFile);
    assert.ok(emptySheet);
    assert.deepEqual(emptySheet.columns.map((column) => column.id), [blankValue, blankLogical]);
    assert.equal(emptySheet.rows.length, 0);
    const blankInserted = await execute({
      type: 'record.insert', commandId: commandId(), fileId: blankFile,
      patch: [{ columnId: blankValue, value: { type: 'text', value: 'First value' } }]
    });
    assertOk(blankInserted);
    const blankRow = responseData<{ rows: Array<{ rowId: string, version: string, }>, }>(blankInserted).rows[0]!;
    assert.match(blankRow.rowId, /^row_[A-Za-z0-9_-]+$/);
    assert.equal((await admin.query(`
      SELECT value FROM operations.blank_sheet
    `)).rows[0].value, 'First value');
    const blankPatched = await execute({
      type: 'record.patch', commandId: commandId(), fileId: blankFile,
      rowId: blankRow.rowId, expectedVersion: blankRow.version,
      patch: [{ columnId: blankValue, value: { type: 'text', value: 'Updated value' } }]
    });
    assertOk(blankPatched);
    const blankPatchedRow = responseData<{
      rows: Array<{ rowId: string, version: string, }>,
    }>(blankPatched).rows[0]!;
    assert.equal(blankPatchedRow.rowId, blankRow.rowId);
    assert.equal((await admin.query(`
      SELECT value FROM operations.blank_sheet
    `)).rows[0].value, 'Updated value');
    assertOk(await execute({
      type: 'record.delete', commandId: commandId(), fileId: blankFile,
      rowId: blankRow.rowId, expectedVersion: blankPatchedRow.version
    }));
    assertOk(await execute({ type: 'history.undo', commandId: commandId(), fileId: blankFile }));
    assert.equal((await admin.query(`SELECT value FROM operations.blank_sheet`)).rows[0].value, 'Updated value');
    assertOk(await execute({ type: 'history.redo', commandId: commandId(), fileId: blankFile }));
    assert.equal((await admin.query(`SELECT count(*)::integer AS count FROM operations.blank_sheet`)).rows[0].count, 0);

    const adjacentDraft = await execute({
      type: 'draft.create', commandId: commandId(), fileId: blankFile,
      rowRank: '000000000000000019000000', schemaVersion: emptySheet.schemaVersion,
      patch: [{ columnId: blankLogical, value: { type: 'text', value: 'row nineteen' } }],
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    assertOk(adjacentDraft);
    const retainedAdjacent = responseData<{
      id: string, version: number, rowRank: string, validation: unknown[],
    }>(adjacentDraft);
    const sparseDraft = await execute({
      type: 'draft.create', commandId: commandId(), fileId: blankFile,
      rowRank: '000000000000000020000000', schemaVersion: emptySheet.schemaVersion,
      patch: [{ columnId: blankLogical, value: { type: 'text', value: 'row twenty' } }],
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    assertOk(sparseDraft);
    const retainedSparse = responseData<{
      id: string, version: number, rowRank: string, validation: unknown[],
    }>(sparseDraft);
    assert.equal(retainedSparse.rowRank, '000000000000000020000000');
    assert.deepEqual(retainedSparse.validation, []);
    assert.deepEqual((await admin.query(`
      SELECT row_rank, patch FROM tabular.action_drafts WHERE id = $1
    `, [retainedSparse.id])).rows[0], {
      row_rank: '000000000000000020000000',
      patch: [{ columnId: blankLogical, value: { type: 'text', value: 'row twenty' } }]
    });
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM operations.blank_sheet
    `)).rows[0].count, 0, 'retaining row 20 does not create rows 1 through 19');
    const correctedAdjacent = await execute({
      type: 'draft.update', commandId: commandId(), draftId: retainedAdjacent.id,
      expectedDraftVersion: retainedAdjacent.version,
      patch: [{ columnId: blankLogical, value: { type: 'text', value: 'row nineteen revised' } }]
    });
    assertOk(correctedAdjacent);
    const correctedAdjacentValue = responseData<{ version: number, }>(correctedAdjacent);
    const adjacentDrafts = await execute({ type: 'draft.list', fileId: blankFile });
    assertOk(adjacentDrafts);
    assert.deepEqual(responseData<Array<{
      id: string, rowRank?: string, patch: unknown[],
    }>>(adjacentDrafts).map((draft) => ({
      id: draft.id,
      rowRank: draft.rowRank,
      patch: draft.patch
    })), [
      {
        id: retainedAdjacent.id,
        rowRank: '000000000000000019000000',
        patch: [{ columnId: blankLogical, value: { type: 'text', value: 'row nineteen revised' } }]
      },
      {
        id: retainedSparse.id,
        rowRank: '000000000000000020000000',
        patch: [{ columnId: blankLogical, value: { type: 'text', value: 'row twenty' } }]
      }
    ], 'adjacent sparse rows keep independent ranks, patches, and draft identities');
    assertOk(await execute({
      type: 'draft.promote', commandId: commandId(), draftId: retainedAdjacent.id,
      expectedDraftVersion: correctedAdjacentValue.version
    }));
    assertOk(await execute({
      type: 'draft.promote', commandId: commandId(), draftId: retainedSparse.id,
      expectedDraftVersion: retainedSparse.version
    }));
    const sparseGrid = await application.grid.load(session.principal, blankFile);
    assert.ok(sparseGrid);
    assert.equal(sparseGrid.rows.length, 2);
    assert.deepEqual(sparseGrid.rows.map((row) => ({
      rank: sparseGrid.rowRanks?.[row.id],
      value: row[blankLogical]
    })), [
      { rank: '000000000000000019000000', value: 'row nineteen revised' },
      { rank: '000000000000000020000000', value: 'row twenty' }
    ]);
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM operations.blank_sheet
    `)).rows[0].count, 2);

    assert.deepEqual(await web.invoke(mutation, {
      action: { type: 'history.list', fileId: ordersFile, limit: 1 },
      authority: 'forged'
    }), {
      status: 'error',
      error: { code: 'invalid_action', message: 'The action is invalid', retryable: false }
    });

    const initial = await application.grid.load(session.principal, ordersFile);
    assert.ok(initial);
    assert.equal(initial.rows.length, 2);
    assert.equal(initial.columns.find((column) => column.id === columns.tenant)?.key, true);
    assert.equal(initial.columns.find((column) => column.id === columns.order)?.editable, false);
    assert.equal(initial.columns.find((column) => column.id === columns.total)?.generated, true);
    assert.equal(initial.columns.find((column) => column.id === columns.total)?.editable, false);
    const first = rowByValue(initial, columns.order, 'ord-001');
    const second = rowByValue(initial, columns.order, 'ord-002');
    assert.equal(first[columns.unitPrice], '12345678901234567890.123456789012345678');
    assert.equal(first[columns.total], '24691357802469135780.246913578024691356');
    assert.equal(first[columns.cutoff], '09:30:00.000000');
    assert.match(String(first[columns.startsAt]), /^2026-08-01T01:02:03(?:\.000)?\+00(?::00)?$/);
    assert.match(first.id, /^row_[A-Za-z0-9_-]+$/);

    const description = await application.files.describe(session.principal, ordersFile);
    const relation = description.constraints.find((constraint) => constraint.kind === 'f');
    assert.deepEqual({
      source: relation?.columnIds,
      targetFile: relation?.targetFileId,
      target: relation?.targetColumnIds
    }, {
      source: [columns.customerTenant, columns.customer],
      targetFile: customersFile,
      target: [customerColumns.tenant, customerColumns.code]
    });
    const orderedColumnIds = initial.columns.map((column) => column.id);
    assert.ok(
      Math.abs(
        orderedColumnIds.indexOf(columns.customerTenant)
        - orderedColumnIds.indexOf(columns.customer)
      ) > 1,
      'the composite relation maps explicit non-adjacent source columns'
    );

    const relationLookup = await application.grid.lookupRelation(session.principal, {
      fileId: ordersFile, columnId: columns.customerTenant, query: '', limit: 25
    });
    assert.ok(relationLookup);
    assert.equal(relationLookup.options.length, 2, 'RLS excludes the partial-role customer');
    assert.deepEqual(relationLookup.sourceColumnIds, [columns.customerTenant, columns.customer]);
    assert.deepEqual(relationLookup.options[0]?.patch, {
      [columns.customerTenant]: 'acme',
      [columns.customer]: 'cust-001'
    });
    await admin.query(`UPDATE crm.customers SET label = 'Ada Updated' WHERE customer_code = 'cust-001'`);
    const refreshedLookup = await application.grid.lookupRelation(session.principal, {
      fileId: ordersFile, columnId: columns.customerTenant, query: 'Updated', limit: 25
    });
    assert.equal(refreshedLookup?.options[0]?.label.includes('Ada Updated'), true);

    const partialSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task00008-partial',
      displayName: 'Grid Partial'
    });
    await application.identity.provisionIdentityRole(partialSubject, 'tabular_grid_partial');
    const partialSession = await application.identity.establishBrowserSession(partialSubject);
    const partialMutation = await application.identity.requireBrowserMutation({
      cookieToken: partialSession.cookieToken,
      csrfToken: partialSession.csrfToken,
      origin: 'https://tabular.test'
    });
    const partialGrid = await application.grid.load(partialSession.principal, ordersFile);
    assert.ok(partialGrid);
    assert.deepEqual(partialGrid.columns.map((column) => column.id), [
      columns.tenant, columns.order, columns.status
    ]);
    assert.equal(partialGrid.rows.length, 1);
    assert.equal(partialGrid.columns.find((column) => column.id === columns.status)?.editable, true);
    const partialWeb = new WebCapabilityAdapter(application.identity, application.capability);
    const partialRow = partialGrid.rows[0]!;
    const partialUpdated = await partialWeb.invoke(partialMutation, { action: {
      type: 'record.patch', commandId: commandId(), fileId: ordersFile,
      rowId: partialRow.id, expectedVersion: partialGrid.versions[partialRow.id]!,
      patch: [{ columnId: columns.status, value: { type: 'text', value: 'review' } }]
    } });
    assertOk(partialUpdated);
    assertFailure(await partialWeb.invoke(partialMutation, { action: {
      type: 'record.patch', commandId: commandId(), fileId: ordersFile,
      rowId: partialRow.id,
      expectedVersion: actionVersion(partialUpdated),
      patch: [{ columnId: columns.quantity, value: { type: 'integer', value: '8' } }]
    } }), 'capability_denied');
    assertFailure(await partialWeb.invoke(partialMutation, { action: {
      type: 'history.undo', commandId: commandId(), fileId: ordersFile
    } }), 'capability_denied');
    assert.equal((await admin.query(`
      SELECT status FROM operations.orders WHERE order_id = 'ord-900'
    `)).rows[0].status, 'review', 'column-only history never reverses an unseen replacement');

    const exactPrice = '9007199254740993.000000000000000001';
    const patched = await execute({
      type: 'record.patch', commandId: commandId(), fileId: ordersFile,
      rowId: first.id, expectedVersion: initial.versions[first.id]!,
      patch: [{ columnId: columns.unitPrice, value: { type: 'decimal', value: exactPrice } }]
    });
    assertOk(patched);
    const patchedVersion = actionVersion(patched);
    assertFailure(await execute({
      type: 'record.patch', commandId: commandId(), fileId: ordersFile,
      rowId: first.id, expectedVersion: initial.versions[first.id]!,
      patch: [{ columnId: columns.status, value: { type: 'text', value: 'review' } }]
    }), 'conflict');
    assertFailure(await execute({
      type: 'record.patch', commandId: commandId(), fileId: ordersFile,
      rowId: first.id, expectedVersion: patchedVersion,
      patch: [{ columnId: columns.total, value: { type: 'decimal', value: '1' } }]
    }), 'validation_failed');
    assertFailure(await execute({
      type: 'record.patch', commandId: commandId(), fileId: ordersFile,
      rowId: first.id, expectedVersion: patchedVersion,
      patch: [{ columnId: columns.order, value: { type: 'text', value: 'changed-key' } }]
    }), 'validation_failed');

    const beforeAtomic = await admin.query(`
      SELECT order_id, status, quantity::text AS quantity
        FROM operations.orders ORDER BY order_id
    `);
    assertFailure(await execute({
      type: 'range.patch', commandId: commandId(), fileId: ordersFile, cellCount: 2,
      rows: [
        {
          rowId: first.id, expectedVersion: patchedVersion,
          patch: [{ columnId: columns.status, value: { type: 'text', value: 'review' } }]
        },
        {
          rowId: second.id, expectedVersion: initial.versions[second.id]!,
          patch: [{ columnId: columns.quantity, value: { type: 'integer', value: '999' } }]
        }
      ]
    }), 'validation_failed');
    assert.deepEqual((await admin.query(`
      SELECT order_id, status, quantity::text AS quantity
        FROM operations.orders ORDER BY order_id
    `)).rows, beforeAtomic.rows);

    const refreshed = await application.grid.load(session.principal, ordersFile);
    assert.ok(refreshed);
    const refreshedFirst = rowByValue(refreshed, columns.order, 'ord-001');
    assert.equal(refreshedFirst[columns.unitPrice], exactPrice);
    assert.equal(refreshedFirst[columns.total], '18014398509481986.000000000000000002');
    assert.equal(refreshed.versions[refreshedFirst.id], patchedVersion);

    const invalidDraft = await execute({
      type: 'draft.create', commandId: commandId(), fileId: ordersFile,
      rowId: refreshedFirst.id, schemaVersion: refreshed.schemaVersion,
      patch: [{ columnId: columns.quantity, value: { type: 'text', value: 'not-a-number' } }],
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    assertOk(invalidDraft);
    const invalidValue = responseData<{ id: string, version: number, validation: Array<{ code: string, }>, }>(invalidDraft);
    assert.equal(invalidValue.validation[0]?.code, 'type_mismatch');
    const persistedRaw = await admin.query(`
      SELECT patch FROM tabular.action_drafts WHERE id = $1
    `, [invalidValue.id]);
    assert.equal(persistedRaw.rows[0].patch[0].value.value, 'not-a-number');
    const resumedDrafts = await new WebCapabilityAdapter(
      application.identity,
      application.capability
    ).invoke(mutation, {
      action: { type: 'draft.list', fileId: ordersFile }
    });
    assertOk(resumedDrafts);
    assert.deepEqual(responseData<Array<{ id: string, patch: unknown[], }>>(resumedDrafts).map((draft) => ({
      id: draft.id,
      patch: draft.patch
    })), [{
      id: invalidValue.id,
      patch: [{ columnId: columns.quantity, value: { type: 'text', value: 'not-a-number' } }]
    }], 'active drafts resume through an independent browser adapter load');
    const corrected = await execute({
      type: 'draft.update', commandId: commandId(), draftId: invalidValue.id,
      expectedDraftVersion: invalidValue.version,
      patch: [{ columnId: columns.quantity, value: { type: 'integer', value: '4' } }]
    });
    assertOk(corrected);
    const correctedValue = responseData<{ version: number, validation: unknown[], }>(corrected);
    assert.deepEqual(correctedValue.validation, []);
    const promoted = await execute({
      type: 'draft.promote', commandId: commandId(), draftId: invalidValue.id,
      expectedDraftVersion: correctedValue.version, expectedRowVersion: patchedVersion
    });
    assertOk(promoted);
    assert.deepEqual((await admin.query(`
      SELECT quantity::text AS quantity, unit_price::text AS price, total::text AS total
        FROM operations.orders WHERE tenant_id = 'acme' AND order_id = 'ord-001'
    `)).rows[0], {
      quantity: '4', price: exactPrice, total: '36028797018963972.000000000000000004'
    });

    const constraintDraft = await execute({
      type: 'draft.create', commandId: commandId(), fileId: ordersFile,
      rowId: refreshedFirst.id, schemaVersion: refreshed.schemaVersion,
      patch: [{ columnId: columns.quantity, value: { type: 'integer', value: '999' } }],
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    assertOk(constraintDraft);
    const constraintValue = responseData<{ id: string, version: number, validation: unknown[], }>(constraintDraft);
    assert.deepEqual(constraintValue.validation, []);
    assertFailure(await execute({
      type: 'draft.promote', commandId: commandId(), draftId: constraintValue.id,
      expectedDraftVersion: constraintValue.version,
      expectedRowVersion: actionVersion(promoted)
    }), 'validation_failed');
    const retainedConstraintDraft = await execute({
      type: 'draft.read', draftId: constraintValue.id
    });
    assertOk(retainedConstraintDraft);
    assert.equal(
      responseData<{ validation: Array<{ code: string, }>, }>(retainedConstraintDraft).validation[0]?.code,
      'database_rejected',
      'a failed promotion persists PostgreSQL validation for reload recovery'
    );
    assertOk(await execute({
      type: 'draft.delete', commandId: commandId(), draftId: constraintValue.id,
      expectedDraftVersion: constraintValue.version
    }));

    const inserted = await execute({
      type: 'record.insert', commandId: commandId(), fileId: ordersFile,
      patch: [
        { columnId: columns.tenant, value: { type: 'text', value: 'acme' } },
        { columnId: columns.order, value: { type: 'text', value: 'ord-003' } },
        { columnId: columns.customerTenant, value: { type: 'text', value: 'acme' } },
        { columnId: columns.customer, value: { type: 'text', value: 'cust-001' } },
        { columnId: columns.status, value: { type: 'text', value: 'review' } },
        { columnId: columns.quantity, value: { type: 'integer', value: '5' } },
        { columnId: columns.unitPrice, value: { type: 'decimal', value: '1.250000000000000000' } }
      ]
    });
    assertOk(inserted);
    const insertedData = responseData<{ rows: Array<{ rowId: string, version: string, }>, }>(inserted);
    const insertedRow = insertedData.rows[0]!;
    assert.equal((await admin.query(`
      SELECT owner_role::text AS owner, total::text AS total
        FROM operations.orders WHERE order_id = 'ord-003'
    `)).rows[0].owner, 'tabular_grid_member');

    assertOk(await execute({
      type: 'record.delete', commandId: commandId(), fileId: ordersFile,
      rowId: insertedRow.rowId, expectedVersion: insertedRow.version
    }));
    assert.equal(await rowCount(admin, 'ord-003'), 0);
    assertOk(await execute({
      type: 'history.undo', commandId: commandId(), fileId: ordersFile
    }));
    assert.equal(await rowCount(admin, 'ord-003'), 1);
    assert.deepEqual((await admin.query(`
      SELECT status, quantity::text AS quantity, unit_price::text AS price,
             metadata::text AS metadata, total::text AS total
        FROM operations.orders WHERE order_id = 'ord-003'
    `)).rows[0], {
      status: 'review', quantity: '5', price: '1.250000000000000000',
      metadata: '{}', total: '6.250000000000000000'
    });
    assertOk(await execute({
      type: 'history.redo', commandId: commandId(), fileId: ordersFile
    }));
    assert.equal(await rowCount(admin, 'ord-003'), 0);

    const journal = await admin.query(`
      SELECT action_type FROM tabular.action_journal
       WHERE actor_identity_id = $1 ORDER BY created_at, id
    `, [session.principal.identityId]);
    const actionTypes = journal.rows.map((row) => row.action_type);
    for (const expected of [
      'record.patch', 'draft.create', 'draft.update', 'draft.promote',
      'record.insert', 'record.delete', 'history.undo', 'history.redo'
    ]) assert.ok(actionTypes.includes(expected), `Journal must contain ${expected}`);

    const replacementSnapshot = await application.grid.load(session.principal, ordersFile);
    assert.ok(replacementSnapshot);
    const replacementCandidate = rowByValue(replacementSnapshot, columns.order, 'ord-002');
    assertOk(await execute({
      type: 'record.patch', commandId: commandId(), fileId: ordersFile,
      rowId: replacementCandidate.id,
      expectedVersion: replacementSnapshot.versions[replacementCandidate.id]!,
      patch: [{ columnId: columns.status, value: { type: 'text', value: 'review' } }]
    }));
    await admin.query(`
      CREATE TEMP TABLE task00008_replacement AS
      SELECT tenant_id, order_id, customer_tenant, customer_code, owner_role,
             status, quantity, unit_price, placed_on, metadata
        FROM operations.orders
       WHERE tenant_id = 'acme' AND order_id = 'ord-002';
      DELETE FROM operations.orders
       WHERE tenant_id = 'acme' AND order_id = 'ord-002';
      INSERT INTO operations.orders (
        tenant_id, order_id, customer_tenant, customer_code, owner_role,
        status, quantity, unit_price, placed_on, metadata
      ) SELECT tenant_id, order_id, customer_tenant, customer_code, owner_role,
               status, quantity, unit_price, placed_on, metadata
          FROM task00008_replacement;
    `);
    const replacementUndo = await execute({
      type: 'history.undo', commandId: commandId(), fileId: ordersFile
    });
    assertFailure(replacementUndo, 'conflict');
    assert.equal((await admin.query(`
      SELECT status FROM operations.orders
       WHERE tenant_id = 'acme' AND order_id = 'ord-002'
    `)).rows[0].status, 'review');
    assert.equal(application.database.openPool('web').checkedOutCount, 0);
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    if (application) {
      try { await application.close(); } catch (error) { cleanupFailures.push(asError(error)); }
    }
    try { await migrator.close(10_000); } catch (error) { cleanupFailures.push(asError(error)); }
    try { await resetFixture(admin); } catch (error) { cleanupFailures.push(asError(error)); }
    try { await admin.end(); } catch (error) { cleanupFailures.push(asError(error)); }
    if (!primaryFailure && cleanupFailures.length) {
      throw new AggregateError(cleanupFailures, 'Task 00008 cleanup failed');
    }
  }
});

/**
 * Reset the fixture.
 */
async function resetFixture(admin: pg.Pool) {
  await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS operations CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS crm CASCADE');
  await admin.query('DROP ROLE IF EXISTS tabular_grid_partial');
  await admin.query('DROP ROLE IF EXISTS tabular_grid_member');
}

/**
 * Return the stable file result.
 */
function stableFile(snapshot: StableCatalogSnapshot, schemaName: string, tableName: string) {
  const schema = [...snapshot.schemas.values()].find((item) => item.name === schemaName);
  const object = [...snapshot.objects.values()].find((item) =>
    item.schemaId === schema?.stableId && item.name === tableName
  );
  assert.ok(object, `Stable catalog file ${schemaName}.${tableName} is required`);
  return object.stableId;
}

/**
 * Return the stable column result.
 */
function stableColumn(snapshot: StableCatalogSnapshot, fileId: string, columnName: string) {
  const column = [...snapshot.columns.values()].find((item) =>
    item.objectId === fileId && item.name === columnName
  );
  assert.ok(column, `Stable catalog column ${fileId}.${columnName} is required`);
  return column.stableId;
}

/**
 * Return the row by value result.
 */
function rowByValue(
  resource: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof startWeb>>['grid']['load']>>>,
  columnId: string,
  value: string
) {
  const row = resource.rows.find((candidate) => candidate[columnId] === value);
  assert.ok(row, `Grid row with ${columnId}=${value} is required`);
  return row;
}

/**
 * Return the command id result.
 */
function commandId() {
  return `cmd_${randomBytes(12).toString('base64url')}`;
}

/**
 * Assert the ok.
 */
function assertOk(response: { status: string, error?: unknown, }) {
  assert.equal(response.status, 'ok', JSON.stringify(response));
}

/**
 * Assert the failure.
 */
function assertFailure(response: { status: string, error?: { code: string, }, }, code: string) {
  assert.equal(response.status, 'error', JSON.stringify(response));
  assert.equal(response.error?.code, code);
}

/**
 * Return the response data result.
 */
function responseData<Value>(response: { status: string, data?: unknown, }) {
  assertOk(response);
  return response.data as Value;
}

/**
 * Return the action version result.
 */
function actionVersion(response: { status: string, data?: unknown, }) {
  const version = responseData<{ rows: Array<{ version: string, }>, }>(response).rows[0]?.version;
  assert.match(version || '', /^ver_[A-Za-z0-9_-]{16,128}$/);
  return version!;
}

/**
 * Return the row count result.
 */
async function rowCount(admin: pg.Pool, orderId: string) {
  const result = await admin.query(`
    SELECT count(*)::integer AS count FROM operations.orders WHERE order_id = $1
  `, [orderId]);
  return result.rows[0].count as number;
}

/**
 * Return the as error result.
 */
function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
