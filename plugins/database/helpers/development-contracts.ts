//client
import type { DatabaseExecutor } from './executor.js';
import type { PostgreSqlTransactionOptions } from './transactions.js';

//The development database backend contract keeps PGlite outside production
//imports while letting the database service own its lifecycle and authority.
export type DevelopmentDatabaseBackend = {
  transaction<Result, FinalResult = Result>(
    options: PostgreSqlTransactionOptions<Result, FinalResult>,
    callback: (database: DatabaseExecutor) => Promise<Result>
  ): Promise<FinalResult>,
  ready(): Promise<boolean>,
  close(): Promise<void>,
};
