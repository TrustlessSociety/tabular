//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import type { PoolClient } from 'pg';

//client
import type { PostgreSqlPoolOwner } from '../helpers/transactions.js';
import {
  PostgreSqlTransactionCancelledError,
  withPostgreSqlTransaction
} from '../helpers/transactions.js';

test('preflight or BEGIN failure destroys an unverified PostgreSQL client', async () => {
  let releasedWith: Error | undefined;
  const client = {
    query: async (query: string) => {
      if (query === 'BEGIN') throw new Error('forced begin failure');
      if (query.includes('SELECT current_user')) {
        return {
          rows: [{
            current_user: 'postgres',
            session_user: 'postgres',
            statement_timeout: '0',
            lock_timeout: '0',
            idle_in_transaction_session_timeout: '0'
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: null };
    }
  } as unknown as PoolClient;
  const owner: PostgreSqlPoolOwner = {
    checkout: async () => client,
    release: (released, error) => {
      assert.equal(released, client);
      releasedWith = error;
    }
  };
  await assert.rejects(
    withPostgreSqlTransaction(owner, {}, async () => undefined),
    (error: unknown) => error instanceof AggregateError
      && error.errors.some((failure) => /forced begin failure/.test(failure.message))
  );
  assert.ok(releasedWith, 'unverified client must be destroyed via release(error)');
});

test('mapped-role work finalizes under verified base authority in the same transaction', async () => {
  const events: string[] = [];
  const client = {
    query: async (request: string | { text?: string, }) => {
      const query = typeof request === 'string' ? request : request.text || '';
      events.push(query.trim().replace(/\s+/g, ' '));
      if (query.includes('SELECT current_user')) {
        return {
          rows: [{
            current_user: 'postgres',
            session_user: 'postgres',
            statement_timeout: '0',
            lock_timeout: '0',
            idle_in_transaction_session_timeout: '0'
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: null };
    }
  } as unknown as PoolClient;
  const owner: PostgreSqlPoolOwner = {
    checkout: async () => client,
    release: () => { events.push('release'); }
  };
  const result = await withPostgreSqlTransaction<string, number>(owner, {
    resolveRole: async () => 'tabular_member',
    finalizeBase: async (_database, value) => {
      events.push(`finalize:${value}`);
      return value.length;
    }
  }, async () => {
    events.push('target');
    return 'committed';
  });
  assert.equal(result, 9);
  assert.ok(events.indexOf('SET LOCAL ROLE "tabular_member"') < events.indexOf('target'));
  const resetAfterTarget = events.indexOf('RESET ROLE', events.indexOf('target'));
  assert.ok(resetAfterTarget > events.indexOf('target'));
  assert.ok(events.indexOf('finalize:committed') > resetAfterTarget);
  assert.ok(events.indexOf('COMMIT') > events.indexOf('finalize:committed'));
  assert.equal(events.at(-1), 'release');
});

test('base finalizer failure rolls back mapped-role target work', async () => {
  const events: string[] = [];
  const client = {
    query: async (request: string | { text?: string, }) => {
      const query = typeof request === 'string' ? request : request.text || '';
      events.push(query.trim().replace(/\s+/g, ' '));
      if (query.includes('SELECT current_user')) {
        return {
          rows: [{
            current_user: 'postgres',
            session_user: 'postgres',
            statement_timeout: '0',
            lock_timeout: '0',
            idle_in_transaction_session_timeout: '0'
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: null };
    }
  } as unknown as PoolClient;
  const owner: PostgreSqlPoolOwner = {
    checkout: async () => client,
    release: () => undefined
  };
  await assert.rejects(
    withPostgreSqlTransaction(owner, {
      resolveRole: async () => 'tabular_member',
      finalizeBase: async () => { throw new Error('forced journal failure'); }
    }, async () => {
      events.push('target mutation');
      return true;
    }),
    /forced journal failure/
  );
  assert.ok(events.includes('ROLLBACK'));
  assert.equal(events.includes('COMMIT'), false);
});

test('abort cancels backend work and rolls back before releasing a verified client', async () => {
  const events: string[] = [];
  const controller = new AbortController();
  let releaseWith: Error | undefined;
  let releaseTarget: (() => void) | undefined;
  let enterTarget: (() => void) | undefined;
  const targetGate = new Promise<void>((resolve) => { releaseTarget = resolve; });
  const targetEntered = new Promise<void>((resolve) => { enterTarget = resolve; });
  const client = {
    processID: 123,
    query: async (request: string | { text?: string, }) => {
      const query = typeof request === 'string' ? request : request.text || '';
      events.push(query.trim().replace(/\s+/g, ' '));
      if (query.includes('SELECT current_user')) {
        return {
          rows: [{
            current_user: 'postgres',
            session_user: 'postgres',
            statement_timeout: '0',
            lock_timeout: '0',
            idle_in_transaction_session_timeout: '0'
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: null };
    }
  } as unknown as PoolClient;
  const owner: PostgreSqlPoolOwner = {
    checkout: async () => client,
    cancel: async (target) => {
      assert.equal(target, client);
      events.push('cancel');
      releaseTarget?.();
    },
    release: (_target, error) => {
      releaseWith = error;
      events.push('release');
    }
  };
  const transaction = withPostgreSqlTransaction(owner, {
    signal: controller.signal,
    resolveRole: async () => 'tabular_member'
  }, async () => {
    events.push('target');
    enterTarget?.();
    await targetGate;
    events.push('target-finished');
    return true;
  });
  await targetEntered;
  controller.abort();
  await assert.rejects(
    transaction,
    (error: unknown) => error instanceof PostgreSqlTransactionCancelledError
  );
  assert.ok(events.indexOf('cancel') > events.indexOf('target'));
  assert.ok(events.indexOf('ROLLBACK') > events.indexOf('target-finished'));
  assert.equal(events.includes('COMMIT'), false);
  assert.equal(releaseWith, undefined);
  assert.equal(events.at(-1), 'release');
});

test('abort while queued for checkout returns cancellation and releases the later client', async () => {
  const controller = new AbortController();
  let provideClient: ((client: PoolClient) => void) | undefined;
  let released = false;
  const checkout = new Promise<PoolClient>((resolve) => { provideClient = resolve; });
  const client = {} as PoolClient;
  const owner: PostgreSqlPoolOwner = {
    checkout: () => checkout,
    release: (target) => {
      assert.equal(target, client);
      released = true;
    }
  };
  const transaction = withPostgreSqlTransaction(owner, {
    signal: controller.signal
  }, async () => true);
  controller.abort();
  await assert.rejects(
    transaction,
    (error: unknown) => error instanceof PostgreSqlTransactionCancelledError
  );
  provideClient?.(client);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(released, true);
});
