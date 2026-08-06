//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type {
  SavedViewAccess,
  SavedViewDefinition
} from './contracts.js';

//The saved view row contract exported for module callers
export type SavedViewRow = {
  id: string,
  connection_id: string,
  file_id: string,
  owner_identity_id: string,
  name: string,
  slug: string,
  access: SavedViewAccess,
  definition: SavedViewDefinition,
  version: string | number,
  created_at: Date | string,
  updated_at: Date | string,
};

//The file target row contract exported for module callers
export type FileTargetRow = {
  file_id: string,
  relation_oid: string | number,
  state: string,
};

//The file column row contract exported for module callers
export type FileColumnRow = {
  column_id: string,
  attribute_number: string | number,
};

//The row order row contract exported for module callers
export type RowOrderRow = {
  file_id: string,
  rank_column_id: string,
  version: string | number,
  relation_oid: string | number,
  attribute_number: string | number,
  physical_name: string,
  object_state: string,
  column_state: string,
};

//The saved view command row contract exported for module callers
export type SavedViewCommandRow = {
  request_digest: string,
  action_type: string,
  result: Record<string, unknown>,
};

/**
 * Provide saved views persistence operations.
 */
export class SavedViewsRepository {
  /**
   * Create a SavedViewsRepository instance.
   */
  public constructor(private readonly database: DatabaseExecutor) {}

  /**
   * Handle the lock command operation.
   */
  public async lockCommand(identityId: string, connectionId: string, commandId: string) {
    await this.database.execute(`
      SELECT pg_advisory_xact_lock(hashtextextended(? || ':' || ? || ':' || ?, 0))
    `, [identityId, connectionId, commandId]);
  }

  /**
   * Handle the lock row order operation.
   */
  public async lockRowOrder(fileId: string) {
    await this.database.execute(`
      SELECT pg_advisory_xact_lock(hashtextextended('tabular-row-order:' || ?, 0))
    `, [fileId]);
  }

  /**
   * Handle the command replay operation.
   */
  public async commandReplay(identityId: string, connectionId: string, commandId: string) {
    const result = await this.database.execute<SavedViewCommandRow>(`
      SELECT request_digest, action_type, result
        FROM tabular.saved_view_commands
       WHERE actor_identity_id = ? AND connection_id = ? AND command_id = ?
    `, [identityId, connectionId, commandId]);
    return result.rows[0];
  }

  /**
   * Insert the command.
   */
  public async insertCommand(input: {
    identityId: string,
    connectionId: string,
    commandId: string,
    requestDigest: string,
    actionType: 'saved-view.create' | 'saved-view.update' | 'saved-view.duplicate'
      | 'saved-view.delete' | 'row-order.move',
    result: Record<string, unknown>,
  }) {
    await this.database.execute(`
      INSERT INTO tabular.saved_view_commands (
        actor_identity_id, connection_id, command_id,
        request_digest, action_type, result
      ) VALUES (?, ?, ?, ?, ?, ?::jsonb)
    `, [
      input.identityId,
      input.connectionId,
      input.commandId,
      input.requestDigest,
      input.actionType,
      JSON.stringify(input.result)
    ]);
  }

  /**
   * List saved-view rows for one identity and optional file set.
   */
  public async list(identityId: string, connectionId: string, fileIds?: string[]) {
    if (fileIds && !fileIds.length) return [];
    const result = await this.database.execute<SavedViewRow>(`
      SELECT id, connection_id, file_id, owner_identity_id, name, slug,
             access, definition, version, created_at, updated_at
        FROM tabular.saved_views
       WHERE connection_id = ?
         AND (access = 'shared' OR owner_identity_id = ?)
         ${fileIds ? `AND file_id IN (${fileIds.map(() => '?').join(', ')})` : ''}
       ORDER BY file_id, access, lower(name), id
    `, [connectionId, identityId, ...(fileIds || [])]);
    return result.rows;
  }

  /**
   * Handle the by id operation.
   */
  public async byId(viewId: string, lock = false) {
    const result = await this.database.execute<SavedViewRow>(`
      SELECT id, connection_id, file_id, owner_identity_id, name, slug,
             access, definition, version, created_at, updated_at
        FROM tabular.saved_views
       WHERE id = ?${lock ? ' FOR UPDATE' : ''}
    `, [viewId]);
    return result.rows[0];
  }

  /**
   * Handle the targets operation.
   */
  public async targets(connectionId: string, fileIds: string[]) {
    if (!fileIds.length) return [];
    const result = await this.database.execute<FileTargetRow>(`
      SELECT id AS file_id, relation_oid, state
        FROM tabular.catalog_objects
       WHERE connection_id = ? AND id IN (${fileIds.map(() => '?').join(', ')})
    `, [connectionId, ...fileIds]);
    return result.rows;
  }

  /**
   * Handle the target columns operation.
   */
  public async targetColumns(fileId: string) {
    const result = await this.database.execute<FileColumnRow>(`
      SELECT c.id AS column_id, c.attribute_number
        FROM tabular.catalog_columns c
       WHERE c.object_id = ? AND c.state = 'current'
         AND NOT EXISTS (
           SELECT 1
             FROM tabular.column_metadata m
            WHERE m.object_id = c.object_id
              AND m.catalog_column_id = c.id
              AND m.hidden
         )
       ORDER BY c.attribute_number
    `, [fileId]);
    return result.rows;
  }

  /**
   * Insert and return one saved-view row.
   */
  public async insert(input: {
    id: string,
    connectionId: string,
    fileId: string,
    ownerIdentityId: string,
    name: string,
    slug: string,
    access: SavedViewAccess,
    definition: SavedViewDefinition,
  }) {
    const result = await this.database.execute<SavedViewRow>(`
      INSERT INTO tabular.saved_views (
        id, connection_id, file_id, owner_identity_id,
        name, slug, access, definition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
      RETURNING id, connection_id, file_id, owner_identity_id, name, slug,
                access, definition, version, created_at, updated_at
    `, [
      input.id,
      input.connectionId,
      input.fileId,
      input.ownerIdentityId,
      input.name,
      input.slug,
      input.access,
      JSON.stringify(input.definition)
    ]);
    return required(result.rows[0], 'Created saved view was not returned');
  }

  /**
   * Update and return one saved-view row when its version matches.
   */
  public async update(input: {
    viewId: string,
    expectedVersion: number,
    name: string,
    slug: string,
    access: SavedViewAccess,
    definition: SavedViewDefinition,
  }) {
    const result = await this.database.execute<SavedViewRow>(`
      UPDATE tabular.saved_views
         SET name = ?, slug = ?, access = ?, definition = ?::jsonb,
             version = version + 1, updated_at = clock_timestamp()
       WHERE id = ? AND version = ?
      RETURNING id, connection_id, file_id, owner_identity_id, name, slug,
                access, definition, version, created_at, updated_at
    `, [
      input.name,
      input.slug,
      input.access,
      JSON.stringify(input.definition),
      input.viewId,
      input.expectedVersion
    ]);
    return result.rows[0];
  }

  /**
   * Delete one saved-view row when its version matches.
   */
  public async delete(viewId: string, expectedVersion: number) {
    return (await this.database.execute(`
      DELETE FROM tabular.saved_views WHERE id = ? AND version = ?
    `, [viewId, expectedVersion])).affectedRows === 1;
  }

  /**
   * Handle the row order operation.
   */
  public async rowOrder(fileId: string, lock = false) {
    const result = await this.database.execute<RowOrderRow>(`
      SELECT s.file_id, s.rank_column_id, s.version,
             o.relation_oid, c.attribute_number,
             c.observed_name AS physical_name,
             o.state AS object_state, c.state AS column_state
        FROM tabular.row_order_state s
        JOIN tabular.column_metadata m
          ON m.column_id = s.rank_column_id AND m.object_id = s.file_id
         AND m.hidden AND m.hidden_purpose = 'shared-rank'
        JOIN tabular.catalog_objects o ON o.id = s.file_id
        JOIN tabular.catalog_columns c ON c.id = m.catalog_column_id
       WHERE s.file_id = ?${lock ? ' FOR UPDATE OF s' : ''}
    `, [fileId]);
    return result.rows[0];
  }

  /**
   * Handle the advance row order operation.
   */
  public async advanceRowOrder(fileId: string, expectedVersion: number, rebalanced: boolean) {
    const result = await this.database.execute<{ version: string | number, }>(`
      UPDATE tabular.row_order_state
         SET version = version + 1,
             last_rebalanced_at = CASE WHEN ? THEN clock_timestamp() ELSE last_rebalanced_at END,
             updated_at = clock_timestamp()
       WHERE file_id = ? AND version = ?
      RETURNING version
    `, [rebalanced, fileId, expectedVersion]);
    return result.rows[0] ? Number(result.rows[0].version) : undefined;
  }

  /**
   * Handle the current cursor operation.
   */
  public async currentCursor(connectionId: string) {
    const result = await this.database.execute<{ cursor: string | number, }>(`
      SELECT next_cursor - 1 AS cursor
        FROM tabular.change_streams
       WHERE connection_id = ?
    `, [connectionId]);
    return Number(result.rows[0]?.cursor || 0);
  }

  /**
   * Handle the append outbox operation.
   */
  public async appendOutbox(input: {
    id: string,
    connectionId: string,
    fileId: string,
    actorIdentityId: string,
    audienceIdentityId?: string,
    eventType: 'saved-view.changed' | 'saved-view.deleted' | 'row-order.changed',
    idempotencyKey: string,
    payload: Record<string, unknown>,
  }) {
    await this.database.execute(`
      SELECT tabular.append_outbox_event(?, ?, ?, ?, ?, ?, ?, ?::jsonb)
    `, [
      input.id,
      input.connectionId,
      input.fileId,
      input.actorIdentityId,
      input.audienceIdentityId || null,
      input.eventType,
      input.idempotencyKey,
      JSON.stringify(input.payload)
    ]);
  }
}

/**
 * Return the iso result.
 */
export function iso(value: Date | string) {
  return new Date(value).toISOString();
}

/**
 * Return the required result.
 */
function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}
