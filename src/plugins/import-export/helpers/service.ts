//node
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { CapabilityPluginService, GridTargetPlan } from '../../capability/helpers/service.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import type { ExpectedDdlContext } from '../../files/helpers/contracts.js';
import type { FilesPluginService } from '../../files/helpers/service.js';
import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';
import type { SessionAuthorityRow } from '../../identity/helpers/repository.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { OperationsPluginService } from '../../operations/helpers/service.js';
import type { SavedViewDefinition } from '../../saved-views/helpers/contracts.js';
import type { SavedViewsPluginService } from '../../saved-views/helpers/service.js';
import type {
  ParsedImportCell,
  ParsedImportResult,
  ParsedImportRow
} from './contracts.js';
import type { GoogleOAuthTokens, GoogleSheetValues } from './google-sheets.js';
import type { ImportColumnMapping, ImportConversionIssue } from './mapping.js';
import type { StoredGoogleConnection, StoredImportOperation } from './repository.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { quoteIdentifier } from '../../database/helpers/identifiers.js';
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import { isBrowserMutationPrincipal } from '../../identity/helpers/contracts.js';
import { IdentityRepository } from '../../identity/helpers/repository.js';
import {
  matchesTokenHash,
  opaqueId,
  opaqueToken,
  tokenHash
} from '../../identity/helpers/security.js';
import { validateDefinition } from '../../saved-views/helpers/validation.js';
import {
  authorizeFileDdlPlan,
  prepareFileDdlPlan
} from '../../files/helpers/planning.js';
import { parseCsv } from './csv.js';
import { parseXlsx } from './xlsx.js';
import { inferColumns } from './inference.js';
import { deterministicFingerprint } from './fingerprint.js';
import {
  defaultMapping,
  mappingFingerprint,
  sourceIdentity,
  stagedRows,
  validateMappedRows,
  validateMapping
} from './mapping.js';
import { ImportExportRepository, safeOperation } from './repository.js';
import {
  csvContentDisposition,
  safeCsvFilename,
  serializeAuthorizedCsv
} from './csv-export.js';
import { IMPORT_PARSER_VERSION } from './contracts.js';
import {
  GOOGLE_READONLY_SCOPE,
  GoogleSheetsClient,
  GoogleTokenVault,
  googlePkceChallenge,
  googleTokenEncryptionKey
} from './google-sheets.js';

//The import export service value exported for module callers
export const IMPORT_EXPORT_SERVICE = 'tabular.import-export';
const SOURCE_BYTES = 8 * 1024 * 1024;
const SOURCE_CHUNK_BYTES = 256 * 1024;
const SOURCE_ROWS = 50_001;
const SOURCE_COLUMNS = 200;
const SOURCE_ISSUES = 10_000;

//The create import input contract exported for module callers
export type CreateImportInput = {
  commandId: string,
  folderId: string,
  sourceKind: 'csv' | 'xlsx' | 'google-sheets',
  sourceName: string,
  sourceMediaType: string,
  sourceSize: number,
  sourceOptions?: Record<string, unknown>,
};

//The csv export request contract exported for module callers
export type CsvExportRequest = {
  fileId: string,
  viewId?: string,
  expectedViewVersion?: number,
  columnIds?: string[],
  sorts?: SavedViewDefinition['sorts'],
  filters?: SavedViewDefinition['filters'],
  presentation?: SavedViewDefinition['presentation'],
};

/**
 * Provide import export plugin operations through one service boundary.
 */
export class ImportExportPluginService {
  //The name state retained by this class instance
  public readonly name = IMPORT_EXPORT_SERVICE;

  /**
   * Create a ImportExportPluginService instance.
   */
  public constructor(
    private readonly runtime: ApplicationRuntimeService,
    private readonly database: DatabasePluginService,
    private readonly identity: IdentityPluginService,
    private readonly capability: CapabilityPluginService,
    private readonly files: FilesPluginService,
    private readonly savedViews: SavedViewsPluginService,
    private readonly operations: OperationsPluginService,
    private readonly googleFetcher: typeof fetch = fetch,
    private readonly googleEnvironment: NodeJS.ProcessEnv = process.env
  ) {}

  /**
   * Handle the google sheets availability operation.
   */
  public googleSheetsAvailability() {
    const required = [
      'TABULAR_GOOGLE_CLIENT_ID',
      'TABULAR_GOOGLE_CLIENT_SECRET',
      'TABULAR_GOOGLE_REDIRECT_URI',
      'TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY'
    ];
    const missing = required.filter((key) => !this.googleEnvironment[key]);
    if (!missing.length) {
      try {
        this.googleConfiguration();
      } catch {
        return {
          available: false as const,
          reason: 'Google Sheets is unavailable because its server configuration is invalid.',
          missing: [] as string[]
        };
      }
    }
    return missing.length
      ? {
        available: false as const,
        reason: `Google Sheets is unavailable in this environment. Missing: ${missing.join(', ')}`,
        missing
      }
      : { available: true as const, missing: [] as string[] };
  }

  /**
   * Start the google OAuth.
   */
  public async startGoogleOAuth(principal: BrowserMutationPrincipal, returnPath: string) {
    requireMutation(principal);
    const configuration = this.googleConfiguration();
    const safeReturnPath = googleReturnPath(returnPath, configuration.publicOrigin);
    const state = opaqueToken();
    const verifier = opaqueToken();
    const expiresAt = new Date(Math.min(
      principal.absoluteExpiresAt.getTime(),
      Date.now() + 10 * 60_000
    ));
    const vault = new GoogleTokenVault(configuration.encryptionKey);
    const encrypted = vault.encrypt(verifier, googleAssociatedData(principal, 'pkce-verifier'));
    await this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async () => undefined,
      undefined,
      async (database) => {
        await new ImportExportRepository(database).insertGoogleOAuthState({
          stateHash: googleStateHash(state),
          principal,
          returnPath: safeReturnPath,
          verifier: encrypted,
          expiresAt
        });
      },
      'read committed'
    );
    const client = this.googleClient(configuration);
    return {
      authorizationUrl: client.authorizationUrl({
        state,
        codeChallenge: googlePkceChallenge(verifier)
      }),
      expiresAt: expiresAt.toISOString()
    };
  }

  /**
   * Handle the complete google OAuth operation.
   */
  public async completeGoogleOAuth(principal: BrowserPrincipal, input: {
    state: string,
    code?: string,
    error?: string,
  }) {
    const configuration = this.googleConfiguration();
    let stored: Awaited<ReturnType<ImportExportRepository['consumeGoogleOAuthState']>>;
    await this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async () => undefined,
      async (database) => {
        stored = await new ImportExportRepository(database).consumeGoogleOAuthState(
          principal,
          googleStateHash(input.state)
        );
        if (!stored) googleOAuthDenied();
      },
      undefined,
      'read committed'
    );
    if (!stored) googleOAuthDenied();
    if (input.error) {
      return { status: 'denied' as const, returnPath: stored.return_path };
    }
    if (!input.code) googleOAuthDenied();
    const vault = new GoogleTokenVault(configuration.encryptionKey);
    const verifier = vault.decrypt({
      ciphertext: stored.verifier_ciphertext,
      iv: stored.verifier_iv,
      tag: stored.verifier_tag
    }, googleAssociatedData(principal, 'pkce-verifier'));
    const client = this.googleClient(configuration);
    let tokens: GoogleOAuthTokens | undefined;
    try {
      tokens = await client.exchangeCode({ code: input.code, codeVerifier: verifier });
      await this.saveGoogleConnection(principal, tokens, vault);
      return { status: 'connected' as const, returnPath: stored.return_path };
    } catch (error) {
      if (tokens?.accessToken) await client.revoke(tokens.accessToken).catch(() => undefined);
      return { status: 'error' as const, returnPath: stored.return_path };
    }
  }

  /**
   * List the google spreadsheets.
   */
  public async listGoogleSpreadsheets(
    principal: BrowserMutationPrincipal,
    pageToken?: string
  ) {
    requireMutation(principal);
    return this.withGoogleAccess(principal, (client, accessToken) =>
      client.listSpreadsheets(accessToken, pageToken)
    );
  }

  /**
   * List the google worksheets.
   */
  public async listGoogleWorksheets(
    principal: BrowserMutationPrincipal,
    spreadsheetId: string
  ) {
    requireMutation(principal);
    return this.withGoogleAccess(principal, async (client, accessToken) => ({
      spreadsheetId,
      sheets: await client.worksheetNames(accessToken, spreadsheetId)
    }));
  }

  /**
   * Handle the stage google import operation.
   */
  public async stageGoogleImport(principal: BrowserMutationPrincipal, input: {
    commandId: string,
    folderId: string,
    spreadsheetId: string,
    sheetName: string,
  }) {
    requireMutation(principal);
    commandId(input.commandId);
    if (!/^schema_[A-Za-z0-9_-]{32,64}$/.test(input.folderId)) invalid('Import folder is invalid');
    const values = await this.withGoogleAccess(principal, (client, accessToken) =>
      client.importValues({
        accessToken,
        spreadsheetId: input.spreadsheetId,
        sheetName: input.sheetName
      })
    );
    const sourceSize = Buffer.byteLength(JSON.stringify(values.rows), 'utf8');
    if (sourceSize > SOURCE_BYTES) invalid(`Import source cannot exceed ${SOURCE_BYTES} bytes`);
    const created = await this.create(principal, {
      commandId: input.commandId,
      folderId: input.folderId,
      sourceKind: 'google-sheets',
      sourceName: values.spreadsheetName,
      sourceMediaType: 'application/vnd.google-apps.spreadsheet',
      sourceSize,
      sourceOptions: {
        spreadsheetId: values.spreadsheetId,
        spreadsheetVersion: values.spreadsheetVersion,
        modifiedTime: values.modifiedTime,
        sheetName: values.sheetName
      }
    });
    if (created.state !== 'initiated') return created;
    let operation: StoredImportOperation | undefined;
    let parsed: ParsedStage | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!operation || !parsed) unavailable();
        await assertImportTarget(database, operation);
        return undefined;
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        operation = await repository.lockOwned(principal, created.id);
        if (!operation || operation.source_kind !== 'google-sheets'
          || operation.state !== 'initiated') unavailable();
        parsed = googleStage(operation, values);
        await repository.replaceParsed({
          importId: operation.id,
          rows: parsed.rows,
          issues: parsed.issues
        });
      },
      async (database) => {
        if (!operation || !parsed) unavailable();
        const repository = new ImportExportRepository(database);
        if (await repository.savePreview({ importId: operation.id, ...parsed.preview }) !== 1) {
          conflict('Google source changed during staging');
        }
        const current = await repository.byId(operation.id);
        if (!current) unavailable();
        return safeOperation(current, parsed.issues);
      },
      'read committed'
    );
  }

  /**
   * Revoke the google connection.
   */
  public async revokeGoogleConnection(principal: BrowserMutationPrincipal) {
    requireMutation(principal);
    let providerToken: string | undefined;
    try {
      providerToken = await this.withGoogleAccess(principal, async (_client, accessToken) => accessToken);
      await this.googleClient(this.googleConfiguration()).revoke(providerToken);
    } catch { /* local revocation remains authoritative */ }
    await this.markGoogleConnectionRevoked(principal, 'user-revoked');
    return { revoked: true as const };
  }

  /**
   * Handle the google configuration operation.
   */
  private googleConfiguration() {
    const publicOrigin = this.runtime.config.environment.publicOrigin;
    const clientId = this.googleEnvironment.TABULAR_GOOGLE_CLIENT_ID;
    const clientSecret = this.googleEnvironment.TABULAR_GOOGLE_CLIENT_SECRET;
    const redirectUri = this.googleEnvironment.TABULAR_GOOGLE_REDIRECT_URI;
    if (!publicOrigin || !clientId || !clientSecret || !redirectUri) {
      throw new Error('Google OAuth configuration is incomplete');
    }
    const expectedRedirect = `${publicOrigin}/events/import-google-callback`;
    if (redirectUri !== expectedRedirect || !redirectUri.startsWith('https://')) {
      throw new Error('TABULAR_GOOGLE_REDIRECT_URI must be the canonical HTTPS callback URL');
    }
    for (const value of [clientId, clientSecret]) {
      if (value !== value.trim() || value.length > 2_048 || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new Error('Google OAuth credentials are invalid');
      }
    }
    return {
      publicOrigin,
      credentials: { clientId, clientSecret, redirectUri },
      encryptionKey: googleTokenEncryptionKey(
        this.googleEnvironment.TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY
      )
    };
  }

  /**
   * Handle the google client operation.
   */
  private googleClient(configuration = this.googleConfiguration()) {
    return new GoogleSheetsClient(configuration.credentials, this.googleFetcher);
  }

  /**
   * Save the google connection.
   */
  private async saveGoogleConnection(
    principal: BrowserPrincipal,
    tokens: GoogleOAuthTokens,
    vault: GoogleTokenVault
  ) {
    const expiresAt = new Date(Math.min(
      principal.absoluteExpiresAt.getTime(),
      Date.now() + tokens.expiresIn * 1_000
    ));
    const access = vault.encrypt(
      tokens.accessToken,
      googleAssociatedData(principal, 'access-token')
    );
    const refresh = tokens.refreshToken
      ? vault.encrypt(tokens.refreshToken, googleAssociatedData(principal, 'refresh-token'))
      : undefined;
    await this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async () => undefined,
      undefined,
      async (database) => {
        await new ImportExportRepository(database).saveGoogleConnection({
          id: `gconn_${opaqueToken()}`,
          principal,
          access,
          ...(refresh ? { refresh } : {}),
          scope: tokens.scope,
          expiresAt
        });
      },
      'read committed'
    );
  }

  /**
   * Handle the google connection operation.
   */
  private async googleConnection(principal: BrowserPrincipal) {
    let connection: StoredGoogleConnection | undefined;
    await this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async () => undefined,
      async (database) => {
        connection = await new ImportExportRepository(database).googleConnection(principal);
      },
      undefined,
      'read committed'
    );
    if (!connection || connection.scope !== GOOGLE_READONLY_SCOPE) {
      throw new ApplicationError(
        'google_reauthentication_required',
        401,
        'Connect Google Sheets before importing.'
      );
    }
    return connection;
  }

  /**
   * Update the google connection.
   */
  private async updateGoogleConnection(
    principal: BrowserPrincipal,
    connection: StoredGoogleConnection,
    tokens: GoogleOAuthTokens,
    vault: GoogleTokenVault
  ) {
    const access = vault.encrypt(tokens.accessToken, googleAssociatedData(principal, 'access-token'));
    const refresh = tokens.refreshToken
      ? vault.encrypt(tokens.refreshToken, googleAssociatedData(principal, 'refresh-token'))
      : undefined;
    const expiresAt = new Date(Math.min(
      principal.absoluteExpiresAt.getTime(),
      Date.now() + tokens.expiresIn * 1_000
    ));
    await this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async () => undefined,
      undefined,
      async (database) => {
        const updated = await new ImportExportRepository(database).updateGoogleConnection({
          principal,
          id: connection.id,
          access,
          ...(refresh ? { refresh } : {}),
          scope: tokens.scope,
          expiresAt
        });
        if (updated !== 1) googleOAuthDenied();
      },
      'read committed'
    );
  }

  /**
   * Mark google connection revoked.
   */
  private async markGoogleConnectionRevoked(principal: BrowserPrincipal, reason: string) {
    await this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async () => undefined,
      undefined,
      async (database) => {
        await new ImportExportRepository(database).revokeGoogleConnection(principal, reason);
      },
      'read committed'
    );
  }

  /**
   * Mark google worker connection revoked.
   */
  private async markGoogleWorkerConnectionRevoked(
    principal: BrowserPrincipal,
    reason: string
  ) {
    await this.database.transaction('worker', {}, async (database) => {
      await new ImportExportRepository(database).revokeGoogleConnection(principal, reason);
    });
  }

  /**
   * Handle the with google access operation.
   */
  private async withGoogleAccess<Result>(
    principal: BrowserPrincipal,
    callback: (client: GoogleSheetsClient, accessToken: string) => Promise<Result>
  ) {
    const configuration = this.googleConfiguration();
    const vault = new GoogleTokenVault(configuration.encryptionKey);
    const client = this.googleClient(configuration);
    const connection = await this.googleConnection(principal);
    let accessToken = vault.decrypt({
      ciphertext: connection.access_ciphertext,
      iv: connection.access_iv,
      tag: connection.access_tag
    }, googleAssociatedData(principal, 'access-token'));
    if (new Date(connection.token_expires_at).getTime() <= Date.now() + 30_000) {
      if (!connection.refresh_ciphertext || !connection.refresh_iv || !connection.refresh_tag) {
        await this.markGoogleConnectionRevoked(principal, 'refresh-token-unavailable');
        throw new ApplicationError(
          'google_reauthentication_required',
          401,
          'Google access expired. Reconnect before importing.'
        );
      }
      const refreshToken = vault.decrypt({
        ciphertext: connection.refresh_ciphertext,
        iv: connection.refresh_iv,
        tag: connection.refresh_tag
      }, googleAssociatedData(principal, 'refresh-token'));
      try {
        const refreshed = await client.refresh(refreshToken);
        await this.updateGoogleConnection(principal, connection, refreshed, vault);
        accessToken = refreshed.accessToken;
      } catch (error) {
        if (error instanceof ApplicationError
          && error.errorCode === 'google_reauthentication_required') {
          await this.markGoogleConnectionRevoked(principal, 'provider-revoked');
        }
        throw error;
      }
    }
    try {
      return await callback(client, accessToken);
    } catch (error) {
      if (error instanceof ApplicationError
        && error.errorCode === 'google_reauthentication_required') {
        await this.markGoogleConnectionRevoked(principal, 'provider-revoked');
      }
      throw error;
    }
  }

  /**
   * Assert the google source current.
   */
  private async assertGoogleSourceCurrent(operation: StoredImportOperation) {
    const principal = operationPrincipal(operation);
    const configuration = this.googleConfiguration();
    const vault = new GoogleTokenVault(configuration.encryptionKey);
    const client = this.googleClient(configuration);
    const connection = await this.database.transaction('worker', {}, (database) =>
      new ImportExportRepository(database).googleConnection(principal)
    );
    if (!connection || connection.scope !== GOOGLE_READONLY_SCOPE) {
      throw new ApplicationError(
        'google_reauthentication_required',
        401,
        'Google access is unavailable. Reconnect and review the source again.'
      );
    }
    let accessToken = vault.decrypt({
      ciphertext: connection.access_ciphertext,
      iv: connection.access_iv,
      tag: connection.access_tag
    }, googleAssociatedData(principal, 'access-token'));
    if (new Date(connection.token_expires_at).getTime() <= Date.now() + 30_000) {
      if (!connection.refresh_ciphertext || !connection.refresh_iv || !connection.refresh_tag) {
        await this.markGoogleWorkerConnectionRevoked(
          principal,
          'refresh-token-unavailable'
        );
        throw new ApplicationError(
          'google_reauthentication_required',
          401,
          'Google access expired. Reconnect and review the source again.'
        );
      }
      try {
        const refreshed = await client.refresh(vault.decrypt({
          ciphertext: connection.refresh_ciphertext,
          iv: connection.refresh_iv,
          tag: connection.refresh_tag
        }, googleAssociatedData(principal, 'refresh-token')));
        accessToken = refreshed.accessToken;
        const access = vault.encrypt(accessToken, googleAssociatedData(principal, 'access-token'));
        const refresh = refreshed.refreshToken
          ? vault.encrypt(refreshed.refreshToken, googleAssociatedData(principal, 'refresh-token'))
          : undefined;
        await this.database.transaction('worker', {}, async (database) => {
          const updated = await new ImportExportRepository(database).updateGoogleConnection({
            principal,
            id: connection.id,
            access,
            ...(refresh ? { refresh } : {}),
            scope: refreshed.scope,
            expiresAt: new Date(Date.now() + refreshed.expiresIn * 1_000)
          });
          if (updated !== 1) googleOAuthDenied();
        });
      } catch (error) {
        if (error instanceof ApplicationError
          && error.errorCode === 'google_reauthentication_required') {
          await this.markGoogleWorkerConnectionRevoked(principal, 'provider-revoked');
        }
        throw error;
      }
    }
    const spreadsheetId = operation.source_options.spreadsheetId;
    const expectedVersion = operation.source_options.spreadsheetVersion;
    const expectedModifiedTime = operation.source_options.modifiedTime;
    if (typeof spreadsheetId !== 'string' || typeof expectedVersion !== 'string'
      || typeof expectedModifiedTime !== 'string') unavailable();
    let current: Awaited<ReturnType<GoogleSheetsClient['fileRevision']>>;
    try {
      current = await client.fileRevision(accessToken, spreadsheetId);
    } catch (error) {
      if (error instanceof ApplicationError
        && error.errorCode === 'google_reauthentication_required') {
        await this.markGoogleWorkerConnectionRevoked(principal, 'provider-revoked');
      }
      throw error;
    }
    if (current.version !== expectedVersion || current.modifiedTime !== expectedModifiedTime) {
      throw new ApplicationError(
        'google_source_changed',
        409,
        'The Google spreadsheet changed after preview. Review a fresh staged import.'
      );
    }
  }

  /**
   * Assert the google worker authority.
   */
  private async assertGoogleWorkerAuthority(operation: StoredImportOperation) {
    return this.database.transaction('worker', {}, async (database) => {
      const identities = new IdentityRepository(database);
      await identities.lockIdentity(operation.actor_identity_id);
      await identities.lockMapping(operation.actor_identity_id, operation.connection_id);
      await identities.lockAllowedRoleForMapping(
        operation.actor_identity_id,
        operation.connection_id
      );
      const session = await identities.sessionById(operation.session_id);
      const current = await new ImportExportRepository(database).lockForWorker(operation.id);
      if (!current || current.source_kind !== 'google-sheets'
        || current.state !== 'confirmed') unavailable();
      assertLockedAuthority(session, current);
      return current;
    });
  }

  /**
   * Create one staged import operation under the caller's mutation authority.
   */
  public async create(principal: BrowserMutationPrincipal, input: CreateImportInput) {
    requireMutation(principal);
    const validated = validateCreate(input);
    const digest = deterministicFingerprint({ type: 'import.create', ...validated });
    const importId = `imp_${opaqueToken()}`;
    const totalChunks = validated.sourceKind === 'google-sheets'
      ? 0
      : Math.max(1, Math.ceil(validated.sourceSize / SOURCE_CHUNK_BYTES));
    const expiresAt = new Date(Math.min(
      principal.absoluteExpiresAt.getTime(),
      Date.now() + 60 * 60_000
    ));
    const identity = sourceIdentity(validated.sourceName);
    let replay: StoredImportOperation | undefined;
    let plan: Awaited<ReturnType<typeof prepareFileDdlPlan>> | undefined;
    let authority: Awaited<ReturnType<typeof currentAuthority>> | undefined;
    let requester: { roleOid: string, roleName: string, } | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!plan) throw new Error('Import destination was not prepared');
        requester = await authorizeFileDdlPlan(database, plan.action, plan.expected);
        return undefined;
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        await repository.lockCommand(principal, validated.commandId);
        replay = await repository.byCommand(principal, validated.commandId);
        if (replay) {
          if (replay.request_digest !== digest
            || replay.session_id !== principal.sessionId
            || replay.history_scope_id !== principal.historyScopeId) idempotencyConflict();
        }
        const stable = await reconcileCatalog(database, principal.connectionId);
        plan = await prepareFileDdlPlan(database, stable, {
          type: 'file.create',
          commandId: validated.commandId,
          schemaId: validated.folderId,
          displayName: identity.fileDisplayName
        });
        authority = await currentAuthority(database, principal);
      },
      async (database) => {
        const plannedTableName = plan && 'physicalName' in plan.action
          ? plan.action.physicalName : undefined;
        if (replay) return safeOperation(replay);
        if (!plan || !authority || !requester
          || !plannedTableName
          || !plan.expected.namespaceOid || !plan.expected.schemaName
          || !plan.expected.ownerRoleOid || !plan.expected.ownerRoleName) {
          throw new Error('Import authority preparation was incomplete');
        }
        await new ImportExportRepository(database).insert({
          id: importId,
          commandId: validated.commandId,
          requestDigest: digest,
          principal,
          databaseOid: plan.expected.databaseOid,
          requestingRoleOid: requester.roleOid,
          requestingRoleName: requester.roleName,
          ...authority,
          schemaId: validated.folderId,
          namespaceOid: plan.expected.namespaceOid,
          schemaName: plan.expected.schemaName,
          ownerRoleOid: plan.expected.ownerRoleOid,
          ownerRoleName: plan.expected.ownerRoleName,
          fileDisplayName: identity.fileDisplayName,
          tableName: plannedTableName,
          sourceKind: validated.sourceKind,
          sourceName: validated.sourceName,
          sourceMediaType: validated.sourceMediaType,
          sourceSize: validated.sourceSize,
          sourceOptions: validated.sourceOptions,
          totalChunks,
          expiresAt
        });
        const created = await new ImportExportRepository(database).byId(importId);
        if (!created) throw new Error('Created import operation was unavailable');
        return safeOperation(created);
      },
      'read committed'
    );
  }

  /**
   * Handle the append chunk operation.
   */
  public async appendChunk(
    principal: BrowserMutationPrincipal,
    importId: string,
    chunkIndex: number,
    bytes: Buffer
  ) {
    requireMutation(principal);
    validateImportId(importId);
    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 63
      || !Buffer.isBuffer(bytes) || bytes.byteLength > SOURCE_CHUNK_BYTES) {
      invalid('Import source chunk is invalid');
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    let operation: StoredImportOperation | undefined;
    let replay = false;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!operation) unavailable();
        await assertImportTarget(database, operation);
        return undefined;
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        operation = await repository.lockOwned(principal, importId);
        if (!operation || !['initiated', 'uploading'].includes(operation.state)) unavailable();
        if (new Date(operation.expires_at).getTime() <= Date.now()) expired();
        if (chunkIndex >= Number(operation.total_chunks)) invalid('Import source chunk is outside the source manifest');
        const existing = await repository.chunk(importId, chunkIndex);
        if (existing) {
          if (existing.chunk_sha256 !== hash || Number(existing.byte_count) !== bytes.byteLength) {
            idempotencyConflict();
          }
          replay = true;
          return;
        }
        if (chunkIndex !== Number(operation.received_chunks)) {
          conflict('Import source chunks must arrive in order');
        }
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        if (!replay) {
          const inserted = await repository.insertChunk({
            importId,
            chunkIndex,
            bytesBase64: bytes.toString('base64'),
            byteCount: bytes.byteLength,
            sha256: hash
          });
          if (inserted !== 1) conflict('Import source chunk changed during upload');
          if (await repository.advanceChunk(importId, chunkIndex + 1) !== 1) {
            conflict('Import source upload changed during upload');
          }
        }
        const current = await repository.byId(importId);
        if (!current) unavailable();
        return { ...safeOperation(current), replayed: replay };
      },
      'read committed'
    );
  }

  /**
   * Handle the finalize source operation.
   */
  public async finalizeSource(
    principal: BrowserMutationPrincipal,
    importId: string,
    selection: { sheetName?: string, } = {}
  ) {
    requireMutation(principal);
    validateImportId(importId);
    let operation: StoredImportOperation | undefined;
    let parsed: ParsedStage | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!operation || !parsed) unavailable();
        await assertImportTarget(database, operation);
        return undefined;
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        operation = await repository.lockOwned(principal, importId);
        if (!operation || !['uploading', 'preview', 'ready'].includes(operation.state)) unavailable();
        if (operation.source_kind === 'google-sheets') unavailable();
        if (Number(operation.received_chunks) !== Number(operation.total_chunks)) {
          conflict('Import source upload is incomplete');
        }
        if (new Date(operation.expires_at).getTime() <= Date.now()) expired();
        const chunks = await repository.chunks(importId);
        const byteCount = chunks.reduce((total, chunk) => total + Number(chunk.byte_count), 0);
        if (chunks.length !== Number(operation.total_chunks)
          || byteCount !== Number(operation.source_size)) {
          conflict('Import source bytes do not match the source manifest');
        }
        parsed = await parseStage(operation, chunks.map((chunk) => chunk.bytes_base64), selection);
        await repository.replaceParsed({
          importId,
          rows: parsed.rows,
          issues: parsed.issues
        });
      },
      async (database) => {
        if (!parsed) throw new Error('Import parse result was unavailable');
        const repository = new ImportExportRepository(database);
        if (await repository.savePreview({ importId, ...parsed.preview }) !== 1) {
          conflict('Import source changed during parsing');
        }
        const current = await repository.byId(importId);
        if (!current) unavailable();
        return safeOperation(current, parsed.issues);
      },
      'read committed'
    );
  }

  /**
   * Update the mapping.
   */
  public async updateMapping(
    principal: BrowserMutationPrincipal,
    input: {
      importId: string,
      mapping: unknown,
      fileDisplayName: string,
      tableName: string,
    }
  ) {
    requireMutation(principal);
    validateImportId(input.importId);
    let operation: StoredImportOperation | undefined;
    let mapping: ImportColumnMapping[] = [];
    let issues: ImportConversionIssue[] = [];
    let preserved: ImportConversionIssue[] = [];
    let fingerprint = '';
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!operation) unavailable();
        await assertImportTarget(database, operation);
        return undefined;
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        operation = await repository.lockOwned(principal, input.importId);
        if (!operation || !['preview', 'ready'].includes(operation.state)
          || !operation.source_fingerprint) unavailable();
        mapping = validateMapping(input.mapping, Number(operation.column_count));
        validateFileIdentity(input.fileDisplayName, input.tableName);
        const rows = await repository.rows(input.importId);
        issues = validateMappedRows(parsedRows(rows), mapping, SOURCE_ISSUES);
        preserved = (await repository.issues(input.importId))
          .filter((issue) => issue.code !== 'mapping_conversion_failed')
          .map((issue) => ({
            ...(issue.row_number ? { rowNumber: Number(issue.row_number) } : {}),
            ...(issue.column_number ? { columnNumber: Number(issue.column_number) } : {}),
            code: issue.code,
            message: issue.message,
            ...(issue.source_token ? { sourceToken: issue.source_token } : {})
          }));
        fingerprint = mappingFingerprint({
          sourceFingerprint: operation.source_fingerprint,
          schemaId: operation.schema_id,
          fileDisplayName: input.fileDisplayName,
          tableName: input.tableName,
          mapping,
          ...(operation.selected_sheet ? { selectedSheet: operation.selected_sheet } : {}),
          sourceOptions: operation.source_options
        });
        await repository.replaceIssues(input.importId, [...preserved, ...issues]);
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        if (await repository.saveMapping({
          importId: input.importId,
          mapping,
          mappingFingerprint: fingerprint,
          issues: preserved.length + issues.length,
          fileDisplayName: input.fileDisplayName,
          tableName: input.tableName
        }) !== 1) conflict('Import mapping changed during validation');
        const current = await repository.byId(input.importId);
        if (!current) unavailable();
        return safeOperation(current, [...preserved, ...issues]);
      },
      'read committed'
    );
  }

  /**
   * Prepare the confirmation.
   */
  public async prepareConfirmation(principal: BrowserMutationPrincipal, importId: string) {
    requireMutation(principal);
    validateImportId(importId);
    const confirmationToken = opaqueToken();
    let operation: StoredImportOperation | undefined;
    let expiresAt = new Date();
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!operation) unavailable();
        await assertImportTarget(database, operation, true);
        return undefined;
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        operation = await repository.lockOwned(principal, importId);
        if (!operation || operation.state !== 'ready' || Number(operation.issue_count) !== 0
          || !operation.source_fingerprint || !operation.mapping_fingerprint) unavailable();
        await assertSameAuthority(database, operation);
        expiresAt = new Date(Math.min(
          new Date(operation.expires_at).getTime(),
          Date.now() + 5 * 60_000
        ));
      },
      async (database) => {
        if (await new ImportExportRepository(database).setConfirmation(
          importId,
          tokenHash(confirmationToken),
          expiresAt
        ) !== 1) conflict('Import changed before confirmation');
        return { importId, confirmationToken, expiresAt: expiresAt.toISOString() };
      },
      'read committed'
    );
  }

  /**
   * Handle the confirm operation.
   */
  public async confirm(
    principal: BrowserMutationPrincipal,
    importId: string,
    confirmationToken: string
  ) {
    requireMutation(principal);
    validateImportId(importId);
    let operation: StoredImportOperation | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!operation) unavailable();
        await assertImportTarget(database, operation, true);
        return undefined;
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        operation = await repository.lockOwned(principal, importId);
        if (!operation || !operation.confirmation_hash || operation.state !== 'ready'
          || !matchesTokenHash(confirmationToken, operation.confirmation_hash)
          || new Date(operation.expires_at).getTime() <= Date.now()) confirmationDenied();
        await assertSameAuthority(database, operation);
      },
      async (database) => {
        if (await new ImportExportRepository(database).confirm(importId) !== 1) confirmationDenied();
        const current = await new ImportExportRepository(database).byId(importId);
        if (!current) unavailable();
        await this.operations.enqueueInTransaction(database, principal, {
          kind: 'import.commit',
          authority: 'worker',
          idempotencyKey: `import.commit:${importId}`,
          payload: { importId },
          maxAttempts: 3
        });
        return safeOperation(current);
      },
      'read committed'
    );
  }

  /**
   * Cancel the current value.
   */
  public async cancel(principal: BrowserMutationPrincipal, importId: string) {
    requireMutation(principal);
    validateImportId(importId);
    let operation: StoredImportOperation | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!operation) unavailable();
        await assertImportTarget(database, operation);
        return undefined;
      },
      async (database) => {
        operation = await new ImportExportRepository(database).lockOwned(principal, importId);
        if (!operation) unavailable();
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        if (await repository.cancel(importId) !== 1) {
          conflict('Import is already committing and can no longer be cancelled');
        }
        const current = await repository.byId(importId);
        if (!current) unavailable();
        const terminal = safeOperation(current);
        await repository.purgeStagedImport(importId);
        return terminal;
      },
      'read committed'
    );
  }

  /**
   * Handle the retry operation.
   */
  public async retry(principal: BrowserMutationPrincipal, importId: string) {
    requireMutation(principal);
    validateImportId(importId);
    let operation: StoredImportOperation | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!operation) unavailable();
        await assertImportTarget(database, operation, true);
        return undefined;
      },
      async (database) => {
        operation = await new ImportExportRepository(database).lockOwned(principal, importId);
        if (!operation || operation.state !== 'failed') unavailable();
        await assertSameAuthority(database, operation);
      },
      async (database) => {
        if (await new ImportExportRepository(database).resetFailed(importId) !== 1) {
          conflict('Import changed before retry');
        }
        const current = await new ImportExportRepository(database).byId(importId);
        if (!current) unavailable();
        return safeOperation(current);
      },
      'read committed'
    );
  }

  /**
   * Return one import operation visible to the current principal.
   */
  public async get(principal: BrowserPrincipal, importId: string) {
    validateImportId(importId);
    let operation: StoredImportOperation | undefined;
    let issues: ImportConversionIssue[] = [];
    return this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async () => {
        if (!operation) unavailable();
        return safeOperation(operation, issues);
      },
      async (database) => {
        const repository = new ImportExportRepository(database);
        operation = await repository.lockOwned(principal, importId);
        issues = (await repository.issues(importId)).map((issue) => ({
          ...(issue.row_number ? { rowNumber: Number(issue.row_number) } : {}),
          ...(issue.column_number ? { columnNumber: Number(issue.column_number) } : {}),
          code: issue.code,
          message: issue.message
        }));
      },
      undefined,
      'read committed'
    );
  }

  /**
   * Handle the cleanup expired imports operation.
   */
  public async cleanupExpiredImports(limit = 100) {
    if (this.runtime.processKind !== 'worker') {
      throw new ApplicationError(
        'import_cleanup_denied',
        403,
        'Only the separate worker process can clean expired import staging'
      );
    }
    return this.database.transaction('worker', {}, (database) =>
      new ImportExportRepository(database).cleanupExpiredStaging(limit)
    );
  }

  /**
   * Execute the confirmed import.
   */
  public async executeConfirmedImport(
    importId: string,
    options: {
      failpoint?: 'after-table-create' | 'after-row-insert',
      terminalOnFailure?: boolean,
    } = {}
  ) {
    if (this.runtime.processKind !== 'worker') {
      throw new ApplicationError(
        'import_worker_denied',
        403,
        'Only the separate worker process can commit confirmed imports'
      );
    }
    validateImportId(importId);
    await this.cleanupExpiredImports();
    const existing = await this.database.transaction('worker', {}, (database) =>
      new ImportExportRepository(database).byId(importId)
    );
    if (!existing) unavailable();
    if (existing.state === 'committed' && existing.result_summary) return existing.result_summary;
    let operation: StoredImportOperation | undefined;
    try {
      if (existing.source_kind === 'google-sheets') {
        const authorized = await this.assertGoogleWorkerAuthority(existing);
        await this.assertGoogleSourceCurrent(authorized);
      }
      return await this.database.transaction<Awaited<ReturnType<CapabilityPluginService['commitImportTable']>>, Record<string, unknown>>(
        'worker',
        {
          resolveRole: async (database) => {
            const repository = new ImportExportRepository(database);
            const coordinates = await repository.byId(importId);
            if (!coordinates) unavailable();
            const identities = new IdentityRepository(database);
            await identities.lockIdentity(coordinates.actor_identity_id);
            await identities.lockMapping(coordinates.actor_identity_id, coordinates.connection_id);
            await identities.lockAllowedRoleForMapping(
              coordinates.actor_identity_id,
              coordinates.connection_id
            );
            const session = await identities.sessionById(coordinates.session_id);
            operation = await repository.lockForWorker(importId);
            if (!operation) unavailable();
            if (operation.state === 'committed' && operation.result_summary) {
              throw new ImportReplay(operation.result_summary);
            }
            if (operation.state !== 'confirmed') unavailable();
            assertLockedAuthority(session, operation);
            await assertWorkerAuthority(database, operation);
            if (await repository.markCommitting(importId) !== 1) conflict('Import changed before commit');
            await database.execute(`
              CREATE TEMP TABLE tabular_import_stage ON COMMIT DROP AS
              SELECT row_number, source_values
                FROM tabular.import_rows WHERE import_id = ? ORDER BY row_number
            `, [importId]);
            await database.execute(
              `GRANT SELECT ON TABLE pg_temp.tabular_import_stage TO ${quoteIdentifier(operation.owner_role_name, 'Import owner role')}`
            );
            return {
              role: operation.owner_role_name,
              verifyAfterSet: async (effectiveDatabase: DatabaseExecutor) => {
                const effective = await effectiveDatabase.execute<{ oid: string, name: string, }>(`
                  SELECT current_user::regrole::oid::text AS oid, current_user::text AS name
                `);
                if (String(effective.rows[0]?.oid) !== String(operation!.owner_role_oid)
                  || effective.rows[0]?.name !== operation!.owner_role_name) confirmationDenied();
              }
            };
          },
          finalizeBase: async (database, effect) => {
            if (!operation) unavailable();
            await assertWorkerAuthority(database, operation, false);
            const result = await finalizeImportedMetadata(database, operation, effect);
            await new ImportExportRepository(database).markCommitted({
              operation,
              targetFileId: String(result.fileId),
              targetRelationOid: effect.relationOid,
              result
            });
            return result;
          }
        },
        async (database) => {
          if (!operation) unavailable();
          await assertDestination(database, operation);
          const mapping = validateMapping(operation.mapping, Number(operation.column_count))
            .filter((entry) => entry.include);
          return this.capability.commitImportTable(database, {
            importId,
            schemaName: operation.schema_name,
            tableName: operation.table_name!,
            rowCount: Number(operation.row_count),
            columns: mapping.map((entry) => ({
              sourceColumn: entry.sourceColumn,
              physicalName: entry.physicalName,
              storageType: entry.storageType
            })),
            ...(options.failpoint ? { failpoint: options.failpoint } : {})
          });
        }
      );
    } catch (error) {
      if (error instanceof ImportReplay) return error.result;
      if (options.terminalOnFailure !== false) {
        await this.database.transaction('worker', {}, async (database) => {
          await new ImportExportRepository(database).markFailed(importId, safeWorkerError(error));
        });
      }
      throw error;
    }
  }

  /**
   * Export the CSV.
   */
  public async exportCsv(principal: BrowserPrincipal, input: CsvExportRequest) {
    const description = await this.files.describe(principal, input.fileId);
    const visibleIds = description.columns.filter((column) => !column.hidden).map((column) => column.id);
    let definition: SavedViewDefinition;
    let viewName: string | undefined;
    if (input.viewId) {
      const view = await this.savedViews.get(principal, input.viewId);
      if (view.fileId !== input.fileId
        || (input.expectedViewVersion && view.version !== input.expectedViewVersion)) {
        conflict('Saved view changed before export');
      }
      definition = view.definition;
      viewName = view.slug;
    } else {
      definition = validateDefinition({
        schemaVersion: 1,
        columnOrder: input.columnIds || visibleIds,
        hiddenColumnIds: [],
        sorts: input.sorts || [],
        filters: input.filters || [],
        presentation: input.presentation || {},
        includes: {
          filtersAndSorting: true,
          columnLayout: true,
          cellPresentation: true
        }
      });
    }
    const known = new Set(visibleIds);
    const columnIds = (definition.includes.columnLayout ? definition.columnOrder : visibleIds)
      .filter((columnId) => !definition.hiddenColumnIds.includes(columnId));
    if (!columnIds.length || columnIds.some((id) => !known.has(id))
      || definition.sorts.some((sort) => !known.has(sort.columnId))
      || definition.filters.some((filter) => !known.has(filter.columnId))) unavailable();
    let plan: GridTargetPlan | undefined;
    const resource = await this.identity.authorizedTransaction(
      principal,
      'tabular.import-export',
      async (database) => {
        if (!plan) unavailable();
        return this.capability.queryGridTarget(database, plan, {
          columnIds,
          sorts: definition.includes.filtersAndSorting ? definition.sorts : [],
          filters: definition.includes.filtersAndSorting ? definition.filters : [],
          limit: 50_000
        });
      },
      async (database) => {
        plan = await this.capability.prepareGridTarget(database, input.fileId, principal.connectionId);
      },
      undefined,
      'repeatable read'
    );
    const descriptors = new Map(description.columns.map((column) => [column.id, column]));
    const csv = serializeAuthorizedCsv({
      resource,
      columns: columnIds.map((id) => {
        const column = descriptors.get(id);
        if (!column) unavailable();
        return {
          id,
          label: column.displayName,
          field: column.field,
          format: column.format,
          formatConfig: column.formatConfig
        };
      }),
      presentation: definition.includes.cellPresentation ? definition.presentation : {}
    });
    const filename = safeCsvFilename(`${description.displayName}${viewName ? `-${viewName}` : ''}`);
    return {
      ...csv,
      filename,
      contentType: 'text/csv; charset=utf-8',
      contentDisposition: csvContentDisposition(filename)
    };
  }
}

type ParsedStage = {
  rows: ReturnType<typeof stagedRows>,
  issues: ImportConversionIssue[],
  preview: {
    sourceSha256: string,
    sourceFingerprint: string,
    selectedSheet?: string,
    sourceOptions: Record<string, unknown>,
    headers: unknown[],
    mapping: unknown[],
    mappingFingerprint: string,
    preview: unknown[],
    warnings: unknown[],
    rowCount: number,
    columnCount: number,
    issueCount: number,
    fileDisplayName: string,
    tableName: string,
  },
};

/**
 * Return the google stage result.
 */
function googleStage(
  operation: StoredImportOperation,
  values: GoogleSheetValues
): ParsedStage {
  const parsedRowsFromGoogle: ParsedImportRow[] = values.rows.map((row, index) => ({
    rowNumber: index + 1,
    cells: row.map((value): ParsedImportCell => value === null
      ? { type: 'empty', value: null, sourceToken: '' }
      : { type: 'text', value, sourceToken: value })
  }));
  const issues: ImportConversionIssue[] = [];
  if (!parsedRowsFromGoogle.length) {
    issues.push({ code: 'source_has_no_rows', message: 'The selected Google worksheet contains no rows' });
  }
  const header = parsedRowsFromGoogle[0] || { rowNumber: 1, cells: [] };
  const dataRows = parsedRowsFromGoogle.slice(1);
  const mapping = header.cells.length ? defaultMapping(header, inferColumns(dataRows)) : [];
  issues.push(...(mapping.length ? validateMappedRows(dataRows, mapping, SOURCE_ISSUES) : []));
  const sourceOptions = {
    provider: 'google-sheets',
    spreadsheetId: values.spreadsheetId,
    spreadsheetVersion: values.spreadsheetVersion,
    modifiedTime: values.modifiedTime,
    sheetName: values.sheetName,
    valueRenderOption: values.provenance.valueRenderOption,
    formulasImported: false,
    parserVersion: IMPORT_PARSER_VERSION
  };
  const sourceFingerprint = deterministicFingerprint({
    contract: 'tabular-import-source-v1',
    providerFingerprint: values.sourceFingerprint,
    sourceKind: 'google-sheets',
    sourceOptions
  });
  const identity = {
    fileDisplayName: operation.file_display_name || sourceIdentity(operation.source_name).fileDisplayName,
    tableName: operation.table_name || sourceIdentity(operation.source_name).tableName
  };
  const fingerprint = mapping.length ? mappingFingerprint({
    sourceFingerprint,
    schemaId: operation.schema_id,
    fileDisplayName: identity.fileDisplayName,
    tableName: identity.tableName,
    mapping,
    selectedSheet: values.sheetName,
    sourceOptions
  }) : deterministicFingerprint({ sourceFingerprint, mapping: [] });
  return {
    rows: stagedRows(dataRows).map((row) => ({
      ...row,
      provenance: {
        ...row.provenance,
        provider: 'google-sheets',
        spreadsheetId: values.spreadsheetId,
        spreadsheetVersion: values.spreadsheetVersion,
        sheetName: values.sheetName
      }
    })),
    issues: issues.slice(0, SOURCE_ISSUES),
    preview: {
      sourceSha256: values.sourceFingerprint,
      sourceFingerprint,
      selectedSheet: values.sheetName,
      sourceOptions,
      headers: mapping.map((entry) => entry.sourceName),
      mapping,
      mappingFingerprint: fingerprint,
      preview: dataRows.slice(0, 12).map((row) => row.cells.map((cell) =>
        cell.type === 'empty' ? null : cell.sourceToken
      )),
      warnings: [{
        code: 'google_values_only',
        message: 'Calculated values were staged without formulas or live synchronization.',
        level: 'warning'
      }],
      rowCount: dataRows.length,
      columnCount: header.cells.length,
      issueCount: issues.length,
      fileDisplayName: identity.fileDisplayName,
      tableName: identity.tableName
    }
  };
}

/**
 * Parse the stage.
 */
async function parseStage(
  operation: StoredImportOperation,
  chunksBase64: string[],
  selection: { sheetName?: string, }
): Promise<ParsedStage> {
  const stream = Readable.from(chunksBase64.map((chunk) => Buffer.from(chunk, 'base64')));
  const limits = {
    sourceBytes: SOURCE_BYTES,
    rows: SOURCE_ROWS,
    columns: SOURCE_COLUMNS,
    cells: 2_000_000,
    issues: SOURCE_ISSUES
  };
  const result = operation.source_kind === 'csv'
    ? await parseCsv(stream, {
      delimiter: csvDelimiter(operation.source_options.delimiter),
      limits
    })
    : await parseXlsx(stream, {
      ...(selection.sheetName ? { sheetName: selection.sheetName } : {}),
      limits
    });
  if (result.sourceByteLength !== Number(operation.source_size)) {
    conflict('Import source size changed during parsing');
  }
  const sheet = selectedSheet(result, selection.sheetName);
  const parserIssues: ImportConversionIssue[] = result.issues.map((issue) => ({
    ...(issue.rowNumber ? { rowNumber: issue.rowNumber } : {}),
    ...(issue.columnNumber ? { columnNumber: issue.columnNumber } : {}),
    code: issue.code,
    message: issue.message
  }));
  if (!sheet?.rows.length) {
    parserIssues.push({ code: 'source_has_no_rows', message: 'The selected source contains no rows' });
  }
  const header = sheet?.rows[0] || { rowNumber: 1, cells: [] };
  const dataRows = sheet?.rows.slice(1) || [];
  const inference = inferColumns(dataRows);
  const mapping = header.cells.length ? defaultMapping(header, inference) : [];
  const conversionIssues = mapping.length ? validateMappedRows(dataRows, mapping, SOURCE_ISSUES) : [];
  const issues = [...parserIssues, ...conversionIssues].slice(0, SOURCE_ISSUES);
  const identity = {
    fileDisplayName: operation.file_display_name || sourceIdentity(operation.source_name).fileDisplayName,
    tableName: operation.table_name || sourceIdentity(operation.source_name).tableName
  };
  const retainedSheets = Array.isArray(operation.source_options.sheets)
    ? operation.source_options.sheets.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const sourceOptions: Record<string, unknown> = result.source === 'csv'
    ? {
      encoding: result.csv!.encoding,
      delimiter: result.csv!.delimiter,
      header: true,
      parserVersion: IMPORT_PARSER_VERSION
    }
    : {
      sheetName: sheet?.name || null,
      sheets: retainedSheets.length ? retainedSheets : result.sheets.map((entry) => entry.name),
      parserVersion: IMPORT_PARSER_VERSION
    };
  const sourceFingerprint = deterministicFingerprint({
    contract: 'tabular-import-source-v1',
    sourceSha256: result.sourceFingerprint,
    sourceKind: result.source,
    sourceOptions
  });
  const fingerprint = mapping.length ? mappingFingerprint({
    sourceFingerprint,
    schemaId: operation.schema_id,
    fileDisplayName: identity.fileDisplayName,
    tableName: identity.tableName,
    mapping,
    ...(sheet?.name ? { selectedSheet: sheet.name } : {}),
    sourceOptions
  }) : deterministicFingerprint({ sourceFingerprint, mapping: [] });
  const warnings = [
    ...result.notices.map((notice) => ({ ...notice, level: 'warning' })),
    ...result.issues.map((issue) => ({ ...issue, level: 'error' })),
    ...(result.source === 'xlsx' && result.sheets.length > 1 ? [{
      code: 'xlsx_multiple_sheets',
      message: `Workbook contains ${result.sheets.length} worksheets; ${sheet?.name || 'none'} is selected.`,
      level: 'warning'
    }] : [])
  ];
  return {
    rows: stagedRows(dataRows),
    issues,
    preview: {
      sourceSha256: result.sourceFingerprint,
      sourceFingerprint,
      ...(sheet?.name ? { selectedSheet: sheet.name } : {}),
      sourceOptions,
      headers: mapping.map((entry) => entry.sourceName),
      mapping,
      mappingFingerprint: fingerprint,
      preview: dataRows.slice(0, 12).map((row) => row.cells.map((cell) =>
        cell.type === 'empty' ? null : cell.sourceToken
      )),
      warnings,
      rowCount: dataRows.length,
      columnCount: header.cells.length,
      issueCount: issues.length,
      fileDisplayName: identity.fileDisplayName,
      tableName: identity.tableName
    }
  };
}

/**
 * Return the selected sheet result.
 */
function selectedSheet(result: ParsedImportResult, requested?: string) {
  if (requested) return result.sheets.find((sheet) => sheet.name === requested);
  return result.sheets[0];
}

/**
 * Return the CSV delimiter result.
 */
function csvDelimiter(value: unknown): ',' | ';' | '\t' | '|' | 'auto' {
  return value === ',' || value === ';' || value === '\t' || value === '|' ? value : 'auto';
}

/**
 * Return the google state hash result.
 */
function googleStateHash(value: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) googleOAuthDenied();
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Return the google associated data result.
 */
function googleAssociatedData(principal: BrowserPrincipal, secret: string) {
  return [
    'tabular-google-v1',
    secret,
    principal.identityId,
    principal.sessionId,
    principal.historyScopeId,
    principal.connectionId
  ].join(':');
}

/**
 * Return the operation principal result.
 */
function operationPrincipal(operation: StoredImportOperation): BrowserPrincipal {
  const expiresAt = new Date(operation.expires_at);
  return {
    transport: 'browser',
    sessionId: operation.session_id,
    identityId: operation.actor_identity_id,
    connectionId: operation.connection_id,
    historyScopeId: operation.history_scope_id,
    idleExpiresAt: expiresAt,
    absoluteExpiresAt: expiresAt
  };
}

/**
 * Return the google return path result.
 */
function googleReturnPath(value: string, publicOrigin: string) {
  if (typeof value !== 'string' || value.length < 18 || value.length > 500
    || /[\u0000-\u001f\u007f]/.test(value)) invalid('Google return path is invalid');
  let parsed: URL;
  try { parsed = new URL(value, publicOrigin); } catch { invalid('Google return path is invalid'); }
  if (parsed.origin !== publicOrigin || parsed.pathname !== '/pages/import.html'
    || parsed.hash || parsed.username || parsed.password
    || [...parsed.searchParams.keys()].some((key) => key !== 'folder')) {
    invalid('Google return path is invalid');
  }
  const folder = parsed.searchParams.get('folder');
  if (folder && !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(folder)) invalid('Google return path is invalid');
  return `${parsed.pathname}${parsed.search}`;
}

/**
 * Return the parsed rows result.
 */
function parsedRows(rows: Array<{ row_number: string | number, source_values: Array<string | null>, }>): ParsedImportRow[] {
  return rows.map((row) => ({
    rowNumber: Number(row.row_number),
    cells: row.source_values.map((value): ParsedImportCell => value === null
      ? { type: 'empty', value: null, sourceToken: '' }
      : { type: 'text', value, sourceToken: value })
  }));
}

/**
 * Return the finalize imported metadata result.
 */
async function finalizeImportedMetadata(
  database: DatabaseExecutor,
  operation: StoredImportOperation,
  effect: {
    relationOid: string,
    rowCount: number,
    columnCount: number,
    hiddenColumn: string,
    primaryConstraint: string,
  }
) {
  const stable = await reconcileCatalog(database, operation.connection_id);
  const object = stable.objects.get(effect.relationOid);
  if (!object || object.schemaId !== operation.schema_id) {
    throw new Error('Imported PostgreSQL table was not reconciled');
  }
  await database.execute(`
    UPDATE tabular.catalog_objects
       SET accepted_schema = observed_schema, accepted_name = observed_name,
           accepted_fingerprint = observed_fingerprint, state = 'current',
           missing_at = NULL, last_seen_at = clock_timestamp()
     WHERE id = ?
  `, [object.stableId]);
  await database.execute(`
    UPDATE tabular.catalog_columns
       SET accepted_name = observed_name, accepted_fingerprint = observed_fingerprint,
           state = 'current', missing_at = NULL, last_seen_at = clock_timestamp()
     WHERE object_id = ?
  `, [object.stableId]);
  await database.execute(`
    INSERT INTO tabular.file_metadata (object_id, display_name, physical_name_overridden)
    VALUES (?, ?, true)
  `, [object.stableId, operation.file_display_name!]);
  const columns = [...stable.columns.values()]
    .filter((column) => column.objectId === object.stableId)
    .sort((left, right) => left.attributeNumber - right.attributeNumber);
  const byName = new Map(columns.map((column) => [column.name, column]));
  const hidden = byName.get(effect.hiddenColumn);
  if (!hidden) throw new Error('Imported row identity was not reconciled');
  await database.execute(`
    INSERT INTO tabular.column_metadata (
      column_id, object_id, catalog_column_id, storage_kind,
      display_name, field_kind, format_kind, hidden, hidden_purpose
    ) VALUES (?, ?, ?, 'postgresql', 'Row identity', 'text', 'plain-text', true, 'row-id')
  `, [hidden.stableId, object.stableId, hidden.stableId]);
  const mapping = validateMapping(operation.mapping, Number(operation.column_count))
    .filter((entry) => entry.include);
  for (const field of mapping) {
    const column = byName.get(field.physicalName);
    if (!column) throw new Error('Imported field was not reconciled');
    const axes = metadataAxes(field.storageType);
    await database.execute(`
      INSERT INTO tabular.column_metadata (
        column_id, object_id, catalog_column_id, storage_kind,
        display_name, field_kind, format_kind, hidden, hidden_purpose
      ) VALUES (?, ?, ?, 'postgresql', ?, ?, ?, false, NULL)
    `, [
      column.stableId,
      object.stableId,
      column.stableId,
      field.displayName,
      axes.field,
      axes.format
    ]);
  }
  const eventId = opaqueId('evt');
  await database.execute(`
    SELECT tabular.append_outbox_event(
      ?, ?, ?, ?, NULL, 'schema.changed', ?, ?::jsonb
    )
  `, [
    eventId,
    operation.connection_id,
    object.stableId,
    operation.actor_identity_id,
    `import:${operation.id}`,
    JSON.stringify({ importId: operation.id, rowCount: effect.rowCount, columnCount: effect.columnCount })
  ]);
  return {
    importId: operation.id,
    state: 'committed',
    fileId: object.stableId,
    fileName: operation.file_display_name,
    tableName: operation.table_name,
    folderId: operation.schema_id,
    folderName: operation.schema_name,
    qualifiedName: `${operation.schema_name}.${operation.table_name}`,
    rowsCommitted: effect.rowCount,
    columnsCommitted: effect.columnCount,
    warnings: operation.warnings.length,
    sourceFingerprint: operation.source_fingerprint,
    mappingFingerprint: operation.mapping_fingerprint
  };
}

/**
 * Return the metadata axes result.
 */
function metadataAxes(type: ImportColumnMapping['storageType']) {
  if (type === 'numeric' || type === 'bigint') return { field: 'number', format: 'number' };
  if (type === 'boolean') return { field: 'checkbox', format: 'yes-no' };
  if (type === 'date') return { field: 'date', format: 'date' };
  if (type === 'time') return { field: 'time', format: 'time' };
  if (type === 'timestamptz') return { field: 'date-time', format: 'date-time' };
  if (type === 'jsonb') return { field: 'long-text', format: 'clipped-text' };
  return { field: 'text', format: 'plain-text' };
}

/**
 * Assert the destination.
 */
async function assertDestination(database: DatabaseExecutor, operation: StoredImportOperation) {
  const result = await database.execute<{
    valid: boolean,
    occupied: boolean,
  }>(`
    SELECT n.oid = ?::oid AND n.nspname = ?
           AND has_schema_privilege(current_user, n.oid, 'CREATE') AS valid,
           EXISTS (
             SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid AND c.relname = ?
           ) AS occupied
      FROM pg_namespace n WHERE n.oid = ?::oid
  `, [operation.namespace_oid, operation.schema_name, operation.table_name!, operation.namespace_oid]);
  if (!result.rows[0]?.valid) confirmationDenied();
  if (result.rows[0].occupied) conflict('The confirmed PostgreSQL table name is occupied');
}

/**
 * Return the current authority result.
 */
async function currentAuthority(database: DatabaseExecutor, principal: BrowserPrincipal) {
  const result = await database.execute<{
    identity_generation: string | number,
    mapping_generation: string | number,
    allowed_role_id: string,
    role_generation: string | number,
  }>(`
    SELECT i.identity_generation, m.mapping_generation,
           r.id AS allowed_role_id, r.role_generation
      FROM tabular.identities i
      JOIN tabular.identity_role_mappings m
        ON m.identity_id = i.id AND m.connection_id = ?
      JOIN tabular.allowed_roles r ON r.id = m.allowed_role_id
      JOIN tabular.browser_sessions s
        ON s.id = ? AND s.identity_id = i.id AND s.connection_id = m.connection_id
     WHERE i.id = ?
  `, [principal.connectionId, principal.sessionId, principal.identityId]);
  const row = result.rows[0];
  if (!row) confirmationDenied();
  return {
    identityGeneration: Number(row.identity_generation),
    mappingGeneration: Number(row.mapping_generation),
    allowedRoleId: row.allowed_role_id,
    roleGeneration: Number(row.role_generation)
  };
}

/**
 * Assert the same authority.
 */
async function assertSameAuthority(database: DatabaseExecutor, operation: StoredImportOperation) {
  const result = await database.execute<{ valid: boolean, }>(`
    SELECT i.status = 'active'
       AND i.identity_generation = ?
       AND m.enabled AND m.mapping_generation = ?
       AND r.enabled AND r.id = ? AND r.role_generation = ?
       AND r.role_oid = ?::oid AND r.role_name = ?
       AND s.revoked_at IS NULL AND clock_timestamp() < s.absolute_expires_at
       AND s.identity_generation = i.identity_generation
       AND s.mapping_generation = m.mapping_generation AS valid
      FROM tabular.identities i
      JOIN tabular.identity_role_mappings m
        ON m.identity_id = i.id AND m.connection_id = ?
      JOIN tabular.allowed_roles r ON r.id = m.allowed_role_id
      JOIN tabular.browser_sessions s
        ON s.id = ? AND s.identity_id = i.id AND s.connection_id = m.connection_id
     WHERE i.id = ?
  `, [
    operation.identity_generation,
    operation.mapping_generation,
    operation.allowed_role_id,
    operation.role_generation,
    operation.requesting_role_oid,
    operation.requesting_role_name,
    operation.connection_id,
    operation.session_id,
    operation.actor_identity_id
  ]);
  if (!result.rows[0]?.valid) confirmationDenied();
}

/**
 * Assert the import target.
 */
async function assertImportTarget(
  database: DatabaseExecutor,
  operation: StoredImportOperation,
  checkName = false
) {
  const expected: ExpectedDdlContext = {
    databaseOid: String(operation.database_oid),
    requestingRoleOid: String(operation.requesting_role_oid),
    requestingRoleName: operation.requesting_role_name,
    schemaId: operation.schema_id,
    namespaceOid: String(operation.namespace_oid),
    schemaName: operation.schema_name,
    ownerRoleOid: String(operation.owner_role_oid),
    ownerRoleName: operation.owner_role_name,
    physicalNameOverridden: true
  };
  const action = {
    type: 'file.create' as const,
    commandId: operation.command_id,
    schemaId: operation.schema_id,
    displayName: operation.file_display_name || sourceIdentity(operation.source_name).fileDisplayName,
    physicalName: operation.table_name || sourceIdentity(operation.source_name).tableName
  };
  const requester = await authorizeFileDdlPlan(database, action, expected);
  if (requester.roleOid !== String(operation.requesting_role_oid)
    || requester.roleName !== operation.requesting_role_name) confirmationDenied();
  if (checkName) {
    const occupied = await database.execute<{ occupied: boolean, }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_class WHERE relnamespace = ?::oid AND relname = ?
      ) AS occupied
    `, [operation.namespace_oid, operation.table_name!]);
    if (occupied.rows[0]?.occupied) conflict('The PostgreSQL table name is occupied');
  }
}

/**
 * Assert the worker authority.
 */
async function assertWorkerAuthority(
  database: DatabaseExecutor,
  operation: StoredImportOperation,
  checkRows = true
) {
  if (checkRows) await assertSameAuthority(database, operation);
  const result = await database.execute<{
    database_oid: string | number,
    owner_oid: string | number,
    owner_name: string,
    requester_oid: string | number,
    requester_name: string,
    requester_usable: boolean,
    worker_can_set: boolean,
    owner_safe: boolean,
    requester_safe: boolean,
  }>(`
    SELECT d.oid AS database_oid,
           owner.oid AS owner_oid, owner.rolname::text AS owner_name,
           requester.oid AS requester_oid, requester.rolname::text AS requester_name,
           pg_has_role(requester.oid, owner.oid, 'USAGE') AS requester_usable,
           pg_has_role(session_user, owner.oid, 'SET') AS worker_can_set,
           NOT (owner.rolcanlogin OR owner.rolsuper OR owner.rolcreaterole OR owner.rolcreatedb
             OR owner.rolreplication OR owner.rolbypassrls) AS owner_safe,
           NOT (requester.rolcanlogin OR requester.rolsuper OR requester.rolcreaterole
             OR requester.rolcreatedb OR requester.rolreplication OR requester.rolbypassrls)
             AS requester_safe
      FROM pg_database d
      JOIN pg_roles owner ON owner.oid = ?::oid AND owner.rolname = ?
      JOIN pg_roles requester ON requester.oid = ?::oid AND requester.rolname = ?
     WHERE d.datname = current_database()
  `, [
    operation.owner_role_oid,
    operation.owner_role_name,
    operation.requesting_role_oid,
    operation.requesting_role_name
  ]);
  const row = result.rows[0];
  if (!row
    || String(row.database_oid) !== String(operation.database_oid)
    || String(row.owner_oid) !== String(operation.owner_role_oid)
    || row.owner_name !== operation.owner_role_name
    || String(row.requester_oid) !== String(operation.requesting_role_oid)
    || row.requester_name !== operation.requesting_role_name
    || !row.requester_usable || !row.worker_can_set || !row.owner_safe || !row.requester_safe) {
    confirmationDenied();
  }
}

/**
 * Assert the locked authority.
 */
function assertLockedAuthority(row: SessionAuthorityRow | undefined, operation: StoredImportOperation) {
  if (!row
    || row.session_id !== operation.session_id
    || row.history_scope_id !== operation.history_scope_id
    || row.identity_id !== operation.actor_identity_id
    || row.connection_id !== operation.connection_id
    || row.identity_status !== 'active'
    || Number(row.identity_generation) !== Number(operation.identity_generation)
    || Number(row.session_identity_generation) !== Number(operation.identity_generation)
    || Number(row.mapping_generation) !== Number(operation.mapping_generation)
    || Number(row.session_mapping_generation) !== Number(operation.mapping_generation)
    || row.allowed_role_id !== operation.allowed_role_id
    || Number(row.role_generation) !== Number(operation.role_generation)
    || !row.mapping_enabled || !row.role_enabled
    || String(row.configured_role_oid) !== String(operation.requesting_role_oid)
    || String(row.live_role_oid) !== String(operation.requesting_role_oid)
    || row.configured_role_name !== operation.requesting_role_name
    || row.live_role_name !== operation.requesting_role_name
    || !row.same_database || !row.idle_valid || !row.absolute_valid || !row.can_set_role
    || row.revoked_at !== null
    || row.rolsuper !== false || row.rolcreaterole !== false || row.rolcreatedb !== false
    || row.rolcanlogin !== false || row.rolreplication !== false || row.rolbypassrls !== false
    || new Date(operation.expires_at).getTime() <= Date.now()) confirmationDenied();
}

/**
 * Validate the create.
 */
function validateCreate(input: CreateImportInput) {
  if (!input || typeof input !== 'object'
    || Object.keys(input).some((key) => ![
      'commandId', 'folderId', 'sourceKind', 'sourceName',
      'sourceMediaType', 'sourceSize', 'sourceOptions'
    ].includes(key))) invalid('Import source manifest is invalid');
  commandId(input.commandId);
  if (!/^schema_[A-Za-z0-9_-]{32,64}$/.test(input.folderId)) invalid('Import folder is invalid');
  if (input.sourceKind !== 'csv' && input.sourceKind !== 'xlsx'
    && input.sourceKind !== 'google-sheets') invalid('Import source type is invalid');
  if (typeof input.sourceName !== 'string' || input.sourceName !== input.sourceName.trim()
    || input.sourceName.length < 1 || input.sourceName.length > 255
    || /[\u0000-\u001f\u007f]/.test(input.sourceName)) invalid('Import source name is invalid');
  const extension = input.sourceKind === 'csv' ? /\.csv$/i : /\.xlsx$/i;
  if (input.sourceKind !== 'google-sheets' && !extension.test(input.sourceName)) {
    invalid(`Import source must use .${input.sourceKind}`);
  }
  if (typeof input.sourceMediaType !== 'string' || input.sourceMediaType.length < 1
    || input.sourceMediaType.length > 160 || /[\u0000-\u001f\u007f]/.test(input.sourceMediaType)) {
    invalid('Import media type is invalid');
  }
  if (!Number.isSafeInteger(input.sourceSize) || input.sourceSize < 0 || input.sourceSize > SOURCE_BYTES) {
    invalid(`Import source cannot exceed ${SOURCE_BYTES} bytes`);
  }
  const localOptions = ['delimiter', 'sheetName', 'uploadSha256'];
  const googleOptions = ['spreadsheetId', 'spreadsheetVersion', 'modifiedTime', 'sheetName'];
  if (input.sourceOptions && (!isRecord(input.sourceOptions)
    || Object.keys(input.sourceOptions).some((key) => !(
      input.sourceKind === 'google-sheets' ? googleOptions : localOptions
    ).includes(key)))) {
    invalid('Import source options are invalid');
  }
  if (input.sourceKind === 'google-sheets'
    && (input.sourceMediaType !== 'application/vnd.google-apps.spreadsheet'
      || !input.sourceOptions
      || typeof input.sourceOptions.spreadsheetId !== 'string'
      || typeof input.sourceOptions.spreadsheetVersion !== 'string'
      || typeof input.sourceOptions.modifiedTime !== 'string'
      || typeof input.sourceOptions.sheetName !== 'string')) {
    invalid('Google import source manifest is invalid');
  }
  return { ...input, sourceOptions: structuredClone(input.sourceOptions || {}) };
}

/**
 * Validate the file identity.
 */
function validateFileIdentity(fileDisplayName: string, tableName: string) {
  if (typeof fileDisplayName !== 'string' || fileDisplayName !== fileDisplayName.trim()
    || fileDisplayName.length < 1 || fileDisplayName.length > 200
    || /[\u0000-\u001f\u007f]/.test(fileDisplayName)) invalid('Imported file name is invalid');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(tableName) || tableName === 'tabular' || tableName.startsWith('pg_')) {
    invalid('Imported PostgreSQL table name is invalid');
  }
}

/**
 * Report the safe worker error condition.
 */
function safeWorkerError(error: unknown) {
  if (error instanceof ApplicationError) {
    return { code: error.errorCode, message: error.message, retryable: true };
  }
  return {
    code: 'import_commit_failed',
    message: 'No table was committed; review the source and retry the import.',
    retryable: true
  };
}

class ImportReplay extends Error {
  /**
   * Create a ImportReplay instance.
   */
  public constructor(public readonly result: Record<string, unknown>) {
    super('Committed import replay');
  }
}

/**
 * Return the command id result.
 */
function commandId(value: string) {
  if (typeof value !== 'string' || !/^cmd_[A-Za-z0-9_-]{8,96}$/.test(value)) {
    invalid('Import command identity is invalid');
  }
}

/**
 * Validate the import id.
 */
function validateImportId(value: string) {
  if (typeof value !== 'string' || !/^imp_[A-Za-z0-9_-]{32,64}$/.test(value)) unavailable();
}

/**
 * Return the require mutation result.
 */
function requireMutation(principal: BrowserPrincipal): asserts principal is BrowserMutationPrincipal {
  if (!isBrowserMutationPrincipal(principal)) {
    throw new ApplicationError('capability_denied', 403, 'A verified browser mutation is required');
  }
}

/**
 * Report whether the record condition holds.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Return the invalid result.
 */
function invalid(message: string): never {
  throw new ApplicationError('import_invalid', 400, message);
}

/**
 * Return the unavailable result.
 */
function unavailable(): never {
  throw new ApplicationError('import_unavailable', 404, 'The import or destination is unavailable');
}

/**
 * Return the conflict result.
 */
function conflict(message: string): never {
  throw new ApplicationError('import_conflict', 409, message);
}

/**
 * Return the idempotency conflict result.
 */
function idempotencyConflict(): never {
  throw new ApplicationError(
    'import_idempotency_conflict',
    409,
    'The command identity is already bound to another import source'
  );
}

/**
 * Return the expired result.
 */
function expired(): never {
  throw new ApplicationError('import_expired', 409, 'The staged import expired; choose the source again');
}

/**
 * Return the confirmation denied result.
 */
function confirmationDenied(): never {
  throw new ApplicationError('import_confirmation_denied', 403, 'The import confirmation is invalid');
}

/**
 * Return the google OAuth denied result.
 */
function googleOAuthDenied(): never {
  throw new ApplicationError(
    'google_oauth_denied',
    403,
    'The Google connection request is invalid or expired'
  );
}
