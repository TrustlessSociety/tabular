import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dispatchOperationAction,
  loadActivityOperation,
  loadActivitySnapshot
} from '../events/actions.js';

test('browser activity reads use only the authorized collection and opaque job detail routes', async () => {
  const original = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ status: 'ok', data: { items: [] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;
  try {
    assert.equal((await loadActivitySnapshot()).status, 'ok');
    assert.equal((await loadActivityOperation(`job_${'a'.repeat(32)}`)).status, 'ok');
    assert.deepEqual(requests.map((request) => request.url), [
      '/events/operations',
      `/events/operations?jobId=job_${'a'.repeat(32)}`
    ]);
    assert.equal(requests.every((request) => request.init?.credentials === 'same-origin'), true);
  } finally {
    globalThis.fetch = original;
  }
});

test('browser mutations carry no caller, owner, connection, role, or target authority claims', async () => {
  const original = globalThis.fetch;
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({ status: 'ok', data: { id: `job_${'b'.repeat(32)}` } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;
  try {
    const result = await dispatchOperationAction({
      type: 'operation.retry',
      jobId: `job_${'b'.repeat(32)}`
    }, 'c'.repeat(64));
    assert.equal(result.status, 'ok');
    assert.equal(request?.url, '/events/operations');
    assert.equal(request?.init?.method, 'POST');
    const body = JSON.parse(String(request?.init?.body)) as Record<string, unknown>;
    assert.deepEqual(body, {
      action: { type: 'operation.retry', jobId: `job_${'b'.repeat(32)}` }
    });
    const serialized = JSON.stringify(body);
    for (const forbidden of ['identity', 'actor', 'owner', 'connection', 'role', 'fileId', 'target']) {
      assert.equal(serialized.includes(forbidden), false);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('activity fetch failures retain a bounded recovery message', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
  try {
    const result = await loadActivitySnapshot();
    assert.deepEqual(result, {
      status: 'error',
      error: { code: 'network_failure', message: 'System activity is unavailable.' }
    });
  } finally {
    globalThis.fetch = original;
  }
});
