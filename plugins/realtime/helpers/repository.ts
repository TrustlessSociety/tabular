import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { RealtimeEventType } from './contracts.js';

export type OutboxRow = {
  sequence: string | number;
  file_id: string;
  audience_identity_id: string | null;
  event_type: RealtimeEventType;
  payload: Record<string, unknown>;
  created_at: Date | string;
};

export type RealtimeTarget = {
  file_id: string;
  relation_oid: string | number;
  state: string;
};

export class RealtimeRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async streamState(connectionId: string) {
    const result = await this.database.execute<{
      retained_from_cursor: string | number;
      high_water: string | number;
    }>(`
      SELECT retained_from_cursor, next_cursor - 1 AS high_water
        FROM tabular.change_streams
       WHERE connection_id = ?
    `, [connectionId]);
    return result.rows[0]
      ? {
        retainedFrom: Number(result.rows[0].retained_from_cursor),
        highWater: Number(result.rows[0].high_water)
      }
      : { retainedFrom: 1, highWater: 0 };
  }

  async events(input: {
    connectionId: string;
    after: number;
    limit: number;
  }) {
    const result = await this.database.execute<OutboxRow>(`
      SELECT sequence, file_id, audience_identity_id,
             event_type, payload, created_at
        FROM tabular.outbox_events
       WHERE connection_id = ? AND sequence > ?
       ORDER BY sequence
       LIMIT ?
    `, [
      input.connectionId,
      input.after,
      input.limit
    ]);
    return result.rows;
  }

  async target(connectionId: string, fileId: string) {
    const result = await this.database.execute<RealtimeTarget>(`
      SELECT id AS file_id, relation_oid, state
        FROM tabular.catalog_objects
       WHERE connection_id = ? AND id = ?
    `, [connectionId, fileId]);
    return result.rows[0];
  }
}
