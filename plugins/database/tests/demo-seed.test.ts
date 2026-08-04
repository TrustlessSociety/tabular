//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { seedLocalDemo } from '../helpers/demo-seed.js';
import { runMigrations } from '../helpers/migrator.js';
import { loadMigrations } from '../migrations/index.js';
import { createPGliteTestDatabase } from './helpers/pglite.js';

test('local demo seed installs idempotent Operations and Finance data plus metadata', async () => {
  const local = await createPGliteTestDatabase();
  try {
    // Migrate the ordinary control schema before invoking the production seed helper.
    await runMigrations(local.transaction, await loadMigrations(), { advisoryLock: false });
    const first = await local.transaction((database) =>
      seedLocalDemo(database, undefined, 'demo_test')
    );
    assert.deepEqual(first.schemas, ['operations', 'finance']);
    assert.deepEqual(first.files, [
      'finance.customers',
      'finance.invoices',
      'operations.customer_orders',
      'operations.fulfillment_queue'
    ]);
    assert.equal(first.insertedRows, 12);
    assert.equal(first.metadataRecords, 31);

    // A reviewer edit remains canonical when the local seed is run again.
    await local.database.execute(`
      UPDATE operations.customer_orders
         SET notes = 'Preserved reviewer edit'
       WHERE order_id = 'ord-4001'
    `);
    const second = await local.transaction((database) =>
      seedLocalDemo(database, undefined, 'demo_test')
    );
    assert.equal(second.insertedRows, 0);
    assert.equal(second.metadataRecords, 0);

    // The catalog/file/column records bind to the real peer-schema objects.
    const proof = await local.database.execute<{
      files: number;
      columns: number;
      preserved: string;
      cross_schema_foreign_keys: number;
    }>(`
      SELECT (SELECT count(*)::integer FROM tabular.file_metadata) AS files,
             (SELECT count(*)::integer FROM tabular.column_metadata) AS columns,
             (SELECT notes FROM operations.customer_orders
               WHERE order_id = 'ord-4001') AS preserved,
             (SELECT count(*)::integer
                FROM information_schema.table_constraints
               WHERE constraint_type = 'FOREIGN KEY'
                 AND table_schema IN ('operations', 'finance')) AS cross_schema_foreign_keys
    `);
    assert.deepEqual(proof.rows[0], {
      files: 4,
      columns: 27,
      preserved: 'Preserved reviewer edit',
      cross_schema_foreign_keys: 3
    });
  } finally {
    await local.close();
  }
});

test('local demo seed refuses to adopt a changed representative table', async () => {
  const local = await createPGliteTestDatabase();
  try {
    await runMigrations(local.transaction, await loadMigrations(), { advisoryLock: false });
    await local.transaction((database) => seedLocalDemo(database, undefined, 'demo_test'));
    await local.database.execute(
      'ALTER TABLE finance.invoices ADD COLUMN foreign_change text'
    );
    await assert.rejects(
      local.transaction((database) => seedLocalDemo(database, undefined, 'demo_test')),
      /Refusing to adopt finance\.invoices with changed columns/
    );
  } finally {
    await local.close();
  }
});
