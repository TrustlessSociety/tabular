//node
import { Readable } from 'node:stream';

//client
import type { SseConfig } from '../../../config/sse.js';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { OperationEventBatch } from '../helpers/contracts.js';
import { ApplicationError } from '../../../bootstrap/errors.js';

//The operation event reader contract exported for module callers
export type OperationEventReader = {
  readEvents(principal: BrowserPrincipal, after: number, limit: number): Promise<OperationEventBatch>,
};

/**
 * Provide the authorized operation event stream behavior used by this module.
 */
export class AuthorizedOperationEventStream extends Readable {
  //The cursor state retained by this class instance
  #cursor: number;
  //The busy state retained by this class instance
  #busy = false;
  //The paused for backpressure state retained by this class instance
  #pausedForBackpressure = false;
  //The timer state retained by this class instance
  #timer?: NodeJS.Timeout;
  //The last write at state retained by this class instance
  #lastWriteAt = Date.now();
  //The closed state retained by this class instance
  #closed = false;

  /**
   * Create a AuthorizedOperationEventStream instance.
   */
  public constructor(
    private readonly operations: OperationEventReader,
    private readonly principal: BrowserPrincipal,
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

  /**
   * Read the current value.
   */
  public override _read() {
    this.#pausedForBackpressure = false;
    this.#schedule(0);
  }

  /**
   * Handle the destroy operation.
   */
  public override _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    callback(error);
  }

  /**
   * Handle the shutdown operation.
   */
  public shutdown() {
    if (this.#closed) return;
    this.#push(formatControl('server.shutdown', {
      reason: 'The server is restarting; reconnect to resume from the last event ID.'
    }));
    this.#finish();
  }

  /**
   * Handle the internal schedule operation.
   */
  #schedule(delay: number) {
    if (this.#closed || this.#busy || this.#pausedForBackpressure || this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#pump();
    }, delay);
  }

  /**
   * Handle the internal pump operation.
   */
  async #pump() {
    if (this.#closed || this.#busy || this.#pausedForBackpressure) return;
    this.#busy = true;
    try {
      const batch = await this.operations.readEvents(
        this.principal,
        this.#cursor,
        //The operations reader deliberately bounds permission-filtered scans
        // at 500 rows even when the shared SSE configuration permits a larger
        // generic replay batch.
        Math.min(this.config.replayLimit, 500)
      );
      if (batch.gap || batch.events.length > this.config.clientQueueLimit) {
        this.#cursor = batch.highWater;
        this.#push(formatEvent(this.#cursor, 'snapshot.required', {
          scope: 'operations',
          retainedFrom: batch.retainedFrom,
          highWater: batch.highWater,
          reason: batch.gap ? 'cursor-gap' : 'client-backpressure'
        }));
      } else {
        for (const event of batch.events) {
          this.#cursor = event.cursor;
          if (!this.#push(formatEvent(event.cursor, 'tabular.change', {
            ...(event.fileId ? { fileId: event.fileId } : {}),
            type: 'operation.changed',
            payload: {
              jobId: event.jobId,
              state: event.state,
              kind: event.kind,
              progress: event.progress,
              version: event.version
            },
            createdAt: event.createdAt
          }))) break;
        }
        if (!this.#pausedForBackpressure && batch.scannedThrough > this.#cursor) {
          this.#cursor = batch.scannedThrough;
          this.#push(formatEvent(this.#cursor, 'tabular.cursor', {}));
        }
      }
      if (!batch.events.length && batch.scannedThrough <= this.#cursor
        && Date.now() - this.#lastWriteAt >= this.config.heartbeatMs) {
        this.#push(`: heartbeat ${Date.now()}\n\n`);
      }
    } catch (error) {
      if (error instanceof ApplicationError
        && ['invalid_session', 'capability_denied', 'operation_unavailable'].includes(error.errorCode)) {
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

  /**
   * Handle the internal push operation.
   */
  #push(value: string) {
    if (this.#closed) return false;
    this.#lastWriteAt = Date.now();
    const writable = this.push(value);
    if (!writable) this.#pausedForBackpressure = true;
    return writable;
  }

  /**
   * Handle the internal finish operation.
   */
  #finish() {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.push(null);
  }
}

/**
 * Format the event.
 */
function formatEvent(cursor: number, event: string, data: Record<string, unknown>) {
  return `id: ${cursor}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Format the control.
 */
function formatControl(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
