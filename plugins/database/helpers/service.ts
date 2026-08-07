//client
import type { RuntimeResources } from '../../../bootstrap/resources.js';
import type { DatabaseConfig } from '../../../config/database.js';
import type { PostgreSqlTransactionOptions } from './transactions.js';
import type { DevelopmentDatabaseBackend } from './development-contracts.js';
import { DatabaseExecutor } from './executor.js';
import { runMigrations, verifyPostgreSqlMigrationState } from './migrator.js';
import { ManagedPostgresPool } from './pool.js';
import {
  findPostgreSqlObject,
  MigrationRepository,
  readPostgreSqlConnectionScope
} from './repositories.js';
import { withPostgreSqlTransaction } from './transactions.js';
import { loadMigrations } from '../migrations/index.js';

//The database service value exported for module callers
export const DATABASE_SERVICE = 'tabular.database';
//The database scope contract exported for module callers
export type DatabaseScope = 'web' | 'migrator' | 'worker';

/**
 * Provide database plugin operations through one service boundary.
 */
export class DatabasePluginService {
  //The name state retained by this class instance
  public readonly name = DATABASE_SERVICE;
  //The repositories state retained by this class instance
  public readonly repositories = {
    migrations: (database: DatabaseExecutor) => new MigrationRepository(database),
    readConnectionScope: readPostgreSqlConnectionScope,
    findObject: findPostgreSqlObject
  };
  //The pools state retained by this class instance
  readonly #pools = new Map<DatabaseScope, ManagedPostgresPool>();
  //The source-only development backend retained by this class instance
  readonly #development?: DevelopmentDatabaseBackend;

  /**
   * Create a DatabasePluginService instance.
   */
  public constructor(
    public readonly processKind: DatabaseScope,
    private readonly config: DatabaseConfig,
    private readonly resources: RuntimeResources,
    private readonly shutdownTimeoutMs: number,
    private readonly instanceId: string,
    development?: DevelopmentDatabaseBackend
  ) {
    if (development && (
      this.processKind !== 'web'
      || this.config.webUrl
    )) {
      throw new Error(
        'The PGlite development backend is available only for a URL-less development web process'
      );
    }
    this.#development = development;
    if (development) {
      resources.register({
        name: 'pglite-development-database',
        ready: () => development.ready(),
        close: () => development.close()
      });
    }
  }

  /**
   * Handle the configured operation.
   */
  public configured(scope: DatabaseScope) {
    return Boolean(this.url(scope)) || (scope === 'web' && Boolean(this.#development));
  }

  /**
   * Open the pool.
   */
  public openPool(scope: DatabaseScope) {
    if (scope !== this.processKind) {
      throw new Error(
        `The ${this.processKind} process cannot open PostgreSQL ${scope} authority`
      );
    }
    const existing = this.#pools.get(scope);
    if (existing) return existing;
    const connectionString = this.url(scope);
    if (!connectionString) {
      if (scope === 'web' && this.#development) {
        throw new Error('PostgreSQL web authority is not configured; development uses PGlite');
      }
      throw new Error(`PostgreSQL ${scope} authority is not configured`);
    }
    const pool = new ManagedPostgresPool({
      name: scope,
      connectionString,
      maximum: this.config.poolMaximum,
      applicationName: `tabular-${scope}-${this.instanceId}`
    });
    this.#pools.set(scope, pool);
    this.resources.register({
      name: `postgres-${scope}-pool`,
      ready: () => this.ready(scope),
      close: () => pool.close(this.shutdownTimeoutMs)
    });
    return pool;
  }

  /**
   * Assert the ready.
   */
  public async assertReady(scope: DatabaseScope) {
    if (this.#development) {
      if (scope !== 'web') {
        throw new Error(`The ${this.processKind} process cannot use development PGlite`);
      }
      if (!await this.#development.ready()) {
        throw new Error('Development PGlite database is not ready');
      }
      return;
    }
    const pool = this.openPool(scope);
    if (!await pool.ready()) throw new Error(`PostgreSQL ${scope} pool is not ready`);
    const migrations = await loadMigrations();
    await this.transaction(scope, {}, (database) =>
      verifyPostgreSqlMigrationState(database, migrations)
    );
  }

  /**
   * Handle the ready operation.
   */
  public async ready(scope: DatabaseScope) {
    try {
      await this.assertReady(scope);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle the transaction operation.
   */
  public transaction<Result, FinalResult = Result>(
    scope: DatabaseScope,
    options: PostgreSqlTransactionOptions<Result, FinalResult>,
    callback: (database: DatabaseExecutor) => Promise<Result>
  ) {
    if (this.#development) {
      if (scope !== 'web') {
        throw new Error(`The ${this.processKind} process cannot use development PGlite`);
      }
      return this.#development.transaction(options, callback);
    }
    return withPostgreSqlTransaction<Result, FinalResult>(this.openPool(scope), options, callback);
  }

  /**
   * Handle the migrate operation.
   */
  public async migrate() {
    if (this.processKind !== 'migrator') {
      throw new Error('Only the migrator process can apply database migrations');
    }
    const migrations = await loadMigrations();
    return runMigrations(
      (callback) => this.transaction('migrator', {
        settings: {
          statement_timeout: String(this.config.statementTimeoutMs),
          lock_timeout: String(this.config.statementTimeoutMs),
          idle_in_transaction_session_timeout: String(this.config.statementTimeoutMs)
        }
      }, callback),
      migrations,
      { advisoryLock: true }
    );
  }

  /**
   * Handle the URL operation.
   */
  private url(scope: DatabaseScope) {
    if (scope === 'web') return this.config.webUrl;
    if (scope === 'migrator') return this.config.migratorUrl;
    return this.config.workerUrl;
  }
}
