import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationLifecycle } from '../bootstrap/lifecycle.js';
import { RuntimeResources } from '../bootstrap/resources.js';

test('lifecycle drains in-flight work and rejects counter underflow', async () => {
  const lifecycle = new ApplicationLifecycle();
  lifecycle.markReady();
  assert.equal(lifecycle.beginRequest(), true);
  lifecycle.beginDrain();
  assert.equal(lifecycle.beginRequest(), false);
  const drained = lifecycle.waitForDrain(100);
  lifecycle.endRequest();
  await drained;
  assert.throws(() => lifecycle.endRequest(), /underflow/);
  lifecycle.markStopped();
});

test('resource cleanup is reverse-order, idempotent, and duplicate-safe', async () => {
  const resources = new RuntimeResources();
  const order: string[] = [];
  resources.register({ name: 'pool', close: () => { order.push('pool'); } });
  resources.register({ name: 'worker', close: () => { order.push('worker'); } });
  assert.throws(
    () => resources.register({ name: 'worker', close: () => undefined }),
    /already registered/
  );
  assert.equal((await resources.readiness()).ready, true);
  await resources.close();
  await resources.close();
  assert.deepEqual(order, ['worker', 'pool']);
});

test('resource cleanup reports a bounded close timeout', async () => {
  const resources = new RuntimeResources();
  resources.register({
    name: 'stuck-pool',
    close: () => new Promise<void>(() => undefined)
  });
  resources.register({
    name: 'stuck-worker',
    close: () => new Promise<void>(() => undefined)
  });
  const startedAt = Date.now();
  await assert.rejects(
    () => resources.close(50),
    (error: unknown) => error instanceof AggregateError
      && error.errors.some((failure) => /Timed out closing runtime resource/.test(failure.message))
  );
  assert.ok(Date.now() - startedAt < 80, 'cleanup should share one global timeout budget');
});
