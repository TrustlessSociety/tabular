import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryObject, Value } from '@stackpress/inquire/types';
import { ApplicationError } from '../../../bootstrap/errors.js';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import {
  DatabaseExecutor,
  type RawDatabaseConnection
} from '../../database/helpers/executor.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { SessionAuthorityRow } from '../../identity/helpers/repository.js';
import type { CapabilityPluginService } from '../../capability/helpers/service.js';
import type { FilesPluginService } from '../../files/helpers/service.js';
import type { SavedViewsPluginService } from '../../saved-views/helpers/service.js';
import type { OperationsPluginService } from '../../operations/helpers/service.js';
import {
  GOOGLE_READONLY_SCOPE,
  GoogleTokenVault,
  googleTokenEncryptionKey
} from '../helpers/google-sheets.js';
import type {
  StoredGoogleConnection,
  StoredImportOperation
} from '../helpers/repository.js';
import { ImportExportPluginService } from '../helpers/service.js';

const publicOrigin = 'https://tabular.test';
const encryptionKeyText = Buffer.alloc(32, 19).toString('base64url');

test('Google worker denies unusable authority before reading or using provider credentials', async () => {
  const invalidAuthorities: Array<[string, Partial<SessionAuthorityRow>]> = [
    ['session binding', { session_id: 'sess_rotated_google' }],
    ['session revocation', { revoked_at: new Date() }],
    ['identity status', { identity_status: 'revoked' }],
    ['identity generation', { identity_generation: 4 }],
    ['mapping generation', { mapping_generation: 6 }],
    ['role generation', { role_generation: 8 }],
    ['role enablement', { role_enabled: false }],
    ['idle expiry', { idle_valid: false }],
    ['absolute expiry', { absolute_valid: false }],
    ['role usability', { can_set_role: false }]
  ];

  for (const [label, overrides] of invalidAuthorities) {
    //Make the stored credential deliberately unusable so reaching it would expose
    //the authority-before-secret ordering regression immediately.
    const harness = workerHarness({
      authority: authorityRow(overrides),
      connection: {
        ...googleConnection(),
        access_ciphertext: 'not-valid-ciphertext'
      }
    });

    //Run the same public worker entry point used by confirmed imports.
    await assert.rejects(
      () => harness.service.executeConfirmedImport(harness.operation.id),
      applicationCode('import_confirmation_denied'),
      label
    );

    //No connection read, decrypt attempt, refresh, or provider request may happen
    //after the bound browser authority has become unusable.
    assert.equal(harness.providerRequests(), 0, label);
    assert.equal(
      harness.queries().some((query) => query.includes('tabular.google_connections')),
      false,
      label
    );
  }
});

test('Google worker persists local revocation when source recheck loses provider authorization', async () => {
  const harness = workerHarness({
    authority: authorityRow(),
    connection: googleConnection(),
    provider: async () => json({ error: { message: 'expired provider token' } }, 401)
  });

  //The provider denial is surfaced to the worker caller without continuing to
  //the PostgreSQL commit transaction.
  await assert.rejects(
    () => harness.service.executeConfirmedImport(harness.operation.id),
    applicationCode('google_reauthentication_required')
  );

  //The exact bound local connection is revoked and its provider access is not
  //left reusable for a later worker retry.
  assert.equal(harness.providerRequests(), 1);
  assert.equal(harness.revocationReason(), 'provider-revoked');
});

test('Google worker persists local revocation when provider refresh authorization fails', async () => {
  const connection = googleConnection({ expired: true, includeRefresh: true });
  const harness = workerHarness({
    authority: authorityRow(),
    connection,
    provider: async (input) => {
      assert.equal(String(input), 'https://oauth2.googleapis.com/token');
      return json({ error: 'invalid_grant' }, 401);
    }
  });

  await assert.rejects(
    () => harness.service.executeConfirmedImport(harness.operation.id),
    applicationCode('google_reauthentication_required')
  );

  assert.equal(harness.providerRequests(), 1);
  assert.equal(harness.revocationReason(), 'provider-revoked');
});

type HarnessOptions = {
  authority: SessionAuthorityRow;
  connection: StoredGoogleConnection;
  provider?: typeof fetch;
};

/** Builds a worker service over a deterministic query script. */
function workerHarness(options: HarnessOptions) {
  const operation = importOperation();
  let providerRequests = 0;
  let revocationReason: string | undefined;
  const provider = options.provider || (async () => json({}));
  const connection = new ScriptedConnection((query, values) => {
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('WITH candidates AS MATERIALIZED')) {
      return { rows: [] };
    }
    if (normalized.includes('SELECT * FROM tabular.import_operations WHERE id = ?')) {
      return { rows: [operation] };
    }
    if (normalized.includes('SELECT id FROM tabular.identities WHERE id = ?')) {
      return { rows: [{ id: operation.actor_identity_id }] };
    }
    if (normalized.includes('SELECT identity_id FROM tabular.identity_role_mappings')) {
      return { rows: [{ identity_id: operation.actor_identity_id }] };
    }
    if (normalized.includes('SELECT r.id FROM tabular.identity_role_mappings')) {
      return { rows: [{ id: operation.allowed_role_id }] };
    }
    if (normalized.includes('FROM tabular.browser_sessions s')) {
      return { rows: [options.authority] };
    }
    if (normalized.includes('FROM tabular.google_connections')) {
      return { rows: [options.connection] };
    }
    if (normalized.includes('UPDATE tabular.google_connections')) {
      revocationReason = String(values[0]);
      return { affectedRows: 1 };
    }
    if (normalized.includes("SET state = 'failed'")) {
      return { affectedRows: 1 };
    }
    throw new Error(`Unexpected worker query: ${normalized}`);
  });
  const executor = new DatabaseExecutor(connection);
  const database = {
    transaction: (
      _scope: string,
      _options: unknown,
      callback: (database: DatabaseExecutor) => Promise<unknown>
    ) => callback(executor)
  } as unknown as DatabasePluginService;
  const runtime = {
    processKind: 'worker',
    config: { environment: { publicOrigin } }
  } as unknown as ApplicationRuntimeService;
  const fetcher: typeof fetch = async (input, init) => {
    providerRequests += 1;
    return provider(input, init);
  };
  const environment = {
    TABULAR_GOOGLE_CLIENT_ID: 'task00011.apps.googleusercontent.com',
    TABULAR_GOOGLE_CLIENT_SECRET: 'task00011-client-secret',
    TABULAR_GOOGLE_REDIRECT_URI: `${publicOrigin}/events/import-google-callback`,
    TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY: encryptionKeyText
  };
  const service = new ImportExportPluginService(
    runtime,
    database,
    {} as IdentityPluginService,
    {} as CapabilityPluginService,
    {} as FilesPluginService,
    {} as SavedViewsPluginService,
    {} as OperationsPluginService,
    fetcher,
    environment
  );
  return {
    operation,
    service,
    providerRequests: () => providerRequests,
    queries: () => connection.queries,
    revocationReason: () => revocationReason
  };
}

/** Supplies a complete current authority row with narrow per-test overrides. */
function authorityRow(overrides: Partial<SessionAuthorityRow> = {}): SessionAuthorityRow {
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    session_id: 'sess_worker_google',
    history_scope_id: 'hist_worker_google',
    identity_id: 'id_worker_google',
    connection_id: 'task00011',
    display_name: 'Google Worker',
    token_hash: 'unused-token-hash',
    csrf_token_hash: 'unused-csrf-hash',
    idle_expires_at: expiresAt,
    absolute_expires_at: expiresAt,
    revoked_at: null,
    identity_status: 'active',
    identity_generation: 3,
    session_identity_generation: 3,
    mapping_generation: 5,
    session_mapping_generation: 5,
    mapping_enabled: true,
    role_enabled: true,
    role_generation: 7,
    configured_role_oid: '41001',
    allowed_role_id: 'role_worker_google',
    live_role_oid: '41001',
    configured_role_name: 'tabular_google_user',
    live_role_name: 'tabular_google_user',
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolcanlogin: false,
    rolreplication: false,
    rolbypassrls: false,
    same_database: true,
    idle_valid: true,
    absolute_valid: true,
    can_set_role: true,
    ...overrides
  };
}

/** Supplies the confirmed Google import record bound to the authority fixture. */
function importOperation(): StoredImportOperation {
  const now = new Date();
  return {
    id: 'imp_worker_google_12345678901234567890123456789012',
    command_id: 'cmd_worker_google_12345678901234567890123456789012',
    request_digest: 'a'.repeat(64),
    actor_identity_id: 'id_worker_google',
    session_id: 'sess_worker_google',
    history_scope_id: 'hist_worker_google',
    connection_id: 'task00011',
    database_oid: '16384',
    requesting_role_oid: '41001',
    requesting_role_name: 'tabular_google_user',
    identity_generation: 3,
    mapping_generation: 5,
    allowed_role_id: 'role_worker_google',
    role_generation: 7,
    schema_id: 'schema_12345678901234567890123456789012',
    namespace_oid: '2200',
    schema_name: 'workspace',
    owner_role_oid: '41002',
    owner_role_name: 'tabular_workspace_owner',
    source_kind: 'google-sheets',
    source_name: 'Orders',
    source_media_type: 'application/vnd.google-apps.spreadsheet',
    source_size: 32,
    source_sha256: 'b'.repeat(64),
    source_options: {
      spreadsheetId: 'sheet_task_00011',
      spreadsheetVersion: '17',
      modifiedTime: '2026-08-02T03:04:05.000Z',
      sheetName: 'Orders'
    },
    source_fingerprint: 'c'.repeat(64),
    total_chunks: 0,
    received_chunks: 0,
    selected_sheet: 'Orders',
    headers: ['Code'],
    mapping: [],
    mapping_fingerprint: 'd'.repeat(64),
    preview: [['001']],
    warnings: [],
    row_count: 1,
    column_count: 1,
    issue_count: 0,
    file_display_name: 'Orders',
    table_name: 'orders',
    confirmation_hash: 'e'.repeat(64),
    state: 'confirmed',
    result_summary: null,
    error_summary: null,
    version: 4,
    created_at: now,
    updated_at: now,
    expires_at: new Date(now.getTime() + 10 * 60_000),
    confirmed_at: now,
    committed_at: null,
    cancelled_at: null
  };
}

/** Encrypts a provider connection exactly as the production binding expects. */
function googleConnection(options: {
  expired?: boolean;
  includeRefresh?: boolean;
} = {}): StoredGoogleConnection {
  const vault = new GoogleTokenVault(googleTokenEncryptionKey(encryptionKeyText));
  const access = vault.encrypt('provider-access-token', associatedData('access-token'));
  const refresh = options.includeRefresh
    ? vault.encrypt('provider-refresh-token', associatedData('refresh-token'))
    : undefined;
  return {
    id: 'gconn_worker_google_12345678901234567890123456789012',
    actor_identity_id: 'id_worker_google',
    session_id: 'sess_worker_google',
    history_scope_id: 'hist_worker_google',
    connection_id: 'task00011',
    access_ciphertext: access.ciphertext,
    access_iv: access.iv,
    access_tag: access.tag,
    refresh_ciphertext: refresh?.ciphertext || null,
    refresh_iv: refresh?.iv || null,
    refresh_tag: refresh?.tag || null,
    scope: GOOGLE_READONLY_SCOPE,
    token_expires_at: new Date(Date.now() + (options.expired ? -1_000 : 10 * 60_000)),
    revoked_at: null
  };
}

/** Reconstructs the production AES-GCM associated-data tuple. */
function associatedData(secret: string) {
  return [
    'tabular-google-v1',
    secret,
    'id_worker_google',
    'sess_worker_google',
    'hist_worker_google',
    'task00011'
  ].join(':');
}

/** Matches an application error without depending on provider wording. */
function applicationCode(code: string) {
  return (error: unknown) => error instanceof ApplicationError && error.errorCode === code;
}

/** Produces a bounded JSON response for the provider test double. */
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

type ScriptedResult = {
  rows?: unknown[];
  affectedRows?: number;
};

/** Records repository queries and delegates their deterministic results. */
class ScriptedConnection implements RawDatabaseConnection {
  public readonly queries: string[] = [];

  public constructor(
    private readonly handler: (query: string, values: Value[]) => ScriptedResult
  ) {}

  public async raw<Row = unknown>(request: QueryObject) {
    this.queries.push(request.query);
    const result = this.handler(request.query, request.values || []);
    return {
      rows: (result.rows || []) as Row[],
      rowCount: result.affectedRows || 0
    };
  }
}
