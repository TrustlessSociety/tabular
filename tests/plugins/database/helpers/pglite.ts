//modules
import { PGlite } from '@electric-sql/pglite';
import PGLiteConnection from '@stackpress/inquire-pglite/Connection';

//client
import type { MigrationTransaction } from '../../../../src/plugins/database/helpers/migrator.js';
import { DatabaseExecutor } from '../../../../src/plugins/database/helpers/executor.js';

/**
 * Create the p glite test database.
 */
export async function createPGliteTestDatabase() {
  const resource = new PGlite();
  await resource.waitReady;
  const database = new DatabaseExecutor(new PGLiteConnection(resource));
  let closed = false;
  /**
   * Return the transaction result.
   */
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
    /**
     * Close the current value.
     */
    async close() {
      if (closed) return;
      closed = true;
      await resource.close();
    }
  };
}
