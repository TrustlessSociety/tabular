import type { Migration } from '../migrations/index.js';
import type { DatabaseExecutor } from './executor.js';

// First signed 64 bits of SHA-256("@trustless/tabular:migrations").
export const DEFAULT_MIGRATION_LOCK = '-6651648430625066027';

export type MigrationTransaction = <Result>(
  callback: (database: DatabaseExecutor) => Promise<Result>
) => Promise<Result>;

export type MigrationRunOptions = {
  advisoryLock?: boolean;
  lockKey?: string;
};

export async function runMigrations(
  transaction: MigrationTransaction,
  migrations: readonly Migration[],
  options: MigrationRunOptions = {}
) {
  validateMigrationSet(migrations);
  const newlyApplied: string[] = [];
  for (const migration of migrations) {
    const result = await transaction(async (database) => {
      if (options.advisoryLock !== false) {
        await database.execute('SELECT pg_advisory_xact_lock(?::bigint)', [
          options.lockKey || DEFAULT_MIGRATION_LOCK
        ]);
      }
      await ensureMigrationLedger(database);
      if (options.advisoryLock !== false) {
        await verifyPostgreSqlFoundation(database, { requireCurrentOwner: true });
      }
      const applied = await database.execute<{
        version: string;
        name: string;
        checksum: string;
      }>('SELECT version, name, checksum FROM tabular.schema_migrations ORDER BY version');
      validateAppliedHistory(applied.rows, migrations);
      const existing = applied.rows.find((row) => row.version === migration.version);
      if (existing) return false;
      await database.execute(migration.sql);
      await database.execute(`
        INSERT INTO tabular.schema_migrations (version, name, checksum)
        VALUES (?, ?, ?)
      `, [migration.version, migration.name, migration.checksum]);
      return true;
    });
    if (result) newlyApplied.push(migration.version);
  }
  return { applied: newlyApplied, total: migrations.length };
}

async function ensureMigrationLedger(database: DatabaseExecutor) {
  await database.execute('CREATE SCHEMA IF NOT EXISTS tabular');
  await database.execute(`
    CREATE TABLE IF NOT EXISTS tabular.schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL UNIQUE,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
      applied_by name NOT NULL DEFAULT current_user,
      server_version_num integer NOT NULL DEFAULT current_setting('server_version_num')::integer
    )
  `);
}

export async function verifyPostgreSqlMigrationState(
  database: DatabaseExecutor,
  migrations: readonly Migration[]
) {
  validateMigrationSet(migrations);
  await verifyPostgreSqlFoundation(database, { requireCurrentOwner: false });
  const applied = await database.execute<{
    version: string;
    name: string;
    checksum: string;
  }>('SELECT version, name, checksum FROM tabular.schema_migrations ORDER BY version');
  validateAppliedHistory(applied.rows, migrations);
  if (applied.rows.length !== migrations.length) {
    throw new Error('PostgreSQL migrations are not current');
  }
}

async function verifyPostgreSqlFoundation(
  database: DatabaseExecutor,
  options: { requireCurrentOwner: boolean }
) {
  const schema = await database.execute<{
    owner: string;
    current_user: string;
  }>(`
    SELECT pg_get_userbyid(namespace.nspowner)::text AS owner,
           current_user::text AS current_user
    FROM pg_namespace AS namespace
    WHERE namespace.nspname = 'tabular'
  `);
  if (!schema.rows[0]
    || (options.requireCurrentOwner && schema.rows[0].owner !== schema.rows[0].current_user)) {
    throw new Error('Refusing to adopt a tabular schema not owned by the migrator authority');
  }
  const ledger = await database.execute<{
    kind: string;
    owner: string;
    current_user: string;
  }>(`
    SELECT relation.relkind::text AS kind,
           pg_get_userbyid(relation.relowner)::text AS owner,
           current_user::text AS current_user
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'tabular'
      AND relation.relname = 'schema_migrations'
  `);
  if (!ledger.rows[0]
    || ledger.rows[0].kind !== 'r'
    || (options.requireCurrentOwner && ledger.rows[0].owner !== ledger.rows[0].current_user)) {
    throw new Error('Refusing to adopt an invalid or foreign-owned migration ledger');
  }
  const columns = await database.execute<{
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: 'YES' | 'NO';
    column_default: string | null;
  }>(`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'tabular' AND table_name = 'schema_migrations'
  `);
  const expected = new Map([
    ['version', ['text', 'text', 'NO']],
    ['name', ['text', 'text', 'NO']],
    ['checksum', ['text', 'text', 'NO']],
    ['applied_at', ['timestamp with time zone', 'timestamptz', 'NO']],
    ['applied_by', ['name', 'name', 'NO']],
    ['server_version_num', ['integer', 'int4', 'NO']]
  ]);
  if (columns.rows.length !== expected.size) {
    throw new Error('Migration ledger has an unexpected column set');
  }
  for (const row of columns.rows) {
    const contract = expected.get(row.column_name);
    if (!contract
      || row.data_type !== contract[0]
      || row.udt_name !== contract[1]
      || row.is_nullable !== contract[2]) {
      throw new Error(`Migration ledger column ${row.column_name} has an invalid contract`);
    }
  }
  const expectedDefaults = new Map<string, string | null>([
    ['version', null],
    ['name', null],
    ['checksum', null],
    ['applied_at', 'transaction_timestamp()'],
    ['applied_by', 'CURRENT_USER'],
    ['server_version_num', "(current_setting('server_version_num'::text))::integer"]
  ]);
  for (const row of columns.rows) {
    if (row.column_default !== expectedDefaults.get(row.column_name)) {
      throw new Error(`Migration ledger default for ${row.column_name} is invalid`);
    }
  }
  const constraints = await database.execute<{
    name: string;
    kind: string;
    deferrable: boolean;
    initially_deferred: boolean;
    validated: boolean;
    definition: string;
  }>(`
    SELECT ledger_constraint.conname::text AS name,
           ledger_constraint.contype::text AS kind,
           ledger_constraint.condeferrable AS deferrable,
           ledger_constraint.condeferred AS initially_deferred,
           ledger_constraint.convalidated AS validated,
           pg_get_constraintdef(ledger_constraint.oid)::text AS definition
    FROM pg_constraint AS ledger_constraint
    JOIN pg_class AS relation ON relation.oid = ledger_constraint.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'tabular'
      AND relation.relname = 'schema_migrations'
  `);
  const expectedConstraints = new Map<string, { kind: string; definition: string }>([
    ['schema_migrations_checksum_check', {
      kind: 'c',
      definition: "CHECK ((checksum ~ '^[a-f0-9]{64}$'::text))"
    }],
    ['schema_migrations_applied_at_not_null', { kind: 'n', definition: 'NOT NULL applied_at' }],
    ['schema_migrations_applied_by_not_null', { kind: 'n', definition: 'NOT NULL applied_by' }],
    ['schema_migrations_checksum_not_null', { kind: 'n', definition: 'NOT NULL checksum' }],
    ['schema_migrations_name_not_null', { kind: 'n', definition: 'NOT NULL name' }],
    ['schema_migrations_server_version_num_not_null', {
      kind: 'n',
      definition: 'NOT NULL server_version_num'
    }],
    ['schema_migrations_version_not_null', { kind: 'n', definition: 'NOT NULL version' }],
    ['schema_migrations_pkey', { kind: 'p', definition: 'PRIMARY KEY (version)' }],
    ['schema_migrations_name_key', { kind: 'u', definition: 'UNIQUE (name)' }]
  ]);
  if (constraints.rows.length !== expectedConstraints.size) {
    throw new Error('Migration ledger has an unexpected constraint set');
  }
  for (const row of constraints.rows) {
    const expectedConstraint = expectedConstraints.get(row.name);
    const normalizedDefinition = row.definition.replace(/\s+/g, ' ').trim();
    if (!expectedConstraint
      || row.kind !== expectedConstraint.kind
      || normalizedDefinition !== expectedConstraint.definition
      || row.deferrable
      || row.initially_deferred
      || !row.validated) {
      throw new Error(`Migration ledger constraint ${row.name} is invalid`);
    }
  }
}

function validateAppliedHistory(
  applied: readonly { version: string; name: string; checksum: string }[],
  migrations: readonly Migration[]
) {
  if (applied.length > migrations.length) {
    throw new Error('Database migration history is ahead of this application');
  }
  for (let index = 0; index < applied.length; index += 1) {
    const record = applied[index];
    const local = migrations[index];
    if (!local || record.version !== local.version) {
      throw new Error(`Database migration history is not a local prefix at ${record.version}`);
    }
    if (record.name !== local.name || record.checksum !== local.checksum) {
      throw new Error(`Migration ${record.version} differs from its applied record`);
    }
  }
}

function validateMigrationSet(migrations: readonly Migration[]) {
  const versions = migrations.map((migration) => migration.version);
  if (new Set(versions).size !== versions.length) {
    throw new Error('Migration versions must be unique');
  }
  if ([...versions].sort().join(',') !== versions.join(',')) {
    throw new Error('Migrations must be ordered by version');
  }
  for (const migration of migrations) {
    if (!/^\d{4}$/.test(migration.version)) {
      throw new Error(`Invalid migration version: ${migration.version}`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(migration.name)) {
      throw new Error(`Invalid migration name: ${migration.name}`);
    }
    if (!/^[a-f0-9]{64}$/.test(migration.checksum)) {
      throw new Error(`Invalid migration checksum: ${migration.version}`);
    }
    if (containsTopLevelTransactionControl(migration.sql)) {
      throw new Error(`Migration ${migration.version} contains transaction control`);
    }
  }
}

/**
 * Rejects transaction-control statements owned by the migration runner while
 * ignoring PL/pgSQL bodies and quoted/commented text. PostgreSQL function
 * bodies legitimately contain BEGIN/END blocks and are still executed inside
 * the runner's single transaction.
 */
function containsTopLevelTransactionControl(sql: string) {
  let visible = '';
  for (let index = 0; index < sql.length;) {
    const pair = sql.slice(index, index + 2);
    const character = sql[index]!;
    if (pair === '--') {
      const end = sql.indexOf('\n', index + 2);
      index = end === -1 ? sql.length : end;
      visible += ' ';
      continue;
    }
    if (pair === '/*') {
      const end = sql.indexOf('*/', index + 2);
      index = end === -1 ? sql.length : end + 2;
      visible += ' ';
      continue;
    }
    if (character === "'") {
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
        } else if (sql[index] === "'") {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      visible += ' ';
      continue;
    }
    if (character === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        const delimiter = match[0];
        const end = sql.indexOf(delimiter, index + delimiter.length);
        index = end === -1 ? sql.length : end + delimiter.length;
        visible += ' ';
        continue;
      }
    }
    visible += character;
    index += 1;
  }
  return /(?:^|;)\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i.test(visible);
}
