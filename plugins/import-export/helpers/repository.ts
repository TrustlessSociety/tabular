import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';

export type StoredImportOperation = {
  id: string;
  command_id: string;
  request_digest: string;
  actor_identity_id: string;
  session_id: string;
  history_scope_id: string;
  connection_id: string;
  database_oid: string | number;
  requesting_role_oid: string | number;
  requesting_role_name: string;
  identity_generation: string | number;
  mapping_generation: string | number;
  allowed_role_id: string;
  role_generation: string | number;
  schema_id: string;
  namespace_oid: string | number;
  schema_name: string;
  owner_role_oid: string | number;
  owner_role_name: string;
  source_kind: 'csv' | 'xlsx' | 'google-sheets';
  source_name: string;
  source_media_type: string;
  source_size: string | number;
  source_sha256: string | null;
  source_options: Record<string, unknown>;
  source_fingerprint: string | null;
  total_chunks: string | number;
  received_chunks: string | number;
  selected_sheet: string | null;
  headers: unknown[];
  mapping: unknown[];
  mapping_fingerprint: string | null;
  preview: unknown[];
  warnings: unknown[];
  row_count: string | number;
  column_count: string | number;
  issue_count: string | number;
  file_display_name: string | null;
  table_name: string | null;
  confirmation_hash: string | null;
  state: 'initiated' | 'uploading' | 'preview' | 'ready' | 'confirmed'
    | 'committing' | 'committed' | 'cancelled' | 'failed';
  result_summary: Record<string, unknown> | null;
  error_summary: Record<string, unknown> | null;
  version: string | number;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string;
  confirmed_at: Date | string | null;
  committed_at: Date | string | null;
  cancelled_at: Date | string | null;
};

export type StoredImportRow = {
  row_number: string | number;
  source_values: Array<string | null>;
  provenance: Record<string, unknown>;
};

export type StoredGoogleOAuthState = {
  state_hash: string;
  actor_identity_id: string;
  session_id: string;
  history_scope_id: string;
  connection_id: string;
  return_path: string;
  verifier_ciphertext: string;
  verifier_iv: string;
  verifier_tag: string;
  expires_at: Date | string;
};

export type StoredGoogleConnection = {
  id: string;
  actor_identity_id: string;
  session_id: string;
  history_scope_id: string;
  connection_id: string;
  access_ciphertext: string;
  access_iv: string;
  access_tag: string;
  refresh_ciphertext: string | null;
  refresh_iv: string | null;
  refresh_tag: string | null;
  scope: string;
  token_expires_at: Date | string;
  revoked_at: Date | string | null;
};

export class ImportExportRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async lockCommand(principal: BrowserPrincipal, commandId: string) {
    await this.database.execute(`
      SELECT pg_advisory_xact_lock(hashtextextended('tabular-import:' || ? || ':' || ? || ':' || ?, 0))
    `, [principal.identityId, principal.connectionId, commandId]);
  }

  async byCommand(principal: BrowserPrincipal, commandId: string) {
    const result = await this.database.execute<StoredImportOperation>(`
      SELECT * FROM tabular.import_operations
       WHERE actor_identity_id = ? AND connection_id = ? AND command_id = ?
       FOR SHARE
    `, [principal.identityId, principal.connectionId, commandId]);
    return result.rows[0];
  }

  async byId(importId: string) {
    const result = await this.database.execute<StoredImportOperation>(`
      SELECT * FROM tabular.import_operations WHERE id = ?
    `, [importId]);
    return result.rows[0];
  }

  async lockOwned(principal: BrowserPrincipal, importId: string) {
    const result = await this.database.execute<StoredImportOperation>(`
      SELECT * FROM tabular.import_operations
       WHERE id = ? AND actor_identity_id = ? AND session_id = ?
         AND history_scope_id = ? AND connection_id = ?
       FOR UPDATE
    `, [
      importId,
      principal.identityId,
      principal.sessionId,
      principal.historyScopeId,
      principal.connectionId
    ]);
    return result.rows[0];
  }

  async lockForWorker(importId: string) {
    const result = await this.database.execute<StoredImportOperation>(`
      SELECT * FROM tabular.import_operations WHERE id = ? FOR UPDATE
    `, [importId]);
    return result.rows[0];
  }

  async insertGoogleOAuthState(input: {
    stateHash: string;
    principal: BrowserPrincipal;
    returnPath: string;
    verifier: { ciphertext: string; iv: string; tag: string };
    expiresAt: Date;
  }) {
    await this.database.execute(`
      INSERT INTO tabular.google_oauth_states (
        state_hash, actor_identity_id, session_id, history_scope_id, connection_id,
        return_path, verifier_ciphertext, verifier_iv, verifier_tag, expires_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, decode(?, 'base64'), decode(?, 'base64'),
        decode(?, 'base64'), ?
      )
    `, [
      input.stateHash,
      input.principal.identityId,
      input.principal.sessionId,
      input.principal.historyScopeId,
      input.principal.connectionId,
      input.returnPath,
      input.verifier.ciphertext,
      input.verifier.iv,
      input.verifier.tag,
      input.expiresAt.toISOString()
    ]);
  }

  async consumeGoogleOAuthState(principal: BrowserPrincipal, stateHash: string) {
    const result = await this.database.execute<StoredGoogleOAuthState>(`
      SELECT state_hash, actor_identity_id, session_id, history_scope_id, connection_id,
             return_path, encode(verifier_ciphertext, 'base64') AS verifier_ciphertext,
             encode(verifier_iv, 'base64') AS verifier_iv,
             encode(verifier_tag, 'base64') AS verifier_tag, expires_at
        FROM tabular.google_oauth_states
       WHERE state_hash = ? AND actor_identity_id = ? AND session_id = ?
         AND history_scope_id = ? AND connection_id = ?
         AND consumed_at IS NULL AND expires_at > clock_timestamp()
       FOR UPDATE
    `, [
      stateHash,
      principal.identityId,
      principal.sessionId,
      principal.historyScopeId,
      principal.connectionId
    ]);
    const state = result.rows[0];
    if (!state) return undefined;
    const consumed = await this.database.execute(`
      UPDATE tabular.google_oauth_states
         SET consumed_at = clock_timestamp(), verifier_ciphertext = NULL,
             verifier_iv = NULL, verifier_tag = NULL
       WHERE state_hash = ? AND consumed_at IS NULL
    `, [stateHash]);
    return consumed.affectedRows === 1 ? state : undefined;
  }

  async saveGoogleConnection(input: {
    id: string;
    principal: BrowserPrincipal;
    access: { ciphertext: string; iv: string; tag: string };
    refresh?: { ciphertext: string; iv: string; tag: string };
    scope: string;
    expiresAt: Date;
  }) {
    await this.database.execute(`
      INSERT INTO tabular.google_connections (
        id, actor_identity_id, session_id, history_scope_id, connection_id,
        access_ciphertext, access_iv, access_tag,
        refresh_ciphertext, refresh_iv, refresh_tag, scope, token_expires_at
      ) VALUES (
        ?, ?, ?, ?, ?, decode(?, 'base64'), decode(?, 'base64'), decode(?, 'base64'),
        CASE WHEN ?::text IS NULL THEN NULL ELSE decode(?::text, 'base64') END,
        CASE WHEN ?::text IS NULL THEN NULL ELSE decode(?::text, 'base64') END,
        CASE WHEN ?::text IS NULL THEN NULL ELSE decode(?::text, 'base64') END,
        ?, ?
      )
      ON CONFLICT (actor_identity_id, session_id, history_scope_id, connection_id)
      DO UPDATE SET
        access_ciphertext = EXCLUDED.access_ciphertext,
        access_iv = EXCLUDED.access_iv,
        access_tag = EXCLUDED.access_tag,
        refresh_ciphertext = COALESCE(EXCLUDED.refresh_ciphertext, google_connections.refresh_ciphertext),
        refresh_iv = COALESCE(EXCLUDED.refresh_iv, google_connections.refresh_iv),
        refresh_tag = COALESCE(EXCLUDED.refresh_tag, google_connections.refresh_tag),
        scope = EXCLUDED.scope,
        token_expires_at = EXCLUDED.token_expires_at,
        revoked_at = NULL,
        revoke_reason = NULL,
        updated_at = clock_timestamp()
    `, [
      input.id,
      input.principal.identityId,
      input.principal.sessionId,
      input.principal.historyScopeId,
      input.principal.connectionId,
      input.access.ciphertext,
      input.access.iv,
      input.access.tag,
      input.refresh?.ciphertext || null,
      input.refresh?.ciphertext || null,
      input.refresh?.iv || null,
      input.refresh?.iv || null,
      input.refresh?.tag || null,
      input.refresh?.tag || null,
      input.scope,
      input.expiresAt.toISOString()
    ]);
  }

  async googleConnection(principal: BrowserPrincipal) {
    const result = await this.database.execute<StoredGoogleConnection>(`
      SELECT id, actor_identity_id, session_id, history_scope_id, connection_id,
             encode(access_ciphertext, 'base64') AS access_ciphertext,
             encode(access_iv, 'base64') AS access_iv,
             encode(access_tag, 'base64') AS access_tag,
             CASE WHEN refresh_ciphertext IS NULL THEN NULL
               ELSE encode(refresh_ciphertext, 'base64') END AS refresh_ciphertext,
             CASE WHEN refresh_iv IS NULL THEN NULL ELSE encode(refresh_iv, 'base64') END AS refresh_iv,
             CASE WHEN refresh_tag IS NULL THEN NULL ELSE encode(refresh_tag, 'base64') END AS refresh_tag,
             scope, token_expires_at, revoked_at
        FROM tabular.google_connections
       WHERE actor_identity_id = ? AND session_id = ? AND history_scope_id = ?
         AND connection_id = ? AND revoked_at IS NULL
       FOR UPDATE
    `, [
      principal.identityId,
      principal.sessionId,
      principal.historyScopeId,
      principal.connectionId
    ]);
    return result.rows[0];
  }

  async updateGoogleConnection(input: {
    principal: BrowserPrincipal;
    id: string;
    access: { ciphertext: string; iv: string; tag: string };
    refresh?: { ciphertext: string; iv: string; tag: string };
    scope: string;
    expiresAt: Date;
  }) {
    const result = await this.database.execute(`
      UPDATE tabular.google_connections
         SET access_ciphertext = decode(?, 'base64'), access_iv = decode(?, 'base64'),
             access_tag = decode(?, 'base64'),
             refresh_ciphertext = COALESCE(
               CASE WHEN ?::text IS NULL THEN NULL ELSE decode(?::text, 'base64') END,
               refresh_ciphertext
             ),
             refresh_iv = COALESCE(
               CASE WHEN ?::text IS NULL THEN NULL ELSE decode(?::text, 'base64') END,
               refresh_iv
             ),
             refresh_tag = COALESCE(
               CASE WHEN ?::text IS NULL THEN NULL ELSE decode(?::text, 'base64') END,
               refresh_tag
             ),
             scope = ?, token_expires_at = ?, updated_at = clock_timestamp()
       WHERE id = ? AND actor_identity_id = ? AND session_id = ?
         AND history_scope_id = ? AND connection_id = ? AND revoked_at IS NULL
    `, [
      input.access.ciphertext,
      input.access.iv,
      input.access.tag,
      input.refresh?.ciphertext || null,
      input.refresh?.ciphertext || null,
      input.refresh?.iv || null,
      input.refresh?.iv || null,
      input.refresh?.tag || null,
      input.refresh?.tag || null,
      input.scope,
      input.expiresAt.toISOString(),
      input.id,
      input.principal.identityId,
      input.principal.sessionId,
      input.principal.historyScopeId,
      input.principal.connectionId
    ]);
    return result.affectedRows;
  }

  async revokeGoogleConnection(principal: BrowserPrincipal, reason: string) {
    const result = await this.database.execute(`
      UPDATE tabular.google_connections
         SET access_ciphertext = NULL, access_iv = NULL, access_tag = NULL,
             refresh_ciphertext = NULL, refresh_iv = NULL, refresh_tag = NULL,
             revoked_at = clock_timestamp(), revoke_reason = ?, updated_at = clock_timestamp()
       WHERE actor_identity_id = ? AND session_id = ? AND history_scope_id = ?
         AND connection_id = ? AND revoked_at IS NULL
    `, [
      reason,
      principal.identityId,
      principal.sessionId,
      principal.historyScopeId,
      principal.connectionId
    ]);
    return result.affectedRows;
  }

  async insert(input: {
    id: string;
    commandId: string;
    requestDigest: string;
    principal: BrowserPrincipal;
    databaseOid: string;
    requestingRoleOid: string;
    requestingRoleName: string;
    identityGeneration: number;
    mappingGeneration: number;
    allowedRoleId: string;
    roleGeneration: number;
    schemaId: string;
    namespaceOid: string;
    schemaName: string;
    ownerRoleOid: string;
    ownerRoleName: string;
    fileDisplayName: string;
    tableName: string;
    sourceKind: StoredImportOperation['source_kind'];
    sourceName: string;
    sourceMediaType: string;
    sourceSize: number;
    sourceOptions: Record<string, unknown>;
    totalChunks: number;
    expiresAt: Date;
  }) {
    await this.database.execute(`
      INSERT INTO tabular.import_operations (
        id, command_id, request_digest, actor_identity_id, session_id, history_scope_id,
        connection_id, database_oid, requesting_role_oid, requesting_role_name,
        identity_generation, mapping_generation, allowed_role_id, role_generation,
        schema_id, namespace_oid, schema_name, owner_role_oid, owner_role_name,
        file_display_name, table_name,
        source_kind, source_name, source_media_type, source_size, source_options,
        total_chunks, expires_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?::oid, ?::oid, ?, ?, ?, ?, ?, ?, ?::oid, ?, ?::oid, ?,
        ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?
      )
    `, [
      input.id,
      input.commandId,
      input.requestDigest,
      input.principal.identityId,
      input.principal.sessionId,
      input.principal.historyScopeId,
      input.principal.connectionId,
      input.databaseOid,
      input.requestingRoleOid,
      input.requestingRoleName,
      input.identityGeneration,
      input.mappingGeneration,
      input.allowedRoleId,
      input.roleGeneration,
      input.schemaId,
      input.namespaceOid,
      input.schemaName,
      input.ownerRoleOid,
      input.ownerRoleName,
      input.fileDisplayName,
      input.tableName,
      input.sourceKind,
      input.sourceName,
      input.sourceMediaType,
      input.sourceSize,
      JSON.stringify(input.sourceOptions),
      input.totalChunks,
      input.expiresAt.toISOString()
    ]);
  }

  async chunk(importId: string, chunkIndex: number) {
    const result = await this.database.execute<{
      chunk_sha256: string;
      byte_count: string | number;
    }>(`
      SELECT chunk_sha256, byte_count FROM tabular.import_source_chunks
       WHERE import_id = ? AND chunk_index = ?
    `, [importId, chunkIndex]);
    return result.rows[0];
  }

  async insertChunk(input: {
    importId: string;
    chunkIndex: number;
    bytesBase64: string;
    byteCount: number;
    sha256: string;
  }) {
    const inserted = await this.database.execute(`
      INSERT INTO tabular.import_source_chunks (
        import_id, chunk_index, byte_count, chunk_sha256, source_bytes
      ) VALUES (?, ?, ?, ?, decode(?, 'base64'))
      ON CONFLICT (import_id, chunk_index) DO NOTHING
    `, [
      input.importId,
      input.chunkIndex,
      input.byteCount,
      input.sha256,
      input.bytesBase64
    ]);
    return inserted.affectedRows;
  }

  async advanceChunk(importId: string, nextCount: number) {
    const result = await this.database.execute(`
      UPDATE tabular.import_operations
         SET received_chunks = ?, state = CASE WHEN ? = total_chunks THEN 'uploading' ELSE 'uploading' END,
             version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state IN ('initiated', 'uploading') AND received_chunks = ?
    `, [nextCount, nextCount, importId, nextCount - 1]);
    return result.affectedRows;
  }

  async chunks(importId: string) {
    return (await this.database.execute<{
      chunk_index: string | number;
      bytes_base64: string;
      byte_count: string | number;
      chunk_sha256: string;
    }>(`
      SELECT chunk_index, encode(source_bytes, 'base64') AS bytes_base64,
             byte_count, chunk_sha256
        FROM tabular.import_source_chunks
       WHERE import_id = ? ORDER BY chunk_index
    `, [importId])).rows;
  }

  async rows(importId: string) {
    return (await this.database.execute<StoredImportRow>(`
      SELECT row_number, source_values, provenance
        FROM tabular.import_rows WHERE import_id = ? ORDER BY row_number
    `, [importId])).rows;
  }

  async issues(importId: string) {
    return (await this.database.execute<{
      row_number: string | number | null;
      column_number: string | number | null;
      code: string;
      message: string;
      source_token: string | null;
    }>(`
      SELECT row_number, column_number, code, message, source_token
        FROM tabular.import_row_issues WHERE import_id = ? ORDER BY issue_number
    `, [importId])).rows;
  }

  async replaceIssues(importId: string, issues: Array<{
    rowNumber?: number;
    columnNumber?: number;
    code: string;
    message: string;
    sourceToken?: string;
  }>) {
    await this.database.execute('DELETE FROM tabular.import_row_issues WHERE import_id = ?', [importId]);
    for (let offset = 0; offset < issues.length; offset += 250) {
      const batch = issues.slice(offset, offset + 250);
      const values = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      await this.database.execute(`
        INSERT INTO tabular.import_row_issues (
          import_id, issue_number, row_number, column_number, code, message, source_token
        ) VALUES ${values}
      `, batch.flatMap((issue, index) => [
        importId,
        offset + index + 1,
        issue.rowNumber || null,
        issue.columnNumber || null,
        issue.code,
        issue.message,
        issue.sourceToken || null
      ]));
    }
  }

  async replaceParsed(input: {
    importId: string;
    rows: StoredImportRow[];
    issues: Array<{
      rowNumber?: number;
      columnNumber?: number;
      code: string;
      message: string;
      sourceToken?: string;
    }>;
  }) {
    await this.database.execute('DELETE FROM tabular.import_row_issues WHERE import_id = ?', [input.importId]);
    await this.database.execute('DELETE FROM tabular.import_rows WHERE import_id = ?', [input.importId]);
    for (let offset = 0; offset < input.rows.length; offset += 250) {
      const batch = input.rows.slice(offset, offset + 250);
      if (!batch.length) continue;
      const values = batch.map(() => '(?, ?, ?::jsonb, ?::jsonb)').join(', ');
      await this.database.execute(`
        INSERT INTO tabular.import_rows (import_id, row_number, source_values, provenance)
        VALUES ${values}
      `, batch.flatMap((row) => [
        input.importId,
        Number(row.row_number),
        JSON.stringify(row.source_values),
        JSON.stringify(row.provenance)
      ]));
    }
    for (let offset = 0; offset < input.issues.length; offset += 250) {
      const batch = input.issues.slice(offset, offset + 250);
      if (!batch.length) continue;
      const values = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      await this.database.execute(`
        INSERT INTO tabular.import_row_issues (
          import_id, issue_number, row_number, column_number, code, message, source_token
        ) VALUES ${values}
      `, batch.flatMap((issue, index) => [
        input.importId,
        offset + index + 1,
        issue.rowNumber || null,
        issue.columnNumber || null,
        issue.code,
        issue.message,
        issue.sourceToken || null
      ]));
    }
  }

  async savePreview(input: {
    importId: string;
    sourceSha256: string;
    sourceFingerprint: string;
    selectedSheet?: string;
    sourceOptions: Record<string, unknown>;
    headers: unknown[];
    mapping: unknown[];
    mappingFingerprint: string;
    preview: unknown[];
    warnings: unknown[];
    rowCount: number;
    columnCount: number;
    issueCount: number;
    fileDisplayName: string;
    tableName: string;
  }) {
    const updated = await this.database.execute(`
      UPDATE tabular.import_operations
         SET source_sha256 = ?, source_fingerprint = ?, selected_sheet = ?,
             source_options = ?::jsonb, headers = ?::jsonb, mapping = ?::jsonb,
             mapping_fingerprint = ?, preview = ?::jsonb, warnings = ?::jsonb,
             row_count = ?, column_count = ?, issue_count = ?,
             file_display_name = ?, table_name = ?, state = ?, confirmation_hash = NULL,
             error_summary = NULL, version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state IN ('initiated', 'uploading', 'preview', 'ready')
    `, [
      input.sourceSha256,
      input.sourceFingerprint,
      input.selectedSheet || null,
      JSON.stringify(input.sourceOptions),
      JSON.stringify(input.headers),
      JSON.stringify(input.mapping),
      input.mappingFingerprint,
      JSON.stringify(input.preview),
      JSON.stringify(input.warnings),
      input.rowCount,
      input.columnCount,
      input.issueCount,
      input.fileDisplayName,
      input.tableName,
      input.issueCount ? 'preview' : 'ready',
      input.importId
    ]);
    return updated.affectedRows;
  }

  async saveMapping(input: {
    importId: string;
    mapping: unknown[];
    mappingFingerprint: string;
    issues: number;
    fileDisplayName: string;
    tableName: string;
  }) {
    const result = await this.database.execute(`
      UPDATE tabular.import_operations
         SET mapping = ?::jsonb, mapping_fingerprint = ?, issue_count = ?,
             file_display_name = ?, table_name = ?, state = ?,
             confirmation_hash = NULL, version = version + 1,
             updated_at = clock_timestamp()
       WHERE id = ? AND state IN ('preview', 'ready')
    `, [
      JSON.stringify(input.mapping),
      input.mappingFingerprint,
      input.issues,
      input.fileDisplayName,
      input.tableName,
      input.issues ? 'preview' : 'ready',
      input.importId
    ]);
    return result.affectedRows;
  }

  async setConfirmation(importId: string, hash: string, expiresAt: Date) {
    const result = await this.database.execute(`
      UPDATE tabular.import_operations
         SET confirmation_hash = ?, expires_at = ?, version = version + 1,
             updated_at = clock_timestamp()
       WHERE id = ? AND state = 'ready'
    `, [hash, expiresAt.toISOString(), importId]);
    return result.affectedRows;
  }

  async confirm(importId: string) {
    const result = await this.database.execute(`
      UPDATE tabular.import_operations
         SET state = 'confirmed', confirmed_at = clock_timestamp(),
             version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state = 'ready' AND expires_at > clock_timestamp()
    `, [importId]);
    return result.affectedRows;
  }

  async cancel(importId: string) {
    const result = await this.database.execute(`
      UPDATE tabular.import_operations
         SET state = 'cancelled', cancelled_at = clock_timestamp(),
             version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state IN ('initiated', 'uploading', 'preview', 'ready')
    `, [importId]);
    return result.affectedRows;
  }

  async purgeStagedImport(importId: string) {
    await this.database.execute('DELETE FROM tabular.import_row_issues WHERE import_id = ?', [importId]);
    await this.database.execute('DELETE FROM tabular.import_rows WHERE import_id = ?', [importId]);
    await this.database.execute('DELETE FROM tabular.import_source_chunks WHERE import_id = ?', [importId]);
  }

  async cleanupExpiredStaging(limit = 100) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('Import staging cleanup limit is invalid');
    }
    const result = await this.database.execute<{ id: string }>(`
      WITH candidates AS MATERIALIZED (
        SELECT operation.id
          FROM tabular.import_operations operation
          LEFT JOIN tabular.browser_sessions session
            ON session.id = operation.session_id
           AND session.identity_id = operation.actor_identity_id
           AND session.connection_id = operation.connection_id
           AND session.history_scope_id = operation.history_scope_id
         WHERE operation.state IN (
           'initiated', 'uploading', 'preview', 'ready', 'confirmed', 'failed'
         )
           AND (
             operation.expires_at <= clock_timestamp()
             OR session.id IS NULL
             OR session.revoked_at IS NOT NULL
             OR session.idle_expires_at <= clock_timestamp()
             OR session.absolute_expires_at <= clock_timestamp()
           )
         ORDER BY operation.expires_at, operation.id
         FOR UPDATE OF operation SKIP LOCKED
         LIMIT ?
      ), terminal AS (
        UPDATE tabular.import_operations operation
           SET state = 'cancelled', confirmation_hash = NULL,
               preview = '[]'::jsonb, issue_count = 0,
               error_summary = jsonb_build_object(
                 'code', 'import_staging_expired',
                 'message', 'The staged import expired or its browser session ended.'
               ),
               cancelled_at = COALESCE(operation.cancelled_at, clock_timestamp()),
               version = operation.version + 1,
               updated_at = clock_timestamp()
          FROM candidates
         WHERE operation.id = candidates.id
         RETURNING operation.id
      ), purged_issues AS (
        DELETE FROM tabular.import_row_issues issue
         USING terminal
         WHERE issue.import_id = terminal.id
         RETURNING issue.import_id
      ), purged_rows AS (
        DELETE FROM tabular.import_rows staged
         USING terminal
         WHERE staged.import_id = terminal.id
         RETURNING staged.import_id
      ), purged_chunks AS (
        DELETE FROM tabular.import_source_chunks chunk
         USING terminal
         WHERE chunk.import_id = terminal.id
         RETURNING chunk.import_id
      )
      SELECT terminal.id
        FROM terminal
       ORDER BY terminal.id
    `, [limit]);
    return {
      cleaned: result.rows.length,
      importIds: result.rows.map((row) => row.id)
    };
  }

  async markCommitting(importId: string) {
    const result = await this.database.execute(`
      UPDATE tabular.import_operations
         SET state = 'committing', version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state = 'confirmed'
    `, [importId]);
    return result.affectedRows;
  }

  async markFailed(importId: string, error: Record<string, unknown>) {
    await this.database.execute(`
      UPDATE tabular.import_operations
         SET state = 'failed', error_summary = ?::jsonb,
             version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state IN ('confirmed', 'committing')
    `, [JSON.stringify(error), importId]);
  }

  async restoreForOperationRetry(importId: string) {
    const result = await this.database.execute(`
      UPDATE tabular.import_operations
         SET state = 'confirmed', error_summary = NULL,
             version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state = 'failed'
    `, [importId]);
    return result.affectedRows;
  }

  async cancelConfirmedOperation(importId: string) {
    const result = await this.database.execute(`
      UPDATE tabular.import_operations
         SET state = 'cancelled', confirmation_hash = NULL,
             cancelled_at = COALESCE(cancelled_at, clock_timestamp()),
             version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state IN ('confirmed', 'committing')
    `, [importId]);
    if (result.affectedRows === 1) await this.purgeStagedImport(importId);
    return result.affectedRows;
  }

  async resetFailed(importId: string) {
    const result = await this.database.execute(`
      UPDATE tabular.import_operations
         SET state = CASE WHEN issue_count = 0 THEN 'ready' ELSE 'preview' END,
             error_summary = NULL, confirmation_hash = NULL,
             version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND state = 'failed'
    `, [importId]);
    return result.affectedRows;
  }

  async markCommitted(input: {
    operation: StoredImportOperation;
    targetFileId: string;
    targetRelationOid: string;
    result: Record<string, unknown>;
  }) {
    await this.database.execute(`
      INSERT INTO tabular.import_commits (
        import_id, actor_identity_id, session_id, history_scope_id, connection_id,
        source_fingerprint, mapping_fingerprint, target_file_id, target_relation_oid,
        affected_row_count, affected_column_count, result_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::oid, ?, ?, ?::jsonb)
      ON CONFLICT (import_id) DO NOTHING
    `, [
      input.operation.id,
      input.operation.actor_identity_id,
      input.operation.session_id,
      input.operation.history_scope_id,
      input.operation.connection_id,
      input.operation.source_fingerprint!,
      input.operation.mapping_fingerprint!,
      input.targetFileId,
      input.targetRelationOid,
      Number(input.operation.row_count),
      Number(input.operation.column_count),
      JSON.stringify(input.result)
    ]);
    const updated = await this.database.execute(`
      UPDATE tabular.import_operations
         SET state = 'committed', result_summary = ?::jsonb, error_summary = NULL,
             committed_at = clock_timestamp(), version = version + 1,
             updated_at = clock_timestamp()
       WHERE id = ? AND state = 'committing'
    `, [JSON.stringify(input.result), input.operation.id]);
    if (updated.affectedRows !== 1) throw new Error('Import state changed before commit finalization');
    await this.purgeStagedImport(input.operation.id);
  }
}

export function safeOperation(row: StoredImportOperation, issues: Array<{
  rowNumber?: number;
  columnNumber?: number;
  code: string;
  message: string;
}> = []) {
  return {
    id: row.id,
    source: {
      kind: row.source_kind,
      name: row.source_name,
      mediaType: row.source_media_type,
      size: Number(row.source_size),
      receivedChunks: Number(row.received_chunks),
      totalChunks: Number(row.total_chunks),
      ...(row.source_sha256 ? { sha256: row.source_sha256 } : {}),
      ...(row.selected_sheet ? { selectedSheet: row.selected_sheet } : {}),
      options: structuredClone(row.source_options)
    },
    folder: { id: row.schema_id, name: row.schema_name },
    headers: structuredClone(row.headers),
    mapping: structuredClone(row.mapping),
    preview: structuredClone(row.preview),
    warnings: structuredClone(row.warnings),
    ...(issues.length ? { issues: structuredClone(issues.slice(0, 1_000)) } : {}),
    counts: {
      rows: Number(row.row_count),
      columns: Number(row.column_count),
      issues: Number(row.issue_count)
    },
    identity: {
      fileName: row.file_display_name || '',
      tableName: row.table_name || '',
      folder: row.schema_name
    },
    state: row.state,
    version: Number(row.version),
    ...(row.result_summary ? { result: structuredClone(row.result_summary) } : {}),
    ...(row.error_summary ? { error: structuredClone(row.error_summary) } : {}),
    expiresAt: new Date(row.expires_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
