//node
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import pg from 'pg';

//client
import type { StableCatalogSnapshot } from '../../../../src/plugins/catalog/helpers/contracts.js';
import type {
  AuthorityPhases,
  CapabilityAction,
  PreparedTarget
} from '../../../../src/plugins/capability/helpers/contracts.js';
import type { PostgreSqlTargetDefinition } from '../../../../src/plugins/capability/helpers/postgresql-target.js';
import { startWeb } from '../../../../src/bootstrap/application.js';
import { ApplicationError } from '../../../../src/bootstrap/errors.js';
import { runMigrations } from '../../../../src/plugins/database/helpers/migrator.js';
import { ManagedPostgresPool } from '../../../../src/plugins/database/helpers/pool.js';
import { withPostgreSqlTransaction } from '../../../../src/plugins/database/helpers/transactions.js';
import { loadMigrations } from '../../../../src/plugins/database/migrations/index.js';
import { reconcileCatalog } from '../../../../src/plugins/catalog/helpers/reconciliation.js';
import { ActionFault, McpAuthorizedExecutionContext } from '../../../../src/plugins/capability/helpers/contracts.js';
import { BrowserAuthorizedExecutionContext } from '../../../../src/plugins/capability/helpers/web-authority.js';
import { RegisteredPostgreSqlTargetAdapter } from '../../../../src/plugins/capability/helpers/postgresql-target.js';
import { WebCapabilityAdapter } from '../../../../src/plugins/capability/events/web-adapter.js';
import { McpShapedCapabilityAdapter } from '../../../../src/plugins/capability/events/mcp-shaped-adapter.js';
import { TestIdentityProvider } from '../../../plugins/identity/provider-double.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TEST_POSTGRES_URL;
let FILE_ID = '';
let ROW_ID_COLUMN_ID = '';
let ROW_INCARNATION_COLUMN_ID = '';
let ROW_VERSION_COLUMN_ID = '';
let AUTHORITY_COLUMN_ID = '';
let LABEL_ID = '';
let AMOUNT_ID = '';
let NOTE_ID = '';
let BIG_ID = '';
let DECIMAL_ID = '';
let JSON_ID = '';
let DATE_ID = '';
let RESTRICTED_ID = '';
let REPLACEMENT_FILE_ID = '';
let REPLACEMENT_ROW_ID_COLUMN_ID = '';
let REPLACEMENT_INCARNATION_COLUMN_ID = '';
let REPLACEMENT_VERSION_COLUMN_ID = '';
let REPLACEMENT_AUTHORITY_COLUMN_ID = '';
let REPLACEMENT_COLUMN_ID = '';
let UNSAFE_FILE_ID = '';
let UNSAFE_ROW_ID_COLUMN_ID = '';
let UNSAFE_INCARNATION_COLUMN_ID = '';
let UNSAFE_VERSION_COLUMN_ID = '';
let UNSAFE_COLUMN_ID = '';
/**
 * Assert the disposable target.
 */
function assertDisposableTarget(value: string | undefined): asserts value is string {
  assert.equal(
    process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
    'task00004-disposable',
    'TABULAR_TEST_POSTGRES_DISPOSABLE must explicitly authorize destructive test cleanup'
  );
  assert.ok(value, 'TABULAR_TEST_POSTGRES_URL is required');
  const target = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/tabular_task00004');
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

test('PostgreSQL 18 capability actions, drafts, atomic ranges, and bounded reversals', {
  timeout: 180_000
}, async () => {
  assertDisposableTarget(connectionString);
  const admin = new Pool({ connectionString, max: 8, allowExitOnIdle: true });
  const migrator = new ManagedPostgresPool({
    name: 'task00004-migrator',
    connectionString,
    maximum: 2,
    applicationName: 'tabular-task00004-migrator'
  });
  let application: Awaited<ReturnType<typeof startWeb>> | undefined;
  let primaryFailure: unknown;
  const cleanupFailures: Error[] = [];
  try {
    const version = await admin.query(`
      SELECT current_setting('server_version_num')::integer AS number, version() AS label
    `);
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);
    await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
    await admin.query('DROP SCHEMA IF EXISTS workspace CASCADE');
    for (const role of ['tabular_action_member', 'tabular_action_reader']) {
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await admin.query(`
      CREATE ROLE tabular_action_member
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_action_reader
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    `);
    const migrations = await loadMigrations();
    assert.deepEqual(await runMigrations(migrationTransaction(migrator), migrations), {
      applied: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
      total: 11
    });
    await admin.query(`
      CREATE SCHEMA workspace;
      CREATE TABLE workspace.capability_records (
        id text PRIMARY KEY,
        tabular_row_incarnation uuid NOT NULL DEFAULT gen_random_uuid(),
        tabular_row_version bigint NOT NULL DEFAULT 1,
        owner_role name NOT NULL,
        label text NOT NULL,
        amount integer NOT NULL CHECK (amount BETWEEN 0 AND 100),
        note text NOT NULL DEFAULT '',
        big_value bigint NOT NULL DEFAULT 9007199254740993,
        decimal_value numeric(38,18) NOT NULL DEFAULT 0,
        json_value jsonb NOT NULL DEFAULT '{}'::jsonb,
        date_value date NOT NULL DEFAULT DATE '2000-01-01',
        restricted_value text NOT NULL DEFAULT 'restricted'
      );
      CREATE TABLE workspace.replaceable_records (
        id text PRIMARY KEY,
        tabular_row_incarnation uuid NOT NULL DEFAULT gen_random_uuid(),
        tabular_row_version bigint NOT NULL DEFAULT 1,
        owner_role name NOT NULL,
        value text NOT NULL
      );
      CREATE TABLE workspace.unsafe_records (
        id text NOT NULL,
        tabular_row_incarnation uuid NOT NULL DEFAULT gen_random_uuid(),
        tabular_row_version bigint NOT NULL DEFAULT 1,
        value text NOT NULL
      );
      CREATE UNIQUE INDEX unsafe_records_wrong_key
        ON workspace.unsafe_records (value) INCLUDE (id);
      CREATE FUNCTION workspace.bump_tabular_row_version() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        NEW.tabular_row_incarnation = OLD.tabular_row_incarnation;
        NEW.tabular_row_version = OLD.tabular_row_version + 1;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER capability_records_row_version
        BEFORE UPDATE ON workspace.capability_records
        FOR EACH ROW EXECUTE FUNCTION workspace.bump_tabular_row_version();
      CREATE TRIGGER replaceable_records_row_version
        BEFORE UPDATE ON workspace.replaceable_records
        FOR EACH ROW EXECUTE FUNCTION workspace.bump_tabular_row_version();
      CREATE TRIGGER unsafe_records_row_version
        BEFORE UPDATE ON workspace.unsafe_records
        FOR EACH ROW EXECUTE FUNCTION workspace.bump_tabular_row_version();
      ALTER TABLE workspace.capability_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE workspace.capability_records FORCE ROW LEVEL SECURITY;
      CREATE POLICY capability_records_owner ON workspace.capability_records
        USING (owner_role = current_user)
        WITH CHECK (owner_role = current_user);
      ALTER TABLE workspace.replaceable_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE workspace.replaceable_records FORCE ROW LEVEL SECURITY;
      CREATE POLICY replaceable_records_owner_initial ON workspace.replaceable_records
        USING (owner_role = current_user)
        WITH CHECK (owner_role = current_user);
      INSERT INTO workspace.capability_records (id, owner_role, label, amount, note)
      VALUES
        ('row_one', 'tabular_action_member', 'One', 10, 'first'),
        ('row_two', 'tabular_action_member', 'Two', 20, 'second'),
        ('row_hidden', 'tabular_action_reader', 'Hidden', 30, 'private');
      INSERT INTO workspace.replaceable_records (id, owner_role, value)
      VALUES ('row_replaceable', 'tabular_action_member', 'first relation');
      INSERT INTO workspace.unsafe_records (id, value)
      VALUES ('row_duplicate', 'one'), ('row_duplicate', 'two');
      GRANT USAGE ON SCHEMA workspace TO tabular_action_member, tabular_action_reader;
      GRANT SELECT (
        id, tabular_row_incarnation, tabular_row_version,
        label, amount, note, big_value, decimal_value, json_value, date_value
      ) ON workspace.capability_records TO tabular_action_member;
      GRANT INSERT (
        id, owner_role, label, amount, note, big_value, decimal_value, json_value, date_value
      ) ON workspace.capability_records TO tabular_action_member;
      GRANT UPDATE (
        label, amount, note, big_value, decimal_value, json_value, date_value
      ) ON workspace.capability_records TO tabular_action_member;
      GRANT DELETE ON workspace.capability_records TO tabular_action_member;
      GRANT SELECT ON workspace.capability_records TO tabular_action_reader;
      GRANT SELECT, INSERT, UPDATE, DELETE ON workspace.replaceable_records TO tabular_action_member;
      GRANT SELECT, INSERT, UPDATE, DELETE ON workspace.unsafe_records TO tabular_action_member;
    `);

    application = await startWeb({
      env: {
        NODE_ENV: 'test',
        TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
        TABULAR_DATABASE_CONNECTION_ID: 'task00004',
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
      reconcileCatalog(database, 'task00004')
    );
    FILE_ID = stableFile(stable, 'workspace', 'capability_records');
    ROW_ID_COLUMN_ID = stableColumn(stable, FILE_ID, 'id');
    ROW_INCARNATION_COLUMN_ID = stableColumn(
      stable,
      FILE_ID,
      'tabular_row_incarnation'
    );
    ROW_VERSION_COLUMN_ID = stableColumn(stable, FILE_ID, 'tabular_row_version');
    AUTHORITY_COLUMN_ID = stableColumn(stable, FILE_ID, 'owner_role');
    LABEL_ID = stableColumn(stable, FILE_ID, 'label');
    AMOUNT_ID = stableColumn(stable, FILE_ID, 'amount');
    NOTE_ID = stableColumn(stable, FILE_ID, 'note');
    BIG_ID = stableColumn(stable, FILE_ID, 'big_value');
    DECIMAL_ID = stableColumn(stable, FILE_ID, 'decimal_value');
    JSON_ID = stableColumn(stable, FILE_ID, 'json_value');
    DATE_ID = stableColumn(stable, FILE_ID, 'date_value');
    RESTRICTED_ID = stableColumn(stable, FILE_ID, 'restricted_value');
    REPLACEMENT_FILE_ID = stableFile(stable, 'workspace', 'replaceable_records');
    REPLACEMENT_ROW_ID_COLUMN_ID = stableColumn(stable, REPLACEMENT_FILE_ID, 'id');
    REPLACEMENT_INCARNATION_COLUMN_ID = stableColumn(
      stable,
      REPLACEMENT_FILE_ID,
      'tabular_row_incarnation'
    );
    REPLACEMENT_VERSION_COLUMN_ID = stableColumn(
      stable,
      REPLACEMENT_FILE_ID,
      'tabular_row_version'
    );
    REPLACEMENT_AUTHORITY_COLUMN_ID = stableColumn(
      stable,
      REPLACEMENT_FILE_ID,
      'owner_role'
    );
    REPLACEMENT_COLUMN_ID = stableColumn(stable, REPLACEMENT_FILE_ID, 'value');
    UNSAFE_FILE_ID = stableFile(stable, 'workspace', 'unsafe_records');
    UNSAFE_ROW_ID_COLUMN_ID = stableColumn(stable, UNSAFE_FILE_ID, 'id');
    UNSAFE_INCARNATION_COLUMN_ID = stableColumn(
      stable,
      UNSAFE_FILE_ID,
      'tabular_row_incarnation'
    );
    UNSAFE_VERSION_COLUMN_ID = stableColumn(
      stable,
      UNSAFE_FILE_ID,
      'tabular_row_version'
    );
    UNSAFE_COLUMN_ID = stableColumn(stable, UNSAFE_FILE_ID, 'value');
    const mainTargetDefinition: PostgreSqlTargetDefinition = {
      fileId: FILE_ID,
      rowIdentity: {
        kind: 'prefixed-text-versioned-unique-key',
        columnId: ROW_ID_COLUMN_ID,
        incarnationColumnId: ROW_INCARNATION_COLUMN_ID,
        versionColumnId: ROW_VERSION_COLUMN_ID
      },
      insertAuthorityColumnId: AUTHORITY_COLUMN_ID,
      columns: [
        { columnId: LABEL_ID, codec: 'text' },
        { columnId: AMOUNT_ID, codec: 'integer' },
        { columnId: NOTE_ID, codec: 'text' },
        { columnId: BIG_ID, codec: 'integer' },
        { columnId: DECIMAL_ID, codec: 'decimal' },
        { columnId: JSON_ID, codec: 'json' },
        { columnId: DATE_ID, codec: 'date' },
        { columnId: RESTRICTED_ID, codec: 'text' }
      ]
    };
    const replacementTargetDefinition: PostgreSqlTargetDefinition = {
      fileId: REPLACEMENT_FILE_ID,
      rowIdentity: {
        kind: 'prefixed-text-versioned-unique-key',
        columnId: REPLACEMENT_ROW_ID_COLUMN_ID,
        incarnationColumnId: REPLACEMENT_INCARNATION_COLUMN_ID,
        versionColumnId: REPLACEMENT_VERSION_COLUMN_ID
      },
      insertAuthorityColumnId: REPLACEMENT_AUTHORITY_COLUMN_ID,
      columns: [
        { columnId: REPLACEMENT_COLUMN_ID, codec: 'text' }
      ]
    };
    const unsafeTargetDefinition: PostgreSqlTargetDefinition = {
      fileId: UNSAFE_FILE_ID,
      rowIdentity: {
        kind: 'prefixed-text-versioned-unique-key',
        columnId: UNSAFE_ROW_ID_COLUMN_ID,
        incarnationColumnId: UNSAFE_INCARNATION_COLUMN_ID,
        versionColumnId: UNSAFE_VERSION_COLUMN_ID
      },
      columns: [{ columnId: UNSAFE_COLUMN_ID, codec: 'text' }]
    };
    application.capability.registerPostgreSqlTarget(mainTargetDefinition);
    application.capability.registerPostgreSqlTarget(replacementTargetDefinition);
    application.capability.registerPostgreSqlTarget(unsafeTargetDefinition);
    const provider = new TestIdentityProvider();
    const memberSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task00004-member',
      displayName: 'Action Member'
    });
    const readerSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'task00004-reader',
      displayName: 'Action Reader'
    });
    await application.identity.provisionIdentityRole(memberSubject, 'tabular_action_member');
    await application.identity.provisionIdentityRole(readerSubject, 'tabular_action_reader');

    const initial = await application.identity.establishBrowserSession(memberSubject);
    const rotated = await application.identity.rotateBrowserSession({
      cookieToken: initial.cookieToken,
      csrfToken: initial.csrfToken,
      origin: 'https://tabular.test'
    });
    assert.equal(rotated.principal.historyScopeId, initial.principal.historyScopeId);
    const fresh = await application.identity.establishBrowserSession(memberSubject);
    assert.notEqual(fresh.principal.historyScopeId, rotated.principal.historyScopeId);
    const reader = await application.identity.establishBrowserSession(readerSubject);
    let executionPrincipal = fresh.principal;
    /**
     * Return the context result.
     */
    const context = () => new BrowserAuthorizedExecutionContext(
      application!.identity,
      executionPrincipal
    );
    /**
     * Execute the current value.
     */
    const execute = (action: CapabilityAction) => application!.capability.execute(context(), action);

    const forgedHistory = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, {
        ...fresh.principal,
        historyScopeId: rotated.principal.historyScopeId
      }),
      { type: 'history.list', fileId: FILE_ID, limit: 1 }
    );
    assertFailure(forgedHistory, 'capability_denied');
    const forgedExpiry = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, {
        ...fresh.principal,
        absoluteExpiresAt: new Date(fresh.principal.absoluteExpiresAt.getTime() + 60_000)
      }),
      { type: 'history.list', fileId: FILE_ID, limit: 1 }
    );
    assertFailure(forgedExpiry, 'capability_denied');

    const firstRead = await execute(readAction('row_one'));
    assert.equal(firstRead.ok, true, JSON.stringify(firstRead));
    const firstVersion = resultVersion(firstRead);
    const unattestedMutation = await execute({
      type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: firstVersion,
      patch: [{ columnId: LABEL_ID, value: { type: 'text', value: 'must be denied' } }]
    });
    assertFailure(unattestedMutation, 'capability_denied');
    await assert.rejects(
      application.identity.requireBrowserMutation({
        cookieToken: fresh.cookieToken,
        csrfToken: fresh.csrfToken,
        origin: 'https://tabular.test.evil.example'
      }),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'invalid_origin'
    );
    const authorizedWebPrincipal = await application.identity.requireBrowserMutation({
      cookieToken: fresh.cookieToken,
      csrfToken: fresh.csrfToken,
      origin: 'https://tabular.test'
    });
    executionPrincipal = authorizedWebPrincipal;
    const unknownFile = await execute({
      type: 'record.read',
      fileId: `obj_${'U'.repeat(43)}`,
      rowId: 'row_one',
      columnIds: [LABEL_ID]
    });
    assertFailure(unknownFile, 'not_found');
    const unknownColumn = await execute({
      type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: firstVersion,
      patch: [{ columnId: `col_${'U'.repeat(43)}`, value: { type: 'text', value: 'unknown' } }]
    });
    assertFailure(unknownColumn, 'validation_failed');
    const restrictedColumn = await execute({
      type: 'record.read', fileId: FILE_ID, rowId: 'row_one', columnIds: [RESTRICTED_ID]
    });
    assertFailure(restrictedColumn, 'capability_denied');
    const replacementRead = await execute({
      type: 'record.read', fileId: REPLACEMENT_FILE_ID, rowId: 'row_replaceable',
      columnIds: [REPLACEMENT_COLUMN_ID]
    });
    assert.equal(replacementRead.ok, true);
    const unsafeIdentity = await execute({
      type: 'record.read', fileId: UNSAFE_FILE_ID, rowId: 'row_duplicate',
      columnIds: [UNSAFE_COLUMN_ID]
    });
    assertFailure(unsafeIdentity, 'not_found');
    const readerMutationPrincipal = await application.identity.requireBrowserMutation({
      cookieToken: reader.cookieToken,
      csrfToken: reader.csrfToken,
      origin: 'https://tabular.test'
    });
    const crossActorUndo = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, readerMutationPrincipal),
      { type: 'history.undo', commandId: commandId(), fileId: FILE_ID }
    );
    assertFailure(crossActorUndo, 'history_not_available');
    const webAdapter = new WebCapabilityAdapter(application.identity, application.capability);
    const webMutationCommand = commandId();
    const firstPatch = await webAdapter
      .invoke(authorizedWebPrincipal, { action: {
      type: 'record.patch', commandId: webMutationCommand, fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: firstVersion,
      patch: [{ columnId: LABEL_ID, value: { type: 'text', value: 'One updated' } }]
    } });
    assert.equal(firstPatch.status, 'ok', JSON.stringify(firstPatch));
    const exactRead = await execute(readAction('row_two'));
    const exactValues = await execute({
      type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
      rowId: 'row_two', expectedVersion: resultVersion(exactRead),
      patch: [
        { columnId: BIG_ID, value: { type: 'integer', value: '9223372036854775806' } },
        { columnId: DECIMAL_ID, value: { type: 'decimal', value: '12345678901234567890.123456789012345678' } },
        { columnId: JSON_ID, value: { type: 'json', value: '{"n":9007199254740993123456789}' } },
        { columnId: DATE_ID, value: { type: 'date', value: '2026-08-01' } }
      ]
    });
    assert.equal(exactValues.ok, true);
    const exactStored = await admin.query(`
      SELECT big_value::text AS big_value, decimal_value::text AS decimal_value,
             json_value->>'n' AS json_number,
             to_char(date_value, 'YYYY-MM-DD') AS date_value
        FROM workspace.capability_records WHERE id = 'row_two'
    `);
    assert.deepEqual(exactStored.rows[0], {
      big_value: '9223372036854775806',
      decimal_value: '12345678901234567890.123456789012345678',
      json_number: '9007199254740993123456789',
      date_value: '2026-08-01'
    });
    const exactRoundTrip = await execute({
      type: 'record.read', fileId: FILE_ID, rowId: 'row_two', columnIds: [DATE_ID]
    });
    assert.equal(exactRoundTrip.ok, true);
    const exactRoundTripValue = exactRoundTrip.ok
      ? exactRoundTrip.value as {
        version: string,
        cells: Array<{ columnId: string, value: { type: string, value?: unknown, }, }>,
      }
      : undefined;
    assert.deepEqual(exactRoundTripValue?.cells, [{
      columnId: DATE_ID,
      value: { type: 'date', value: '2026-08-01' }
    }]);

    const freshMainTarget = new RegisteredPostgreSqlTargetAdapter();
    freshMainTarget.register(mainTargetDefinition);
    let freshMainPrepared: PreparedTarget | undefined;
    const freshMainRead = await application.database.transaction('web', {
      resolveRole: async (database) => {
        freshMainPrepared = await freshMainTarget.prepare(database, FILE_ID, 'task00004');
        assert.ok(freshMainPrepared);
        return 'tabular_action_member';
      }
    }, async (database) => {
      const dateStyle = await database.execute<{ date_style: string, }>(`
        SELECT set_config('DateStyle', 'SQL, DMY', true) AS date_style
      `);
      assert.equal(dateStyle.rows[0]?.date_style, 'SQL, DMY');
      await freshMainTarget.authorize(database, freshMainPrepared!, 'read');
      return freshMainTarget.read(database, freshMainPrepared!, 'row_two', [DATE_ID]);
    });
    assert.ok(freshMainRead);
    assert.equal(freshMainRead.version, exactRoundTripValue?.version);
    assert.deepEqual(freshMainRead.cells, exactRoundTripValue?.cells);

    const mcpAuthority = new PostgreSqlMcpAuthority(
      application.database,
      fresh.principal.identityId
    );
    const mcpAdapter = new McpShapedCapabilityAdapter(application.capability);
    const mcpRead = await mcpAdapter.invoke(mcpAuthority, {
      tool: 'tabular_record_read',
      arguments: { fileId: FILE_ID, rowId: 'row_two', columnIds: [NOTE_ID] }
    });
    assert.equal(mcpRead.isError, false);
    const mcpVersion = mcpRead.isError
      ? ''
      : (mcpRead.structuredContent.result as { version: string, }).version;
    const mcpCommand = commandId();
    const mcpPatch = await mcpAdapter.invoke(mcpAuthority, {
      tool: 'tabular_record_patch',
      arguments: {
        commandId: mcpCommand, fileId: FILE_ID, rowId: 'row_two',
        expectedVersion: mcpVersion,
        patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'MCP mutation' } }]
      }
    });
    assert.equal(mcpPatch.isError, false);
    const webMutationValue = firstPatch.status === 'ok'
      ? firstPatch.data as {
        rows: Array<{ rowId: string, version: string, }>,
        affectedRowCount: number,
        affectedCellCount: number,
        replayed: boolean,
      }
      : undefined;
    const mcpMutationValue = mcpPatch.isError
      ? undefined
      : mcpPatch.structuredContent.result as typeof webMutationValue;
    assert.deepEqual(
      {
        affectedRowCount: webMutationValue?.affectedRowCount,
        affectedCellCount: webMutationValue?.affectedCellCount,
        rowCount: webMutationValue?.rows.length,
        replayed: webMutationValue?.replayed
      },
      {
        affectedRowCount: mcpMutationValue?.affectedRowCount,
        affectedCellCount: mcpMutationValue?.affectedCellCount,
        rowCount: mcpMutationValue?.rows.length,
        replayed: mcpMutationValue?.replayed
      }
    );
    const adapterJournals = await admin.query(`
      SELECT id, command_id, surface, action_type, outcome,
             affected_row_count, affected_cell_count
        FROM tabular.action_journal WHERE command_id = ANY($1::text[])
       ORDER BY command_id
    `, [[webMutationCommand, mcpCommand]]);
    assert.equal(adapterJournals.rows.length, 2);
    const webJournal = adapterJournals.rows.find((row) => row.command_id === webMutationCommand);
    const mcpJournal = adapterJournals.rows.find((row) => row.command_id === mcpCommand);
    assert.deepEqual({
      action_type: webJournal.action_type,
      outcome: webJournal.outcome,
      affected_row_count: webJournal.affected_row_count,
      affected_cell_count: webJournal.affected_cell_count
    }, {
      action_type: mcpJournal.action_type,
      outcome: mcpJournal.outcome,
      affected_row_count: mcpJournal.affected_row_count,
      affected_cell_count: mcpJournal.affected_cell_count
    });
    assert.equal(webJournal.surface, 'web');
    assert.equal(mcpJournal.surface, 'mcp');
    await admin.query(`
      UPDATE tabular.session_action_entries
         SET created_at = clock_timestamp() - interval '2 seconds',
             expires_at = clock_timestamp() - interval '1 second'
       WHERE action_id = $1
    `, [mcpJournal.id]);
    assert.equal((await execute({
      type: 'history.list', fileId: FILE_ID, limit: 1
    })).ok, true);
    assert.equal(
      (await admin.query(`
        SELECT count(*)::integer AS count
          FROM tabular.session_action_entries WHERE action_id = $1
      `, [mcpJournal.id])).rows[0].count,
      0
    );
    const stale = await execute({
      type: 'record.patch',
      commandId: commandId(),
      fileId: FILE_ID,
      rowId: 'row_one',
      expectedVersion: firstVersion,
      patch: [{ columnId: AMOUNT_ID, value: { type: 'integer', value: '11' } }]
    });
    assertFailure(stale, 'conflict');

    const [raceRead] = await Promise.all([execute(readAction('row_one'))]);
    const raceVersion = resultVersion(raceRead);
    const raceActions: CapabilityAction[] = [
      {
        type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
        rowId: 'row_one', expectedVersion: raceVersion,
        patch: [{ columnId: LABEL_ID, value: { type: 'text', value: 'Race A' } }]
      },
      {
        type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
        rowId: 'row_one', expectedVersion: raceVersion,
        patch: [{ columnId: LABEL_ID, value: { type: 'text', value: 'Race B' } }]
      }
    ];
    const raceResults = await Promise.all(raceActions.map(execute));
    assert.equal(raceResults.filter((result) => result.ok).length, 1);
    const loserIndex = raceResults.findIndex((result) => !result.ok);
    assert.ok(loserIndex >= 0);
    const loser = raceResults[loserIndex];
    assert.ok(!loser.ok && ['conflict', 'retryable_conflict'].includes(loser.error.code));
    if (!loser.ok && loser.error.code === 'retryable_conflict') {
      assertFailure(await execute(raceActions[loserIndex]), 'conflict');
    }

    const idempotentRead = await execute(readAction('row_one'));
    const sameCommand = commandId();
    const idempotentAction: CapabilityAction = {
      type: 'record.patch', commandId: sameCommand, fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: resultVersion(idempotentRead),
      patch: [{ columnId: AMOUNT_ID, value: { type: 'integer', value: '12' } }]
    };
    const duplicates = await Promise.all([execute(idempotentAction), execute(idempotentAction)]);
    assert.equal(duplicates.every((result) => result.ok), true);
    assert.equal(duplicates.filter((result) => result.ok && replayed(result)).length, 1);
    const duplicateCount = await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.action_journal WHERE command_id = $1
    `, [sameCommand]);
    assert.equal(duplicateCount.rows[0].count, 1);
    const changedDuplicate = await execute({
      ...idempotentAction,
      patch: [{ columnId: AMOUNT_ID, value: { type: 'integer', value: '13' } }]
    });
    assertFailure(changedDuplicate, 'conflict');

    const retryRead = await execute(readAction('row_one'));
    const retryCommand = commandId();
    const retryAction: CapabilityAction = {
      type: 'record.patch', commandId: retryCommand, fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: resultVersion(retryRead),
      patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'retry-once' } }]
    };
    await admin.query(`
      CREATE SEQUENCE workspace.task00004_retry_once_seq;
      GRANT USAGE ON SEQUENCE workspace.task00004_retry_once_seq TO tabular_action_member;
      CREATE FUNCTION workspace.task00004_retry_once() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.note = 'retry-once'
           AND nextval('workspace.task00004_retry_once_seq') = 1 THEN
          RAISE serialization_failure USING MESSAGE = 'TASK00004_RETRY_SENTINEL';
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER task00004_retry_once
        BEFORE UPDATE ON workspace.capability_records
        FOR EACH ROW EXECUTE FUNCTION workspace.task00004_retry_once();
    `);
    assertFailure(await execute(retryAction), 'retryable_conflict');
    const retryRecovery = await execute(retryAction);
    assert.equal(retryRecovery.ok, true);
    assert.equal(replayed(retryRecovery), false);
    await admin.query('DROP TRIGGER task00004_retry_once ON workspace.capability_records');
    await admin.query('DROP FUNCTION workspace.task00004_retry_once()');
    await admin.query('DROP SEQUENCE workspace.task00004_retry_once_seq');

    const rollbackRead = await execute(readAction('row_one'));
    const beforeFinalizerFailure = await admin.query(
      'SELECT note FROM workspace.capability_records WHERE id = $1',
      ['row_one']
    );
    await admin.query(`
      CREATE FUNCTION tabular.reject_task00004_journal() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'TASK00004_PRIVATE_FINALIZER_SENTINEL';
      END
      $$;
      CREATE TRIGGER reject_task00004_journal
        BEFORE INSERT ON tabular.action_journal
        FOR EACH ROW EXECUTE FUNCTION tabular.reject_task00004_journal();
    `);
    const finalizerFailure = await execute({
      type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: resultVersion(rollbackRead),
      patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'must not commit' } }]
    });
    assertFailure(finalizerFailure, 'action_failed');
    assert.equal(JSON.stringify(finalizerFailure).includes('PRIVATE_FINALIZER'), false);
    await admin.query('DROP TRIGGER reject_task00004_journal ON tabular.action_journal');
    await admin.query('DROP FUNCTION tabular.reject_task00004_journal()');
    const afterFinalizerFailure = await admin.query(
      'SELECT note FROM workspace.capability_records WHERE id = $1',
      ['row_one']
    );
    assert.equal(afterFinalizerFailure.rows[0].note, beforeFinalizerFailure.rows[0].note);

    const validRangeOne = await execute(readAction('row_one'));
    const validRangeTwo = await execute(readAction('row_two'));
    const acceptedRange = await execute({
      type: 'range.patch', commandId: commandId(), fileId: FILE_ID, cellCount: 2,
      rows: [
        {
          rowId: 'row_two', expectedVersion: resultVersion(validRangeTwo),
          patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'range two' } }]
        },
        {
          rowId: 'row_one', expectedVersion: resultVersion(validRangeOne),
          patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'range one' } }]
        }
      ]
    });
    assert.equal(acceptedRange.ok, true);

    const beforeRangeOne = await execute(readAction('row_one'));
    const beforeRangeTwo = await execute(readAction('row_two'));
    const rowOneBefore = await admin.query(
      'SELECT label FROM workspace.capability_records WHERE id = $1',
      ['row_one']
    );
    const rejectedRange = await execute({
      type: 'range.patch',
      commandId: commandId(),
      fileId: FILE_ID,
      cellCount: 2,
      rows: [
        {
          rowId: 'row_two', expectedVersion: resultVersion(beforeRangeTwo),
          patch: [{ columnId: AMOUNT_ID, value: { type: 'integer', value: '999' } }]
        },
        {
          rowId: 'row_one', expectedVersion: resultVersion(beforeRangeOne),
          patch: [{ columnId: LABEL_ID, value: { type: 'text', value: 'must rollback' } }]
        }
      ]
    });
    assertFailure(rejectedRange, 'validation_failed');
    const rowOneAfter = await admin.query(
      'SELECT label FROM workspace.capability_records WHERE id = $1',
      ['row_one']
    );
    assert.equal(rowOneAfter.rows[0].label, rowOneBefore.rows[0].label);
    const missingRangeOne = await execute(readAction('row_one'));
    const missingRangeBefore = await admin.query(
      'SELECT label FROM workspace.capability_records WHERE id = $1',
      ['row_one']
    );
    const missingRange = await execute({
      type: 'range.patch', commandId: commandId(), fileId: FILE_ID, cellCount: 2,
      rows: [
        {
          rowId: 'row_one', expectedVersion: resultVersion(missingRangeOne),
          patch: [{ columnId: LABEL_ID, value: { type: 'text', value: 'must rollback missing' } }]
        },
        {
          rowId: 'row_z_missing', expectedVersion: `ver_${'m'.repeat(20)}`,
          patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'missing' } }]
        }
      ]
    });
    assertFailure(missingRange, 'not_found');
    assert.equal(
      (await admin.query('SELECT label FROM workspace.capability_records WHERE id = $1', ['row_one']))
        .rows[0].label,
      missingRangeBefore.rows[0].label
    );
    const webInvalidRead = await execute(readAction('row_one'));
    const webInvalidCommand = commandId();
    const webInvalid = await webAdapter.invoke(authorizedWebPrincipal, { action: {
      type: 'record.patch', commandId: webInvalidCommand, fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: resultVersion(webInvalidRead),
      patch: [{ columnId: AMOUNT_ID, value: { type: 'integer', value: '999' } }]
    } });
    assert.equal(webInvalid.status, 'error');
    const mcpInvalidRead = await mcpAdapter.invoke(mcpAuthority, {
      tool: 'tabular_record_read',
      arguments: { fileId: FILE_ID, rowId: 'row_two', columnIds: [AMOUNT_ID] }
    });
    assert.equal(mcpInvalidRead.isError, false);
    const mcpInvalidCommand = commandId();
    const mcpInvalid = await mcpAdapter.invoke(mcpAuthority, {
      tool: 'tabular_record_patch',
      arguments: {
        commandId: mcpInvalidCommand, fileId: FILE_ID, rowId: 'row_two',
        expectedVersion: mcpInvalidRead.isError
          ? ''
          : (mcpInvalidRead.structuredContent.result as { version: string, }).version,
        patch: [{ columnId: AMOUNT_ID, value: { type: 'integer', value: '999' } }]
      }
    });
    assert.equal(mcpInvalid.isError, true);
    assert.deepEqual(
      webInvalid.status === 'error'
        ? {
          category: webInvalid.error.code,
          description: webInvalid.error.message,
          canRetry: webInvalid.error.retryable
        }
        : undefined,
      mcpInvalid.isError ? mcpInvalid.structuredContent.error : undefined
    );
    const rejectedAdapterJournals = await admin.query(`
      SELECT count(*)::integer AS count
        FROM tabular.action_journal WHERE command_id = ANY($1::text[])
    `, [[webInvalidCommand, mcpInvalidCommand]]);
    assert.equal(rejectedAdapterJournals.rows[0].count, 0);

    const staleRangeRead = await execute(readAction('row_one'));
    const staleRowTwoRead = await execute(readAction('row_two'));
    const staleRangeVersion = resultVersion(staleRangeRead);
    await admin.query(
      'UPDATE workspace.capability_records SET note = $1 WHERE id = $2',
      ['stale external', 'row_one']
    );
    const beforeStaleOther = await admin.query(
      'SELECT note FROM workspace.capability_records WHERE id = $1',
      ['row_two']
    );
    const staleRange = await execute({
      type: 'range.patch', commandId: commandId(), fileId: FILE_ID, cellCount: 2,
      rows: [
        {
          rowId: 'row_one', expectedVersion: staleRangeVersion,
          patch: [{ columnId: LABEL_ID, value: { type: 'text', value: 'stale range' } }]
        },
        {
          rowId: 'row_two', expectedVersion: resultVersion(staleRowTwoRead),
          patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'must stay' } }]
        }
      ]
    });
    assertFailure(staleRange, 'conflict');
    const afterStaleOther = await admin.query(
      'SELECT note FROM workspace.capability_records WHERE id = $1',
      ['row_two']
    );
    assert.equal(afterStaleOther.rows[0].note, beforeStaleOther.rows[0].note);

    const schemaToken = (await application.database.transaction('web', {}, (database) =>
      application!.capability.postgresqlTargets.prepare(database, FILE_ID, 'task00004')
    ))!.schemaVersion;
    const duplicateDraftCommand = commandId();
    const duplicateDraftAction: CapabilityAction = {
      type: 'draft.create',
      commandId: duplicateDraftCommand,
      fileId: FILE_ID,
      schemaVersion: schemaToken,
      patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'idempotent draft' } }],
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    };
    const duplicateDrafts = await Promise.all([
      execute(duplicateDraftAction),
      execute(duplicateDraftAction)
    ]);
    assert.equal(duplicateDrafts.every((result) => result.ok), true);
    assert.equal(duplicateDrafts.filter((result) => replayed(result)).length, 1);
    assert.equal(
      duplicateDrafts[0].ok && duplicateDrafts[1].ok
        ? (duplicateDrafts[0].value as { id: string, }).id
          === (duplicateDrafts[1].value as { id: string, }).id
        : false,
      true
    );
    assertFailure(await execute({
      ...duplicateDraftAction,
      patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'changed retry' } }]
    }), 'conflict');
    const duplicateDraftJournal = await admin.query(`
      SELECT count(*)::integer AS count FROM tabular.action_journal WHERE command_id = $1
    `, [duplicateDraftCommand]);
    assert.equal(duplicateDraftJournal.rows[0].count, 1);
    const persistentDraftId = duplicateDrafts[0].ok
      ? (duplicateDrafts[0].value as { id: string, }).id
      : '';
    const createdDraft = await execute({
      type: 'draft.create', commandId: commandId(), fileId: FILE_ID, schemaVersion: schemaToken,
      patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'draft note' } }],
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    assert.equal(createdDraft.ok, true);
    const draft = createdDraft.ok ? createdDraft.value as { id: string, version: number, } : undefined;
    const draftUpdates = await Promise.all([
      execute({
        type: 'draft.update', commandId: commandId(),
        draftId: draft!.id, expectedDraftVersion: draft!.version,
        patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'tab one' } }]
      }),
      execute({
        type: 'draft.update', commandId: commandId(),
        draftId: draft!.id, expectedDraftVersion: draft!.version,
        patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'tab two' } }]
      })
    ]);
    assert.equal(draftUpdates.filter((result) => result.ok).length, 1);
    assert.equal(draftUpdates.filter((result) => !result.ok && result.error.code === 'conflict').length, 1);
    const readerDraft = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, reader.principal),
      { type: 'draft.read', draftId: draft!.id }
    );
    assertFailure(readerDraft, 'not_found');

    const deletable = await execute({
      type: 'draft.create', commandId: commandId(), fileId: FILE_ID, schemaVersion: schemaToken,
      patch: [], expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    const deletableValue = deletable.ok
      ? deletable.value as { id: string, version: number, }
      : undefined;
    const deleted = await execute({
      type: 'draft.delete',
      commandId: commandId(),
      draftId: deletableValue!.id,
      expectedDraftVersion: deletableValue!.version
    });
    assert.equal(deleted.ok && (deleted.value as { state: string, }).state, 'abandoned');

    const expiringDraft = await execute({
      type: 'draft.create', commandId: commandId(), fileId: FILE_ID, schemaVersion: schemaToken,
      patch: [], expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    const expiringId = expiringDraft.ok ? (expiringDraft.value as { id: string, }).id : '';
    await admin.query(`
      UPDATE tabular.action_drafts
         SET created_at = clock_timestamp() - interval '2 seconds',
             expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1
    `, [expiringId]);
    const expired = await execute({ type: 'draft.read', draftId: expiringId });
    assert.equal(expired.ok && (expired.value as { state: string, }).state, 'expired');

    const invalidDraft = await execute({
      type: 'draft.create', commandId: commandId(), fileId: FILE_ID, schemaVersion: schemaToken,
      patch: [{ columnId: AMOUNT_ID, value: { type: 'integer', value: '44' } }],
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    const invalidDraftValue = invalidDraft.ok
      ? invalidDraft.value as { id: string, version: number, }
      : undefined;
    const beforePromotionCount = await admin.query(
      'SELECT count(*)::integer AS count FROM workspace.capability_records'
    );
    const invalidPromotion = await execute({
      type: 'draft.promote', commandId: commandId(),
      draftId: invalidDraftValue!.id,
      expectedDraftVersion: invalidDraftValue!.version
    });
    assertFailure(invalidPromotion, 'validation_failed');
    const afterPromotionCount = await admin.query(
      'SELECT count(*)::integer AS count FROM workspace.capability_records'
    );
    assert.equal(afterPromotionCount.rows[0].count, beforePromotionCount.rows[0].count);
    const retainedInvalid = await execute({ type: 'draft.read', draftId: invalidDraftValue!.id });
    assert.equal(
      retainedInvalid.ok
        && (retainedInvalid.value as { validation: Array<{ code: string, }>, }).validation[0]?.code,
      'database_rejected'
    );

    const driftDraft = await execute({
      type: 'draft.create', commandId: commandId(), fileId: FILE_ID, schemaVersion: schemaToken,
      patch: [
        { columnId: LABEL_ID, value: { type: 'text', value: 'Drift' } },
        { columnId: AMOUNT_ID, value: { type: 'integer', value: '5' } }
      ],
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    const driftValue = driftDraft.ok ? driftDraft.value as { id: string, version: number, } : undefined;
    await admin.query('ALTER TABLE workspace.capability_records ADD COLUMN extra text');
    const driftPromotion = await execute({
      type: 'draft.promote', commandId: commandId(),
      draftId: driftValue!.id, expectedDraftVersion: driftValue!.version
    });
    assertFailure(driftPromotion, 'schema_changed');

    const currentSchemaToken = (await application.database.transaction('web', {}, (database) =>
      application!.capability.postgresqlTargets.prepare(database, FILE_ID, 'task00004')
    ))!.schemaVersion;
    const promotable = await execute({
      type: 'draft.create', commandId: commandId(), fileId: FILE_ID,
      schemaVersion: currentSchemaToken,
      patch: [
        { columnId: LABEL_ID, value: { type: 'text', value: 'Promoted' } },
        { columnId: AMOUNT_ID, value: { type: 'integer', value: '7' } },
        { columnId: NOTE_ID, value: { type: 'text', value: 'created from draft' } }
      ],
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    const promotableValue = promotable.ok
      ? promotable.value as { id: string, version: number, }
      : undefined;
    const promoted = await execute({
      type: 'draft.promote', commandId: commandId(),
      draftId: promotableValue!.id, expectedDraftVersion: promotableValue!.version
    });
    assert.equal(promoted.ok, true);
    const promotedRowId = promoted.ok
      ? (promoted.value as { rows: Array<{ rowId: string, }>, }).rows[0]!.rowId
      : '';
    assert.equal((await execute({
      type: 'history.undo', commandId: commandId(), fileId: FILE_ID
    })).ok, true);
    assert.equal(
      (await admin.query(
        'SELECT count(*)::integer AS count FROM workspace.capability_records WHERE id = $1',
        [promotedRowId]
      )).rows[0].count,
      0
    );
    await admin.query(`
      INSERT INTO workspace.capability_records (id, owner_role, label, amount, note)
      VALUES ($1, 'tabular_action_member', 'Promoted', 7, 'created from draft')
    `, [promotedRowId]);
    const occupiedRedo = await execute({
      type: 'history.redo', commandId: commandId(), fileId: FILE_ID
    });
    assertFailure(occupiedRedo, 'conflict');
    assert.equal(
      (await admin.query(
        'SELECT label FROM workspace.capability_records WHERE id = $1',
        [promotedRowId]
      )).rows[0].label,
      'Promoted'
    );
    await admin.query('DELETE FROM workspace.capability_records WHERE id = $1', [promotedRowId]);
    assert.equal((await execute({
      type: 'history.redo', commandId: commandId(), fileId: FILE_ID
    })).ok, true);
    assert.equal(
      (await admin.query(
        'SELECT count(*)::integer AS count FROM workspace.capability_records WHERE id = $1',
        [promotedRowId]
      )).rows[0].count,
      1
    );
    await admin.query('DELETE FROM workspace.capability_records WHERE id = $1', [promotedRowId]);
    await admin.query(`
      INSERT INTO workspace.capability_records (id, owner_role, label, amount, note)
      VALUES ($1, 'tabular_action_member', 'Promoted', 7, 'created from draft')
    `, [promotedRowId]);
    const replacementUndo = await execute({
      type: 'history.undo', commandId: commandId(), fileId: FILE_ID
    });
    assertFailure(replacementUndo, 'conflict');
    assert.equal(
      (await admin.query(
        'SELECT count(*)::integer AS count FROM workspace.capability_records WHERE id = $1',
        [promotedRowId]
      )).rows[0].count,
      1
    );

    const undoRead = await execute(readAction('row_one'));
    const beforeUndoLabel = await admin.query(
      'SELECT label FROM workspace.capability_records WHERE id = $1',
      ['row_one']
    );
    const undoable = await execute({
      type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: resultVersion(undoRead),
      patch: [{ columnId: LABEL_ID, value: { type: 'text', value: 'Undo me' } }]
    });
    assert.equal(undoable.ok, true);
    await admin.query(
      'UPDATE workspace.capability_records SET note = $1 WHERE id = $2',
      ['external later work', 'row_one']
    );
    const undone = await execute({
      type: 'history.undo', commandId: commandId(), fileId: FILE_ID
    });
    assert.equal(undone.ok, true);
    const afterUndo = await admin.query(
      'SELECT label, note FROM workspace.capability_records WHERE id = $1',
      ['row_one']
    );
    assert.equal(afterUndo.rows[0].label, beforeUndoLabel.rows[0].label);
    assert.equal(afterUndo.rows[0].note, 'external later work');
    const redone = await execute({
      type: 'history.redo', commandId: commandId(), fileId: FILE_ID
    });
    assert.equal(redone.ok, true);

    const overlapRead = await execute(readAction('row_one'));
    await execute({
      type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: resultVersion(overlapRead),
      patch: [{ columnId: LABEL_ID, value: { type: 'text', value: 'Overlap' } }]
    });
    await admin.query(
      'UPDATE workspace.capability_records SET label = $1 WHERE id = $2',
      ['external overlap', 'row_one']
    );
    const overlapUndo = await execute({
      type: 'history.undo', commandId: commandId(), fileId: FILE_ID
    });
    assertFailure(overlapUndo, 'conflict');
    await admin.query(
      'UPDATE workspace.capability_records SET label = $1 WHERE id = $2',
      ['Overlap', 'row_one']
    );
    assert.equal((await execute({
      type: 'history.undo', commandId: commandId(), fileId: FILE_ID
    })).ok, true);
    const branchRead = await execute(readAction('row_one'));
    await execute({
      type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
      rowId: 'row_one', expectedVersion: resultVersion(branchRead),
      patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'new branch' } }]
    });
    const invalidatedRedo = await execute({
      type: 'history.redo', commandId: commandId(), fileId: FILE_ID
    });
    assertFailure(invalidatedRedo, 'history_not_available');

    const journal = await execute({ type: 'history.list', fileId: FILE_ID, limit: 100 });
    assert.equal(journal.ok, true);
    const journalText = JSON.stringify(journal);
    for (const secret of [
      'external later work', 'new branch', 'workspace', 'capability_records',
      'tabular_action_member', 'SELECT', 'UPDATE'
    ]) {
      assert.equal(journalText.includes(secret), false, `journal output leaked ${secret}`);
    }

    for (let index = 0; index < 101; index += 1) {
      const read = await execute(readAction('row_two'));
      const action = await execute({
        type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
        rowId: 'row_two', expectedVersion: resultVersion(read),
        patch: [{ columnId: NOTE_ID, value: { type: 'text', value: `bounded-${index}` } }]
      });
      assert.equal(action.ok, true);
    }
    const concurrentBoundOne = await execute(readAction('row_one'));
    const concurrentBoundTwo = await execute(readAction('row_two'));
    const concurrentBound = await Promise.all([
      execute({
        type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
        rowId: 'row_one', expectedVersion: resultVersion(concurrentBoundOne),
        patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'bounded-concurrent-one' } }]
      }),
      execute({
        type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
        rowId: 'row_two', expectedVersion: resultVersion(concurrentBoundTwo),
        patch: [{ columnId: NOTE_ID, value: { type: 'text', value: 'bounded-concurrent-two' } }]
      })
    ]);
    assert.equal(concurrentBound.every((result) => result.ok), true);
    const historyCounts = await admin.query(`
      SELECT
        (SELECT count(*)::integer FROM tabular.session_action_entries
          WHERE actor_identity_id = $1 AND history_scope_id = $2) AS reversible,
        (SELECT count(*)::integer FROM tabular.action_journal
          WHERE actor_identity_id = $1 AND history_scope_id = $2) AS journaled
    `, [fresh.principal.identityId, fresh.principal.historyScopeId]);
    assert.equal(historyCounts.rows[0].reversible, 100);
    assert.ok(historyCounts.rows[0].journaled > 100);

    await admin.query('REVOKE UPDATE ON workspace.capability_records FROM tabular_action_member');
    const deniedUndo = await execute({
      type: 'history.undo', commandId: commandId(), fileId: FILE_ID
    });
    assertFailure(deniedUndo, 'capability_denied');
    await admin.query('GRANT UPDATE ON workspace.capability_records TO tabular_action_member');

    const securityRotated = await application.identity.rotateBrowserSession({
      cookieToken: fresh.cookieToken,
      csrfToken: fresh.csrfToken,
      origin: 'https://tabular.test'
    });
    assert.equal(securityRotated.principal.historyScopeId, fresh.principal.historyScopeId);
    const rotatedHistory = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, securityRotated.principal),
      { type: 'history.list', fileId: FILE_ID, limit: 1 }
    );
    assert.equal(rotatedHistory.ok && (rotatedHistory.value as unknown[]).length, 1);
    const secondFresh = await application.identity.establishBrowserSession(memberSubject);
    assert.notEqual(secondFresh.principal.historyScopeId, securityRotated.principal.historyScopeId);
    const emptyFreshHistory = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFresh.principal),
      { type: 'history.list', fileId: FILE_ID, limit: 1 }
    );
    assert.equal(emptyFreshHistory.ok && (emptyFreshHistory.value as unknown[]).length, 0);
    const freshActorDraft = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFresh.principal),
      { type: 'draft.read', draftId: driftValue!.id }
    );
    assert.equal(freshActorDraft.ok, true);
    const freshActorPersistentDraft = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFresh.principal),
      { type: 'draft.read', draftId: persistentDraftId }
    );
    assert.equal(freshActorPersistentDraft.ok, true);
    const secondFreshMutation = await application.identity.requireBrowserMutation({
      cookieToken: secondFresh.cookieToken,
      csrfToken: secondFresh.csrfToken,
      origin: 'https://tabular.test'
    });
    const crossSessionDraftRetry = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFreshMutation),
      duplicateDraftAction
    );
    assert.equal(crossSessionDraftRetry.ok, true);
    assert.equal(replayed(crossSessionDraftRetry), true);
    assert.equal(
      crossSessionDraftRetry.ok
        ? (crossSessionDraftRetry.value as { id: string, }).id
        : '',
      persistentDraftId
    );
    executionPrincipal = secondFresh.principal;

    await admin.query(`
      CREATE TABLE workspace.replaceable_records_child ()
        INHERITS (workspace.replaceable_records);
      INSERT INTO workspace.replaceable_records_child (id, owner_role, value)
      VALUES ('row_replaceable', 'tabular_action_member', 'inherited collision');
    `);
    const inheritedParentRead = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFresh.principal),
      {
        type: 'record.read', fileId: REPLACEMENT_FILE_ID, rowId: 'row_replaceable',
        columnIds: [REPLACEMENT_COLUMN_ID]
      }
    );
    const inheritedParentPatch = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFreshMutation),
      {
        type: 'record.patch', commandId: commandId(), fileId: REPLACEMENT_FILE_ID,
        rowId: 'row_replaceable', expectedVersion: resultVersion(inheritedParentRead),
        patch: [{
          columnId: REPLACEMENT_COLUMN_ID,
          value: { type: 'text', value: 'parent only update' }
        }]
      }
    );
    assert.equal(inheritedParentPatch.ok, true);
    const inheritedRows = await admin.query(`
      SELECT 'parent' AS source, value
        FROM ONLY workspace.replaceable_records WHERE id = 'row_replaceable'
      UNION ALL
      SELECT 'child' AS source, value
        FROM ONLY workspace.replaceable_records_child WHERE id = 'row_replaceable'
      ORDER BY source
    `);
    assert.deepEqual(inheritedRows.rows, [
      { source: 'child', value: 'inherited collision' },
      { source: 'parent', value: 'parent only update' }
    ]);

    const incarnationGuardRead = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFresh.principal),
      readAction('row_one')
    );
    const incarnationGuardPatch = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFreshMutation),
      {
        type: 'record.patch', commandId: commandId(), fileId: FILE_ID,
        rowId: 'row_one', expectedVersion: resultVersion(incarnationGuardRead),
        patch: [{
          columnId: NOTE_ID,
          value: { type: 'text', value: 'incarnation guarded' }
        }]
      }
    );
    assert.equal(incarnationGuardPatch.ok, true);
    await admin.query("DELETE FROM ONLY workspace.capability_records WHERE id = 'row_one'");
    await admin.query(`
      INSERT INTO workspace.capability_records (id, owner_role, label, amount, note)
      VALUES (
        'row_one', 'tabular_action_member', 'replacement incarnation', 10,
        'incarnation guarded'
      )
    `);
    const replacementIncarnationUndo = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFreshMutation),
      { type: 'history.undo', commandId: commandId(), fileId: FILE_ID }
    );
    assertFailure(replacementIncarnationUndo, 'conflict');
    const replacementIncarnation = await admin.query(`
      SELECT label, note FROM ONLY workspace.capability_records WHERE id = 'row_one'
    `);
    assert.deepEqual(replacementIncarnation.rows[0], {
      label: 'replacement incarnation',
      note: 'incarnation guarded'
    });

    const rawSensitive = await admin.query(`
      SELECT count(*)::integer AS count
        FROM tabular.action_journal
       WHERE result_summary::text LIKE '%external later work%'
          OR result_summary::text LIKE '%workspace%'
          OR result_summary::text LIKE '%tabular_action_member%'
    `);
    assert.equal(rawSensitive.rows[0].count, 0);
    let racedTarget: PreparedTarget | undefined;
    await assert.rejects(
      application.database.transaction('web', {
        resolveRole: async (database) => {
          racedTarget = await application!.capability.postgresqlTargets.prepare(
            database,
            REPLACEMENT_FILE_ID,
            'task00004'
          );
          assert.ok(racedTarget);
          await admin.query(`
            ALTER TABLE workspace.replaceable_records
              RENAME COLUMN value TO retired_value;
            ALTER TABLE workspace.replaceable_records
              ADD COLUMN value text NOT NULL DEFAULT 'replacement column';
          `);
          return 'tabular_action_member';
        }
      }, async (database) => {
        await application!.capability.postgresqlTargets.authorize(
          database,
          racedTarget!,
          'read'
        );
        return application!.capability.postgresqlTargets.read(
          database,
          racedTarget!,
          'row_replaceable',
          [REPLACEMENT_COLUMN_ID]
        );
      }),
      (error: unknown) => error instanceof ActionFault && error.safe.code === 'schema_changed'
    );
    let keyRaceTarget: PreparedTarget | undefined;
    await assert.rejects(
      application.database.transaction('web', {
        resolveRole: async (database) => {
          keyRaceTarget = await application!.capability.postgresqlTargets.prepare(
            database,
            REPLACEMENT_FILE_ID,
            'task00004'
          );
          assert.ok(keyRaceTarget);
          await admin.query(`
            ALTER TABLE workspace.replaceable_records
              DROP CONSTRAINT replaceable_records_pkey;
          `);
          return 'tabular_action_member';
        }
      }, async (database) => {
        await application!.capability.postgresqlTargets.authorize(
          database,
          keyRaceTarget!,
          'read'
        );
        return application!.capability.postgresqlTargets.read(
          database,
          keyRaceTarget!,
          'row_replaceable',
          [REPLACEMENT_COLUMN_ID]
        );
      }),
      (error: unknown) => error instanceof ActionFault && error.safe.code === 'schema_changed'
    );
    await admin.query(`
      DROP TABLE workspace.replaceable_records_child;
      DROP TABLE workspace.replaceable_records;
      CREATE TABLE workspace.replaceable_records (
        id text PRIMARY KEY,
        tabular_row_incarnation uuid NOT NULL DEFAULT gen_random_uuid(),
        tabular_row_version bigint NOT NULL DEFAULT 1,
        owner_role name NOT NULL,
        value text NOT NULL
      );
      CREATE TRIGGER replaceable_records_row_version
        BEFORE UPDATE ON workspace.replaceable_records
        FOR EACH ROW EXECUTE FUNCTION workspace.bump_tabular_row_version();
      INSERT INTO workspace.replaceable_records (id, owner_role, value)
      VALUES ('row_replaceable', 'tabular_action_member', 'replacement relation');
      ALTER TABLE workspace.replaceable_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE workspace.replaceable_records FORCE ROW LEVEL SECURITY;
      CREATE POLICY replaceable_records_owner ON workspace.replaceable_records
        USING (owner_role = current_user) WITH CHECK (owner_role = current_user);
      GRANT SELECT, INSERT, UPDATE, DELETE ON workspace.replaceable_records TO tabular_action_member;
    `);
    const replacedIdentity = await execute({
      type: 'record.read', fileId: REPLACEMENT_FILE_ID, rowId: 'row_replaceable',
      columnIds: [REPLACEMENT_COLUMN_ID]
    });
    assertFailure(replacedIdentity, 'not_found');
    const restartedTarget = new RegisteredPostgreSqlTargetAdapter();
    restartedTarget.register(replacementTargetDefinition);
    const restartedReplacement = await application.database.transaction(
      'web',
      {},
      (database) => restartedTarget.prepare(database, REPLACEMENT_FILE_ID, 'task00004')
    );
    assert.equal(restartedReplacement, undefined);

    const beforeTypeDrift = await application.database.transaction('web', {}, (database) =>
      application!.capability.postgresqlTargets.prepare(database, FILE_ID, 'task00004')
    );
    const typeDriftDraft = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFreshMutation),
      {
        type: 'draft.create', commandId: commandId(), fileId: FILE_ID,
        schemaVersion: beforeTypeDrift!.schemaVersion,
        patch: [{ columnId: DATE_ID, value: { type: 'date', value: '2026-08-02' } }],
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      }
    );
    assert.equal(typeDriftDraft.ok, true);
    const typeDriftDraftValue = typeDriftDraft.ok
      ? typeDriftDraft.value as { id: string, version: number, }
      : undefined;
    await admin.query(`
      ALTER TABLE workspace.capability_records ALTER COLUMN date_value DROP DEFAULT;
      ALTER TABLE workspace.capability_records
        ALTER COLUMN date_value TYPE text USING date_value::text;
    `);
    const incompatibleType = await application.capability.execute(
      new BrowserAuthorizedExecutionContext(application.identity, secondFreshMutation),
      {
        type: 'draft.promote', commandId: commandId(),
        draftId: typeDriftDraftValue!.id,
        expectedDraftVersion: typeDriftDraftValue!.version
      }
    );
    assertFailure(incompatibleType, 'schema_changed');
    assert.equal(application.database.openPool('web').checkedOutCount, 0);
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
      throw new AggregateError(cleanupFailures, 'Task 00004 cleanup failed');
    }
  }
});

/**
 * Read the action.
 */
function readAction(rowId: string): CapabilityAction {
  return {
    type: 'record.read',
    fileId: FILE_ID,
    rowId,
    columnIds: [LABEL_ID, AMOUNT_ID, NOTE_ID, BIG_ID, DECIMAL_ID, JSON_ID, DATE_ID]
  };
}

/**
 * Return the command id result.
 */
function commandId() {
  return `cmd_${randomBytes(12).toString('base64url')}`;
}

/**
 * Return the result version result.
 */
function resultVersion(result: Awaited<ReturnType<
  Awaited<ReturnType<typeof startWeb>>['capability']['execute']
>>) {
  assert.equal(result.ok, true);
  const value = result.ok ? result.value as {
    version?: string,
    rows?: Array<{ version: string, }>,
  } : undefined;
  const version = value?.version || value?.rows?.[0]?.version;
  assert.match(version || '', /^ver_[A-Za-z0-9_-]{16,128}$/);
  return version!;
}

/**
 * Return the replayed result.
 */
function replayed(result: { ok: boolean, value?: unknown, }) {
  return result.ok && Boolean((result.value as { replayed?: boolean, }).replayed);
}

/**
 * Assert the failure.
 */
function assertFailure(result: { ok: boolean, error?: { code: string, }, }, code: string) {
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.error?.code, code);
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

class PostgreSqlMcpAuthority extends McpAuthorizedExecutionContext {
  /**
   * Create a PostgreSqlMcpAuthority instance.
   */
  public constructor(
    private readonly database: Awaited<ReturnType<typeof startWeb>>['database'],
    actorIdentityId: string
  ) {
    super({
      actorIdentityId,
      sessionId: `mcp_${'M'.repeat(43)}`,
      historyScopeId: `hist_${'M'.repeat(43)}`,
      connectionId: 'task00004',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
  }

  /**
   * Handle the allows operation.
   */
  public allows(_action: CapabilityAction) {
    return true;
  }

  /**
   * Handle the transaction operation.
   */
  public transaction<TargetResult, FinalResult = TargetResult>(
    _capability: 'tabular.capability',
    phases: AuthorityPhases<TargetResult, FinalResult>
  ) {
    return this.database.transaction<TargetResult, FinalResult>('web', {
      resolveRole: async (database) => {
        await phases.prepareBase?.(database);
        return 'tabular_action_member';
      },
      ...(phases.finalizeBase
        ? { finalizeBase: (database, result) => phases.finalizeBase!(database, result) }
        : {})
    }, phases.target);
  }
}

/**
 * Return the as error result.
 */
function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
