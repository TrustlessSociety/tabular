//node
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import pg from 'pg';

//client
import type { StableCatalogSnapshot } from '../../../../src/plugins/catalog/helpers/contracts.js';
import type { McpToolName } from '../../../../src/plugins/mcp/helpers/contracts.js';
import { startWeb } from '../../../../src/bootstrap/application.js';
import { runMigrations } from '../../../../src/plugins/database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../../../src/plugins/database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../../../src/plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../../src/plugins/database/migrations/index.js';
import { reconcileCatalog } from '../../../../src/plugins/catalog/helpers/reconciliation.js';
import { TestIdentityProvider } from '../../../plugins/identity/provider-double.js';
import { GovernedMcpTransportAdapter } from '../../../../src/plugins/mcp/events/adapter.js';
import {
  MCP_CONTRACT_VERSION,
  MCP_TOOL_DEFINITIONS,
  McpCredentialVerifier
} from '../../../../src/plugins/mcp/helpers/contracts.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TEST_POSTGRES_URL;
const connectionId = 'task00013';
const publicOrigin = 'https://tabular.test';
const allTools = MCP_TOOL_DEFINITIONS.map((definition) => definition.name);

/**
 * Assert the disposable target.
 */
function assertDisposableTarget(value: string | undefined): asserts value is string {
  assert.equal(
    process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
    'task00013-disposable',
    'TABULAR_TEST_POSTGRES_DISPOSABLE must explicitly authorize destructive test cleanup'
  );
  assert.ok(value, 'TABULAR_TEST_POSTGRES_URL is required');
  const target = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/tabular_task00013');
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

test('PostgreSQL 18 MCP and browser-event paths preserve authority, effects, and cleanup parity', {
  timeout: 180_000
}, async (context) => {
  assertDisposableTarget(connectionString);
  const password = `p_${randomBytes(12).toString('hex')}`;
  const admin = new Pool({ connectionString, max: 8, allowExitOnIdle: true });
  const webUrl = roleUrl(connectionString, 'tabular_task13_web', password);
  const migratorUrl = roleUrl(connectionString, 'tabular_task13_migrator', password);
  const migrator = new ManagedPostgresPool({
    name: 'task00013-migrator',
    connectionString: migratorUrl,
    maximum: 2,
    applicationName: 'tabular-task00013-migrator'
  });
  let application: Awaited<ReturnType<typeof startWeb>> | undefined;
  let primaryFailure: unknown;
  const cleanupFailures: Error[] = [];
  const transcript: Array<Record<string, unknown>> = [];
  try {
    const version = await admin.query(`
      SELECT current_setting('server_version_num')::integer AS number, version() AS label
    `);
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);
    await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
    await admin.query('DROP SCHEMA IF EXISTS workspace CASCADE');
    for (const role of [
      'tabular_task13_web', 'tabular_task13_migrator',
      'tabular_task13_member', 'tabular_task13_other'
    ]) {
      await admin.query(`DROP OWNED BY ${role}`).catch(() => undefined);
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await admin.query(`
      CREATE ROLE tabular_task13_web LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task13_migrator LOGIN PASSWORD '${password}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task13_member
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task13_other
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT CONNECT, CREATE ON DATABASE tabular_task00013 TO tabular_task13_migrator;
      GRANT CONNECT ON DATABASE tabular_task00013 TO tabular_task13_web;
      GRANT tabular_task13_member, tabular_task13_other TO tabular_task13_web
        WITH INHERIT FALSE, SET TRUE;
    `);
    const migrations = await loadMigrations();
    assert.deepEqual(await runMigrations(migrationTransaction(migrator), migrations), {
      applied: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
      total: 11
    });
    await admin.query(`
      GRANT USAGE ON SCHEMA tabular TO tabular_task13_web, tabular_task13_migrator;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular
        TO tabular_task13_web, tabular_task13_migrator;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular
        TO tabular_task13_web, tabular_task13_migrator;
      CREATE SCHEMA workspace;
      CREATE TABLE workspace.mcp_records (
        id text PRIMARY KEY,
        owner_role name NOT NULL,
        label text NOT NULL,
        note text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'ready',
        __tabular_system_xmin__ text NOT NULL DEFAULT 'physical system alias collision',
        __tabular_visible_hash__ text NOT NULL DEFAULT 'physical visible alias collision',
        __tabular_row_v1 text NOT NULL DEFAULT '000000000000000000000001',
        CONSTRAINT mcp_records_status CHECK (status IN ('ready', 'slow'))
      );
      CREATE FUNCTION workspace.delay_slow_mcp_record() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'slow' THEN PERFORM pg_sleep(5); END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER mcp_records_slow
        BEFORE UPDATE ON workspace.mcp_records
        FOR EACH ROW EXECUTE FUNCTION workspace.delay_slow_mcp_record();
      ALTER TABLE workspace.mcp_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE workspace.mcp_records FORCE ROW LEVEL SECURITY;
      CREATE POLICY mcp_records_owner ON workspace.mcp_records
        USING (owner_role = current_user)
        WITH CHECK (owner_role = current_user);
      INSERT INTO workspace.mcp_records (id, owner_role, label, note)
      VALUES
        ('web-row', 'tabular_task13_member', 'Browser row', 'before'),
        ('mcp-row', 'tabular_task13_member', 'MCP row', 'before'),
        ('race-row', 'tabular_task13_member', 'Race row', 'before'),
        ('slow-row', 'tabular_task13_member', 'Slow row', 'before'),
        ('finalizer-web', 'tabular_task13_member', 'Finalizer browser', 'before'),
        ('finalizer-mcp', 'tabular_task13_member', 'Finalizer MCP', 'before'),
        ('hidden-row', 'tabular_task13_other', 'Other tenant row', 'secret');
      GRANT USAGE ON SCHEMA workspace TO tabular_task13_member, tabular_task13_other;
      GRANT SELECT ON workspace.mcp_records TO tabular_task13_member, tabular_task13_other;
      GRANT UPDATE (label, note, status) ON workspace.mcp_records TO tabular_task13_member;
      CREATE FUNCTION tabular.reject_task13_journal() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.command_id IN ('cmd_task13_finalizer_web', 'cmd_task13_finalizer_mcp') THEN
          RAISE EXCEPTION 'PRIVATE_TASK13_FINALIZER_FAILURE';
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER reject_task13_journal
        BEFORE INSERT ON tabular.action_journal
        FOR EACH ROW EXECUTE FUNCTION tabular.reject_task13_journal();
    `);

    application = await startWeb({
      env: {
        NODE_ENV: 'test',
        TABULAR_PUBLIC_ORIGIN: publicOrigin,
        TABULAR_DATABASE_CONNECTION_ID: connectionId,
        TABULAR_WEB_DATABASE_URL: webUrl,
        TABULAR_MIGRATOR_DATABASE_URL: migratorUrl,
        TABULAR_POOL_MAXIMUM: '8',
        TABULAR_STATEMENT_TIMEOUT_MS: '10000',
        TABULAR_REQUEST_TIMEOUT_MS: '10000',
        TABULAR_HEADERS_TIMEOUT_MS: '5000',
        TABULAR_SHUTDOWN_TIMEOUT_MS: '5000',
        TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '600',
        TABULAR_SESSION_MAX_AGE_SECONDS: '3600'
      },
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd(),
      host: '127.0.0.1',
      port: 0
    });
    const stable = await application.database.transaction('web', {}, (database) =>
      reconcileCatalog(database, connectionId)
    );
    const fileId = stableFile(stable, 'workspace', 'mcp_records');
    const labelId = stableColumn(stable, fileId, 'label');
    const noteId = stableColumn(stable, fileId, 'note');
    const statusId = stableColumn(stable, fileId, 'status');
    const rankCatalogId = stableColumn(stable, fileId, '__tabular_row_v1');
    await admin.query(`
      INSERT INTO tabular.column_metadata (
        column_id, object_id, catalog_column_id, display_name,
        field_kind, format_kind, hidden, hidden_purpose
      ) VALUES ($1, $2, $3, 'Shared row order', 'text', 'plain-text', true, 'shared-rank')
    `, [`col_${'R'.repeat(32)}`, fileId, rankCatalogId]);

    const provider = new TestIdentityProvider();
    const memberSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task00013-member',
      displayName: 'Task 13 Member'
    });
    const otherSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task00013-other',
      displayName: 'Task 13 Other'
    });
    const memberProvision = await application.identity.provisionIdentityRole(
      memberSubject,
      'tabular_task13_member'
    );
    const otherProvision = await application.identity.provisionIdentityRole(
      otherSubject,
      'tabular_task13_other'
    );
    const browserSession = await application.identity.establishBrowserSession(memberSubject);
    const otherBrowserSession = await application.identity.establishBrowserSession(otherSubject);
    const primaryTransport = new GovernedMcpTransportAdapter(
      application.mcp,
      new TestMcpVerifier(memberProvision.identityId, 'A', 'primary-token', allTools)
    );
    const isolatedTransport = new GovernedMcpTransportAdapter(
      application.mcp,
      new TestMcpVerifier(memberProvision.identityId, 'B', 'isolated-token', allTools)
    );
    const otherTransport = new GovernedMcpTransportAdapter(
      application.mcp,
      new TestMcpVerifier(otherProvision.identityId, 'C', 'other-token', allTools)
    );

    assert.deepEqual(
      (await primaryTransport.listTools('primary-token')).map((tool) => tool.name),
      allTools
    );
    assert.equal((await primaryTransport.listResourceTemplates('primary-token')).length, 1);
    const invalidCredential = await primaryTransport.callTool('wrong-token', {
      name: 'tabular_list_files', arguments: { limit: 10 }
    });
    assertToolError(invalidCredential, 'capability_denied');

    const contract = toolResult<Record<string, unknown>>(await primaryTransport.callTool(
      'primary-token',
      { name: 'get_frontend_contract', arguments: { contractVersion: 1, fileId } }
    ));
    assert.equal(contract.contractVersion, MCP_CONTRACT_VERSION);
    assert.equal(contract.arbitrarySql, false);
    assert.equal(contract.arbitraryDdl, false);
    assert.ok((contract.operations as string[]).includes('tabular_record_patch'));
    assert.equal((contract.operations as string[]).includes('tabular_record_insert'), false);
    assert.equal((contract.operations as string[]).includes('tabular_record_delete'), false);
    assert.doesNotMatch(JSON.stringify(contract), /workspace|mcp_records|owner_role|relationOid/i);
    const resource = await primaryTransport.readResource('primary-token', {
      uri: `tabular://frontend-contract/v1/${fileId}`
    });
    assert.equal(resource.isError, false, JSON.stringify(resource));
    assert.equal(resource.isError ? '' : resource.structuredContent.resource.fileId, fileId);
    const discovery = toolResult<{ items: Array<{ file: { fileId: string, }, }>, }>(
      await primaryTransport.callTool('primary-token', {
        name: 'tabular_list_files', arguments: { limit: 100 }
      })
    );
    assert.ok(discovery.items.some((entry) => entry.file.fileId === fileId));

    const query = await queryRows(primaryTransport, fileId, [labelId, noteId, statusId]);
    assert.deepEqual(query.rows.map((row) => cellText(row, labelId)).sort(), [
      'Browser row', 'Finalizer MCP', 'Finalizer browser', 'MCP row', 'Race row', 'Slow row'
    ]);
    assert.doesNotMatch(JSON.stringify(query), /Other tenant row|secret|owner_role/);
    const rows = new Map(query.rows.map((row) => [cellText(row, labelId), row]));
    const otherQuery = toolResult<{ rows: McpRow[], }>(await otherTransport.callTool(
      'other-token',
      {
        name: 'tabular_records_query',
        arguments: { fileId, columnIds: [labelId, noteId], filters: [], sorts: [], limit: 100 }
      }
    ));
    assert.deepEqual(otherQuery.rows.map((row) => cellText(row, labelId)), ['Other tenant row']);
    await admin.query(`
      INSERT INTO workspace.mcp_records (id, owner_role, label, note)
      VALUES ('large-row', 'tabular_task13_member', 'Large row', repeat('x', 500000))
    `);
    const oversized = await primaryTransport.callTool('primary-token', {
      name: 'tabular_records_query',
      arguments: {
        fileId,
        columnIds: [noteId],
        filters: [{ columnId: labelId, operation: '=', value: 'Large row' }],
        sorts: [],
        limit: 1
      }
    });
    assertToolError(oversized, 'result_too_large');
    const largeIdentity = await queryRows(primaryTransport, fileId, [labelId], [{
      columnId: labelId, operation: '=', value: 'Large row'
    }]);
    assert.equal(largeIdentity.rows.length, 1);
    const oversizedRecord = await primaryTransport.callTool('primary-token', {
      name: 'tabular_record_read',
      arguments: {
        fileId,
        rowId: required(largeIdentity.rows[0]).rowId,
        columnIds: [noteId]
      }
    });
    assertToolError(oversizedRecord, 'result_too_large');
    const oversizedDraft = toolResult<{ id: string, }>(await primaryTransport.callTool(
      'primary-token',
      {
        name: 'tabular_draft_create',
        arguments: {
          commandId: 'cmd_task13_oversized_draft',
          fileId,
          schemaVersion: String(contract.schemaVersion),
          patch: [{ columnId: noteId, value: { type: 'text', value: 'd'.repeat(300000) } }],
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        }
      }
    ));
    assertToolError(await primaryTransport.callTool('primary-token', {
      name: 'tabular_draft_read', arguments: { draftId: oversizedDraft.id }
    }), 'result_too_large');
    assertToolError(await primaryTransport.callTool('primary-token', {
      name: 'tabular_draft_list', arguments: { fileId }
    }), 'result_too_large');
    await admin.query(`DELETE FROM tabular.action_drafts WHERE id = $1`, [oversizedDraft.id]);
    await admin.query(`DELETE FROM workspace.mcp_records WHERE id = 'large-row'`);
    await assertPoolBaseline(application, 'tabular_task13_web');

    const deniedBefore = await auditCounts(admin, ['cmd_task13_forged_sql']);
    const forgedSql = await primaryTransport.callTool('primary-token', {
      name: 'tabular_record_read',
      arguments: {
        fileId,
        rowId: required(rows.get('MCP row')).rowId,
        columnIds: [labelId],
        sql: 'SELECT current_user'
      }
    });
    assertToolError(forgedSql, 'invalid_action');
    assert.deepEqual(await auditCounts(admin, ['cmd_task13_forged_sql']), deniedBefore);
    assert.throws(() => application!.database.openPool('migrator'), /cannot open PostgreSQL migrator/);
    const webRole = await admin.query(`
      SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
        FROM pg_roles WHERE rolname = 'tabular_task13_web'
    `);
    assert.deepEqual(webRole.rows[0], {
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false
    });
    await assert.rejects(
      application.database.transaction('web', {}, (database) =>
        database.execute('SET ROLE tabular_task13_migrator')
      ),
      (error: unknown) => postgresCode(error) === '42501'
    );
    await assertPoolBaseline(application, 'tabular_task13_web');

    const webRow = required(rows.get('Browser row'));
    const mcpRow = required(rows.get('MCP row'));
    const webCommand = 'cmd_task13_web_patch';
    const mcpCommand = 'cmd_task13_mcp_patch';
    const webPatch = await browserAction(application, browserSession, {
      type: 'record.patch',
      commandId: webCommand,
      fileId,
      rowId: webRow.rowId,
      expectedVersion: webRow.version,
      patch: [{ columnId: noteId, value: { type: 'text', value: 'surface committed' } }]
    });
    assert.equal(webPatch.status, 'ok', JSON.stringify(webPatch));
    const mcpPatchCall = {
      name: 'tabular_record_patch' as const,
      arguments: {
        commandId: mcpCommand,
        fileId,
        rowId: mcpRow.rowId,
        expectedVersion: mcpRow.version,
        patch: [{ columnId: noteId, value: { type: 'text' as const, value: 'surface committed' } }]
      }
    };
    const mcpPatch = toolResult<Record<string, unknown>>(
      await primaryTransport.callTool('primary-token', mcpPatchCall)
    );
    assert.deepEqual(normalizeMutation(webPatch.data), normalizeMutation(mcpPatch));
    const storedParity = await admin.query(`
      SELECT id, note FROM workspace.mcp_records
       WHERE id IN ('web-row', 'mcp-row') ORDER BY id
    `);
    assert.deepEqual(storedParity.rows, [
      { id: 'mcp-row', note: 'surface committed' },
      { id: 'web-row', note: 'surface committed' }
    ]);
    const effects = await actionEffects(admin, [webCommand, mcpCommand]);
    assert.equal(effects.length, 2);
    const mcpEffect = required(effects.find((row) => row.surface === 'mcp'));
    const webEffect = required(effects.find((row) => row.surface === 'web'));
    assert.deepEqual(normalizeEffect(mcpEffect), normalizeEffect(webEffect));
    assert.equal(mcpEffect.actor_identity_id, memberProvision.identityId);
    assert.equal(webEffect.actor_identity_id, memberProvision.identityId);
    const replay = toolResult<Record<string, unknown>>(
      await primaryTransport.callTool('primary-token', mcpPatchCall)
    );
    assert.equal(replay.replayed, true);
    assert.equal((await actionEffects(admin, [mcpCommand])).length, 1);

    const invalidCommands = ['cmd_task13_invalid_web', 'cmd_task13_invalid_mcp'];
    const beforeInvalid = await auditCounts(admin, invalidCommands);
    const invalidWeb = await browserAction(application, browserSession, {
      type: 'record.patch',
      commandId: invalidCommands[0], fileId, rowId: webRow.rowId,
      expectedVersion: webRow.version,
      patch: [{ columnId: statusId, value: { type: 'integer', value: '7' } }]
    });
    const invalidPatch = await primaryTransport.callTool('primary-token', {
      name: 'tabular_record_patch',
      arguments: {
        commandId: invalidCommands[1], fileId, rowId: mcpRow.rowId,
        expectedVersion: mcpRow.version,
        patch: [{ columnId: statusId, value: { type: 'integer', value: '7' } }]
      }
    });
    assertToolError(invalidPatch, 'validation_failed');
    assert.deepEqual(normalizeBrowserError(invalidWeb), normalizeToolError(invalidPatch));
    assert.deepEqual(await auditCounts(admin, invalidCommands), beforeInvalid);

    const conflictWeb = await browserAction(application, browserSession, {
      type: 'record.patch',
      commandId: 'cmd_task13_conflict_web', fileId, rowId: webRow.rowId,
      expectedVersion: webRow.version,
      patch: [{ columnId: noteId, value: { type: 'text', value: 'stale' } }]
    });
    const conflictMcp = await primaryTransport.callTool('primary-token', {
      name: 'tabular_record_patch',
      arguments: {
        commandId: 'cmd_task13_conflict_mcp', fileId, rowId: mcpRow.rowId,
        expectedVersion: mcpRow.version,
        patch: [{ columnId: noteId, value: { type: 'text', value: 'stale' } }]
      }
    });
    assert.deepEqual(normalizeBrowserError(conflictWeb), normalizeToolError(conflictMcp));
    assert.deepEqual(normalizeBrowserError(conflictWeb), {
      category: 'conflict', canRetry: false
    });
    assert.deepEqual(await auditCounts(admin, [
      'cmd_task13_conflict_web', 'cmd_task13_conflict_mcp'
    ]), { journal: 0, outbox: 0 });

    const narrow = await queryRows(primaryTransport, fileId, [labelId], [{
      columnId: labelId, operation: '=', value: 'MCP row'
    }]);
    assert.equal(narrow.rows.length, 1);
    assert.equal(narrow.rows[0]?.cells.length, 1);
    const narrowPatch = await primaryTransport.callTool('primary-token', {
      name: 'tabular_record_patch',
      arguments: {
        commandId: 'cmd_task13_ranked_narrow_patch',
        fileId,
        rowId: required(narrow.rows[0]).rowId,
        expectedVersion: required(narrow.rows[0]).version,
        patch: [{ columnId: noteId, value: { type: 'text', value: 'narrow query committed' } }]
      }
    });
    assert.equal(narrowPatch.isError, false, JSON.stringify(narrowPatch));

    const memberRowId = mcpRow.rowId;
    const otherBrowserDenied = await browserAction(application, otherBrowserSession, {
      type: 'record.read', fileId, rowId: memberRowId, columnIds: [labelId]
    });
    const otherMcpDenied = await otherTransport.callTool('other-token', {
      name: 'tabular_record_read',
      arguments: { fileId, rowId: memberRowId, columnIds: [labelId] }
    });
    assert.deepEqual(normalizeBrowserError(otherBrowserDenied), normalizeToolError(otherMcpDenied));
    assert.equal(normalizeToolError(otherMcpDenied).category, 'not_found');

    const finalizerWebRow = required(rows.get('Finalizer browser'));
    const finalizerMcpRow = required(rows.get('Finalizer MCP'));
    const cursorBeforeFinalizer = await currentCursor(admin);
    const finalizerWeb = await browserAction(application, browserSession, {
      type: 'record.patch', commandId: 'cmd_task13_finalizer_web', fileId,
      rowId: finalizerWebRow.rowId, expectedVersion: finalizerWebRow.version,
      patch: [{ columnId: noteId, value: { type: 'text', value: 'must roll back' } }]
    });
    const finalizerMcp = await primaryTransport.callTool('primary-token', {
      name: 'tabular_record_patch',
      arguments: {
        commandId: 'cmd_task13_finalizer_mcp', fileId,
        rowId: finalizerMcpRow.rowId, expectedVersion: finalizerMcpRow.version,
        patch: [{ columnId: noteId, value: { type: 'text', value: 'must roll back' } }]
      }
    });
    assert.deepEqual(normalizeBrowserError(finalizerWeb), normalizeToolError(finalizerMcp));
    assert.deepEqual(normalizeToolError(finalizerMcp), {
      category: 'action_failed', canRetry: false
    });
    assert.doesNotMatch(JSON.stringify([finalizerWeb, finalizerMcp]), /PRIVATE_TASK13/);
    assert.deepEqual((await admin.query(`
      SELECT id, note FROM workspace.mcp_records
       WHERE id IN ('finalizer-web', 'finalizer-mcp') ORDER BY id
    `)).rows, [
      { id: 'finalizer-mcp', note: 'before' },
      { id: 'finalizer-web', note: 'before' }
    ]);
    assert.deepEqual(await auditCounts(admin, [
      'cmd_task13_finalizer_web', 'cmd_task13_finalizer_mcp'
    ]), { journal: 0, outbox: 0 });
    assert.equal(await currentCursor(admin), cursorBeforeFinalizer);
    await assertPoolBaseline(application, 'tabular_task13_web');

    const raceRow = required(rows.get('Race row'));
    const raceCalls = await Promise.all([
      primaryTransport.callTool('primary-token', {
        name: 'tabular_record_patch',
        arguments: {
          commandId: 'cmd_task13_race_one', fileId, rowId: raceRow.rowId,
          expectedVersion: raceRow.version,
          patch: [{ columnId: noteId, value: { type: 'text', value: 'race one' } }]
        }
      }),
      primaryTransport.callTool('primary-token', {
        name: 'tabular_record_patch',
        arguments: {
          commandId: 'cmd_task13_race_two', fileId, rowId: raceRow.rowId,
          expectedVersion: raceRow.version,
          patch: [{ columnId: noteId, value: { type: 'text', value: 'race two' } }]
        }
      })
    ]);
    assert.equal(raceCalls.filter((response) => !response.isError).length, 1);
    assert.equal(raceCalls.filter((response) => response.isError
      && response.structuredContent.error.category === 'conflict').length, 1);
    assert.equal((await actionEffects(admin, ['cmd_task13_race_one', 'cmd_task13_race_two'])).length, 1);

    const primaryHistory = toolResult<unknown[]>(await primaryTransport.callTool(
      'primary-token',
      { name: 'tabular_history_list', arguments: { fileId, limit: 100 } }
    ));
    const isolatedHistory = toolResult<unknown[]>(await isolatedTransport.callTool(
      'isolated-token',
      { name: 'tabular_history_list', arguments: { fileId, limit: 100 } }
    ));
    const otherHistory = toolResult<unknown[]>(await otherTransport.callTool(
      'other-token',
      { name: 'tabular_history_list', arguments: { fileId, limit: 100 } }
    ));
    const browserHistory = await browserAction(application, browserSession, {
      type: 'history.list', fileId, limit: 100
    });
    const otherBrowserHistory = await browserAction(application, otherBrowserSession, {
      type: 'history.list', fileId, limit: 100
    });
    assert.ok(primaryHistory.length >= 2);
    assert.equal(isolatedHistory.length, 0);
    assert.equal(otherHistory.length, 0);
    assert.equal(browserHistory.status, 'ok');
    assert.equal((browserHistory.data as unknown[]).length, 1);
    assert.equal(otherBrowserHistory.status, 'ok');
    assert.equal((otherBrowserHistory.data as unknown[]).length, 0);
    const isolatedUndo = await isolatedTransport.callTool('isolated-token', {
      name: 'tabular_history_undo',
      arguments: { commandId: 'cmd_task13_isolated_undo', fileId }
    });
    assertToolError(isolatedUndo, 'history_not_available');
    const otherUndo = await otherTransport.callTool('other-token', {
      name: 'tabular_history_undo',
      arguments: { commandId: 'cmd_task13_other_undo', fileId }
    });
    assertToolError(otherUndo, 'history_not_available');

    const slowRow = required(rows.get('Slow row'));
    const cancelledCommand = 'cmd_task13_cancelled';
    const cancelledController = new AbortController();
    const cancelledPromise = primaryTransport.callTool('primary-token', {
      name: 'tabular_record_patch',
      arguments: {
        commandId: cancelledCommand, fileId, rowId: slowRow.rowId,
        expectedVersion: slowRow.version,
        patch: [{ columnId: statusId, value: { type: 'text', value: 'slow' } }]
      }
    }, { signal: cancelledController.signal });
    setTimeout(() => cancelledController.abort(), 100).unref?.();
    assertToolError(await cancelledPromise, 'cancelled');
    assert.deepEqual(await auditCounts(admin, [cancelledCommand]), { journal: 0, outbox: 0 });
    await assertPoolBaseline(application, 'tabular_task13_web');

    const deadlineCommand = 'cmd_task13_deadline';
    const deadline = await primaryTransport.callTool('primary-token', {
      name: 'tabular_record_patch',
      arguments: {
        commandId: deadlineCommand, fileId, rowId: slowRow.rowId,
        expectedVersion: slowRow.version,
        patch: [{ columnId: statusId, value: { type: 'text', value: 'slow' } }]
      }
    }, { timeoutMs: 150 });
    assertToolError(deadline, 'deadline_exceeded');
    assert.deepEqual(await auditCounts(admin, [deadlineCommand]), { journal: 0, outbox: 0 });
    await assertPoolBaseline(application, 'tabular_task13_web');
    const slowAfter = toolResult<{ cells: Array<{ columnId: string, value: unknown, }>, }>(
      await primaryTransport.callTool('primary-token', {
        name: 'tabular_record_read',
        arguments: { fileId, rowId: slowRow.rowId, columnIds: [statusId] }
      })
    );
    assert.deepEqual(slowAfter.cells, [{
      columnId: statusId, value: { type: 'text', value: 'ready' }
    }]);

    const drainingCommand = 'cmd_task13_draining';
    const drainingCall = primaryTransport.callTool('primary-token', {
      name: 'tabular_record_patch',
      arguments: {
        commandId: drainingCommand, fileId, rowId: slowRow.rowId,
        expectedVersion: slowRow.version,
        patch: [{ columnId: statusId, value: { type: 'text', value: 'slow' } }]
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const drain = application.mcp.close();
    assertToolError(await drainingCall, 'cancelled');
    await drain;
    assert.equal(application.mcp.ready(), false);
    assert.deepEqual(await auditCounts(admin, [drainingCommand]), { journal: 0, outbox: 0 });
    const whileDraining = await primaryTransport.callTool('primary-token', {
      name: 'tabular_list_files', arguments: { limit: 1 }
    });
    assertToolError(whileDraining, 'server_draining');

    await assertPoolBaseline(application, 'tabular_task13_web');
    transcript.push(
      {
        check: 'browser-mcp-parity',
        surfaces: effects.map((row) => row.surface),
        success: true,
        validation: true,
        conflict: true,
        denial: true,
        rankedNarrowQueryPatch: true,
        internalAliasCollisions: true
      },
      { check: 'row-level-authority', visibleRows: query.rows.length, hiddenRows: 1 },
      {
        check: 'rollback',
        finalizer: true,
        cancelled: true,
        deadline: true,
        journal: 0,
        outbox: 0
      },
      { check: 'cleanup', checkedOut: 0, currentUserReset: true, mcpReady: false }
    );
    context.diagnostic(JSON.stringify({
      postgres: version.rows[0].label,
      contractVersion: MCP_CONTRACT_VERSION,
      transcript
    }));
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    if (application) {
      try { await application.close(); } catch (error) { cleanupFailures.push(asError(error)); }
    }
    try { await migrator.close(10_000); } catch (error) { cleanupFailures.push(asError(error)); }
    try { await admin.end(); } catch (error) { cleanupFailures.push(asError(error)); }
    if (!primaryFailure && cleanupFailures.length) {
      throw new AggregateError(cleanupFailures, 'Task 00013 cleanup failed');
    }
  }
});

class TestMcpVerifier extends McpCredentialVerifier<string> {
  /**
   * Create a TestMcpVerifier instance.
   */
  public constructor(
    private readonly identityId: string,
    private readonly scopeSeed: 'A' | 'B' | 'C',
    private readonly token: string,
    private readonly tools: McpToolName[]
  ) { super(); }

  /**
   * Verify the current value.
   */
  public async verify(credential: string) {
    if (credential !== this.token) throw new Error('Credential denied');
    return this.verifiedPrincipal({
      identityId: this.identityId,
      sessionId: `mcp_${this.scopeSeed.repeat(43)}`,
      historyScopeId: `hist_${this.scopeSeed.repeat(43)}`,
      connectionId,
      expiresAt: new Date(Date.now() + 60_000),
      scopes: { tools: this.tools, resources: ['tabular_frontend_contract'] }
    });
  }
}

type McpRow = {
  rowId: string,
  version: string,
  cells: Array<{ columnId: string, value: unknown, }>,
};

/**
 * Query the rows.
 */
async function queryRows(
  transport: GovernedMcpTransportAdapter<string>,
  fileId: string,
  columnIds: string[],
  filters: Array<{
    columnId: string,
    operation: '=' | '!=' | 'like' | '<' | '<=' | '>' | '>=',
    value: string | number | boolean | null,
  }> = []
) {
  return toolResult<{ rows: McpRow[], }>(await transport.callTool('primary-token', {
    name: 'tabular_records_query',
    arguments: { fileId, columnIds, filters, sorts: [], limit: 100 }
  }));
}

/**
 * Return the browser action result.
 */
async function browserAction(
  application: Awaited<ReturnType<typeof startWeb>>,
  session: { cookieToken: string, csrfToken: string, },
  action: Record<string, unknown>
) {
  const response = await fetch(`${application.origin}/events/grid`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: `${application.identity.cookieName()}=${session.cookieToken}`,
      Origin: publicOrigin,
      'X-Tabular-CSRF': session.csrfToken
    },
    body: JSON.stringify({ event: { kind: 'capability', action } })
  });
  const body = await response.text();
  assert.equal(response.status, 200, body);
  return JSON.parse(body) as {
    status: 'ok' | 'error',
    data?: unknown,
    error?: { code: string, message: string, retryable: boolean, },
  };
}

/**
 * Return the tool result result.
 */
function toolResult<Result>(response: Awaited<ReturnType<
  GovernedMcpTransportAdapter<string>['callTool']
>>) {
  assert.equal(response.isError, false, JSON.stringify(response));
  return (response.isError ? undefined : response.structuredContent.result) as Result;
}

/**
 * Assert the tool error.
 */
function assertToolError(
  response: Awaited<ReturnType<GovernedMcpTransportAdapter<string>['callTool']>>,
  category: string
) {
  assert.equal(response.isError, true, JSON.stringify(response));
  assert.equal(response.isError ? response.structuredContent.error.category : '', category);
}

/**
 * Return the cell text result.
 */
function cellText(row: McpRow, columnId: string) {
  const cell = required(row.cells.find((candidate) => candidate.columnId === columnId));
  const value = cell.value as { type: string, value?: string, };
  assert.equal(value.type, 'text');
  return String(value.value);
}

/**
 * Return the action effects result.
 */
async function actionEffects(admin: pg.Pool, commandIds: string[]) {
  const result = await admin.query(`
    SELECT j.command_id, j.actor_identity_id, j.surface, j.action_type,
           j.outcome, j.result_summary,
           j.affected_row_count, j.affected_cell_count,
           (SELECT count(*)::integer FROM tabular.outbox_events e
             WHERE e.idempotency_key = 'action:' || j.id) AS outbox_count,
           (SELECT e.event_type FROM tabular.outbox_events e
             WHERE e.idempotency_key = 'action:' || j.id) AS outbox_event_type,
           (SELECT e.payload FROM tabular.outbox_events e
             WHERE e.idempotency_key = 'action:' || j.id) AS outbox_payload
      FROM tabular.action_journal j
     WHERE j.command_id = ANY($1::text[])
     ORDER BY j.surface, j.command_id
  `, [commandIds]);
  return result.rows as Array<{
    command_id: string,
    actor_identity_id: string,
    surface: string,
    action_type: string,
    outcome: string,
    result_summary: Record<string, unknown>,
    affected_row_count: number,
    affected_cell_count: number,
    outbox_count: number,
    outbox_event_type: string,
    outbox_payload: Record<string, unknown>,
  }>;
}

/**
 * Normalize the mutation.
 */
function normalizeMutation(value: unknown) {
  const result = value as {
    rows?: unknown[],
    affectedRowCount?: number,
    affectedCellCount?: number,
    replayed?: boolean,
  };
  return {
    affectedRowCount: result.affectedRowCount,
    affectedCellCount: result.affectedCellCount,
    rowCount: result.rows?.length,
    replayed: result.replayed
  };
}

/**
 * Normalize the effect.
 */
function normalizeEffect(effect: Awaited<ReturnType<typeof actionEffects>>[number]) {
  return {
    actionType: effect.action_type,
    outcome: effect.outcome,
    affectedRowCount: effect.affected_row_count,
    affectedCellCount: effect.affected_cell_count,
    result: normalizeMutation(effect.result_summary),
    outboxCount: effect.outbox_count,
    outboxEventType: effect.outbox_event_type,
    outboxActionType: effect.outbox_payload.actionType
  };
}

/**
 * Normalize the browser error.
 */
function normalizeBrowserError(response: Awaited<ReturnType<typeof browserAction>>) {
  assert.equal(response.status, 'error', JSON.stringify(response));
  return {
    category: response.error?.code || '',
    canRetry: Boolean(response.error?.retryable)
  };
}

/**
 * Normalize the tool error.
 */
function normalizeToolError(
  response: Awaited<ReturnType<GovernedMcpTransportAdapter<string>['callTool']>>
) {
  assert.equal(response.isError, true, JSON.stringify(response));
  return response.isError ? {
    category: response.structuredContent.error.category,
    canRetry: response.structuredContent.error.canRetry
  } : { category: '', canRetry: false };
}

/**
 * Return the audit counts result.
 */
async function auditCounts(admin: pg.Pool, commandIds: string[]) {
  const result = await admin.query(`
    SELECT
      (SELECT count(*)::integer FROM tabular.action_journal
        WHERE command_id = ANY($1::text[])) AS journal,
      (SELECT count(*)::integer FROM tabular.outbox_events e
        JOIN tabular.action_journal j ON e.idempotency_key = 'action:' || j.id
       WHERE j.command_id = ANY($1::text[])) AS outbox
  `, [commandIds]);
  return result.rows[0] as { journal: number, outbox: number, };
}

/**
 * Return the current cursor result.
 */
async function currentCursor(admin: pg.Pool) {
  const result = await admin.query(`
    SELECT next_cursor - 1 AS cursor
      FROM tabular.change_streams WHERE connection_id = $1
  `, [connectionId]);
  return Number(result.rows[0]?.cursor || 0);
}

/**
 * Assert the pool baseline.
 */
async function assertPoolBaseline(
  application: Awaited<ReturnType<typeof startWeb>>,
  expectedLogin: string
) {
  const state = await application.database.transaction('web', {}, (database) =>
    database.execute<{
      current_user: string,
      session_user: string,
      statement_timeout: string,
      lock_timeout: string,
      idle_timeout: string,
    }>(`
      SELECT current_user, session_user,
             current_setting('statement_timeout') AS statement_timeout,
             current_setting('lock_timeout') AS lock_timeout,
             current_setting('idle_in_transaction_session_timeout') AS idle_timeout
    `)
  );
  assert.deepEqual(state.rows[0], {
    current_user: expectedLogin,
    session_user: expectedLogin,
    statement_timeout: '0',
    lock_timeout: '0',
    idle_timeout: '0'
  });
  assert.equal(application.database.openPool('web').checkedOutCount, 0);
}

/**
 * Return the role URL result.
 */
function roleUrl(base: string, role: string, password: string) {
  const url = new URL(base);
  url.username = role;
  url.password = password;
  return url.toString();
}

/**
 * Return the postgres code result.
 */
function postgresCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) return String(error.code);
  if (error instanceof AggregateError) {
    return error.errors.map(postgresCode).find(Boolean) || '';
  }
  return '';
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
 * Return the required result.
 */
function required<Value>(value: Value | undefined | null): Value {
  assert.ok(value);
  return value;
}

/**
 * Return the as error result.
 */
function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
