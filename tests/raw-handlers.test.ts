import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { RawHttpHandlerRegistry } from '../bootstrap/raw-handlers.js';

test('raw handler registry dispatches exact method and pathname before adaptation', async () => {
  const registry = new RawHttpHandlerRegistry();
  let handled = false;
  registry.register({
    method: 'post',
    path: '/events/import-source',
    handle: () => {
      handled = true;
    }
  });

  const matched = await registry.dispatch(
    {
      method: 'POST',
      url: '/events/import-source?folderId=schema_operations'
    } as unknown as IncomingMessage,
    {} as unknown as ServerResponse
  );
  const missed = await registry.dispatch(
    { method: 'GET', url: '/events/import-source' } as unknown as IncomingMessage,
    {} as unknown as ServerResponse
  );

  assert.equal(matched, true);
  assert.equal(missed, false);
  assert.equal(handled, true);
  assert.deepEqual(registry.routes, ['POST /events/import-source']);
});

test('raw handler registry rejects duplicate and non-path registrations', () => {
  const registry = new RawHttpHandlerRegistry();
  const registration = {
    method: 'POST',
    path: '/events/import-source',
    handle: () => undefined
  };
  registry.register(registration);
  assert.throws(() => registry.register(registration), /already registered/);
  assert.throws(() => registry.register({
    ...registration,
    path: 'events/import-source'
  }), /absolute pathname/);
});
