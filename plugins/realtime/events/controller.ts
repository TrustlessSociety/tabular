//The realtime state contract exported for module callers
export type RealtimeState =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'refreshing'
  | 'access-lost'
  | 'closed';

//The realtime change contract exported for module callers
export type RealtimeChange = {
  cursor: number,
  fileId?: string,
  type: string,
  payload: Record<string, unknown>,
};

type RealtimeSubscription =
  | { fileId: string, scope?: never, }
  | { fileId?: never, scope: 'operations', };

//The realtime controller options contract exported for module callers
export type RealtimeControllerOptions = RealtimeSubscription & {
  cursor: number,
  retryMs?: number,
  maximumRetryMs?: number,
  stableConnectionMs?: number,
  onRetryScheduled?: (delayMs: number) => void,
  onState: (state: RealtimeState, message: string) => void,
  onChange: (change: RealtimeChange) => void | Promise<void>,
  onSnapshot: (cursor: number) => void | Promise<void>,
};

/**
 * Coordinate realtime state and events.
 */
export class RealtimeController {
  //The source state retained by this class instance
  #source?: EventSource;
  //The cursor state retained by this class instance
  #cursor: number;
  //The closed state retained by this class instance
  #closed = false;
  //The generation state retained by this class instance
  #generation = 0;
  //The retry timer state retained by this class instance
  #retryTimer?: ReturnType<typeof setTimeout>;
  //The stable timer state retained by this class instance
  #stableTimer?: ReturnType<typeof setTimeout>;
  //The retry attempt state retained by this class instance
  #retryAttempt = 0;
  //The processing state retained by this class instance
  #processing = Promise.resolve();

  /**
   * Create a RealtimeController instance.
   */
  public constructor(private readonly options: RealtimeControllerOptions) {
    this.#cursor = options.cursor;
  }

  /**
   * Start the current value.
   */
  public start() {
    if (this.#closed || this.#source || this.#retryTimer) return;
    this.#open();
  }

  /**
   * Handle the internal open operation.
   */
  #open() {
    if (this.#closed || this.#source) return;
    this.options.onState('connecting', 'Connecting live updates…');
    const search = new URLSearchParams({ cursor: String(this.#cursor) });
    if (this.options.scope === 'operations') search.set('scope', 'operations');
    else search.set('fileId', this.options.fileId);
    const source = new EventSource(`/events?${search}`, { withCredentials: true });
    const generation = ++this.#generation;
    this.#source = source;
    source.onopen = () => {
      if (this.#closed || generation !== this.#generation) return;
      this.options.onState('live', 'Live updates connected');
      if (this.#stableTimer) clearTimeout(this.#stableTimer);
      this.#stableTimer = setTimeout(() => {
        if (!this.#closed && generation === this.#generation) this.#markHealthy();
      }, this.options.stableConnectionMs ?? 10_000);
    };
    source.onerror = () => {
      if (this.#closed || generation !== this.#generation) return;
      this.#restart('Live updates reconnecting…');
    };
    source.addEventListener('tabular.change', (event) => {
      const message = event as MessageEvent<string>;
      const cursor = parseCursor(message.lastEventId);
      let data: Omit<RealtimeChange, 'cursor'>;
      try {
        data = JSON.parse(message.data) as Omit<RealtimeChange, 'cursor'>;
      } catch {
        if (!this.#closed && generation === this.#generation) {
          this.#restart('Live update payload was invalid; retrying from the last applied change…');
        }
        return;
      }
      this.#processing = this.#processing.then(async () => {
        if (this.#closed || generation !== this.#generation || cursor <= this.#cursor) return;
        try {
          await this.options.onChange({ cursor, ...data });
          if (!this.#closed && generation === this.#generation) {
            this.#cursor = cursor;
            this.#markHealthy();
          }
        } catch {
          if (!this.#closed && generation === this.#generation) {
            this.#restart('Live update refresh failed; retrying…');
          }
        }
      });
    });
    source.addEventListener('tabular.cursor', (event) => {
      const message = event as MessageEvent<string>;
      const cursor = parseCursor(message.lastEventId);
      this.#processing = this.#processing.then(() => {
        if (this.#closed || generation !== this.#generation || cursor <= this.#cursor) return;
        this.#cursor = cursor;
        this.#markHealthy();
      });
    });
    source.addEventListener('snapshot.required', (event) => {
      const message = event as MessageEvent<string>;
      const cursor = parseCursor(message.lastEventId);
      this.#processing = this.#processing.then(async () => {
        if (this.#closed || generation !== this.#generation || cursor < this.#cursor) return;
        this.options.onState('refreshing', 'Refreshing after an event cursor gap…');
        try {
          await this.options.onSnapshot(cursor);
          if (!this.#closed && generation === this.#generation) {
            this.#cursor = cursor;
            this.#markHealthy();
            this.options.onState('live', 'Live snapshot refreshed');
          }
        } catch {
          if (!this.#closed && generation === this.#generation) {
            this.#restart('Live snapshot refresh failed; retrying…');
          }
        }
      });
    });
    source.addEventListener('access.revoked', () => {
      if (this.#closed || generation !== this.#generation) return;
      this.options.onState(
        'access-lost',
        'Live access ended. Sign in again or ask the PostgreSQL owner to restore access.'
      );
      this.close(false);
    });
    source.addEventListener('server.shutdown', () => {
      if (!this.#closed && generation === this.#generation) {
        this.#restart('Server restarting; live updates will resume…');
      }
    });
  }

  /**
   * Handle the internal restart operation.
   */
  #restart(message: string) {
    if (this.#closed) return;
    this.#generation += 1;
    this.#source?.close();
    this.#source = undefined;
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    if (this.#stableTimer) clearTimeout(this.#stableTimer);
    this.#stableTimer = undefined;
    this.options.onState('reconnecting', message);
    const base = Math.max(0, this.options.retryMs ?? 250);
    const maximum = Math.max(base, this.options.maximumRetryMs ?? 8_000);
    const delay = Math.min(maximum, base * (2 ** Math.min(this.#retryAttempt, 20)));
    this.#retryAttempt += 1;
    this.options.onRetryScheduled?.(delay);
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = undefined;
      this.#open();
    }, delay);
  }

  /**
   * Handle the internal mark healthy operation.
   */
  #markHealthy() {
    this.#retryAttempt = 0;
    if (this.#stableTimer) clearTimeout(this.#stableTimer);
    this.#stableTimer = undefined;
  }

  /**
   * Handle the cursor operation.
   */
  public cursor() {
    return this.#cursor;
  }

  /**
   * Close the current value.
   */
  public close(report = true) {
    if (this.#closed) return;
    this.#closed = true;
    this.#generation += 1;
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    if (this.#stableTimer) clearTimeout(this.#stableTimer);
    this.#retryTimer = undefined;
    this.#stableTimer = undefined;
    this.#source?.close();
    this.#source = undefined;
    if (report) this.options.onState('closed', 'Live updates closed');
  }
}

/**
 * Parse the cursor.
 */
function parseCursor(value: string) {
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}
