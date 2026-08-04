import type { QueryObject, Value } from '@stackpress/inquire/types';

export type DatabaseResult<Row = unknown> = {
  rows: Row[];
  affectedRows: number;
};

export type RawDatabaseConnection = {
  raw<Row = unknown>(request: QueryObject): Promise<{
    rows: Row[];
    rowCount?: number | null;
    affectedRows?: number;
  }>;
};

export class DatabaseExecutor {
  constructor(readonly connection: RawDatabaseConnection) {}

  async execute<Row = unknown>(query: string, values: Value[] = []): Promise<DatabaseResult<Row>> {
    const result = await this.connection.raw<Row>({ query, values: [...values] });
    return {
      rows: result.rows,
      affectedRows: result.rowCount ?? result.affectedRows ?? 0
    };
  }
}
