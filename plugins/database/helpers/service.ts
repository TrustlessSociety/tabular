import type { DatabaseConfig } from '../../../config/database.js';
import type { RuntimeResources } from '../../../bootstrap/resources.js';
import { DatabaseExecutor } from './executor.js';
import { runMigrations, verifyPostgreSqlMigrationState } from './migrator.js';
import { ManagedPostgresPool } from './pool.js';
import {
  findPostgreSqlObject,
  MigrationRepository,
  readPostgreSqlConnectionScope
} from './repositories.js';
import {
  withPostgreSqlTransaction,
  type PostgreSqlTransactionOptions
} from './transactions.js';
import { loadMigrations } from '../migrations/index.js';

export const DATABASE_SERVICE = 'tabular.database';
export type DatabaseScope = 'web' | 'migrator' | 'worker';

export class DatabasePluginService {
  readonly name = DATABASE_SERVICE;
  readonly repositories = {
    migrations: (database: DatabaseExecutor) => new MigrationRepository(database),
    readConnectionScope: readPostgreSqlConnectionScope,
    findObject: findPostgreSqlObject
  };
  readonly #pools = new Map<DatabaseScope, ManagedPostgresPool>();

  constructor(
    readonly processKind: DatabaseScope,
    private readonly config: DatabaseConfig,
    private readonly resources: RuntimeResources,
    private readonly shutdownTimeoutMs: number,
    private readonly instanceId: string
  ) {}

  configured(scope: DatabaseScope) {
    return Boolean(this.url(scope));
  }

  openPool(scope: DatabaseScope) {
    if (scope !== this.processKind) {
      throw new Error(
        `The ${this.processKind} process cannot open PostgreSQL ${scope} authority`
      );
    }
    const existing = this.#pools.get(scope);
    if (existing) return existing;
    const connectionString = this.url(scope);
    if (!connectionString) throw new Error(`PostgreSQL ${scope} authority is not configured`);
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

  async assertReady(scope: DatabaseScope) {
    const pool = this.openPool(scope);
    if (!await pool.ready()) throw new Error(`PostgreSQL ${scope} pool is not ready`);
    const migrations = await loadMigrations();
    await this.transaction(scope, {}, (database) =>
      verifyPostgreSqlMigrationState(database, migrations)
    );
  }

  async ready(scope: DatabaseScope) {
    try {
      await this.assertReady(scope);
      return true;
    } catch {
      return false;
    }
  }

  transaction<Result, FinalResult = Result>(
    scope: DatabaseScope,
    options: PostgreSqlTransactionOptions<Result, FinalResult>,
    callback: (database: DatabaseExecutor) => Promise<Result>
  ) {
    return withPostgreSqlTransaction<Result, FinalResult>(this.openPool(scope), options, callback);
  }

  async migrate() {
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

  private url(scope: DatabaseScope) {
    if (scope === 'web') return this.config.webUrl;
    if (scope === 'migrator') return this.config.migratorUrl;
    return this.config.workerUrl;
  }
}
