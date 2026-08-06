//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { OperationHandlerRegistry, operationHandler } from '../helpers/handlers.js';

/**
 * Return the handler result.
 */
const handler = async () => ({ state: 'ok' });

test('operation handler dispatch fails closed on authority and schema version', () => {
  const registry = new OperationHandlerRegistry()
    .register(operationHandler('import.commit', 'worker', handler, 1))
    .register(operationHandler('import.commit', 'worker', handler, 2));
  assert.equal(registry.resolve('import.commit', 'worker', 1)?.version, 1);
  assert.equal(registry.resolve('import.commit', 'worker', 2)?.version, 2);
  assert.equal(registry.resolve('import.commit', 'migrator', 1), undefined);
  assert.equal(registry.resolve('import.commit', 'worker', 3), undefined);
  assert.equal(registry.resolve('import.commit', 'worker', Number.NaN), undefined);
});

test('operation handler registration rejects duplicate kind-version pairs', () => {
  const registry = new OperationHandlerRegistry()
    .register(operationHandler('ddl.apply', 'migrator', handler, 1));
  assert.throws(
    () => registry.register(operationHandler('ddl.apply', 'migrator', handler, 1)),
    /already registered/
  );
  assert.throws(
    () => operationHandler('ddl.apply', 'migrator', handler, 0)
      && registry.register(operationHandler('ddl.apply', 'migrator', handler, 0)),
    /positive integer/
  );
});

test('operation kinds without accepted durable request stores fail closed', () => {
  const registry = new OperationHandlerRegistry()
    .register(operationHandler('import.commit', 'worker', handler, 1))
    .register(operationHandler('maintenance.import-staging', 'worker', handler, 1))
    .register(operationHandler('operations.retention', 'worker', handler, 1));
  assert.equal(registry.resolve('export.csv', 'worker', 1), undefined);
  assert.equal(registry.resolve('draft.promote', 'worker', 1), undefined);
  assert.equal(registry.resolve('row-order.maintenance', 'worker', 1), undefined);
});
