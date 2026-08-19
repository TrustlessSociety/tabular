//node
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import pg from 'pg';

//client
import type { BrowserMutationPrincipal } from '../../../../src/plugins/identity/helpers/contracts.js';
import type { SavedViewDefinition } from '../../../../src/plugins/saved-views/helpers/contracts.js';
import type { BrowserImportOperation } from '../../../../src/plugins/import-export/events/actions.js';
import type { ImportColumnMapping } from '../../../../src/plugins/import-export/helpers/mapping.js';
import { createApplication } from '../../../../src/bootstrap/application.js';
import { ApplicationError } from '../../../../src/bootstrap/errors.js';
import { runMigrations } from '../../../../src/plugins/database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../../../src/plugins/database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../../../src/plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../../src/plugins/database/migrations/index.js';
import { TestIdentityProvider } from '../../../plugins/identity/provider-double.js';
import {
  GOOGLE_READONLY_SCOPE
} from '../../../../src/plugins/import-export/helpers/google-sheets.js';
import { ImportExportPluginService } from '../../../../src/plugins/import-export/helpers/service.js';
import { operationHandler } from '../../../../src/plugins/operations/helpers/handlers.js';
import { OperationWorker } from '../../../../src/plugins/operations/helpers/worker.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TEST_POSTGRES_URL;

/**
 * Assert the disposable target.
 */
function assertDisposableTarget(value: string | undefined): asserts value is string {
  assert.equal(
    process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
    'task00011-disposable',
    'TABULAR_TEST_POSTGRES_DISPOSABLE must explicitly authorize destructive test cleanup'
  );
  assert.ok(value, 'TABULAR_TEST_POSTGRES_URL is required');
  const target = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/tabular_task00011');
  assert.ok(target.port);
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
}

test('PostgreSQL 18 staged imports, atomic worker commits, recovery, and authorized export', {
  timeout: 180_000
}, async () => {
  assertDisposableTarget(connectionString);
  const password = `p_${randomBytes(12).toString('hex')}`;
  const admin = new Pool({ connectionString, max: 8, allowExitOnIdle: true });
  const webUrl = roleUrl(connectionString, 'tabular_task11_web', password);
  const migratorUrl = roleUrl(connectionString, 'tabular_task11_migrator', password);
  const workerUrl = roleUrl(connectionString, 'tabular_task11_worker', password);
  const migratorPool = new ManagedPostgresPool({
    name: 'task00011-migrator',
    connectionString: migratorUrl,
    maximum: 2,
    applicationName: 'tabular-task00011-migrator'
  });
  let web: Awaited<ReturnType<typeof createApplication>> | undefined;
  let worker: Awaited<ReturnType<typeof createApplication>> | undefined;
  try {
    const version = await admin.query(`SELECT current_setting('server_version_num')::integer AS number`);
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);
    await reset(admin);
    await admin.query(`
      CREATE ROLE tabular_task11_web LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task11_migrator LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task11_worker LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task11_owner NOLOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task11_reader NOLOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT CONNECT, CREATE ON DATABASE tabular_task00011 TO tabular_task11_migrator;
      GRANT CONNECT ON DATABASE tabular_task00011 TO tabular_task11_web, tabular_task11_worker;
      GRANT tabular_task11_owner TO tabular_task11_web, tabular_task11_worker
        WITH INHERIT FALSE, SET TRUE;
      GRANT tabular_task11_reader TO tabular_task11_web
        WITH INHERIT FALSE, SET TRUE;
    `);
    assert.deepEqual(
      await runMigrations(transaction(migratorPool), await loadMigrations()),
      {
      applied: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012'],
      total: 12
      }
    );
    await admin.query(`
      GRANT USAGE ON SCHEMA tabular TO tabular_task11_web, tabular_task11_worker;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular
        TO tabular_task11_web, tabular_task11_worker;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular
        TO tabular_task11_web, tabular_task11_worker;
      CREATE SCHEMA workspace AUTHORIZATION tabular_task11_owner;
      CREATE TABLE workspace.q3_orders (occupied text);
      ALTER TABLE workspace.q3_orders OWNER TO tabular_task11_owner;
      GRANT USAGE ON SCHEMA workspace TO tabular_task11_reader;
    `);

    const env = environment(webUrl, migratorUrl, workerUrl);
    web = await createApplication({
      processKind: 'web', env, projectRoot: process.cwd(), runtimeRoot: process.cwd()
    });
    worker = await createApplication({
      processKind: 'worker', env, projectRoot: process.cwd(), runtimeRoot: process.cwd()
    });
    const provider = new TestIdentityProvider();
    const ownerSubject = await provider.verify({
      assertion: 'verified-test-assertion', subject: 'task11-owner', displayName: 'Import owner'
    });
    const readerSubject = await provider.verify({
      assertion: 'verified-test-assertion', subject: 'task11-reader', displayName: 'Import reader'
    });
    await web.identity.provisionIdentityRole(ownerSubject, 'tabular_task11_owner');
    await web.identity.provisionIdentityRole(readerSubject, 'tabular_task11_reader');
    const ownerSession = await web.identity.establishBrowserSession(ownerSubject);
    const readerSession = await web.identity.establishBrowserSession(readerSubject);
    const owner = await mutation(web, ownerSession.cookieToken, ownerSession.csrfToken);
    const reader = await mutation(web, readerSession.cookieToken, readerSession.csrfToken);
    const catalog = await web.catalog.discover(ownerSession.principal);
    const workspace = catalog.schemas.find((schema) => schema.name === 'workspace')!;

    await assert.rejects(
      web.importExport.create(reader, createInput(workspace.id, Buffer.from('a\n1'), 'Denied.csv')),
      applicationCode('file_ddl_denied')
    );

    const source = Buffer.from([
      'code,name,amount',
      '001,Alpha,10.50',
      '002,"=SUM(A1)",2',
      '003,Gamma,20'
    ].join('\r\n'));
    const operation = await stageCsv(web, owner, workspace.id, source, 'Q3-orders.csv');
    assert.equal(operation.state, 'ready');
    assert.equal(operation.identity.tableName, 'q3_orders_2', 'automatic destinations are collision-safe');
    assert.equal(operation.preview[0]?.[0], '001');
    const replay = await web.importExport.create(
      owner,
      createInput(workspace.id, source, 'Q3-orders.csv', operation.commandId)
    );
    assert.equal(replay.id, operation.id);
    await assert.rejects(
      web.importExport.create(
        owner,
        createInput(workspace.id, source, 'Changed.csv', operation.commandId)
      ),
      applicationCode('import_idempotency_conflict')
    );

    const stalePrepared = await web.importExport.prepareConfirmation(owner, operation.id);
    await web.importExport.finalizeSource(owner, operation.id);
    await assert.rejects(
      web.importExport.confirm(owner, operation.id, stalePrepared.confirmationToken),
      applicationCode('import_confirmation_denied')
    );
    const prepared = await web.importExport.prepareConfirmation(owner, operation.id);
    const confirmed = await web.importExport.confirm(owner, operation.id, prepared.confirmationToken);
    assert.equal(confirmed.state, 'confirmed');
    await assert.rejects(
      web.importExport.cancel(owner, operation.id),
      applicationCode('import_conflict')
    );
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count
        FROM tabular.operation_jobs
       WHERE kind = 'import.commit' AND payload->>'importId' = $1
    `, [operation.id])).rows[0].count, 1);
    const committed = await worker.importExport.executeConfirmedImport(operation.id) as WorkerResult;
    assert.equal(committed.state, 'committed');
    assert.equal(committed.rowsCommitted, 3);
    assert.equal(
      (await worker.importExport.executeConfirmedImport(operation.id) as WorkerResult).fileId,
      committed.fileId
    );
    assert.deepEqual((await admin.query(`
      SELECT code, name, amount::text AS amount
        FROM workspace.q3_orders_2 ORDER BY code
    `)).rows, [
      { code: '001', name: 'Alpha', amount: '10.50' },
      { code: '002', name: '=SUM(A1)', amount: '2' },
      { code: '003', name: 'Gamma', amount: '20' }
    ]);
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.import_commits WHERE import_id = $1
    `, [operation.id])).rows[0].count, 1);
    assert.deepEqual((await admin.query(`
      SELECT
        (SELECT count(*)::integer FROM tabular.import_source_chunks WHERE import_id = $1) AS chunks,
        (SELECT count(*)::integer FROM tabular.import_rows WHERE import_id = $1) AS rows,
        (SELECT count(*)::integer FROM tabular.import_row_issues WHERE import_id = $1) AS issues
    `, [operation.id])).rows[0], { chunks: 0, rows: 0, issues: 0 });

    const description = await web.files.describe(ownerSession.principal, committed.fileId);
    const byPhysical = new Map(description.columns.map((column) => [column.physicalName, column]));
    const name = byPhysical.get('name')!;
    const amount = byPhysical.get('amount')!;
    const definition: SavedViewDefinition = {
      schemaVersion: 1,
      columnOrder: [name.id, amount.id],
      hiddenColumnIds: [],
      sorts: [{ columnId: amount.id, direction: 'desc' }],
      filters: [{ columnId: amount.id, operation: '>=', value: 5 }],
      presentation: {},
      includes: {
        filtersAndSorting: true,
        columnLayout: true,
        cellPresentation: true
      }
    };
    const view = await web.savedViews.create(owner, {
      fileId: committed.fileId,
      name: 'Higher value orders',
      access: 'private',
      definition
    }, commandId());
    const exported = await web.importExport.exportCsv(ownerSession.principal, {
      fileId: committed.fileId,
      viewId: view.id,
      expectedViewVersion: view.version
    });
    assert.equal(exported.rowCount, 2);
    assert.equal(exported.bytes, '\uFEFF"name","amount"\r\n"Gamma",20\r\n"Alpha",10.50\r\n');
    const updatedView = await web.savedViews.update(owner, {
      viewId: view.id,
      expectedVersion: view.version,
      name: view.name,
      access: view.access,
      definition: view.definition
    }, commandId());
    await assert.rejects(
      web.importExport.exportCsv(ownerSession.principal, {
        fileId: committed.fileId,
        viewId: updatedView.id,
        expectedViewVersion: view.version
      }),
      applicationCode('import_conflict')
    );
    const current = await web.importExport.exportCsv(ownerSession.principal, {
      fileId: committed.fileId,
      columnIds: [name.id]
    });
    assert.match(current.bytes, /"'=SUM\(A1\)"/);
    assert.equal(current.sanitizedCells, 1);

    await admin.query(`
      INSERT INTO workspace.q3_orders_2 (__tabular_row_id_v1, code, name, amount)
      SELECT 'row_zpad_' || lpad(series::text, 4, '0'),
             'PAD-' || series::text, 'Padding row ' || series::text, series::numeric
        FROM generate_series(1, 1000) series;
      INSERT INTO workspace.q3_orders_2 (__tabular_row_id_v1, code, name, amount)
      VALUES ('row_zzzz_target', 'TARGET', 'Beyond window', 99999);
    `);
    const defaultWindow = await web.grid.load(ownerSession.principal, committed.fileId);
    assert.equal(defaultWindow?.rows.length, 1000);
    assert.equal(
      defaultWindow?.rows.some((row) => row[name.id] === 'Beyond window'),
      false,
      'the matching row is deliberately beyond the default unfiltered grid window'
    );
    const beyondDefinition: SavedViewDefinition = {
      ...definition,
      filters: [{ columnId: name.id, operation: '=', value: 'Beyond window' }]
    };
    const beyondView = await web.savedViews.create(owner, {
      fileId: committed.fileId,
      name: 'Beyond default window',
      access: 'private',
      definition: beyondDefinition
    }, commandId());
    const visibleSavedView = await web.grid.load(ownerSession.principal, committed.fileId, {
      columnIds: [name.id, amount.id],
      sorts: beyondView.definition.sorts,
      filters: beyondView.definition.filters,
      view: {
        id: beyondView.id,
        version: beyondView.version,
        definition: beyondView.definition
      }
    });
    assert.deepEqual(visibleSavedView?.rows.map((row) => ({
      name: row[name.id], amount: row[amount.id]
    })), [{ name: 'Beyond window', amount: '99999' }]);
    const beyondExport = await web.importExport.exportCsv(ownerSession.principal, {
      fileId: committed.fileId,
      viewId: beyondView.id,
      expectedViewVersion: beyondView.version
    });
    assert.equal(
      beyondExport.bytes,
      '\uFEFF"name","amount"\r\n"Beyond window","99,999"\r\n',
      'the visible saved-view result and authorized export share the server query semantics'
    );

    const invalidSource = Buffer.from('amount\n10\nnot-a-number');
    const invalid = await stageCsv(web, owner, workspace.id, invalidSource, 'Invalid.csv');
    const numericMapping: ImportColumnMapping[] = invalid.mapping.map((entry) => ({
      ...entry, storageType: 'numeric'
    }));
    const rejectedMapping = await web.importExport.updateMapping(owner, {
      importId: invalid.id,
      mapping: numericMapping,
      fileDisplayName: invalid.identity.fileName,
      tableName: invalid.identity.tableName
    });
    assert.equal(rejectedMapping.state, 'preview');
    assert.equal(rejectedMapping.counts.issues, 1);
    await assert.rejects(
      web.importExport.prepareConfirmation(owner, invalid.id),
      applicationCode('import_unavailable')
    );
    const repaired = await web.importExport.updateMapping(owner, {
      importId: invalid.id,
      mapping: numericMapping.map((entry) => ({ ...entry, storageType: 'text' })),
      fileDisplayName: invalid.identity.fileName,
      tableName: invalid.identity.tableName
    });
    assert.equal(repaired.state, 'ready');

    const cancelled = await stageCsv(
      web, owner, workspace.id, Buffer.from('value\nkept-staged-only'), 'Cancelled.csv'
    );
    assert.equal((await web.importExport.cancel(owner, cancelled.id)).state, 'cancelled');
    assert.deepEqual((await admin.query(`
      SELECT
        (SELECT count(*)::integer FROM tabular.import_source_chunks WHERE import_id = $1) AS chunks,
        (SELECT count(*)::integer FROM tabular.import_rows WHERE import_id = $1) AS rows,
        (SELECT count(*)::integer FROM tabular.import_row_issues WHERE import_id = $1) AS issues
    `, [cancelled.id])).rows[0], { chunks: 0, rows: 0, issues: 0 });
    await assert.rejects(
      worker.importExport.executeConfirmedImport(cancelled.id),
      applicationCode('import_unavailable')
    );
    assert.equal((await admin.query(`SELECT to_regclass('workspace.cancelled') IS NULL AS absent`)).rows[0].absent, true);

    const expired = await stageCsv(
      web, owner, workspace.id, Buffer.from('value\nexpired-staging'), 'Expired.csv'
    );
    await admin.query(`
      UPDATE tabular.import_operations
         SET created_at = clock_timestamp() - interval '2 hours',
             expires_at = clock_timestamp() - interval '1 hour'
       WHERE id = $1
    `, [expired.id]);
    const expiredCleanup = await worker.importExport.cleanupExpiredImports(25);
    assert.deepEqual(expiredCleanup, { cleaned: 1, importIds: [expired.id] });
    assert.deepEqual((await admin.query(`
      SELECT operation.state,
             operation.error_summary->>'code' AS error_code,
             (SELECT count(*)::integer FROM tabular.import_source_chunks WHERE import_id = $1) AS chunks,
             (SELECT count(*)::integer FROM tabular.import_rows WHERE import_id = $1) AS rows,
             (SELECT count(*)::integer FROM tabular.import_row_issues WHERE import_id = $1) AS issues
        FROM tabular.import_operations operation WHERE operation.id = $1
    `, [expired.id])).rows[0], {
      state: 'cancelled',
      error_code: 'import_staging_expired',
      chunks: 0,
      rows: 0,
      issues: 0
    });

    const partial = await stageCsv(
      web, owner, workspace.id, Buffer.from('value\none\ntwo'), 'Partial.csv'
    );
    const partialPrepared = await web.importExport.prepareConfirmation(owner, partial.id);
    await web.importExport.confirm(owner, partial.id, partialPrepared.confirmationToken);
    let failPartialOnce = true;
    worker.operations.handlers.register(operationHandler(
      'import.commit',
      'worker',
      async (context) => {
        if (!await context.markIrreversible()) throw new Error('Import operation was cancelled');
        const result = await worker!.importExport.executeConfirmedImport(
          context.job.payload.importId,
          {
            ...(failPartialOnce ? { failpoint: 'after-row-insert' as const } : {}),
            terminalOnFailure: false
          }
        );
        failPartialOnce = false;
        return {
          importId: result.importId,
          state: result.state,
          fileId: result.fileId,
          rowsCommitted: result.rowsCommitted,
          columnsCommitted: result.columnsCommitted,
          warnings: result.warnings
        };
      }
    ));
    const partialJob = (await admin.query<{ id: string, }>(`
      SELECT id FROM tabular.operation_jobs
       WHERE kind = 'import.commit' AND payload->>'importId' = $1
    `, [partial.id])).rows[0];
    assert.ok(partialJob);
    const operationWorker = new OperationWorker(worker.operations, 'worker', 'worker:task11');
    assert.equal(await operationWorker.runOnce(partialJob.id), true);
    assert.equal((await admin.query(`SELECT to_regclass('workspace.partial') IS NULL AS absent`)).rows[0].absent, true);
    assert.deepEqual((await admin.query(`
      SELECT operation.state AS import_state, job.state AS job_state, job.attempts
        FROM tabular.import_operations operation
        JOIN tabular.operation_jobs job ON job.payload->>'importId' = operation.id
       WHERE operation.id = $1
    `, [partial.id])).rows[0], {
      import_state: 'confirmed',
      job_state: 'retrying',
      attempts: 1
    });
    await admin.query(`
      UPDATE tabular.operation_jobs SET available_at = clock_timestamp() WHERE id = $1
    `, [partialJob.id]);
    failPartialOnce = false;
    assert.equal(await operationWorker.runOnce(partialJob.id), true);
    const recoveredJob = (await admin.query(`
      SELECT state, attempts, error_summary, diagnostics
        FROM tabular.operation_jobs WHERE id = $1
    `, [partialJob.id])).rows[0];
    assert.equal(
      recoveredJob.state,
      'succeeded',
      JSON.stringify(recoveredJob)
    );
    const recovered = (await admin.query<{ result_summary: WorkerResult, }>(`
      SELECT result_summary FROM tabular.import_operations WHERE id = $1
    `, [partial.id])).rows[0]?.result_summary;
    assert.equal(recovered?.rowsCommitted, 2, JSON.stringify(recovered));
    assert.equal((await admin.query(`SELECT count(*)::integer AS count FROM workspace.partial`)).rows[0].count, 2);
    assert.deepEqual((await admin.query(`
      SELECT state, attempts, file_id IS NOT NULL AS linked
        FROM tabular.operation_jobs WHERE id = $1
    `, [partialJob.id])).rows[0], { state: 'succeeded', attempts: 2, linked: true });
    assert.equal((await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.import_commits WHERE import_id = $1
    `, [partial.id])).rows[0].count, 1);

    const googleProvider = googleProviderDouble();
    const googleEnv = {
      ...env,
      TABULAR_GOOGLE_CLIENT_ID: 'task00011.apps.googleusercontent.com',
      TABULAR_GOOGLE_CLIENT_SECRET: 'task00011-client-secret',
      TABULAR_GOOGLE_REDIRECT_URI: 'https://tabular.test/events/import-google-callback',
      TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64url')
    };
    const googleWeb = new ImportExportPluginService(
      web.runtime,
      web.database,
      web.identity,
      web.capability,
      web.files,
      web.savedViews,
      web.operations,
      googleProvider.fetcher,
      googleEnv
    );
    const googleWorker = new ImportExportPluginService(
      worker.runtime,
      worker.database,
      worker.identity,
      worker.capability,
      worker.files,
      worker.savedViews,
      worker.operations,
      googleProvider.fetcher,
      googleEnv
    );
    const oauth = await googleWeb.startGoogleOAuth(
      owner,
      '/pages/import.html?folder=workspace'
    );
    const oauthState = new URL(oauth.authorizationUrl).searchParams.get('state');
    assert.ok(oauthState);
    await assert.rejects(
      googleWeb.completeGoogleOAuth(readerSession.principal, {
        state: oauthState,
        code: 'cross-session-code'
      }),
      applicationCode('google_oauth_denied')
    );
    assert.deepEqual(
      await googleWeb.completeGoogleOAuth(ownerSession.principal, {
        state: oauthState,
        code: 'owner-authorization-code'
      }),
      { status: 'connected', returnPath: '/pages/import.html?folder=workspace' }
    );
    await assert.rejects(
      googleWeb.completeGoogleOAuth(ownerSession.principal, {
        state: oauthState,
        code: 'replayed-authorization-code'
      }),
      applicationCode('google_oauth_denied')
    );
    const storedGoogle = (await admin.query(`
      SELECT octet_length(access_ciphertext)::integer AS access_bytes,
             octet_length(access_iv)::integer AS access_iv_bytes,
             octet_length(access_tag)::integer AS access_tag_bytes,
             octet_length(refresh_ciphertext)::integer AS refresh_bytes,
             consumed.consumed_at IS NOT NULL AS state_consumed,
             consumed.verifier_ciphertext IS NULL AS verifier_purged
        FROM tabular.google_connections connection
        CROSS JOIN tabular.google_oauth_states consumed
       WHERE connection.actor_identity_id = $1
         AND connection.session_id = $2
         AND consumed.actor_identity_id = $1
         AND consumed.session_id = $2
    `, [ownerSession.principal.identityId, ownerSession.principal.sessionId])).rows[0];
    assert.ok(storedGoogle.access_bytes > 0);
    assert.equal(storedGoogle.access_iv_bytes, 12);
    assert.equal(storedGoogle.access_tag_bytes, 16);
    assert.ok(storedGoogle.refresh_bytes > 0);
    assert.equal(storedGoogle.state_consumed, true);
    assert.equal(storedGoogle.verifier_purged, true);

    await admin.query(`
      UPDATE tabular.google_connections
         SET token_expires_at = clock_timestamp() - interval '1 second'
       WHERE actor_identity_id = $1 AND session_id = $2
    `, [ownerSession.principal.identityId, ownerSession.principal.sessionId]);
    const listed = await googleWeb.listGoogleSpreadsheets(owner);
    assert.deepEqual(listed.files.map((file) => file.id), ['sheet_task_00011']);
    assert.equal(googleProvider.refreshes, 1);

    const googleImport = await googleWeb.stageGoogleImport(owner, {
      commandId: commandId(),
      folderId: workspace.id,
      spreadsheetId: 'sheet_task_00011',
      sheetName: 'Orders'
    });
    assert.equal(googleImport.state, 'ready');
    assert.equal(googleImport.counts.rows, 2);
    const googleConfirmation = await googleWeb.prepareConfirmation(owner, googleImport.id);
    await googleWeb.confirm(owner, googleImport.id, googleConfirmation.confirmationToken);

    const readerOauth = await googleWeb.startGoogleOAuth(
      reader,
      '/pages/import.html?folder=workspace'
    );
    const readerOauthState = new URL(readerOauth.authorizationUrl).searchParams.get('state');
    assert.ok(readerOauthState);
    assert.equal((await googleWeb.completeGoogleOAuth(readerSession.principal, {
      state: readerOauthState,
      code: 'reader-authorization-code'
    })).status, 'connected');
    googleProvider.denyNextGoogleRequest = true;
    await assert.rejects(
      googleWeb.listGoogleSpreadsheets(reader),
      applicationCode('google_reauthentication_required')
    );
    assert.deepEqual((await admin.query(`
      SELECT revoked_at IS NOT NULL AS revoked,
             access_ciphertext IS NULL AS access_purged,
             refresh_ciphertext IS NULL AS refresh_purged
        FROM tabular.google_connections
       WHERE actor_identity_id = $1 AND session_id = $2
    `, [readerSession.principal.identityId, readerSession.principal.sessionId])).rows[0], {
      revoked: true,
      access_purged: true,
      refresh_purged: true
    });

    assert.equal(await web.identity.logoutBrowserSession({
      cookieToken: ownerSession.cookieToken,
      csrfToken: ownerSession.csrfToken,
      origin: 'https://tabular.test'
    }), true);
    const providerRequestsBeforeRejectedCommit = googleProvider.googleRequests;
    await assert.rejects(
      googleWorker.executeConfirmedImport(googleImport.id),
      applicationCode('import_unavailable')
    );
    assert.equal(
      googleProvider.googleRequests,
      providerRequestsBeforeRejectedCommit,
      'revoked authority is rejected before a provider credential or API is used'
    );
    assert.equal((await admin.query(`
      SELECT state FROM tabular.import_operations WHERE id = $1
    `, [googleImport.id])).rows[0].state, 'cancelled');
  } finally {
    await worker?.runtime.resources.close(2_000).catch(() => undefined);
    await web?.runtime.resources.close(2_000).catch(() => undefined);
    await migratorPool.close(2_000).catch(() => undefined);
    await reset(admin).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});

/**
 * Return the stage CSV result.
 */
async function stageCsv(
  application: Awaited<ReturnType<typeof createApplication>>,
  principal: BrowserMutationPrincipal,
  folderId: string,
  source: Buffer,
  sourceName: string
) {
  const input = createInput(folderId, source, sourceName);
  const created = await application.importExport.create(principal, input);
  await application.importExport.appendChunk(principal, created.id, 0, source);
  const staged = await application.importExport.finalizeSource(principal, created.id);
  return { ...(staged as BrowserImportOperation), commandId: input.commandId };
}

type WorkerResult = {
  importId: string,
  state: 'committed',
  fileId: string,
  fileName: string,
  tableName: string,
  folderId: string,
  folderName: string,
  qualifiedName: string,
  rowsCommitted: number,
  columnsCommitted: number,
};

/**
 * Create the input.
 */
function createInput(folderId: string, source: Buffer, sourceName: string, existingCommandId?: string) {
  return {
    commandId: existingCommandId || commandId(),
    folderId,
    sourceKind: 'csv' as const,
    sourceName,
    sourceMediaType: 'text/csv',
    sourceSize: source.byteLength,
    sourceOptions: {}
  };
}

/**
 * Return the mutation result.
 */
async function mutation(
  application: Awaited<ReturnType<typeof createApplication>>,
  cookieToken: string,
  csrfToken: string
) {
  return application.identity.requireBrowserMutation({
    cookieToken,
    csrfToken,
    origin: 'https://tabular.test'
  });
}

/**
 * Return the transaction result.
 */
function transaction(pool: ManagedPostgresPool) {
  return <Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
    withPostgreSqlTransaction(pool, {
      settings: {
        statement_timeout: '15000',
        lock_timeout: '15000',
        idle_in_transaction_session_timeout: '15000'
      }
    }, callback);
}

/**
 * Return the role URL result.
 */
function roleUrl(value: string, role: string, password: string) {
  const url = new URL(value);
  url.username = role;
  url.password = password;
  return url.toString();
}

/**
 * Return the environment result.
 */
function environment(webUrl: string, migratorUrl: string, workerUrl: string) {
  return {
    NODE_ENV: 'test',
    TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
    TABULAR_DATABASE_CONNECTION_ID: 'task00011',
    TABULAR_WEB_DATABASE_URL: webUrl,
    TABULAR_MIGRATOR_DATABASE_URL: migratorUrl,
    TABULAR_WORKER_DATABASE_URL: workerUrl,
    TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '600',
    TABULAR_SESSION_MAX_AGE_SECONDS: '3600',
    TABULAR_POOL_MAXIMUM: '8'
  };
}

/**
 * Return the command id result.
 */
function commandId() {
  return `cmd_${randomBytes(18).toString('base64url')}`;
}

/**
 * Return the application code result.
 */
function applicationCode(code: string) {
  return (error: unknown) => error instanceof ApplicationError && error.errorCode === code;
}

/**
 * Return the google provider double result.
 */
function googleProviderDouble() {
  const state = {
    refreshes: 0,
    googleRequests: 0,
    denyNextGoogleRequest: false
  };
  /**
   * Return the fetcher result.
   */
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
      if (body.get('grant_type') === 'refresh_token') {
        state.refreshes += 1;
        return jsonResponse({
          access_token: `task00011-refreshed-${state.refreshes}`,
          expires_in: 3600,
          token_type: 'Bearer'
        });
      }
      return jsonResponse({
        access_token: `task00011-access-${body.get('code')}`,
        refresh_token: `task00011-refresh-${body.get('code')}`,
        expires_in: 3600,
        token_type: 'Bearer',
        scope: GOOGLE_READONLY_SCOPE
      });
    }
    if (url === 'https://oauth2.googleapis.com/revoke') return jsonResponse({});
    state.googleRequests += 1;
    if (state.denyNextGoogleRequest) {
      state.denyNextGoogleRequest = false;
      return jsonResponse({ error: { message: 'revoked in provider sandbox' } }, 401);
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      return jsonResponse({ files: [googleSpreadsheet()] });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files/sheet_task_00011?')) {
      return jsonResponse(googleSpreadsheet());
    }
    if (url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/sheet_task_00011/values/Orders?')) {
      return jsonResponse({
        range: 'Orders!A1:B3',
        majorDimension: 'ROWS',
        values: [['code', 'amount'], ['G-001', '10.50'], ['G-002', '20']]
      });
    }
    if (url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/sheet_task_00011?')) {
      return jsonResponse({
        spreadsheetId: 'sheet_task_00011',
        properties: { title: 'Google task 00011' },
        sheets: [{ properties: { sheetId: 0, title: 'Orders', index: 0, gridProperties: {} } }]
      });
    }
    return jsonResponse({ error: { message: `unexpected provider URL: ${url}` } }, 500);
  };
  return {
    fetcher,
    /**
     * Return the refreshes value.
     */
    get refreshes() { return state.refreshes; },
    /**
     * Return the google requests value.
     */
    get googleRequests() { return state.googleRequests; },
    /**
     * Return the deny next google request value.
     */
    get denyNextGoogleRequest() { return state.denyNextGoogleRequest; },
    /**
     * Set the deny next google request value.
     */
    set denyNextGoogleRequest(value: boolean) { state.denyNextGoogleRequest = value; }
  };
}

/**
 * Return the google spreadsheet result.
 */
function googleSpreadsheet() {
  return {
    id: 'sheet_task_00011',
    name: 'Google task 00011',
    modifiedTime: '2026-08-01T00:00:00.000Z',
    version: '17',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    trashed: false
  };
}

/**
 * Return the JSON response result.
 */
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Reset the current value.
 */
async function reset(admin: InstanceType<typeof Pool>) {
  await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS workspace CASCADE');
  for (const role of [
    'tabular_task11_web',
    'tabular_task11_migrator',
    'tabular_task11_worker',
    'tabular_task11_owner',
    'tabular_task11_reader'
  ]) {
    await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
  }
}
