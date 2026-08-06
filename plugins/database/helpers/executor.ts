//modules
import type { QueryObject, Value } from '@stackpress/inquire/types';

//The database result contract exported for module callers
export type DatabaseResult<Row = unknown> = {
  rows: Row[],
  affectedRows: number,
};

//The raw database connection contract exported for module callers
export type RawDatabaseConnection = {
  raw<Row = unknown>(request: QueryObject): Promise<{
    rows: Row[],
    rowCount?: number | null,
    affectedRows?: number,
  }>,
};

/**
 * Provide the database executor behavior used by this module.
 */
export class DatabaseExecutor {
  /**
   * Create a DatabaseExecutor instance.
   */
  public constructor(public readonly connection: RawDatabaseConnection) {}

  /**
   * Execute the current value.
   */
  public async execute<Row = unknown>(query: string, values: Value[] = []): Promise<DatabaseResult<Row>> {
    const result = await this.connection.raw<Row>({ query, values: [...values] });
    return {
      rows: result.rows,
      affectedRows: result.rowCount ?? result.affectedRows ?? 0
    };
  }
}
