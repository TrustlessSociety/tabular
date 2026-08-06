//client
import type {
  PostgreSqlConnectionScope,
  PostgreSqlObjectIdentity,
  SchemaMigrationRecord
} from './contracts.js';
import type { QualifiedIdentifier } from './identifiers.js';
import { DatabaseExecutor } from './executor.js';
import { qualifiedIdentifier } from './identifiers.js';

type MigrationRow = {
  version: string,
  name: string,
  checksum: string,
  applied_at: Date | string,
};

const objectKinds = {
  r: 'table',
  p: 'partitioned-table',
  v: 'view',
  m: 'materialized-view',
  f: 'foreign-table'
} as const;

/**
 * Provide migration persistence operations.
 */
export class MigrationRepository {
  /**
   * Create a MigrationRepository instance.
   */
  public constructor(private readonly database: DatabaseExecutor) {}

  /**
   * List applied migrations in deterministic version order.
   */
  public async list(): Promise<SchemaMigrationRecord[]> {
    const result = await this.database.execute<MigrationRow>(`
      SELECT version, name, checksum, applied_at
      FROM tabular.schema_migrations
      ORDER BY version
    `);
    return result.rows.map((row) => ({
      version: row.version,
      name: row.name,
      checksum: row.checksum,
      appliedAt: row.applied_at
    }));
  }
}

/**
 * Read the postgre SQL connection scope.
 */
export async function readPostgreSqlConnectionScope(
  database: DatabaseExecutor,
  connectionId: string
): Promise<PostgreSqlConnectionScope> {
  if (!/^[a-z][a-z0-9_-]{0,62}$/.test(connectionId)) {
    throw new Error('Database connection ID must be a stable non-secret slug');
  }
  const result = await database.execute<{
    database_oid: string,
    database_name: string,
  }>(`
    SELECT current_database()::text AS database_name,
           database.oid::text AS database_oid
    FROM pg_database AS database
    WHERE database.datname = current_database()
  `);
  if (!result.rows[0]) throw new Error('PostgreSQL connection scope was not available');
  return {
    connectionId,
    databaseOid: result.rows[0].database_oid,
    databaseName: result.rows[0].database_name
  };
}

/**
 * Find the postgre SQL object.
 */
export async function findPostgreSqlObject(
  database: DatabaseExecutor,
  connectionId: string,
  identifierInput: QualifiedIdentifier
): Promise<PostgreSqlObjectIdentity | undefined> {
  const scope = await readPostgreSqlConnectionScope(database, connectionId);
  const identifier = qualifiedIdentifier(identifierInput.schema, identifierInput.name);
  const result = await database.execute<{
    oid: string,
    schema_oid: string,
    schema: string,
    name: string,
    kind: keyof typeof objectKinds,
  }>(`
    SELECT class.oid::text AS oid,
           namespace.oid::text AS schema_oid,
           namespace.nspname::text AS schema,
           class.relname::text AS name,
           class.relkind::text AS kind
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = ? AND class.relname = ?
      AND class.relkind IN ('r', 'p', 'v', 'm', 'f')
  `, [identifier.schema, identifier.name]);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    connectionScope: scope,
    oid: row.oid,
    schemaOid: row.schema_oid,
    schema: row.schema,
    name: row.name,
    kind: objectKinds[row.kind]
  };
}
