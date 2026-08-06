//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import {
  CatalogDiscoveryQueue,
  reconciliationRetryDelayMs,
  retryableReconciliation,
  withCatalogReconciliationRetry
} from '../helpers/service.js';

test('catalog discovery serializes reconciliation attempts within one application instance', async () => {
  const queue = new CatalogDiscoveryQueue();
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const first = queue.run(async () => {
    events.push('first:start');
    await firstGate;
    events.push('first:end');
  });
  const second = queue.run(async () => {
    events.push('second:start');
    events.push('second:end');
  });
  await Promise.resolve();
  assert.deepEqual(events, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('catalog reconciliation recovers from wrapped serialization conflicts within its existing bound', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const result = await withCatalogReconciliationRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new AggregateError([
        Object.assign(new Error('serialization conflict'), { code: '40001' })
      ], 'transaction cleanup failed');
    }
    return 'stable catalog';
  }, async (milliseconds) => {
    delays.push(milliseconds);
  });

  assert.equal(result, 'stable catalog');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 250]);
  assert.equal(reconciliationRetryDelayMs(1), 100);
  assert.equal(reconciliationRetryDelayMs(2), 250);
});

test('catalog reconciliation exhausts after three retryable failures and preserves the final error', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const final = Object.assign(new Error('still conflicting'), { code: '40P01' });

  await assert.rejects(
    withCatalogReconciliationRetry(async () => {
      attempts += 1;
      throw attempts === 3
        ? final
        : Object.assign(new Error('unique race'), { code: '23505' });
    }, async (milliseconds) => {
      delays.push(milliseconds);
    }),
    (error: unknown) => error === final
  );
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 250]);
  assert.equal(retryableReconciliation({ cause: final }), true);
  assert.equal(retryableReconciliation(new Error('not retryable')), false);
});
