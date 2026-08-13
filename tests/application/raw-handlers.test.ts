//node
import type { IncomingMessage, ServerResponse } from 'node:http';
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { RawHttpHandlerRegistry } from '../../src/bootstrap/raw-handlers.js';

test('raw handler registry dispatches exact method and pathname before adaptation', async () => {
  //register one lowercase method to prove registration normalizes its key
  const registry = new RawHttpHandlerRegistry();
  let handled = false;
  registry.register({
    method: 'post',
    path: '/events/import-source',
    handle: () => {
      handled = true;
    }
  });

  //query state does not change the matching pathname for the POST request
  const matched = await registry.dispatch(
    {
      method: 'POST',
      url: '/events/import-source?folderId=schema_operations'
    } as unknown as IncomingMessage,
    {} as unknown as ServerResponse
  );

  //the same path under another method must remain a registry miss
  const missed = await registry.dispatch(
    { method: 'GET', url: '/events/import-source' } as unknown as IncomingMessage,
    {} as unknown as ServerResponse
  );

  //confirm dispatch, handler execution, and diagnostic route normalization
  assert.equal(matched, true);
  assert.equal(missed, false);
  assert.equal(handled, true);
  assert.deepEqual(registry.routes, ['POST /events/import-source']);
});

test('raw handler registry rejects duplicate and non-path registrations', () => {
  //start from one valid registration shared by both failure probes
  const registry = new RawHttpHandlerRegistry();
  const registration = {
    method: 'POST',
    path: '/events/import-source',
    handle: () => undefined
  };
  registry.register(registration);

  //a second owner cannot replace the same method-path key
  assert.throws(() => registry.register(registration), /already registered/);

  //raw routes accept absolute pathnames only
  assert.throws(() => registry.register({
    ...registration,
    path: 'events/import-source'
  }), /absolute pathname/);
});
