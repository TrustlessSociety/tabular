//modules
import type { Value } from '@stackpress/inquire/types';

//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type {
  AppliedCellChange,
  AuthorizedExecutionContext,
  CellPatch,
  SafeDraft,
  SafeJournalEntry,
  TargetMutationEffect,
  ValidationIssue
} from './contracts.js';
import { CapabilityResultBudgetExceededError } from './contracts.js';

type Scope = Pick<
  AuthorizedExecutionContext,
  'actorIdentityId' | 'sessionId' | 'historyScopeId' | 'connectionId' | 'surface' | 'expiresAt'
>;

//The draft record contract exported for module callers
export type DraftRecord = {
  id: string,
  file_id: string,
  row_id: string | null,
  row_rank: string | null,
  schema_version: string,
  patch: CellPatch[],
  validation_state: ValidationIssue[],
  draft_version: string | number,
  state: SafeDraft['state'],
  expires_at: Date | string,
};

//The journal replay contract exported for module callers
export type JournalReplay = {
  id: string,
  file_id: string,
  schema_version: string,
  request_digest: string,
  result_summary: Record<string, unknown>,
};

//The session history entry contract exported for module callers
export type SessionHistoryEntry = {
  action_id: string,
  file_id: string,
  schema_version: string,
  forward_patch: AppliedCellChange[],
  inverse_patch: AppliedCellChange[],
  prior_versions: Record<string, string>,
  resulting_versions: Record<string, string>,
  operations: Record<string, 'insert' | 'update' | 'delete'>,
  active_incarnations: Record<string, string>,
  last_reversal_versions: Record<string, string> | null,
  state: 'applied' | 'undone',
};

/**
 * Provide capability persistence operations.
 */
export class CapabilityRepository {
  /**
   * Create a CapabilityRepository instance.
   */
  public constructor(private readonly database: DatabaseExecutor) {}

  /**
   * Handle the lock command operation.
   */
  public async lockCommand(scope: Scope, commandId: string) {
    await this.database.execute(`
      SELECT pg_advisory_xact_lock(
        hashtextextended('tabular-action:' || ? || ':' || ? || ':' || ?, 0)
      )
    `, [scope.actorIdentityId, scope.connectionId, commandId]);
  }

  /**
   * Handle the journal replay operation.
   */
  public async journalReplay(scope: Scope, commandId: string) {
    const result = await this.database.execute<JournalReplay>(`
      SELECT id, file_id, schema_version, request_digest, result_summary
        FROM tabular.action_journal
       WHERE actor_identity_id = ? AND connection_id = ? AND command_id = ?
       FOR SHARE
    `, [scope.actorIdentityId, scope.connectionId, commandId]);
    return result.rows[0];
  }

  /**
   * Insert the committed action.
   */
  public async insertCommittedAction(input: {
    scope: Scope,
    id: string,
    commandId: string,
    requestDigest: string,
    fileId: string,
    actionType:
      | 'record.patch'
      | 'record.insert'
      | 'record.delete'
      | 'range.patch'
      | 'draft.promote',
    schemaVersion: string,
    effect: TargetMutationEffect,
    resultSummary: Record<string, unknown>,
  }) {
    const { scope, effect } = input;
    const versions = versionMaps(effect);
    await this.lockHistoryScope(scope);
    await this.purgeExpiredHistory();
    await this.invalidateRedo(scope);
    await this.database.execute(`
      INSERT INTO tabular.action_journal (
        id, command_id, actor_identity_id, session_id, history_scope_id,
        connection_id, file_id, action_type, surface, request_digest,
        schema_version, affected_row_count, affected_cell_count, outcome,
        result_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?::jsonb)
    `, [
      input.id,
      input.commandId,
      scope.actorIdentityId,
      scope.sessionId,
      scope.historyScopeId,
      scope.connectionId,
      input.fileId,
      input.actionType,
      scope.surface,
      input.requestDigest,
      input.schemaVersion,
      effect.rows.length,
      effect.changes.length,
      JSON.stringify(input.resultSummary)
    ]);
    await this.database.execute(`
      INSERT INTO tabular.session_action_entries (
        action_id, actor_identity_id, history_scope_id, file_id,
        forward_patch, inverse_patch, prior_versions, resulting_versions,
        operations, active_incarnations, expires_at
      ) VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?)
    `, [
      input.id,
      scope.actorIdentityId,
      scope.historyScopeId,
      input.fileId,
      JSON.stringify(effect.changes),
      JSON.stringify(inverseChanges(effect.changes)),
      JSON.stringify(versions.prior),
      JSON.stringify(versions.resulting),
      JSON.stringify(Object.fromEntries(effect.rows.map((row) => [row.rowId, row.operation]))),
      JSON.stringify(incarnationMap(effect)),
      scope.expiresAt
    ]);
    await this.trimHistory(scope);
  }

  /**
   * Insert the draft action.
   */
  public async insertDraftAction(input: {
    scope: Scope,
    id: string,
    commandId: string,
    requestDigest: string,
    fileId: string,
    actionType: 'draft.create' | 'draft.update' | 'draft.delete',
    schemaVersion: string,
    affectedCellCount: number,
    resultSummary: Record<string, unknown>,
  }) {
    const { scope } = input;
    await this.database.execute(`
      INSERT INTO tabular.action_journal (
        id, command_id, actor_identity_id, session_id, history_scope_id,
        connection_id, file_id, action_type, surface, request_digest,
        schema_version, affected_row_count, affected_cell_count, outcome,
        result_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'committed', ?::jsonb)
    `, [
      input.id,
      input.commandId,
      scope.actorIdentityId,
      scope.sessionId,
      scope.historyScopeId,
      scope.connectionId,
      input.fileId,
      input.actionType,
      scope.surface,
      input.requestDigest,
      input.schemaVersion,
      input.affectedCellCount,
      JSON.stringify(input.resultSummary)
    ]);
  }

  /**
   * Insert the reversal action.
   */
  public async insertReversalAction(input: {
    scope: Scope,
    id: string,
    commandId: string,
    requestDigest: string,
    mode: 'undo' | 'redo',
    original: SessionHistoryEntry,
    effect: TargetMutationEffect,
    resultSummary: Record<string, unknown>,
  }) {
    const { scope, original, effect } = input;
    await this.database.execute(`
      INSERT INTO tabular.action_journal (
        id, command_id, actor_identity_id, session_id, history_scope_id,
        connection_id, file_id, action_type, surface, request_digest,
        schema_version, affected_row_count, affected_cell_count, outcome,
        reversal_of_action_id, result_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?, ?::jsonb)
    `, [
      input.id,
      input.commandId,
      scope.actorIdentityId,
      scope.sessionId,
      scope.historyScopeId,
      scope.connectionId,
      original.file_id,
      `history.${input.mode}`,
      scope.surface,
      input.requestDigest,
      original.schema_version,
      effect.rows.length,
      effect.changes.length,
      original.action_id,
      JSON.stringify(input.resultSummary)
    ]);
    await this.database.execute(`
      UPDATE tabular.session_action_entries
         SET state = ?,
             undone_at = CASE WHEN ? = 'undone' THEN clock_timestamp() ELSE undone_at END,
             last_reversal_versions = ?::jsonb,
             active_incarnations = ?::jsonb
       WHERE action_id = ? AND actor_identity_id = ? AND history_scope_id = ?
    `, [
      input.mode === 'undo' ? 'undone' : 'applied',
      input.mode === 'undo' ? 'undone' : 'applied',
      JSON.stringify(versionMaps(effect).resulting),
      JSON.stringify(incarnationMap(effect)),
      original.action_id,
      scope.actorIdentityId,
      scope.historyScopeId
    ]);
  }

  /**
   * Handle the history candidate operation.
   */
  public async historyCandidate(
    scope: Scope,
    mode: 'undo' | 'redo',
    fileId?: string,
    actionId?: string
  ) {
    await this.lockHistoryScope(scope);
    await this.purgeExpiredHistory();
    const state = mode === 'undo' ? 'applied' : 'undone';
    const order = mode === 'undo' ? 'j.sequence DESC' : 'e.undone_at DESC NULLS LAST';
    const result = await this.database.execute<SessionHistoryEntry>(`
      SELECT e.action_id, e.file_id, j.schema_version,
             e.forward_patch, e.inverse_patch, e.prior_versions,
             e.resulting_versions, e.operations, e.active_incarnations,
             e.last_reversal_versions, e.state
        FROM tabular.session_action_entries e
        JOIN tabular.action_journal j ON j.id = e.action_id
       WHERE e.actor_identity_id = ? AND e.history_scope_id = ?
         AND e.state = ?
         AND (?::text IS NULL OR e.file_id = ?)
         AND (?::text IS NULL OR e.action_id = ?)
         AND (? = 'undo' OR e.redo_invalidated_at IS NULL)
       ORDER BY ${order}, e.action_id DESC
       LIMIT 1
       FOR UPDATE OF e
    `, [
      scope.actorIdentityId,
      scope.historyScopeId,
      state,
      fileId || null,
      fileId || null,
      actionId || null,
      actionId || null,
      mode
    ]);
    return result.rows[0];
  }

  /**
   * List the journal.
   */
  public async listJournal(
    scope: Scope,
    fileId: string,
    limit: number,
    maximumResultBytes?: number
  ): Promise<SafeJournalEntry[]> {
    await this.purgeExpiredHistory();
    const values = [scope.actorIdentityId, scope.historyScopeId, fileId, limit];
    await this.assertBoundedRead(`
      SELECT j.id, j.file_id, j.action_type, j.affected_row_count,
             j.affected_cell_count, e.state AS entry_state, j.created_at,
             e.undone_at, e.redo_invalidated_at
        FROM tabular.action_journal j
        LEFT JOIN tabular.session_action_entries e ON e.action_id = j.id
       WHERE j.actor_identity_id = ? AND j.history_scope_id = ? AND j.file_id = ?
       ORDER BY j.sequence DESC
       LIMIT ?
    `, values, maximumResultBytes);
    const result = await this.database.execute<{
      id: string,
      file_id: string,
      action_type: SafeJournalEntry['actionType'],
      affected_row_count: number,
      affected_cell_count: number,
      entry_state: 'applied' | 'undone' | null,
      created_at: Date | string,
      undone_at: Date | string | null,
      redo_invalidated_at: Date | string | null,
    }>(`
      SELECT j.id, j.file_id, j.action_type, j.affected_row_count,
             j.affected_cell_count, e.state AS entry_state, j.created_at,
             e.undone_at, e.redo_invalidated_at
        FROM tabular.action_journal j
        LEFT JOIN tabular.session_action_entries e ON e.action_id = j.id
       WHERE j.actor_identity_id = ? AND j.history_scope_id = ? AND j.file_id = ?
       ORDER BY j.sequence DESC
       LIMIT ?
    `, values);
    return result.rows.map((row) => ({
      id: row.id,
      fileId: row.file_id,
      actionType: row.action_type,
      affectedRowCount: Number(row.affected_row_count),
      affectedCellCount: Number(row.affected_cell_count),
      createdAt: iso(row.created_at),
      reversalAvailable: row.entry_state === 'applied'
        ? 'undo'
        : row.entry_state === 'undone' && !row.redo_invalidated_at
          ? 'redo'
          : 'none'
    }));
  }

  /**
   * Handle the expire owned drafts operation.
   */
  public async expireOwnedDrafts(scope: Scope) {
    await this.database.execute(`
      UPDATE tabular.action_drafts
         SET state = 'expired', updated_at = clock_timestamp()
       WHERE actor_identity_id = ? AND connection_id = ?
         AND state = 'active' AND expires_at <= clock_timestamp()
    `, [scope.actorIdentityId, scope.connectionId]);
  }

  /**
   * Create the draft.
   */
  public async createDraft(input: {
    scope: Scope,
    id: string,
    fileId: string,
    rowId?: string,
    rowRank?: string,
    schemaVersion: string,
    patch: CellPatch[],
    validation: ValidationIssue[],
    expiresAt: Date,
  }) {
    const result = await this.database.execute<DraftRecord>(`
      INSERT INTO tabular.action_drafts (
        id, actor_identity_id, session_id, history_scope_id, connection_id,
        file_id, row_id, row_rank, schema_version, patch, validation_state, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
      RETURNING id, file_id, row_id, row_rank, schema_version, patch, validation_state,
                draft_version, state, expires_at
    `, [
      input.id,
      input.scope.actorIdentityId,
      input.scope.sessionId,
      input.scope.historyScopeId,
      input.scope.connectionId,
      input.fileId,
      input.rowId ?? null,
      input.rowRank ?? null,
      input.schemaVersion,
      JSON.stringify(input.patch),
      JSON.stringify(input.validation),
      input.expiresAt
    ]);
    return safeDraft(required(result.rows[0], 'Created draft was not returned'));
  }

  /**
   * Handle the draft for update operation.
   */
  public async draftForUpdate(scope: Scope, draftId: string, maximumResultBytes?: number) {
    await this.expireOwnedDrafts(scope);
    const values = [draftId, scope.actorIdentityId, scope.connectionId];
    await this.assertBoundedRead(`
      SELECT id, file_id, row_id, row_rank, schema_version, patch, validation_state,
             draft_version, state, expires_at
        FROM tabular.action_drafts
       WHERE id = ? AND actor_identity_id = ? AND connection_id = ?
    `, values, maximumResultBytes);
    const result = await this.database.execute<DraftRecord>(`
      SELECT id, file_id, row_id, row_rank, schema_version, patch, validation_state,
             draft_version, state, expires_at
        FROM tabular.action_drafts
       WHERE id = ? AND actor_identity_id = ? AND connection_id = ?
       FOR UPDATE
    `, values);
    return result.rows[0];
  }

  /**
   * List the active drafts.
   */
  public async listActiveDrafts(scope: Scope, fileId: string, maximumResultBytes?: number) {
    await this.expireOwnedDrafts(scope);
    const values = [scope.actorIdentityId, scope.connectionId, fileId];
    await this.assertBoundedRead(`
      SELECT id, file_id, row_id, row_rank, schema_version, patch, validation_state,
             draft_version, state, expires_at
        FROM tabular.action_drafts
       WHERE actor_identity_id = ? AND connection_id = ? AND file_id = ?
         AND state = 'active' AND expires_at > clock_timestamp()
       ORDER BY updated_at DESC, id DESC
       LIMIT 100
    `, values, maximumResultBytes);
    const result = await this.database.execute<DraftRecord>(`
      SELECT id, file_id, row_id, row_rank, schema_version, patch, validation_state,
             draft_version, state, expires_at
        FROM tabular.action_drafts
       WHERE actor_identity_id = ? AND connection_id = ? AND file_id = ?
         AND state = 'active' AND expires_at > clock_timestamp()
       ORDER BY updated_at DESC, id DESC
       LIMIT 100
    `, values);
    return result.rows.map(safeDraft);
  }

  /**
   * Update the draft.
   */
  public async updateDraft(
    scope: Scope,
    draftId: string,
    expectedVersion: number,
    patch: CellPatch[],
    validation: ValidationIssue[]
  ) {
    const result = await this.database.execute<DraftRecord>(`
      UPDATE tabular.action_drafts
         SET patch = ?::jsonb, validation_state = ?::jsonb,
             draft_version = draft_version + 1, updated_at = clock_timestamp(),
             session_id = ?, history_scope_id = ?
       WHERE id = ? AND actor_identity_id = ? AND connection_id = ?
         AND state = 'active' AND draft_version = ?
       RETURNING id, file_id, row_id, row_rank, schema_version, patch, validation_state,
                 draft_version, state, expires_at
    `, [
      JSON.stringify(patch),
      JSON.stringify(validation),
      scope.sessionId,
      scope.historyScopeId,
      draftId,
      scope.actorIdentityId,
      scope.connectionId,
      expectedVersion
    ]);
    return result.rows[0] ? safeDraft(result.rows[0]) : undefined;
  }

  /**
   * Handle the abandon draft operation.
   */
  public async abandonDraft(scope: Scope, draftId: string, expectedVersion: number) {
    const result = await this.database.execute<DraftRecord>(`
      UPDATE tabular.action_drafts
         SET state = 'abandoned', draft_version = draft_version + 1,
             updated_at = clock_timestamp(), session_id = ?, history_scope_id = ?
       WHERE id = ? AND actor_identity_id = ? AND connection_id = ?
         AND state = 'active' AND draft_version = ?
       RETURNING id, file_id, row_id, row_rank, schema_version, patch, validation_state,
                 draft_version, state, expires_at
    `, [
      scope.sessionId,
      scope.historyScopeId,
      draftId,
      scope.actorIdentityId,
      scope.connectionId,
      expectedVersion
    ]);
    return result.rows[0] ? safeDraft(result.rows[0]) : undefined;
  }

  /**
   * Set the draft validation.
   */
  public async setDraftValidation(scope: Scope, draftId: string, validation: ValidationIssue[]) {
    await this.database.execute(`
      UPDATE tabular.action_drafts
         SET validation_state = ?::jsonb, updated_at = clock_timestamp()
       WHERE id = ? AND actor_identity_id = ? AND connection_id = ?
         AND state = 'active'
    `, [
      JSON.stringify(validation), draftId, scope.actorIdentityId,
      scope.connectionId
    ]);
  }

  /**
   * Handle the promote draft operation.
   */
  public async promoteDraft(scope: Scope, draftId: string, actionId: string) {
    await this.database.execute(`
      UPDATE tabular.action_drafts
         SET state = 'promoted', promoted_action_id = ?, promoted_at = clock_timestamp(),
             updated_at = clock_timestamp(), session_id = ?, history_scope_id = ?
       WHERE id = ? AND actor_identity_id = ? AND connection_id = ?
         AND state = 'active'
    `, [
      actionId,
      scope.sessionId,
      scope.historyScopeId,
      draftId,
      scope.actorIdentityId,
      scope.connectionId
    ]);
  }

  /**
   * Handle the invalidate redo operation.
   */
  private async invalidateRedo(scope: Scope) {
    await this.database.execute(`
      UPDATE tabular.session_action_entries
         SET redo_invalidated_at = clock_timestamp()
       WHERE actor_identity_id = ? AND history_scope_id = ?
         AND state = 'undone' AND redo_invalidated_at IS NULL
    `, [scope.actorIdentityId, scope.historyScopeId]);
  }

  /**
   * Handle the lock history scope operation.
   */
  public async lockHistoryScope(scope: Scope) {
    await this.database.execute(`
      SELECT pg_advisory_xact_lock(
        hashtextextended('tabular-history:' || ? || ':' || ?, 0)
      )
    `, [scope.actorIdentityId, scope.historyScopeId]);
  }

  /**
   * Assert the bounded read.
   */
  private async assertBoundedRead(
    query: string,
    values: Value[],
    maximumResultBytes?: number
  ) {
    if (maximumResultBytes === undefined) return;
    if (!Number.isSafeInteger(maximumResultBytes)
      || maximumResultBytes < 1
      || maximumResultBytes > 1_048_576) {
      throw new Error('Capability result budget is invalid');
    }
    const measured = await this.database.execute<{ bytes: string, }>(`
      SELECT COALESCE(sum(octet_length(row_to_json(bounded_row)::text) + 1), 0)::text AS bytes
        FROM (${query}) AS bounded_row
    `, values);
    if (BigInt(measured.rows[0]?.bytes || '0') > BigInt(maximumResultBytes)) {
      throw new CapabilityResultBudgetExceededError();
    }
  }

  /**
   * Handle the purge expired history operation.
   */
  private async purgeExpiredHistory() {
    await this.database.execute(`
      DELETE FROM tabular.session_action_entries
       WHERE expires_at <= clock_timestamp()
    `);
  }

  /**
   * Handle the trim history operation.
   */
  private async trimHistory(scope: Scope) {
    await this.database.execute(`
      DELETE FROM tabular.session_action_entries
       WHERE action_id IN (
         SELECT action_id
           FROM tabular.session_action_entries
          WHERE actor_identity_id = ? AND history_scope_id = ?
          ORDER BY created_at DESC, action_id DESC
          OFFSET 100
       )
    `, [scope.actorIdentityId, scope.historyScopeId]);
  }
}

/**
 * Report the safe draft condition.
 */
export function safeDraft(row: DraftRecord): SafeDraft {
  return {
    id: row.id,
    fileId: row.file_id,
    ...(row.row_id ? { rowId: row.row_id } : {}),
    ...(row.row_rank ? { rowRank: row.row_rank } : {}),
    schemaVersion: row.schema_version,
    patch: row.patch,
    validation: row.validation_state,
    version: Number(row.draft_version),
    state: row.state,
    expiresAt: iso(row.expires_at)
  };
}

/**
 * Return the inverse changes result.
 */
function inverseChanges(changes: AppliedCellChange[]): AppliedCellChange[] {
  return changes.map((change) => ({
    ...change,
    before: change.after,
    after: change.before
  }));
}

/**
 * Return the version maps result.
 */
function versionMaps(effect: TargetMutationEffect) {
  return {
    prior: Object.fromEntries(effect.rows.map((row) => [row.rowId, row.priorVersion])),
    resulting: Object.fromEntries(effect.rows.map((row) => [row.rowId, row.resultingVersion]))
  };
}

/**
 * Return the incarnation map result.
 */
function incarnationMap(effect: TargetMutationEffect) {
  return Object.fromEntries(effect.rows.map((row) => [row.rowId, row.incarnation]));
}

/**
 * Return the iso result.
 */
function iso(value: Date | string) {
  return new Date(value).toISOString();
}

/**
 * Return the required result.
 */
function required<Value>(value: Value | undefined, message: string): Value {
  if (typeof value === 'undefined') throw new Error(message);
  return value;
}
