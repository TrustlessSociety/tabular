//node
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { Migration } from '../migrations/index.js';
import { createPGliteTestDatabase } from './helpers/pglite.js';
import { runMigrations } from '../helpers/migrator.js';
import { MigrationRepository } from '../helpers/repositories.js';
import { loadMigrations } from '../migrations/index.js';

/**
 * Return the migration result.
 */
function migration(version: string, name: string, sql: string): Migration {
  return {
    version,
    name,
    sql,
    checksum: createHash('sha256').update(sql).digest('hex')
  };
}

test('PGlite-labeled migration helper installs and re-enters handwritten history', async () => {
  const local = await createPGliteTestDatabase();
  try {
    const migrations = await loadMigrations();
    assert.deepEqual(await runMigrations(local.transaction, migrations, { advisoryLock: false }), {
      applied: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
      total: 11
    });
    assert.deepEqual(await runMigrations(local.transaction, migrations, { advisoryLock: false }), {
      applied: [],
      total: 11
    });
    const records = await new MigrationRepository(local.database).list();
    assert.deepEqual(records.map((record) => record.version), [
      '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'
    ]);
    assert.equal(records[0].checksum, migrations[0].checksum);
  } finally {
    await local.close();
  }
});

test('PGlite-labeled failed DDL leaves neither schema change nor version record', async () => {
  const local = await createPGliteTestDatabase();
  try {
    const base = await loadMigrations();
    await runMigrations(local.transaction, base, { advisoryLock: false });
    await assert.rejects(
      runMigrations(local.transaction, [
        ...base,
        migration('0012', 'forced-failure', `
          CREATE TABLE tabular.should_rollback (id bigint PRIMARY KEY);
          SELECT tabular.function_that_does_not_exist();
        `)
      ], { advisoryLock: false }),
      /function_that_does_not_exist/
    );
    const relation = await local.database.execute<{ exists: boolean, }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'tabular' AND table_name = 'should_rollback'
      ) AS exists
    `);
    assert.equal(relation.rows[0].exists, false);
    const records = await new MigrationRepository(local.database).list();
    assert.deepEqual(records.map((record) => record.version), [
      '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'
    ]);
  } finally {
    await local.close();
  }
});

test('PGlite-labeled migration history rejects drift, ahead state, and transaction control', async () => {
  const local = await createPGliteTestDatabase();
  try {
    const base = await loadMigrations();
    await runMigrations(local.transaction, base, { advisoryLock: false });
    const drifted = [{ ...base[0], checksum: 'a'.repeat(64) }, ...base.slice(1)];
    await assert.rejects(
      runMigrations(local.transaction, drifted, { advisoryLock: false }),
      /differs from its applied record/
    );
    await local.database.execute(`
      INSERT INTO tabular.schema_migrations (version, name, checksum)
      VALUES ('9999', 'future', ?)
    `, ['b'.repeat(64)]);
    await assert.rejects(
      runMigrations(local.transaction, base, { advisoryLock: false }),
      /ahead of this application/
    );
    const invalid = migration('0012', 'bad-control', 'BEGIN; SELECT 1; COMMIT;');
    await assert.rejects(
      runMigrations(local.transaction, [...base, invalid], { advisoryLock: false }),
      /transaction control/
    );
  } finally {
    await local.close();
  }
});
