import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { createApplication, startWeb } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { runMigrations } from '../../database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../database/helpers/transactions.js';
import { loadMigrations } from '../../database/migrations/index.js';
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import type { StableCatalogSnapshot } from '../../catalog/helpers/contracts.js';
import { TestIdentityProvider } from '../../identity/tests/provider-double.js';
import type { BrowserMutationPrincipal } from '../../identity/helpers/contracts.js';
import type { FileDdlAction } from '../helpers/contracts.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TEST_POSTGRES_URL;

function assertDisposableTarget(value: string | undefined): asserts value is string {
  assert.equal(
    process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
    'task00005-disposable',
    'TABULAR_TEST_POSTGRES_DISPOSABLE must explicitly authorize destructive test cleanup'
  );
  assert.ok(value, 'TABULAR_TEST_POSTGRES_URL is required');
  const target = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/tabular_task00005');
  assert.ok(target.port);
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
}

function roleUrl(value: string, role: string, password: string) {
  const url = new URL(value);
  url.username = role;
  url.password = password;
  return url.toString();
}

function migrationTransaction(pool: ManagedPostgresPool) {
  return <Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
    withPostgreSqlTransaction(pool, {
      settings: {
        statement_timeout: '15000',
        lock_timeout: '15000',
        idle_in_transaction_session_timeout: '15000'
      }
    }, callback);
}

test('PostgreSQL 18 owner-confirmed file DDL, native relations, hidden fields, and promotion', {
  timeout: 180_000
}, async () => {
  assertDisposableTarget(connectionString);
  const password = `p_${randomBytes(12).toString('hex')}`;
  const admin = new Pool({ connectionString, max: 8, allowExitOnIdle: true });
  const webUrl = roleUrl(connectionString, 'tabular_task5_web', password);
  const migratorUrl = roleUrl(connectionString, 'tabular_task5_migrator', password);
  const migrationPool = new ManagedPostgresPool({
    name: 'task00005-migrations',
    connectionString: migratorUrl,
    maximum: 2,
    applicationName: 'tabular-task00005-migrations'
  });
  let web: Awaited<ReturnType<typeof startWeb>> | undefined;
  let migrator: Awaited<ReturnType<typeof createApplication>> | undefined;
  let primaryFailure: unknown;
  const cleanupFailures: Error[] = [];
  try {
    const version = await admin.query(`
      SELECT current_setting('server_version_num')::integer AS number, version() AS label
    `);
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);
    await resetFixture(admin);
    await admin.query(`
      CREATE ROLE tabular_task5_web LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task5_migrator LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task5_owner NOLOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task5_finance_owner NOLOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task5_reader NOLOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT CONNECT, CREATE ON DATABASE tabular_task00005 TO tabular_task5_migrator;
      GRANT tabular_task5_owner TO tabular_task5_web, tabular_task5_migrator
        WITH INHERIT FALSE, SET TRUE;
      GRANT tabular_task5_finance_owner TO tabular_task5_migrator
        WITH INHERIT FALSE, SET TRUE;
      GRANT tabular_task5_reader TO tabular_task5_web
        WITH INHERIT FALSE, SET TRUE;
    `);
    const migrations = await loadMigrations();
    assert.deepEqual(await runMigrations(migrationTransaction(migrationPool), migrations), {
      applied: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
      total: 11
    });
    await admin.query(`
      GRANT USAGE ON SCHEMA tabular TO tabular_task5_web;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular TO tabular_task5_web;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular TO tabular_task5_web;
      CREATE SCHEMA workspace AUTHORIZATION tabular_task5_owner;
      CREATE SCHEMA finance AUTHORIZATION tabular_task5_finance_owner;
      CREATE TABLE finance.customers (
        tenant_code text NOT NULL,
        customer_code text NOT NULL,
        label text NOT NULL,
        CONSTRAINT customers_key UNIQUE (tenant_code, customer_code)
      );
      CREATE TABLE finance.keyless (
        tenant_code text NOT NULL,
        customer_code text NOT NULL
      );
      CREATE VIEW finance.customer_view AS
        SELECT tenant_code, customer_code FROM finance.customers;
      ALTER TABLE finance.customers OWNER TO tabular_task5_finance_owner;
      ALTER TABLE finance.keyless OWNER TO tabular_task5_finance_owner;
      ALTER VIEW finance.customer_view OWNER TO tabular_task5_finance_owner;
      GRANT USAGE ON SCHEMA finance TO tabular_task5_owner;
      GRANT REFERENCES (tenant_code, customer_code) ON finance.customers TO tabular_task5_owner;
      GRANT REFERENCES (tenant_code, customer_code) ON finance.keyless TO tabular_task5_owner;
      GRANT SELECT ON finance.customers TO tabular_task5_owner;
      GRANT SELECT ON finance.customer_view TO tabular_task5_owner;
      GRANT USAGE ON SCHEMA workspace TO tabular_task5_reader;
    `);

    web = await startWeb({
      env: environment(webUrl, migratorUrl, 'web'),
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd(),
      host: '127.0.0.1',
      port: 0
    });
    migrator = await createApplication({
      processKind: 'migrator',
      env: environment(webUrl, migratorUrl, 'migrator'),
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd()
    });
    const provider = new TestIdentityProvider();
    const ownerSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task00005-owner',
      displayName: 'File Owner'
    });
    const readerSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task00005-reader',
      displayName: 'File Reader'
    });
    await web.identity.provisionIdentityRole(ownerSubject, 'tabular_task5_owner');
    await web.identity.provisionIdentityRole(readerSubject, 'tabular_task5_reader');
    const ownerSession = await web.identity.establishBrowserSession(ownerSubject);
    const owner = await web.identity.requireBrowserMutation({
      cookieToken: ownerSession.cookieToken,
      csrfToken: ownerSession.csrfToken,
      origin: 'https://tabular.test'
    });
    const readerSession = await web.identity.establishBrowserSession(readerSubject);
    const reader = await web.identity.requireBrowserMutation({
      cookieToken: readerSession.cookieToken,
      csrfToken: readerSession.csrfToken,
      origin: 'https://tabular.test'
    });
    let stable = await stableCatalog(web, 'task00005');
    const workspaceId = stableSchema(stable, 'workspace');

    await assert.rejects(
      apply(web, migrator, reader, {
        type: 'file.create', commandId: commandId(), schemaId: workspaceId,
        displayName: 'Denied File'
      }),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'file_ddl_denied'
    );
    assert.throws(
      () => web!.files.applyConfirmed(`ddl_${'D'.repeat(43)}`),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'file_ddl_denied'
    );

    const created = await apply(web, migrator, owner, {
      type: 'file.create', commandId: commandId(), schemaId: workspaceId,
      displayName: 'Untitled File'
    });
    assert.equal(created.physicalName, 'untitled_file');
    assert.ok(created.targetFileId);
    const appliedStatus = await web.files.status(owner, created.requestId);
    assert.equal(appliedStatus.state, 'applied');
    assert.equal(appliedStatus.result?.targetFileId, created.targetFileId);
    await assert.rejects(
      web.files.status(reader, created.requestId),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'file_ddl_unavailable'
    );
    const blank = await admin.query(`
      SELECT c.relname, r.rolname AS owner,
             count(a.attnum)::integer AS physical_columns
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_roles r ON r.oid = c.relowner
        LEFT JOIN pg_attribute a
          ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       WHERE n.nspname = 'workspace' AND c.relname = 'untitled_file'
       GROUP BY c.relname, r.rolname
    `);
    assert.deepEqual(blank.rows[0], {
      relname: 'untitled_file', owner: 'tabular_task5_owner', physical_columns: 1
    });
    assert.deepEqual((await admin.query(`
      SELECT a.attname AS column_name,
             a.attnotnull AS required,
             pg_get_expr(d.adbin, d.adrelid) LIKE '%gen_random_uuid%' AS generated_default,
             EXISTS (
               SELECT 1 FROM pg_constraint c
                WHERE c.conrelid = a.attrelid AND c.contype = 'u'
                  AND a.attnum = ANY(c.conkey)
             ) AS unique_key,
             m.hidden,
             m.hidden_purpose
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        JOIN tabular.catalog_columns catalog
          ON catalog.object_id = $1 AND catalog.attribute_number = a.attnum
        JOIN tabular.column_metadata m ON m.catalog_column_id = catalog.id
       WHERE a.attrelid = 'workspace.untitled_file'::regclass
         AND a.attname = '__tabular_row_id'
    `, [created.targetFileId])).rows[0], {
      column_name: '__tabular_row_id',
      required: true,
      generated_default: true,
      unique_key: true,
      hidden: true,
      hidden_purpose: 'row-id'
    });
    const replay = await migrator.files.applyConfirmed(created.requestId);
    assert.deepEqual(replay, created);
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.file_ddl_versions WHERE request_id = $1
    `, [created.requestId])).rows[0].count, 1);

    await assert.rejects(
      web.files.plan(owner, {
        type: 'file.create', commandId: commandId(), schemaId: workspaceId,
        displayName: 'Explicit Collision', physicalName: 'untitled_file'
      }),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'file_ddl_conflict'
    );
    await admin.query(`CREATE TABLE workspace.collision_file (); ALTER TABLE workspace.collision_file OWNER TO tabular_task5_owner`);
    const collisionFile = await apply(web, migrator, owner, {
      type: 'file.create', commandId: commandId(), schemaId: workspaceId,
      displayName: 'Collision File'
    });
    assert.equal(collisionFile.physicalName, 'collision_file_2');
    const collisionColumn = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: collisionFile.targetFileId!,
      displayName: 'Code', storageType: 'text', field: 'text', format: 'plain', unique: true
    });
    await apply(web, migrator, owner, {
      type: 'file.drop', commandId: commandId(), fileId: collisionFile.targetFileId!
    });
    assert.deepEqual((await admin.query(`
      SELECT to_regclass('workspace.collision_file_2') IS NULL AS table_removed,
             NOT EXISTS (SELECT 1 FROM tabular.file_metadata WHERE object_id = $1) AS file_removed,
             NOT EXISTS (SELECT 1 FROM tabular.column_metadata WHERE object_id = $1) AS columns_removed,
             NOT EXISTS (SELECT 1 FROM tabular.file_managed_constraints WHERE object_id = $1) AS constraints_removed
    `, [collisionFile.targetFileId])).rows[0], {
      table_removed: true,
      file_removed: true,
      columns_removed: true,
      constraints_removed: true
    });
    assert.ok(collisionColumn.targetColumnId);

    const sameNameA = await web.files.plan(owner, {
      type: 'file.create', commandId: commandId(), schemaId: workspaceId,
      displayName: 'Concurrent Name'
    });
    const sameNameB = await web.files.plan(owner, {
      type: 'file.create', commandId: commandId(), schemaId: workspaceId,
      displayName: 'Concurrent Name'
    });
    await web.files.confirm(owner, sameNameA.requestId, sameNameA.confirmationToken);
    await web.files.confirm(owner, sameNameB.requestId, sameNameB.confirmationToken);
    const concurrentFile = await migrator.files.applyConfirmed(sameNameA.requestId);
    await assert.rejects(
      migrator.files.applyConfirmed(sameNameB.requestId),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'file_ddl_conflict'
    );
    await apply(web, migrator, owner, {
      type: 'file.drop', commandId: commandId(), fileId: concurrentFile.targetFileId!
    });

    const guardedFile = await apply(web, migrator, owner, {
      type: 'file.create', commandId: commandId(), schemaId: workspaceId,
      displayName: 'Guarded Drop'
    });
    await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: guardedFile.targetFileId!,
      displayName: 'Value', physicalName: 'value', storageType: 'text',
      field: 'text', format: 'plain'
    });
    await admin.query(`
      CREATE VIEW workspace.guarded_drop_view AS
        SELECT value FROM workspace.guarded_drop;
      ALTER VIEW workspace.guarded_drop_view OWNER TO tabular_task5_owner;
    `);
    const guardedDrop = await web.files.plan(owner, {
      type: 'file.drop', commandId: commandId(), fileId: guardedFile.targetFileId!
    });
    await web.files.confirm(owner, guardedDrop.requestId, guardedDrop.confirmationToken);
    await assert.rejects(
      migrator.files.applyConfirmed(guardedDrop.requestId),
      /other objects depend/
    );
    assert.equal((await admin.query(`
      SELECT to_regclass('workspace.guarded_drop') IS NOT NULL AS table_present,
             EXISTS (SELECT 1 FROM tabular.file_metadata WHERE object_id = $1) AS metadata_present
    `, [guardedFile.targetFileId])).rows[0].table_present, true);
    await admin.query(`DROP VIEW workspace.guarded_drop_view`);
    await migrator.files.applyConfirmed(guardedDrop.requestId);
    assert.deepEqual((await admin.query(`
      SELECT to_regclass('workspace.guarded_drop') IS NULL AS table_removed,
             NOT EXISTS (SELECT 1 FROM tabular.file_metadata WHERE object_id = $1) AS metadata_removed
    `, [guardedFile.targetFileId])).rows[0], {
      table_removed: true,
      metadata_removed: true
    });

    const displayOnly = await apply(web, migrator, owner, {
      type: 'file.rename', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Customer Orders'
    });
    assert.equal(displayOnly.targetFileId, created.targetFileId);
    assert.equal((await admin.query(`
      SELECT display_name FROM tabular.file_metadata WHERE object_id = $1
    `, [created.targetFileId])).rows[0].display_name, 'Customer Orders');
    assert.equal(
      (await web.files.displayNames(owner, [created.targetFileId!])).get(created.targetFileId!),
      'Customer Orders'
    );
    assert.equal((await admin.query(`
      SELECT to_regclass('workspace.untitled_file')::text AS name
    `)).rows[0].name, 'workspace.untitled_file');

    const metadataWinner = await web.files.plan(owner, {
      type: 'file.rename', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Customer Orders v2'
    });
    assert.equal((await web.files.status(owner, metadataWinner.requestId)).state, 'planned');
    const metadataStale = await web.files.plan(owner, {
      type: 'file.rename', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Stale Customer Orders'
    });
    const firstConfirmation = await web.files.confirm(
      owner,
      metadataWinner.requestId,
      metadataWinner.confirmationToken
    );
    const confirmedStatus = await web.files.status(owner, metadataWinner.requestId);
    assert.equal(confirmedStatus.state, 'confirmed');
    assert.equal(confirmedStatus.operation?.state, 'queued');
    assert.deepEqual(
      await web.files.confirm(owner, metadataWinner.requestId, metadataWinner.confirmationToken),
      firstConfirmation
    );
    await web.files.confirm(owner, metadataStale.requestId, metadataStale.confirmationToken);
    await migrator.files.applyConfirmed(metadataWinner.requestId);
    await assert.rejects(
      migrator.files.applyConfirmed(metadataStale.requestId),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'file_ddl_stale'
    );
    assert.equal((await admin.query(`
      SELECT display_name FROM tabular.file_metadata WHERE object_id = $1
    `, [created.targetFileId])).rows[0].display_name, 'Customer Orders v2');

    const expiredPlan = await web.files.plan(owner, {
      type: 'file.rename', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Expired Rename'
    });
    await web.files.confirm(owner, expiredPlan.requestId, expiredPlan.confirmationToken);
    await admin.query(`
      UPDATE tabular.file_ddl_requests
         SET created_at = clock_timestamp() - interval '10 minutes',
             expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1
    `, [expiredPlan.requestId]);
    await assert.rejects(
      migrator.files.applyConfirmed(expiredPlan.requestId),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'file_ddl_confirmation_denied'
    );

    const idColumn = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Record ID', physicalName: 'record_id', storageType: 'text',
      field: 'text', format: 'plain-text', required: true
    });
    const tenantColumn = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Tenant', physicalName: 'tenant_code', storageType: 'text',
      field: 'text', format: 'plain-text', required: true
    });
    const customerColumn = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Customer', physicalName: 'customer_code', storageType: 'text',
      field: 'relation', format: 'related-record', required: true
    });
    const amountColumn = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Amount', physicalName: 'amount', storageType: 'numeric',
      field: 'number', format: 'currency',
      default: { mode: 'literal', value: { type: 'numeric', value: '0.00' } }
    });
    const firstColumn = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'First', physicalName: 'first_name', storageType: 'text',
      field: 'text', format: 'plain-text'
    });
    const lastColumn = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Last', physicalName: 'last_name', storageType: 'text',
      field: 'text', format: 'plain-text'
    });
    const generatedColumn = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Full Name', physicalName: 'full_name', storageType: 'text',
      field: 'text', format: 'plain-text',
      generated: {
        kind: 'concat-text',
        columnIds: [firstColumn.targetColumnId!, lastColumn.targetColumnId!],
        separator: ' '
      }
    });
    await assert.rejects(
      web.files.plan(owner, {
        type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
        displayName: 'Invalid Generated', physicalName: 'invalid_generated',
        storageType: 'text', field: 'computed', format: 'plain',
        generated: {
          kind: 'concat-text', columnIds: [amountColumn.targetColumnId!], separator: ' '
        }
      }),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'file_ddl_unavailable'
    );
    const metadataAxes = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Notes', physicalName: 'notes', storageType: 'text',
      field: 'markdown-source', format: 'code-highlighting',
      fieldConfig: { language: 'markdown' }, formatConfig: { theme: 'plain' }
    });
    await assert.rejects(
      web.files.plan(owner, {
        type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
        displayName: 'Notes Collision', physicalName: 'notes', storageType: 'text',
        field: 'text', format: 'plain'
      }),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'file_ddl_conflict'
    );
    const derivedColumnCollision = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Notes', storageType: 'text', field: 'text', format: 'plain'
    });
    assert.equal(derivedColumnCollision.physicalName, 'notes_2');
    await apply(web, migrator, owner, {
      type: 'column.drop', commandId: commandId(), fileId: created.targetFileId!,
      columnId: derivedColumnCollision.targetColumnId!
    });
    const disposableUnique = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Temporary Unique', physicalName: 'temporary_unique', storageType: 'text',
      field: 'text', format: 'plain', unique: true
    });
    await apply(web, migrator, owner, {
      type: 'column.configure', commandId: commandId(), fileId: created.targetFileId!,
      columnId: disposableUnique.targetColumnId!, unique: false
    });
    await apply(web, migrator, owner, {
      type: 'column.drop', commandId: commandId(), fileId: created.targetFileId!,
      columnId: disposableUnique.targetColumnId!
    });
    assert.deepEqual((await admin.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_attribute
         WHERE attrelid = 'workspace.untitled_file'::regclass
           AND attname = 'temporary_unique' AND NOT attisdropped
      ) AS native_present,
      EXISTS (
        SELECT 1 FROM tabular.column_metadata WHERE column_id = $1
      ) AS metadata_present
    `, [disposableUnique.targetColumnId])).rows[0], {
      native_present: false,
      metadata_present: false
    });
    await apply(web, migrator, owner, {
      type: 'key.create', commandId: commandId(), fileId: created.targetFileId!,
      columnIds: [idColumn.targetColumnId!], key: 'primary'
    });
    await admin.query(`
      INSERT INTO finance.customers (tenant_code, customer_code, label)
      VALUES ('acme', 'c1', 'First');
      INSERT INTO workspace.untitled_file (
        record_id, tenant_code, customer_code, first_name, last_name
      ) VALUES ('r1', 'acme', 'c1', 'Ada', 'Lovelace');
    `);
    assert.equal((await admin.query(`
      SELECT amount::text AS amount, full_name
        FROM workspace.untitled_file WHERE record_id = 'r1'
    `)).rows[0].amount, '0.00');
    assert.equal((await admin.query(`
      SELECT full_name FROM workspace.untitled_file WHERE record_id = 'r1'
    `)).rows[0].full_name, 'Ada Lovelace');
    await apply(web, migrator, owner, {
      type: 'column.configure', commandId: commandId(), fileId: created.targetFileId!,
      columnId: amountColumn.targetColumnId!,
      default: { mode: 'literal', value: { type: 'numeric', value: '2.50' } }
    });
    await admin.query(`
      INSERT INTO workspace.untitled_file (
        record_id, tenant_code, customer_code, first_name, last_name
      ) VALUES ('r2', 'acme', 'c1', 'Grace', 'Hopper')
    `);
    assert.equal((await admin.query(`
      SELECT amount::text AS amount FROM workspace.untitled_file WHERE record_id = 'r2'
    `)).rows[0].amount, '2.50');
    await apply(web, migrator, owner, {
      type: 'column.configure', commandId: commandId(), fileId: created.targetFileId!,
      columnId: amountColumn.targetColumnId!, default: { mode: 'drop' }
    });
    assert.equal((await admin.query(`
      SELECT pg_get_expr(d.adbin, d.adrelid) AS expression
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = 'workspace.untitled_file'::regclass AND a.attname = 'amount'
    `)).rows[0].expression, null);

    const columnMetadataWinner = await web.files.plan(owner, {
      type: 'column.configure', commandId: commandId(), fileId: created.targetFileId!,
      columnId: amountColumn.targetColumnId!, displayName: 'Order Amount'
    });
    const columnMetadataStale = await web.files.plan(owner, {
      type: 'column.configure', commandId: commandId(), fileId: created.targetFileId!,
      columnId: amountColumn.targetColumnId!, displayName: 'Stale Amount'
    });
    await web.files.confirm(
      owner,
      columnMetadataWinner.requestId,
      columnMetadataWinner.confirmationToken
    );
    await web.files.confirm(
      owner,
      columnMetadataStale.requestId,
      columnMetadataStale.confirmationToken
    );
    await migrator.files.applyConfirmed(columnMetadataWinner.requestId);
    await assert.rejects(
      migrator.files.applyConfirmed(columnMetadataStale.requestId),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'file_ddl_stale'
    );
    assert.equal((await admin.query(`
      SELECT display_name FROM tabular.column_metadata WHERE column_id = $1
    `, [amountColumn.targetColumnId])).rows[0].display_name, 'Order Amount');

    const nullCandidate = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Null Candidate', physicalName: 'null_candidate', storageType: 'text',
      field: 'text', format: 'plain'
    });
    const requiredFailure = await web.files.plan(owner, {
      type: 'column.configure', commandId: commandId(), fileId: created.targetFileId!,
      columnId: nullCandidate.targetColumnId!, required: true
    });
    await web.files.confirm(owner, requiredFailure.requestId, requiredFailure.confirmationToken);
    await assert.rejects(
      migrator.files.applyConfirmed(requiredFailure.requestId),
      /contains null values/
    );
    assert.equal((await admin.query(`
      SELECT a.attnotnull FROM pg_attribute a
       WHERE a.attrelid = 'workspace.untitled_file'::regclass AND a.attname = 'null_candidate'
    `)).rows[0].attnotnull, false);

    const duplicateCandidate = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Duplicate Candidate', physicalName: 'duplicate_candidate', storageType: 'text',
      field: 'text', format: 'plain'
    });
    await admin.query(`UPDATE workspace.untitled_file SET duplicate_candidate = 'same'`);
    const uniqueFailure = await web.files.plan(owner, {
      type: 'column.configure', commandId: commandId(), fileId: created.targetFileId!,
      columnId: duplicateCandidate.targetColumnId!, unique: true
    });
    await web.files.confirm(owner, uniqueFailure.requestId, uniqueFailure.confirmationToken);
    await assert.rejects(
      migrator.files.applyConfirmed(uniqueFailure.requestId),
      /could not create unique index/
    );
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM pg_constraint
       WHERE conrelid = 'workspace.untitled_file'::regclass
         AND contype = 'u' AND conname LIKE 'tabular_uniq_%'
         AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
           WHERE attrelid = 'workspace.untitled_file'::regclass
             AND attname = 'duplicate_candidate')]::smallint[]
    `)).rows[0].count, 0);

    const managedDrop = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Managed Drop', physicalName: 'managed_drop', storageType: 'text',
      field: 'text', format: 'plain', unique: true
    });
    await apply(web, migrator, owner, {
      type: 'column.drop', commandId: commandId(), fileId: created.targetFileId!,
      columnId: managedDrop.targetColumnId!
    });
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.file_managed_constraints
       WHERE object_id = $1 AND source_column_ids @> jsonb_build_array($2::text)
    `, [created.targetFileId, managedDrop.targetColumnId])).rows[0].count, 0);

    const selfTarget = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Self Target', physicalName: 'self_target', storageType: 'text',
      field: 'text', format: 'plain', unique: true
    });
    const selfSource = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Self Source', physicalName: 'self_source', storageType: 'text',
      field: 'relation', format: 'related-record'
    });
    await apply(web, migrator, owner, {
      type: 'relation.create', commandId: commandId(), fileId: created.targetFileId!,
      columnIds: [selfSource.targetColumnId!],
      targetFileId: created.targetFileId!,
      targetColumnIds: [selfTarget.targetColumnId!]
    });
    const selfLedgers = await admin.query(`
      SELECT physical_name, constraint_kind
        FROM tabular.file_managed_constraints
       WHERE object_id = $1
         AND (source_column_ids @> jsonb_build_array($2::text)
           OR target_column_ids @> jsonb_build_array($2::text))
       ORDER BY constraint_kind
    `, [created.targetFileId, selfTarget.targetColumnId]);
    assert.deepEqual(selfLedgers.rows.map((row) => row.constraint_kind), [
      'foreign-key', 'unique'
    ]);
    for (const row of selfLedgers.rows) {
      const name = String(row.physical_name);
      assert.match(name, /^tabular_(?:fk|uniq)_[a-f0-9]{20}$/);
      await admin.query(`ALTER TABLE workspace.untitled_file DROP CONSTRAINT "${name}"`);
    }
    await apply(web, migrator, owner, {
      type: 'column.drop', commandId: commandId(), fileId: created.targetFileId!,
      columnId: selfTarget.targetColumnId!
    });
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.file_managed_constraints
       WHERE (object_id = $1
         AND source_column_ids @> jsonb_build_array($2::text))
          OR (target_object_id = $1
         AND target_column_ids @> jsonb_build_array($2::text))
    `, [created.targetFileId, selfTarget.targetColumnId])).rows[0].count, 0);

    stable = await stableCatalog(web, 'task00005');
    const financeFile = stableFile(stable, 'finance', 'customers');
    const financeTenant = stableColumn(stable, financeFile, 'tenant_code');
    const financeCustomer = stableColumn(stable, financeFile, 'customer_code');
    const keylessFile = stableFile(stable, 'finance', 'keyless');
    const keylessTenant = stableColumn(stable, keylessFile, 'tenant_code');
    const keylessCustomer = stableColumn(stable, keylessFile, 'customer_code');
    const viewFile = stableFile(stable, 'finance', 'customer_view');
    const viewTenant = stableColumn(stable, viewFile, 'tenant_code');
    const viewCustomer = stableColumn(stable, viewFile, 'customer_code');
    await assert.rejects(
      web.files.plan(owner, {
        type: 'relation.create', commandId: commandId(), fileId: created.targetFileId!,
        columnIds: [tenantColumn.targetColumnId!, customerColumn.targetColumnId!],
        targetFileId: viewFile,
        targetColumnIds: [viewTenant, viewCustomer]
      }),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'file_ddl_unavailable'
    );
    await assert.rejects(
      web.files.plan(owner, {
        type: 'relation.create', commandId: commandId(), fileId: created.targetFileId!,
        columnIds: [tenantColumn.targetColumnId!, customerColumn.targetColumnId!],
        targetFileId: keylessFile,
        targetColumnIds: [keylessTenant, keylessCustomer]
      }),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'file_ddl_unavailable'
    );
    await admin.query(`REVOKE REFERENCES ON finance.customers FROM tabular_task5_owner`);
    await assert.rejects(
      web.files.plan(owner, {
        type: 'relation.create', commandId: commandId(), fileId: created.targetFileId!,
        columnIds: [tenantColumn.targetColumnId!, customerColumn.targetColumnId!],
        targetFileId: financeFile,
        targetColumnIds: [financeTenant, financeCustomer]
      }),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'file_ddl_denied'
    );
    await admin.query(`
      GRANT REFERENCES (tenant_code, customer_code)
        ON finance.customers TO tabular_task5_owner
    `);
    const relation = await apply(web, migrator, owner, {
      type: 'relation.create', commandId: commandId(), fileId: created.targetFileId!,
      columnIds: [tenantColumn.targetColumnId!, customerColumn.targetColumnId!],
      targetFileId: financeFile,
      targetColumnIds: [financeTenant, financeCustomer]
    });
    assert.ok(relation.targetFileId);
    const foreignKey = await admin.query(`
      SELECT c.conkey::text AS source, c.confkey::text AS target,
             c.confupdtype, c.confdeltype, c.condeferrable
        FROM pg_constraint c
       WHERE c.conrelid = 'workspace.untitled_file'::regclass AND c.contype = 'f'
    `);
    assert.equal(foreignKey.rows.length, 1);
    assert.deepEqual({
      up: foreignKey.rows[0].confupdtype,
      del: foreignKey.rows[0].confdeltype,
      deferrable: foreignKey.rows[0].condeferrable
    }, { up: 'a', del: 'a', deferrable: false });
    const foreignKeyOrder = await admin.query(`
      SELECT array_to_json(ARRAY(
        SELECT a.attname
          FROM unnest(c.conkey) WITH ORDINALITY AS key(attnum, position)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
         ORDER BY key.position
      )) AS source_names,
      array_to_json(ARRAY(
        SELECT a.attname
          FROM unnest(c.confkey) WITH ORDINALITY AS key(attnum, position)
          JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = key.attnum
         ORDER BY key.position
      )) AS target_names
        FROM pg_constraint c
       WHERE c.conrelid = 'workspace.untitled_file'::regclass AND c.contype = 'f'
    `);
    assert.deepEqual(foreignKeyOrder.rows[0], {
      source_names: ['tenant_code', 'customer_code'],
      target_names: ['tenant_code', 'customer_code']
    });
    await assert.rejects(
      admin.query(`
        INSERT INTO workspace.untitled_file (record_id, tenant_code, customer_code)
        VALUES ('bad', 'missing', 'missing')
      `),
      /foreign key constraint/
    );

    await admin.query(`
      ALTER TABLE workspace.untitled_file ADD COLUMN __tabular_json_v1 text;
      ALTER TABLE workspace.untitled_file ADD COLUMN __tabular_row_v1 text;
    `);
    const hidden = await apply(web, migrator, owner, {
      type: 'hidden.install', commandId: commandId(), fileId: created.targetFileId!,
      purpose: 'unstructured-json'
    });
    assert.equal(hidden.physicalName, '__tabular_json_v2');
    const collision = await admin.query(`
      SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type,
             EXISTS (
               SELECT 1 FROM tabular.column_metadata m
                WHERE m.catalog_column_id = c.id AND m.hidden
             ) AS hidden
        FROM pg_attribute a
        JOIN tabular.catalog_objects o ON o.relation_oid = a.attrelid
        JOIN tabular.catalog_columns c
          ON c.object_id = o.id AND c.attribute_number = a.attnum
       WHERE a.attrelid = 'workspace.untitled_file'::regclass
         AND a.attname IN ('__tabular_json_v1', '__tabular_json_v2')
       ORDER BY a.attname
    `);
    assert.deepEqual(collision.rows, [
      { attname: '__tabular_json_v1', type: 'text', hidden: false },
      { attname: '__tabular_json_v2', type: 'jsonb', hidden: true }
    ]);
    const rank = await apply(web, migrator, owner, {
      type: 'hidden.install', commandId: commandId(), fileId: created.targetFileId!,
      purpose: 'shared-rank'
    });
    assert.equal(rank.physicalName, '__tabular_row_v2');
    const rankShape = await admin.query(`
      SELECT format_type(a.atttypid, a.atttypmod) AS type,
             coll.collname AS collation, NOT a.attnotnull AS nullable
        FROM pg_attribute a
        JOIN pg_collation coll ON coll.oid = a.attcollation
       WHERE a.attrelid = 'workspace.untitled_file'::regclass
         AND a.attname = '__tabular_row_v2'
    `);
    assert.deepEqual(rankShape.rows[0], { type: 'text', collation: 'C', nullable: true });
    await assert.rejects(
      web.files.plan(owner, {
        type: 'hidden.install', commandId: commandId(), fileId: created.targetFileId!,
        purpose: 'shared-rank'
      }),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'file_ddl_conflict'
    );

    const logical = await web.files.createUnstructuredColumn(owner, {
      fileId: created.targetFileId!,
      displayName: 'Score', field: 'number', format: 'plain-text'
    });
    await admin.query(`
      UPDATE workspace.untitled_file
         SET __tabular_json_v2 = jsonb_build_object(
           $1::text, CASE WHEN record_id = 'r1' THEN 42 ELSE 43 END,
           'other', false
         )
    `, [logical.id]);
    const promoted = await apply(web, migrator, owner, {
      type: 'json.promote', commandId: commandId(), fileId: created.targetFileId!,
      hiddenColumnId: hidden.targetColumnId!, jsonKey: logical.id,
      displayName: 'Score', physicalName: 'score', storageType: 'bigint',
      field: 'number', format: 'plain-text', required: true, unique: true
    });
    assert.equal(promoted.targetColumnId, logical.id);
    const promotedRow = await admin.query(`
      SELECT score::text AS score, __tabular_json_v2 AS remaining
        FROM workspace.untitled_file WHERE record_id = 'r1'
    `);
    assert.equal(promotedRow.rows[0].score, '42');
    assert.deepEqual(promotedRow.rows[0].remaining, { other: false });
    assert.equal((await admin.query(`
      SELECT storage_kind, catalog_column_id IS NOT NULL AS bound
        FROM tabular.column_metadata WHERE column_id = $1
    `, [logical.id])).rows[0].storage_kind, 'postgresql');
    await apply(web, migrator, owner, {
      type: 'column.configure', commandId: commandId(), fileId: created.targetFileId!,
      columnId: logical.id, unique: false
    });
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count
        FROM pg_constraint
       WHERE conrelid = 'workspace.untitled_file'::regclass
         AND contype = 'u' AND conkey = ARRAY[
           (SELECT attnum FROM pg_attribute
             WHERE attrelid = 'workspace.untitled_file'::regclass AND attname = 'score')
         ]::smallint[]
    `)).rows[0].count, 0);

    const promotedTargetFile = await apply(web, migrator, owner, {
      type: 'file.create', commandId: commandId(), schemaId: workspaceId,
      displayName: 'Promoted Target'
    });
    const promotedTargetHidden = await apply(web, migrator, owner, {
      type: 'hidden.install', commandId: commandId(), fileId: promotedTargetFile.targetFileId!,
      purpose: 'unstructured-json'
    });
    const promotedTargetLogical = await web.files.createUnstructuredColumn(owner, {
      fileId: promotedTargetFile.targetFileId!,
      displayName: 'Public Key', field: 'text', format: 'plain'
    });
    await apply(web, migrator, owner, {
      type: 'json.promote', commandId: commandId(), fileId: promotedTargetFile.targetFileId!,
      hiddenColumnId: promotedTargetHidden.targetColumnId!, jsonKey: promotedTargetLogical.id,
      displayName: 'Public Key', physicalName: 'public_key', storageType: 'text',
      field: 'text', format: 'plain', required: true, unique: true
    });
    const promotedTargetSource = await apply(web, migrator, owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Promoted Target Key', physicalName: 'promoted_target_key',
      storageType: 'text', field: 'relation', format: 'related-record'
    });
    await apply(web, migrator, owner, {
      type: 'relation.create', commandId: commandId(), fileId: created.targetFileId!,
      columnIds: [promotedTargetSource.targetColumnId!],
      targetFileId: promotedTargetFile.targetFileId!,
      targetColumnIds: [promotedTargetLogical.id]
    });
    const promotedTargetDescription = await web.files.describe(owner, created.targetFileId!);
    assert.ok(promotedTargetDescription.constraints.some((constraint) =>
      constraint.kind === 'f'
        && constraint.targetFileId === promotedTargetFile.targetFileId
        && constraint.targetColumnIds?.[0] === promotedTargetLogical.id
    ));
    const promotedRelationLedger = await admin.query(`
      SELECT physical_name FROM tabular.file_managed_constraints
       WHERE target_object_id = $1 AND constraint_kind = 'foreign-key'
    `, [promotedTargetFile.targetFileId]);
    const promotedRelationName = String(promotedRelationLedger.rows[0]?.physical_name || '');
    assert.match(promotedRelationName, /^tabular_fk_[a-f0-9]{20}$/);
    await admin.query(`
      ALTER TABLE workspace.untitled_file
        DROP CONSTRAINT "${promotedRelationName}"
    `);
    await apply(web, migrator, owner, {
      type: 'file.drop', commandId: commandId(), fileId: promotedTargetFile.targetFileId!
    });
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.file_managed_constraints
       WHERE target_object_id = $1
    `, [promotedTargetFile.targetFileId])).rows[0].count, 0);

    const invalidLogical = await web.files.createUnstructuredColumn(owner, {
      fileId: created.targetFileId!,
      displayName: 'Broken Number', field: 'number', format: 'plain-text'
    });
    await admin.query(`
      UPDATE workspace.untitled_file
         SET __tabular_json_v2 = __tabular_json_v2 || jsonb_build_object($1::text, 'not-a-number')
       WHERE record_id = 'r1'
    `, [invalidLogical.id]);
    const invalidPlan = await web.files.plan(owner, {
      type: 'json.promote', commandId: commandId(), fileId: created.targetFileId!,
      hiddenColumnId: hidden.targetColumnId!, jsonKey: invalidLogical.id,
      displayName: 'Broken Number', physicalName: 'broken_number', storageType: 'bigint',
      field: 'number', format: 'plain-text'
    });
    await web.files.confirm(owner, invalidPlan.requestId, invalidPlan.confirmationToken);
    await assert.rejects(migrator.files.applyConfirmed(invalidPlan.requestId), /invalid input syntax/);
    const retained = await admin.query(`
      SELECT to_regclass('workspace.untitled_file') IS NOT NULL AS table_present,
             EXISTS (
               SELECT 1 FROM pg_attribute
                WHERE attrelid = 'workspace.untitled_file'::regclass
                  AND attname = 'broken_number' AND NOT attisdropped
             ) AS column_present,
             __tabular_json_v2 ? $1::text AS json_retained
        FROM workspace.untitled_file WHERE record_id = 'r1'
    `, [invalidLogical.id]);
    assert.deepEqual(retained.rows[0], {
      table_present: true, column_present: false, json_retained: true
    });
    assert.equal((await admin.query(`
      SELECT state FROM tabular.file_ddl_requests WHERE id = $1
    `, [invalidPlan.requestId])).rows[0].state, 'confirmed');

    for (const [index, failpoint] of ([
      'after-add-column',
      'after-backfill',
      'after-json-removal'
    ] as const).entries()) {
      const failLogical = await web.files.createUnstructuredColumn(owner, {
        fileId: created.targetFileId!,
        displayName: `Failpoint ${index}`, field: 'number', format: 'number',
        formatConfig: { precision: 0 }
      });
      await admin.query(`
        UPDATE workspace.untitled_file
           SET __tabular_json_v2 = __tabular_json_v2
             || jsonb_build_object($1::text, (100 + $2::integer))
      `, [failLogical.id, index]);
      const failPlan = await web.files.plan(owner, {
        type: 'json.promote', commandId: commandId(), fileId: created.targetFileId!,
        hiddenColumnId: hidden.targetColumnId!, jsonKey: failLogical.id,
        displayName: `Failpoint ${index}`, physicalName: `failpoint_${index}`,
        storageType: 'bigint', field: 'number', format: 'number'
      });
      await web.files.confirm(owner, failPlan.requestId, failPlan.confirmationToken);
      await assert.rejects(
        migrator.files.applyConfirmed(failPlan.requestId, { failpoint }),
        new RegExp(`Injected file DDL failure: ${failpoint}`)
      );
      assert.deepEqual((await admin.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_attribute
           WHERE attrelid = 'workspace.untitled_file'::regclass
             AND attname = $1 AND NOT attisdropped
        ) AS column_present,
        bool_and(__tabular_json_v2 ? $2::text) AS json_retained
          FROM workspace.untitled_file
      `, [`failpoint_${index}`, failLogical.id])).rows[0], {
        column_present: false,
        json_retained: true
      });
    }

    const rlsLogical = await web.files.createUnstructuredColumn(owner, {
      fileId: created.targetFileId!,
      displayName: 'RLS Protected', field: 'number', format: 'number'
    });
    await admin.query(`
      UPDATE workspace.untitled_file
         SET __tabular_json_v2 = __tabular_json_v2
           || jsonb_build_object($1::text, 7)
       WHERE record_id = 'r1'
    `, [rlsLogical.id]);
    await admin.query(`
      ALTER TABLE workspace.untitled_file ENABLE ROW LEVEL SECURITY;
      ALTER TABLE workspace.untitled_file FORCE ROW LEVEL SECURITY;
      CREATE POLICY task5_rls_guard ON workspace.untitled_file
        FOR ALL TO tabular_task5_owner
        USING (record_id <> 'r1') WITH CHECK (record_id <> 'r1');
    `);
    const rlsPlan = await web.files.plan(owner, {
      type: 'json.promote', commandId: commandId(), fileId: created.targetFileId!,
      hiddenColumnId: hidden.targetColumnId!, jsonKey: rlsLogical.id,
      displayName: 'RLS Protected', physicalName: 'rls_protected',
      storageType: 'bigint', field: 'number', format: 'number'
    });
    await web.files.confirm(owner, rlsPlan.requestId, rlsPlan.confirmationToken);
    await assert.rejects(
      migrator.files.applyConfirmed(rlsPlan.requestId),
      /row-level security policy/
    );
    await admin.query(`
      DROP POLICY task5_rls_guard ON workspace.untitled_file;
      ALTER TABLE workspace.untitled_file NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE workspace.untitled_file DISABLE ROW LEVEL SECURITY;
    `);
    assert.deepEqual((await admin.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_attribute
         WHERE attrelid = 'workspace.untitled_file'::regclass
           AND attname = 'rls_protected' AND NOT attisdropped
      ) AS column_present,
      __tabular_json_v2 ? $1::text AS json_retained
        FROM workspace.untitled_file WHERE record_id = 'r1'
    `, [rlsLogical.id])).rows[0], {
      column_present: false,
      json_retained: true
    });

    const rollbackPlan = await web.files.plan(owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Rollback Me', physicalName: 'rollback_me', storageType: 'text',
      field: 'text', format: 'plain-text'
    });
    await web.files.confirm(owner, rollbackPlan.requestId, rollbackPlan.confirmationToken);
    await admin.query(`
      CREATE FUNCTION tabular.task5_reject_version() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'TASK00005_FINALIZER_SENTINEL';
      END
      $$;
      CREATE TRIGGER task5_reject_version
        BEFORE INSERT ON tabular.file_ddl_versions
        FOR EACH ROW EXECUTE FUNCTION tabular.task5_reject_version();
    `);
    await assert.rejects(migrator.files.applyConfirmed(rollbackPlan.requestId), /TASK00005_FINALIZER_SENTINEL/);
    await admin.query(`
      DROP TRIGGER task5_reject_version ON tabular.file_ddl_versions;
      DROP FUNCTION tabular.task5_reject_version();
    `);
    assert.equal((await admin.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_attribute
         WHERE attrelid = 'workspace.untitled_file'::regclass
           AND attname = 'rollback_me' AND NOT attisdropped
      ) AS found
    `)).rows[0].found, false);

    const stalePlan = await web.files.plan(owner, {
      type: 'column.create', commandId: commandId(), fileId: created.targetFileId!,
      displayName: 'Stale', physicalName: 'stale_column', storageType: 'text',
      field: 'text', format: 'plain-text'
    });
    await web.files.confirm(owner, stalePlan.requestId, stalePlan.confirmationToken);
    await admin.query(`ALTER TABLE workspace.untitled_file ADD COLUMN external_drift text`);
    await assert.rejects(
      migrator.files.applyConfirmed(stalePlan.requestId),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'file_ddl_stale'
    );
    assert.equal((await admin.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_attribute
         WHERE attrelid = 'workspace.untitled_file'::regclass
           AND attname = 'stale_column' AND NOT attisdropped
      ) AS found
    `)).rows[0].found, false);

    const described = await web.files.describe(owner, created.targetFileId!);
    assert.equal(described.displayName, 'Customer Orders v2');
    assert.equal(described.physical.name, 'untitled_file');
    assert.equal(described.physical.readOnly, false);
    assert.ok(described.columns.some((column) => column.id === logical.id && column.physicalName === 'score'));
    assert.ok(described.columns.some((column) =>
      column.id === generatedColumn.targetColumnId && column.readOnly
    ));
    assert.ok(described.columns.some((column) =>
      column.id === metadataAxes.targetColumnId
        && column.field === 'markdown-source'
        && column.format === 'code-highlighting'
        && column.fieldConfig.language === 'markdown'
        && column.formatConfig.theme === 'plain'
    ));
    assert.equal(described.columns.some((column) => column.hidden), false);
    assert.ok(described.constraints.some((constraint) => constraint.kind === 'f'));

    await admin.query(`
      CREATE TABLE workspace.nullable_unique_identity (
        id text UNIQUE,
        value text NOT NULL
      );
      CREATE TABLE workspace.index_only_identity (
        id text NOT NULL,
        value text NOT NULL
      );
      CREATE UNIQUE INDEX index_only_identity_key ON workspace.index_only_identity (id);
      CREATE TABLE workspace.hidden_key_identity (
        id text PRIMARY KEY,
        value text NOT NULL
      );
      ALTER TABLE workspace.nullable_unique_identity OWNER TO tabular_task5_owner;
      ALTER TABLE workspace.index_only_identity OWNER TO tabular_task5_owner;
      ALTER TABLE workspace.hidden_key_identity OWNER TO tabular_task5_owner;
    `);
    stable = await stableCatalog(web, 'task00005');
    const nullableIdentityFile = stableFile(stable, 'workspace', 'nullable_unique_identity');
    const indexOnlyIdentityFile = stableFile(stable, 'workspace', 'index_only_identity');
    const hiddenKeyIdentityFile = stableFile(stable, 'workspace', 'hidden_key_identity');
    assert.equal((await web.files.describe(owner, nullableIdentityFile)).physical.readOnly, true);
    assert.equal((await web.files.describe(owner, indexOnlyIdentityFile)).physical.readOnly, true);

    await admin.query(`
      GRANT SELECT (value), UPDATE (value)
        ON workspace.hidden_key_identity TO tabular_task5_reader;
      GRANT SELECT ON workspace.untitled_file TO tabular_task5_reader;
      GRANT SELECT (tenant_code, customer_code)
        ON finance.customers TO tabular_task5_reader;
    `);
    const hiddenKeyDescription = await web.files.describe(reader, hiddenKeyIdentityFile);
    assert.equal(hiddenKeyDescription.physical.readOnly, true);
    assert.deepEqual(hiddenKeyDescription.columns.map((column) => column.physicalName), ['value']);
    const readerDescription = await web.files.describe(reader, created.targetFileId!);
    assert.equal(readerDescription.physical.readOnly, true);
    assert.ok(readerDescription.columns.length > 0);
    assert.ok(readerDescription.columns.every((column) => column.readOnly));
    const redactedRelation = readerDescription.constraints.find((constraint) =>
      constraint.kind === 'f' && constraint.columnIds.includes(tenantColumn.targetColumnId!)
    );
    assert.ok(redactedRelation);
    assert.equal(redactedRelation.targetFileId, undefined);
    assert.equal(redactedRelation.targetColumnIds, undefined);
    assert.equal(redactedRelation.definition, 'FOREIGN KEY (target redacted)');

    await admin.query(`
      GRANT USAGE ON SCHEMA finance TO tabular_task5_reader;
      REVOKE SELECT (tenant_code, customer_code)
        ON finance.customers FROM tabular_task5_reader;
      GRANT SELECT (label) ON finance.customers TO tabular_task5_reader;
    `);
    const partialTargetDescription = await web.files.describe(reader, created.targetFileId!);
    const partialTargetRelation = partialTargetDescription.constraints.find((constraint) =>
      constraint.kind === 'f' && constraint.columnIds.includes(tenantColumn.targetColumnId!)
    );
    assert.ok(partialTargetRelation);
    assert.equal(partialTargetRelation.targetFileId, undefined);
    assert.equal(partialTargetRelation.definition, 'FOREIGN KEY (target redacted)');

    await admin.query(`
      GRANT SELECT (tenant_code, customer_code)
        ON finance.customers TO tabular_task5_reader
    `);
    const visibleTargetDescription = await web.files.describe(reader, created.targetFileId!);
    const visibleTargetRelation = visibleTargetDescription.constraints.find((constraint) =>
      constraint.kind === 'f' && constraint.columnIds.includes(tenantColumn.targetColumnId!)
    );
    assert.equal(visibleTargetRelation?.targetFileId, financeFile);
    assert.deepEqual(visibleTargetRelation?.targetColumnIds, [financeTenant, financeCustomer]);

    await admin.query(`
      REVOKE SELECT ON workspace.untitled_file FROM tabular_task5_reader;
      GRANT SELECT (record_id) ON workspace.untitled_file TO tabular_task5_reader;
    `);
    const columnReaderDescription = await web.files.describe(reader, created.targetFileId!);
    assert.equal(columnReaderDescription.physical.readOnly, true);
    assert.deepEqual(
      columnReaderDescription.columns.map((column) => column.physicalName),
      ['record_id']
    );

    await admin.query(`
      ALTER TABLE workspace.untitled_file
        ALTER COLUMN __tabular_json_v2 DROP DEFAULT
    `);
    await assert.rejects(
      web.files.createUnstructuredColumn(owner, {
        fileId: created.targetFileId!,
        displayName: 'Drift Refused', field: 'text', format: 'plain'
      }),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'file_ddl_stale'
    );
    await admin.query(`
      ALTER TABLE workspace.untitled_file
        ALTER COLUMN __tabular_json_v2 SET DEFAULT '{}'::jsonb
    `);
    await admin.query(`
      ALTER TABLE workspace.untitled_file
        RENAME COLUMN __tabular_json_v2 TO externally_renamed_json
    `);
    await assert.rejects(
      web.files.plan(owner, {
        type: 'json.promote', commandId: commandId(), fileId: created.targetFileId!,
        hiddenColumnId: hidden.targetColumnId!, jsonKey: rlsLogical.id,
        displayName: 'Rename Refused', physicalName: 'rename_refused',
        storageType: 'bigint', field: 'number', format: 'number'
      }),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'file_ddl_unavailable'
    );
    assert.equal(
      (await web.files.describe(owner, created.targetFileId!)).columns
        .some((column) => column.id === rlsLogical.id),
      false
    );
    await admin.query(`
      ALTER TABLE workspace.untitled_file
        RENAME COLUMN externally_renamed_json TO __tabular_json_v2
    `);
    await web.files.describe(owner, created.targetFileId!);
    await admin.query(`
      ALTER TABLE workspace.untitled_file DROP COLUMN __tabular_json_v2;
      ALTER TABLE workspace.untitled_file ADD COLUMN __tabular_json_v2 text;
    `);
    await assert.rejects(
      web.files.createUnstructuredColumn(owner, {
        fileId: created.targetFileId!,
        displayName: 'Replacement Refused', field: 'text', format: 'plain'
      }),
      (error: unknown) => error instanceof ApplicationError
        && error.errorCode === 'file_ddl_unavailable'
    );
    assert.equal(
      (await web.files.describe(owner, created.targetFileId!)).columns
        .some((column) => column.id === rlsLogical.id),
      false
    );

    const roles = await admin.query(`
      SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
        FROM pg_roles WHERE rolname LIKE 'tabular_task5_%' ORDER BY rolname
    `);
    assert.ok(roles.rows.every((role) => !role.rolsuper && !role.rolcreatedb
      && !role.rolcreaterole && !role.rolreplication && !role.rolbypassrls));
    await admin.query(`
      UPDATE tabular.browser_sessions
         SET revoked_at = clock_timestamp(), revoke_reason = 'task5-replay-proof'
       WHERE id = $1
    `, [owner.sessionId]);
    assert.deepEqual(await migrator.files.applyConfirmed(created.requestId), created);
  } catch (error) {
    primaryFailure = error;
  } finally {
    try { await web?.close(); } catch (error) { cleanupFailures.push(asError(error)); }
    try {
      await migrator?.runtime.resources.close(10_000);
    } catch (error) { cleanupFailures.push(asError(error)); }
    try { await migrationPool.close(10_000); } catch (error) { cleanupFailures.push(asError(error)); }
    try { await resetFixture(admin); } catch (error) { cleanupFailures.push(asError(error)); }
    try { await admin.end(); } catch (error) { cleanupFailures.push(asError(error)); }
  }
  if (primaryFailure || cleanupFailures.length) {
    throw new AggregateError(
      [...(primaryFailure ? [asError(primaryFailure)] : []), ...cleanupFailures],
      'Task 00005 PostgreSQL integration failed',
      { cause: primaryFailure }
    );
  }
});

async function apply(
  web: Awaited<ReturnType<typeof startWeb>>,
  migrator: Awaited<ReturnType<typeof createApplication>>,
  principal: BrowserMutationPrincipal,
  action: FileDdlAction
) {
  const planned = await web.files.plan(principal, action);
  await web.files.confirm(principal, planned.requestId, planned.confirmationToken);
  return migrator.files.applyConfirmed(planned.requestId);
}

async function stableCatalog(
  application: Awaited<ReturnType<typeof startWeb>>,
  connectionId: string
) {
  return application.database.transaction('web', {}, (database) =>
    reconcileCatalog(database, connectionId)
  );
}

function stableSchema(stable: StableCatalogSnapshot, schema: string) {
  const value = [...stable.schemas.values()].find((item) => item.name === schema);
  assert.ok(value, `Missing stable schema ${schema}`);
  return value.stableId;
}

function stableFile(stable: StableCatalogSnapshot, schema: string, relation: string) {
  const schemaValue = [...stable.schemas.values()].find((item) => item.name === schema);
  const value = [...stable.objects.values()].find((item) =>
    item.schemaId === schemaValue?.stableId && item.name === relation
  );
  assert.ok(value, `Missing stable file ${schema}.${relation}`);
  return value.stableId;
}

function stableColumn(stable: StableCatalogSnapshot, fileId: string, column: string) {
  const value = [...stable.columns.values()].find((item) =>
    item.objectId === fileId && item.name === column
  );
  assert.ok(value, `Missing stable column ${fileId}.${column}`);
  return value.stableId;
}

function commandId() {
  return `cmd_${randomBytes(18).toString('base64url')}`;
}

function environment(webUrl: string, migratorUrl: string, kind: 'web' | 'migrator') {
  return {
    NODE_ENV: 'test',
    TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
    TABULAR_DATABASE_CONNECTION_ID: 'task00005',
    TABULAR_WEB_DATABASE_URL: webUrl,
    TABULAR_MIGRATOR_DATABASE_URL: migratorUrl,
    TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '600',
    TABULAR_SESSION_MAX_AGE_SECONDS: '3600',
    TABULAR_POOL_MAXIMUM: '8',
    TABULAR_PROCESS_KIND: kind
  };
}

async function resetFixture(admin: InstanceType<typeof Pool>) {
  await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS workspace CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS finance CASCADE');
  for (const role of [
    'tabular_task5_web',
    'tabular_task5_migrator',
    'tabular_task5_owner',
    'tabular_task5_finance_owner',
    'tabular_task5_reader'
  ]) {
    await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  }
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
