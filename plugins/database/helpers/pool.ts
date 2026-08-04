import pg, { type PoolClient, type PoolConfig } from 'pg';

const { Client, Pool } = pg;

export type ManagedPostgresPoolOptions = {
  name: string;
  connectionString: string;
  maximum: number;
  applicationName: string;
  connectionTimeoutMs?: number;
};

export class ManagedPostgresPool {
  readonly name: string;
  readonly #pool: InstanceType<typeof Pool>;
  readonly #cancelConfig: PoolConfig;
  readonly #checkedOut = new Set<PoolClient>();
  readonly #clientErrorListeners = new Map<PoolClient, (error: Error) => void>();
  #closing = false;
  #closePromise?: Promise<void>;

  constructor(options: ManagedPostgresPoolOptions) {
    this.name = options.name;
    const config: PoolConfig = {
      connectionString: options.connectionString,
      max: options.maximum,
      application_name: options.applicationName,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
      allowExitOnIdle: true
    };
    this.#cancelConfig = {
      connectionString: options.connectionString,
      application_name: `${options.applicationName}-cancel`,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000
    };
    this.#pool = new Pool(config);
  }

  get checkedOutCount() {
    return this.#checkedOut.size;
  }

  async checkout() {
    if (this.#closing) throw new Error(`PostgreSQL pool ${this.name} is closing`);
    const client = await this.#pool.connect();
    if (this.#closing) {
      client.release(new Error(`PostgreSQL pool ${this.name} closed during checkout`));
      throw new Error(`PostgreSQL pool ${this.name} is closing`);
    }
    const onClientError = (_error: Error) => {
      // The active transaction observes query/cleanup rejection. This listener
      // prevents a checked-out pg client error from becoming an uncaught event.
    };
    client.on('error', onClientError);
    this.#clientErrorListeners.set(client, onClientError);
    this.#checkedOut.add(client);
    return client;
  }

  release(client: PoolClient, error?: Error) {
    if (!this.#checkedOut.delete(client)) {
      throw new Error(`PostgreSQL client does not belong to active pool ${this.name}`);
    }
    const onClientError = this.#clientErrorListeners.get(client);
    if (onClientError) {
      client.off('error', onClientError);
      this.#clientErrorListeners.delete(client);
    }
    client.release(error);
  }

  /** Cancel one currently checked-out backend through a separate connection.
   * The transaction owner still awaits rollback and state verification before
   * releasing the target client. */
  async cancel(client: PoolClient) {
    const processId = (client as PoolClient & { processID?: number }).processID;
    if (!this.#checkedOut.has(client) || typeof processId !== 'number' || !Number.isInteger(processId)) {
      throw new Error(`PostgreSQL client cannot be cancelled by pool ${this.name}`);
    }
    const control = new Client(this.#cancelConfig);
    try {
      await control.connect();
      const result = await control.query<{ cancelled: boolean }>(
        'SELECT pg_cancel_backend($1) AS cancelled',
        [processId]
      );
      if (!result.rows[0]?.cancelled) {
        throw new Error(`PostgreSQL backend cancellation was rejected for pool ${this.name}`);
      }
    } finally {
      await control.end().catch(() => undefined);
    }
  }

  async ready() {
    if (this.#closing) return false;
    const result = await this.#pool.query('SELECT 1 AS ready');
    return result.rows[0]?.ready === 1;
  }

  async close(timeoutMs = 10_000) {
    if (this.#closePromise) return this.#closePromise;
    this.#closing = true;
    this.#closePromise = (async () => {
      const deadline = Date.now() + timeoutMs;
      while (this.#checkedOut.size && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (this.#checkedOut.size) {
        const error = new Error(`Forced close of PostgreSQL pool ${this.name}`);
        for (const client of [...this.#checkedOut]) {
          this.#checkedOut.delete(client);
          const onClientError = this.#clientErrorListeners.get(client);
          if (onClientError) {
            client.off('error', onClientError);
            this.#clientErrorListeners.delete(client);
          }
          client.release(error);
        }
      }
      await this.#pool.end();
    })();
    return this.#closePromise;
  }
}
