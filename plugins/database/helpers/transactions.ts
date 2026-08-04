import PGConnection from '@stackpress/inquire-pg/Connection';
import type { PoolClient } from 'pg';
import { DatabaseExecutor } from './executor.js';
import { quoteIdentifier, validateIdentifier } from './identifiers.js';

const allowedSettings = new Set([
  'statement_timeout',
  'lock_timeout',
  'idle_in_transaction_session_timeout'
]);

export type PostgreSqlTransactionOptions<Result = unknown, FinalResult = Result> = {
  isolation?: 'repeatable read';
  role?: string;
  resolveRole?: (database: DatabaseExecutor) => Promise<string | ResolvedPostgreSqlRole>;
  finalizeBase?: (database: DatabaseExecutor, result: Result) => Promise<FinalResult>;
  allowedRoles?: ReadonlySet<string>;
  settings?: Partial<Record<
    'statement_timeout' | 'lock_timeout' | 'idle_in_transaction_session_timeout',
    string
  >>;
  signal?: AbortSignal;
};

export type ResolvedPostgreSqlRole = {
  role: string;
  verifyAfterSet?: (database: DatabaseExecutor) => Promise<void>;
};

export type PostgreSqlPoolOwner = {
  checkout(): Promise<PoolClient>;
  release(client: PoolClient, error?: Error): void;
  cancel?(client: PoolClient): Promise<void>;
};

export class PostgreSqlTransactionCancelledError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The PostgreSQL transaction was cancelled', options);
    this.name = 'PostgreSqlTransactionCancelledError';
  }
}

type SessionState = {
  current_user: string;
  session_user: string;
  statement_timeout: string;
  lock_timeout: string;
  idle_in_transaction_session_timeout: string;
};

export async function withPostgreSqlTransaction<Result, FinalResult = Result>(
  pool: PostgreSqlPoolOwner,
  options: PostgreSqlTransactionOptions<Result, FinalResult>,
  callback: (database: DatabaseExecutor) => Promise<Result>
): Promise<FinalResult> {
  if (options.signal?.aborted) throw new PostgreSqlTransactionCancelledError();
  const client = await checkoutWithSignal(pool, options.signal);
  const database = new DatabaseExecutor(new PGConnection(client));
  let primaryError: unknown;
  let result: Result | undefined;
  let finalResult: FinalResult | undefined;
  const cleanupErrors: Error[] = [];
  let reusable = false;
  let committed = false;
  let transactionOpen = false;
  let baseline: SessionState | undefined;
  let unverifiedPreparationFailure = false;
  let cancellationRequested = false;
  let cancellationPromise: Promise<void> | undefined;
  let cancellationFailed = false;
  const requestCancellation = () => {
    if (committed || cancellationRequested) return;
    cancellationRequested = true;
    cancellationPromise = pool.cancel
      ? pool.cancel(client).catch((error) => {
        cancellationFailed = true;
        cleanupErrors.push(asError(error, 'PostgreSQL backend cancellation failed'));
      })
      : Promise.resolve().then(() => {
        cancellationFailed = true;
        cleanupErrors.push(new Error('PostgreSQL pool does not support backend cancellation'));
      });
  };
  const throwIfCancelled = () => {
    if (cancellationRequested || options.signal?.aborted) {
      throw new PostgreSqlTransactionCancelledError();
    }
  };
  options.signal?.addEventListener('abort', requestCancellation, { once: true });
  if (options.signal?.aborted) requestCancellation();

  try {
    baseline = await resetAndReadState(database);
    assertCleanState(baseline);
    throwIfCancelled();
    await database.execute(options.isolation === 'repeatable read'
      ? 'BEGIN ISOLATION LEVEL REPEATABLE READ'
      : 'BEGIN');
    transactionOpen = true;
    throwIfCancelled();
    if (options.role && options.resolveRole) {
      throw new Error('PostgreSQL role and role resolver are mutually exclusive');
    }
    const resolvedRole = options.resolveRole
      ? await options.resolveRole(database)
      : options.role;
    throwIfCancelled();
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
    for (const [name, value] of Object.entries(options.settings || {})) {
      if (!allowedSettings.has(name)) throw new Error(`PostgreSQL setting is not allowlisted: ${name}`);
      await database.execute("SELECT set_config(?, ?, true)", [name, String(value)]);
    }
    throwIfCancelled();
    result = await callback(database);
    throwIfCancelled();
    if (options.finalizeBase) {
      if (!role) {
        throw new Error('A PostgreSQL role is required before base-authority finalization');
      }
      await database.execute('RESET ROLE');
      const baseState = await readState(database);
      assertCleanState(baseState);
      finalResult = await options.finalizeBase(database, result as Result);
    } else {
      finalResult = result as unknown as FinalResult;
    }
    throwIfCancelled();
    await database.execute('COMMIT');
    committed = true;
    transactionOpen = false;
  } catch (error) {
    const cancelled = cancellationRequested || options.signal?.aborted;
    unverifiedPreparationFailure = !cancelled && (!baseline || !transactionOpen);
    primaryError = cancelled
      ? new PostgreSqlTransactionCancelledError({ cause: error })
      : error;
  }

  options.signal?.removeEventListener('abort', requestCancellation);
  await cancellationPromise;

  if (transactionOpen) {
    try {
      await database.execute('ROLLBACK');
      transactionOpen = false;
    } catch (rollbackError) {
      cleanupErrors.push(asError(rollbackError, 'PostgreSQL rollback failed'));
    }
  }
  try {
    const cleaned = await resetAndReadState(database);
    if (baseline) assertStateMatches(cleaned, baseline);
    else assertCleanState(cleaned);
    reusable = !cancellationFailed && !unverifiedPreparationFailure;
  } catch (error) {
    cleanupErrors.push(asError(error, 'PostgreSQL cleanup verification failed'));
  }

  if (!reusable) {
    if (!cleanupErrors.length) {
      cleanupErrors.push(new Error('PostgreSQL client safety was not verified'));
    }
    const combined = primaryError
      ? [asError(primaryError, 'PostgreSQL transaction failed'), ...cleanupErrors]
      : cleanupErrors;
    const aggregate = new AggregateError(combined, 'PostgreSQL transaction cleanup failed', {
      cause: primaryError
    });
    pool.release(client, aggregate);
    throw aggregate;
  }
  pool.release(client);
  if (primaryError) throw primaryError;
  return finalResult as FinalResult;
}

function checkoutWithSignal(pool: PostgreSqlPoolOwner, signal?: AbortSignal) {
  if (!signal) return pool.checkout();
  if (signal.aborted) return Promise.reject(new PostgreSqlTransactionCancelledError());
  return new Promise<PoolClient>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(new PostgreSqlTransactionCancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void pool.checkout().then((client) => {
      if (settled) {
        pool.release(client);
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve(client);
    }, (error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      reject(signal.aborted ? new PostgreSqlTransactionCancelledError({ cause: error }) : error);
    });
  });
}

async function resetAndReadState(database: DatabaseExecutor) {
  await database.execute('RESET ROLE');
  await database.execute('RESET ALL');
  return readState(database);
}

async function readState(database: DatabaseExecutor) {
  const state = await database.execute<SessionState>(`
    SELECT current_user,
           session_user,
           current_setting('statement_timeout') AS statement_timeout,
           current_setting('lock_timeout') AS lock_timeout,
           current_setting('idle_in_transaction_session_timeout') AS idle_in_transaction_session_timeout
  `);
  if (!state.rows[0]) throw new Error('PostgreSQL session state was unavailable');
  return state.rows[0];
}

function assertCleanState(state: SessionState) {
  if (state.current_user !== state.session_user) {
    throw new Error(`Unsafe PostgreSQL role state before transaction: ${state.current_user}`);
  }
}

function assertStateMatches(state: SessionState, baseline: SessionState) {
  assertCleanState(state);
  for (const setting of allowedSettings) {
    if (state[setting as keyof SessionState] !== baseline[setting as keyof SessionState]) {
      throw new Error(`PostgreSQL setting ${setting} leaked across pool reuse`);
    }
  }
}

function asError(error: unknown, fallback: string) {
  return error instanceof Error ? error : new Error(fallback);
}

export function validatePostgreSqlRole(role: string) {
  return validateIdentifier(role, 'PostgreSQL role');
}
