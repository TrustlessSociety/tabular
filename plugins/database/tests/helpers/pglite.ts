import { PGlite } from '@electric-sql/pglite';
import PGLiteConnection from '@stackpress/inquire-pglite/Connection';
import { DatabaseExecutor } from '../../helpers/executor.js';
import type { MigrationTransaction } from '../../helpers/migrator.js';

export async function createPGliteTestDatabase() {
  const resource = new PGlite();
  await resource.waitReady;
  const database = new DatabaseExecutor(new PGLiteConnection(resource));
  let closed = false;
  const transaction: MigrationTransaction = async (callback) => {
    await database.execute('BEGIN');
    try {
      const result = await callback(database);
      await database.execute('COMMIT');
      return result;
    } catch (error) {
      await database.execute('ROLLBACK');
      throw error;
    }
  };
  return {
    label: 'PGlite unit helper' as const,
    resource,
    database,
    transaction,
    async close() {
      if (closed) return;
      closed = true;
      await resource.close();
    }
  };
}
