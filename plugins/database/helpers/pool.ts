//modules
import type { PoolClient, PoolConfig } from 'pg';
import pg from 'pg';

const { Client, Pool } = pg;

//The managed postgres pool options contract exported for module callers
export type ManagedPostgresPoolOptions = {
  name: string,
  connectionString: string,
  maximum: number,
  applicationName: string,
  connectionTimeoutMs?: number,
};

/**
 * Provide the managed postgres pool behavior used by this module.
 */
export class ManagedPostgresPool {
  //The name state retained by this class instance
  public readonly name: string;
  //The pool state retained by this class instance
  readonly #pool: InstanceType<typeof Pool>;
  //The cancel config state retained by this class instance
  readonly #cancelConfig: PoolConfig;
  //The checked out state retained by this class instance
  readonly #checkedOut = new Set<PoolClient>();
  //The client error listeners state retained by this class instance
  readonly #clientErrorListeners = new Map<PoolClient, (error: Error) => void>();
  //The closing state retained by this class instance
  #closing = false;
  //The close promise state retained by this class instance
  #closePromise?: Promise<void>;

  /**
   * Create a ManagedPostgresPool instance.
   */
  public constructor(options: ManagedPostgresPoolOptions) {
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

  /**
   * Return the checked out count value.
   */
  public get checkedOutCount() {
    return this.#checkedOut.size;
  }

  /**
   * Handle the checkout operation.
   */
  public async checkout() {
    if (this.#closing) throw new Error(`PostgreSQL pool ${this.name} is closing`);
    const client = await this.#pool.connect();
    if (this.#closing) {
      client.release(new Error(`PostgreSQL pool ${this.name} closed during checkout`));
      throw new Error(`PostgreSQL pool ${this.name} is closing`);
    }
    /**
     * Handle the client error event.
     */
    const onClientError = (_error: Error) => {
      //The active transaction observes query/cleanup rejection. This listener
      // prevents a checked-out pg client error from becoming an uncaught event.
    };
    client.on('error', onClientError);
    this.#clientErrorListeners.set(client, onClientError);
    this.#checkedOut.add(client);
    return client;
  }

  /**
   * Release the current value.
   */
  public release(client: PoolClient, error?: Error) {
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

  /**
   * Cancel one currently checked-out backend through a separate connection.
   * The transaction owner still awaits rollback and state verification before
   * releasing the target client.
   */
  public async cancel(client: PoolClient) {
    const processId = (client as PoolClient & { processID?: number, }).processID;
    if (!this.#checkedOut.has(client) || typeof processId !== 'number' || !Number.isInteger(processId)) {
      throw new Error(`PostgreSQL client cannot be cancelled by pool ${this.name}`);
    }
    const control = new Client(this.#cancelConfig);
    try {
      await control.connect();
      const result = await control.query<{ cancelled: boolean, }>(
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

  /**
   * Handle the ready operation.
   */
  public async ready() {
    if (this.#closing) return false;
    const result = await this.#pool.query('SELECT 1 AS ready');
    return result.rows[0]?.ready === 1;
  }

  /**
   * Close the current value.
   */
  public async close(timeoutMs = 10_000) {
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
