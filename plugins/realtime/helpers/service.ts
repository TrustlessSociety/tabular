import { Readable } from 'node:stream';
import type { SseConfig } from '../../../config/sse.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import {
  AuthorizedOperationEventStream,
  type OperationEventReader
} from '../../operations/events/stream.js';
import type { RealtimeBatch, RealtimeEvent } from './contracts.js';
import {
  RealtimeRepository,
  type OutboxRow,
  type RealtimeTarget
} from './repository.js';

export const REALTIME_SERVICE = 'tabular.realtime';

export class RealtimePluginService {
  readonly name = REALTIME_SERVICE;
  readonly #connections = new Set<AuthorizedEventStream | AuthorizedOperationEventStream>();

  constructor(
    private readonly identity: IdentityPluginService,
    readonly config: SseConfig
  ) {}

  open(principal: BrowserPrincipal, input: { fileId: string; cursor: number }) {
    this.requireCapacity();
    const stream = new AuthorizedEventStream(
      this,
      principal,
      input.fileId,
      input.cursor,
      this.config
    );
    this.#connections.add(stream);
    stream.once('close', () => this.#connections.delete(stream));
    return stream;
  }

  openOperations(
    principal: BrowserPrincipal,
    operations: OperationEventReader,
    input: { cursor: number }
  ) {
    this.requireCapacity();
    const stream = new AuthorizedOperationEventStream(
      operations,
      principal,
      input.cursor,
      this.config
    );
    this.#connections.add(stream);
    stream.once('close', () => this.#connections.delete(stream));
    return stream;
  }

  connectionCount() {
    return this.#connections.size;
  }

  closeConnections() {
    for (const connection of [...this.#connections]) connection.shutdown();
  }

  private requireCapacity() {
    if (this.#connections.size >= this.config.connectionLimit) {
      throw new ApplicationError(
        'realtime_capacity',
        503,
        'Live updates are at capacity. Retry the connection shortly.',
        true
      );
    }
  }

  async readBatch(
    principal: BrowserPrincipal,
    fileId: string,
    after: number
  ): Promise<RealtimeBatch> {
    let state = { retainedFrom: 1, highWater: 0 };
    let rows: OutboxRow[] = [];
    let target: RealtimeTarget | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.realtime',
      async (database) => {
        if (!target || !await canReadTarget(database, target)) accessLost();
        const first = Number(rows[0]?.sequence || 0);
        const gap = after < state.retainedFrom - 1
          || after > state.highWater
          || (first > 0 && first > after + 1);
        const visibleRows = rows.filter((row) => row.file_id === fileId && (
          row.audience_identity_id === null
          || row.audience_identity_id === principal.identityId
        ));
        return {
          events: gap ? [] : visibleRows.map(safeEvent),
          ...state,
          scannedThrough: Number(rows.at(-1)?.sequence || after),
          gap
        };
      },
      async (database) => {
        const repository = new RealtimeRepository(database);
        state = await repository.streamState(principal.connectionId);
        target = await repository.target(principal.connectionId, fileId);
        rows = await repository.events({
          connectionId: principal.connectionId,
          after,
          limit: this.config.replayLimit
        });
      },
      undefined,
      'read committed'
    );
  }
}

class AuthorizedEventStream extends Readable {
  #cursor: number;
  #busy = false;
  #pausedForBackpressure = false;
  #timer?: NodeJS.Timeout;
  #lastWriteAt = Date.now();
  #closed = false;

  constructor(
    private readonly realtime: RealtimePluginService,
    private readonly principal: BrowserPrincipal,
    private readonly fileId: string,
    cursor: number,
    private readonly config: SseConfig
  ) {
    super({ encoding: 'utf8', highWaterMark: 16 * 1024 });
    this.#cursor = cursor;
    queueMicrotask(() => {
      if (this.#closed) return;
      this.#push(`retry: 1000\n: connected ${Date.now()}\n\n`);
      this.#schedule(0);
    });
  }

  override _read() {
    this.#pausedForBackpressure = false;
    this.#schedule(0);
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    callback(error);
  }

  shutdown() {
    if (this.#closed) return;
    this.#push(formatControl('server.shutdown', {
      reason: 'The server is restarting; reconnect to resume from the last event ID.'
    }));
    this.#finish();
  }

  #schedule(delay: number) {
    if (this.#closed || this.#busy || this.#pausedForBackpressure || this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#pump();
    }, delay);
  }

  async #pump() {
    if (this.#closed || this.#busy || this.#pausedForBackpressure) return;
    this.#busy = true;
    try {
      const batch = await this.realtime.readBatch(this.principal, this.fileId, this.#cursor);
      if (batch.gap || batch.events.length > this.config.clientQueueLimit) {
        this.#cursor = batch.highWater;
        this.#push(formatEvent(this.#cursor, 'snapshot.required', {
          fileId: this.fileId,
          retainedFrom: batch.retainedFrom,
          highWater: batch.highWater,
          reason: batch.gap ? 'cursor-gap' : 'client-backpressure'
        }));
      } else {
        for (const event of batch.events) {
          this.#cursor = event.cursor;
          if (!this.#push(formatEvent(event.cursor, 'tabular.change', {
            fileId: event.fileId,
            type: event.type,
            payload: event.payload,
            createdAt: event.createdAt
          }))) break;
        }
        if (!this.#pausedForBackpressure && batch.scannedThrough > this.#cursor) {
          this.#cursor = batch.scannedThrough;
          this.#push(formatEvent(this.#cursor, 'tabular.cursor', {}));
        }
      }
      if (!batch.events.length && Date.now() - this.#lastWriteAt >= this.config.heartbeatMs) {
        this.#push(`: heartbeat ${Date.now()}\n\n`);
      }
    } catch (error) {
      if (error instanceof ApplicationError
        && ['invalid_session', 'capability_denied', 'realtime_access_lost'].includes(error.errorCode)) {
        this.#push(formatControl('access.revoked', {
          code: error.errorCode,
          recovery: 'Sign in again or ask the PostgreSQL owner to restore access.'
        }));
        this.#finish();
        return;
      }
      this.#push(formatControl('stream.error', {
        retryable: true,
        recovery: 'The stream closed; reconnect from the last received event ID.'
      }));
      this.#finish();
      return;
    } finally {
      this.#busy = false;
    }
    this.#schedule(this.config.pollMs);
  }

  #push(value: string) {
    if (this.#closed) return false;
    this.#lastWriteAt = Date.now();
    const writable = this.push(value);
    if (!writable) this.#pausedForBackpressure = true;
    return writable;
  }

  #finish() {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.push(null);
  }
}

async function canReadTarget(database: DatabaseExecutor, target: RealtimeTarget) {
  if (!['current', 'renamed', 'changed'].includes(target.state)) return false;
  const result = await database.execute<{ allowed: boolean }>(`
    SELECT has_schema_privilege(current_user, c.relnamespace, 'USAGE') AND (
      has_table_privilege(current_user, c.oid, 'SELECT') OR EXISTS (
        SELECT 1 FROM pg_attribute visible
         WHERE visible.attrelid = c.oid AND visible.attnum > 0
           AND NOT visible.attisdropped
           AND has_column_privilege(current_user, c.oid, visible.attnum, 'SELECT')
      )
    ) AS allowed
      FROM pg_class c
     WHERE c.oid = ?::oid AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  `, [target.relation_oid]);
  return Boolean(result.rows[0]?.allowed);
}

function safeEvent(row: OutboxRow): RealtimeEvent {
  return {
    cursor: Number(row.sequence),
    fileId: row.file_id,
    type: row.event_type,
    payload: structuredClone(row.payload),
    createdAt: new Date(row.created_at).toISOString()
  };
}

function formatEvent(cursor: number, event: string, data: Record<string, unknown>) {
  return `id: ${cursor}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function formatControl(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function accessLost(): never {
  throw new ApplicationError(
    'realtime_access_lost',
    403,
    'Current PostgreSQL authority no longer permits this subscription'
  );
}
