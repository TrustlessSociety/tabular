//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type {
  AppliedFileDdl,
  ExpectedDdlContext,
  FileDdlApplyState,
  FileDdlAction,
  StoredFileDdlRequest
} from './contracts.js';

type StoredFileDdlOperation = {
  state: FileDdlApplyState,
  error_summary: Record<string, unknown> | null,
};

/**
 * Provide file persistence operations.
 */
export class FileRepository {
  /**
   * Create a FileRepository instance.
   */
  public constructor(private readonly database: DatabaseExecutor) {}

  /**
   * Handle the request replay operation.
   */
  public async requestReplay(principal: BrowserPrincipal, commandId: string) {
    const result = await this.database.execute<StoredFileDdlRequest>(`
      SELECT * FROM tabular.file_ddl_requests
       WHERE actor_identity_id = ? AND connection_id = ? AND command_id = ?
       FOR SHARE
    `, [principal.identityId, principal.connectionId, commandId]);
    return result.rows[0];
  }

  /**
   * Handle the request by id operation.
   */
  public async requestById(requestId: string) {
    const result = await this.database.execute<StoredFileDdlRequest>(`
      SELECT * FROM tabular.file_ddl_requests WHERE id = ?
    `, [requestId]);
    return result.rows[0];
  }

  /**
   * Handle the owned request operation.
   */
  public async ownedRequest(principal: BrowserPrincipal, requestId: string) {
    const result = await this.database.execute<StoredFileDdlRequest>(`
      SELECT * FROM tabular.file_ddl_requests
       WHERE id = ? AND actor_identity_id = ? AND session_id = ?
         AND history_scope_id = ? AND connection_id = ?
       FOR SHARE
    `, [
      requestId,
      principal.identityId,
      principal.sessionId,
      principal.historyScopeId,
      principal.connectionId
    ]);
    return result.rows[0];
  }

  /**
   * Handle the owned apply operation operation.
   */
  public async ownedApplyOperation(principal: BrowserPrincipal, requestId: string) {
    const result = await this.database.execute<StoredFileDdlOperation>(`
      SELECT state, error_summary
        FROM tabular.operation_jobs
       WHERE connection_id = ? AND actor_identity_id = ? AND session_id = ?
         AND history_scope_id = ? AND kind = 'ddl.apply'
         AND payload ->> 'requestId' = ?
       ORDER BY sequence DESC
       LIMIT 1
    `, [
      principal.connectionId,
      principal.identityId,
      principal.sessionId,
      principal.historyScopeId,
      requestId
    ]);
    return result.rows[0];
  }

  /**
   * Insert the plan.
   */
  public async insertPlan(input: {
    id: string,
    principal: BrowserPrincipal,
    roleOid: string,
    roleName: string,
    action: FileDdlAction,
    digest: string,
    expected: ExpectedDdlContext,
    confirmationHash: string,
    expiresAt: Date,
  }) {
    await this.database.execute(`
      INSERT INTO tabular.file_ddl_requests (
        id, command_id, actor_identity_id, session_id, history_scope_id,
        connection_id, database_oid, requesting_role_oid, requesting_role_name,
        identity_generation, mapping_generation, allowed_role_id, role_generation,
        action_type, request_digest, action_payload, expected_context,
        confirmation_hash, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?::oid, ?::oid, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
    `, [
      input.id,
      input.action.commandId,
      input.principal.identityId,
      input.principal.sessionId,
      input.principal.historyScopeId,
      input.principal.connectionId,
      input.expected.databaseOid,
      input.roleOid,
      input.roleName,
      input.expected.identityGeneration!,
      input.expected.mappingGeneration!,
      input.expected.allowedRoleId!,
      input.expected.roleGeneration!,
      input.action.type,
      input.digest,
      JSON.stringify(input.action),
      JSON.stringify(input.expected),
      input.confirmationHash,
      input.expiresAt.toISOString()
    ]);
  }

  /**
   * Handle the lock owned request operation.
   */
  public async lockOwnedRequest(principal: BrowserPrincipal, requestId: string) {
    const result = await this.database.execute<StoredFileDdlRequest>(`
      SELECT * FROM tabular.file_ddl_requests
       WHERE id = ? AND actor_identity_id = ? AND session_id = ?
         AND history_scope_id = ? AND connection_id = ?
       FOR UPDATE
    `, [
      requestId,
      principal.identityId,
      principal.sessionId,
      principal.historyScopeId,
      principal.connectionId
    ]);
    return result.rows[0];
  }

  /**
   * Handle the rotate planned confirmation operation.
   */
  public async rotatePlannedConfirmation(
    requestId: string,
    confirmationHash: string,
    expiresAt: Date
  ) {
    const result = await this.database.execute(`
      UPDATE tabular.file_ddl_requests
         SET confirmation_hash = ?, expires_at = ?
       WHERE id = ? AND state = 'planned'
    `, [confirmationHash, expiresAt.toISOString(), requestId]);
    if (result.affectedRows !== 1) throw new Error('Planned DDL request changed before replay');
  }

  /**
   * Handle the confirm operation.
   */
  public async confirm(requestId: string) {
    const result = await this.database.execute<{ expires_at: Date | string, }>(`
      UPDATE tabular.file_ddl_requests
         SET state = 'confirmed', confirmed_at = clock_timestamp()
       WHERE id = ? AND state = 'planned' AND expires_at > clock_timestamp()
       RETURNING expires_at
    `, [requestId]);
    return result.rows[0];
  }

  /**
   * Handle the lock confirmed request operation.
   */
  public async lockConfirmedRequest(requestId: string) {
    const result = await this.database.execute<StoredFileDdlRequest>(`
      SELECT * FROM tabular.file_ddl_requests
       WHERE id = ? AND state IN ('confirmed', 'applied')
       FOR UPDATE
    `, [requestId]);
    return result.rows[0];
  }

  /**
   * Mark applied.
   */
  public async markApplied(request: StoredFileDdlRequest, result: AppliedFileDdl) {
    await this.database.execute(`
      INSERT INTO tabular.file_ddl_versions (
        request_id, connection_id, database_oid, action_type, request_digest,
        requesting_role_oid, target_object_id, result_summary
      ) VALUES (?, ?, ?::oid, ?, ?, ?::oid, ?, ?::jsonb)
    `, [
      request.id,
      request.connection_id,
      request.database_oid,
      request.action_type,
      request.request_digest,
      request.requesting_role_oid,
      result.targetFileId || null,
      JSON.stringify(result)
    ]);
    const updated = await this.database.execute(`
      UPDATE tabular.file_ddl_requests
         SET state = 'applied', applied_at = clock_timestamp(), result_summary = ?::jsonb
       WHERE id = ? AND state = 'confirmed'
    `, [JSON.stringify(result), request.id]);
    if (updated.affectedRows !== 1) throw new Error('Confirmed DDL request changed before apply');
  }
}

/**
 * Return the iso result.
 */
export function iso(value: Date | string) {
  return new Date(value).toISOString();
}
