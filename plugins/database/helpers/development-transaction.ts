//client
import type { DatabaseExecutor } from './executor.js';
import type { PostgreSqlTransactionOptions } from './transactions.js';
import { PostgreSqlTransactionCancelledError, validatePostgreSqlRole } from './transactions.js';
import { quoteIdentifier } from './identifiers.js';

const allowedSettings = new Set([
  'statement_timeout',
  'lock_timeout',
  'idle_in_transaction_session_timeout'
]);

/**
 * Run one serialized PGlite transaction with the PostgreSQL authority contract.
 */
export async function withDevelopmentTransaction<Result, FinalResult = Result>(
  database: DatabaseExecutor,
  options: PostgreSqlTransactionOptions<Result, FinalResult>,
  callback: (database: DatabaseExecutor) => Promise<Result>
) {
  if (options.signal?.aborted) throw new PostgreSqlTransactionCancelledError();

  let transactionOpen = false;
  let result: Result | undefined;
  let finalResult: FinalResult | undefined;
  try {
    //PGlite has one in-process PostgreSQL session, so the same transaction
    // preparation and role boundary must be applied for every request.
    await database.execute(options.isolation === 'repeatable read'
      ? 'BEGIN ISOLATION LEVEL REPEATABLE READ'
      : 'BEGIN');
    transactionOpen = true;
    if (options.signal?.aborted) throw new PostgreSqlTransactionCancelledError();

    //Keep role selection aligned with the PostgreSQL transaction helper.
    if (options.role && options.resolveRole) {
      throw new Error('PostgreSQL role and role resolver are mutually exclusive');
    }
    const resolvedRole = options.resolveRole
      ? await options.resolveRole(database)
      : options.role;
    const role = resolvedRole
      ? validatePostgreSqlRole(
        typeof resolvedRole === 'string' ? resolvedRole : resolvedRole.role
      )
      : undefined;
    if (role) {
      if (!options.resolveRole && !options.allowedRoles?.has(role)) {
        throw new Error(`PostgreSQL role is not allowlisted: ${role}`);
      }
      await database.execute(`SET LOCAL ROLE ${quoteIdentifier(role, 'PostgreSQL role')}`);
      if (typeof resolvedRole !== 'string') {
        await resolvedRole?.verifyAfterSet?.(database);
      }
    }

    //Only the same settings allowlist is accepted on the local authority.
    for (const [name, value] of Object.entries(options.settings || {})) {
      if (!allowedSettings.has(name)) {
        throw new Error(`PostgreSQL setting is not allowlisted: ${name}`);
      }
      await database.execute('SELECT set_config(?, ?, true)', [name, String(value)]);
    }
    if (options.signal?.aborted) throw new PostgreSqlTransactionCancelledError();

    result = await callback(database);
    if (options.signal?.aborted) throw new PostgreSqlTransactionCancelledError();
    if (options.finalizeBase) {
      if (!role) throw new Error('A PostgreSQL role is required before base-authority finalization');
      await database.execute('RESET ROLE');
      finalResult = await options.finalizeBase(database, result);
    } else {
      finalResult = result as unknown as FinalResult;
    }
    if (options.signal?.aborted) throw new PostgreSqlTransactionCancelledError();
    await database.execute('COMMIT');
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        await database.execute('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        throw new AggregateError(
          [asError(error), asError(rollbackError)],
          'PGlite transaction rollback failed',
          { cause: error }
        );
      }
    }
    throw error;
  }
  return finalResult as FinalResult;
}

/**
 * Preserve the original failure shape when rollback reports a second error.
 */
function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
