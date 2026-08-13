//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { ApplicationLifecycle } from '../../src/bootstrap/lifecycle.js';
import { RuntimeResources } from '../../src/bootstrap/resources.js';

test('lifecycle drains in-flight work and rejects counter underflow', async () => {
  //admit one request while the ready lifecycle still accepts work
  const lifecycle = new ApplicationLifecycle();
  lifecycle.markReady();
  assert.equal(lifecycle.beginRequest(), true);

  //draining blocks the next request but waits for the admitted request
  lifecycle.beginDrain();
  assert.equal(lifecycle.beginRequest(), false);
  const drained = lifecycle.waitForDrain(100);
  lifecycle.endRequest();
  await drained;

  //a second completion exposes mismatched request accounting
  assert.throws(() => lifecycle.endRequest(), /underflow/);
  lifecycle.markStopped();
});

test('resource cleanup is reverse-order, idempotent, and duplicate-safe', async () => {
  //register a dependent worker after its pool so reverse cleanup is observable
  const resources = new RuntimeResources();
  const order: string[] = [];
  resources.register({ name: 'pool', close: () => { order.push('pool'); } });
  resources.register({ name: 'worker', close: () => { order.push('worker'); } });

  //duplicate names must fail before replacing the existing cleanup callback
  assert.throws(
    () => resources.register({ name: 'worker', close: () => undefined }),
    /already registered/
  );

  //ordinary resources are ready, close in reverse order, and close only once
  assert.equal((await resources.readiness()).ready, true);
  await resources.close();
  await resources.close();
  assert.deepEqual(order, ['worker', 'pool']);
});

test('resource cleanup reports a bounded close timeout', async () => {
  //two never-resolving resources prove the deadline is shared, not sequential
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

  //cleanup aggregates timeout failures while staying within one global budget
  await assert.rejects(
    () => resources.close(200),
    (error: unknown) => error instanceof AggregateError
      && error.errors.some((failure) => /Timed out closing runtime resource/.test(failure.message))
  );

  //a shared deadline finishes near the budget; a per-resource deadline needs
  //twice it, so the midpoint separates them with real headroom on both sides
  assert.ok(Date.now() - startedAt < 300, 'cleanup should share one global timeout budget');
});
