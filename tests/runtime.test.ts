import assert from 'node:assert/strict';
import test from 'node:test';
import { mapError, ApplicationError } from '../bootstrap/errors.js';
import { startWeb } from '../bootstrap/application.js';

test('structured errors hide unexpected internals', () => {
  assert.deepEqual(mapError(new ApplicationError('invalid', 400, 'Invalid input')), {
    statusCode: 400,
    payload: { error: { code: 'invalid', message: 'Invalid input', requestId: undefined } }
  });
  assert.equal(mapError(new Error('secret failure')).payload.error.message, 'The request could not be completed');
});

test('unexpected route diagnostics never serialize exception content', async () => {
  const source = await import('node:fs/promises').then((fs) => (
    fs.readFile(new URL('../bootstrap/application.ts', import.meta.url), 'utf8')
  ));
  assert.match(source, /route_request_failed/);
  assert.match(source, /errorPresent: Boolean\(res\.error\)/);
  assert.doesNotMatch(source, /error:\s*(?:String\()?res\.error/);
});

test('source runtime serves health, readiness, Reactus, and releases the listener', async () => {
  const runtime = await startWeb({
    env: { NODE_ENV: 'test', TABULAR_SHUTDOWN_TIMEOUT_MS: '500' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd(),
    port: 0
  });
  try {
    runtime.app.get('/__test/invalid', () => {
      throw new ApplicationError('invalid', 400, 'Invalid input');
    }, Number.MAX_SAFE_INTEGER);
    runtime.app.get('/__test/throw', () => {
      throw new Error('TOP_SECRET_SENTINEL');
    }, Number.MAX_SAFE_INTEGER);
    runtime.app.on('error', ({ res }) => {
      res.set(
        'application/json; charset=utf-8',
        JSON.stringify({ error: { message: res.error || 'LEAK_ATTEMPT' } }),
        res.code
      );
    });
    assert.equal((await fetch(`${runtime.origin}/healthz`)).status, 200);
    assert.equal((await fetch(`${runtime.origin}/readyz`)).status, 200);
    for (const pathname of [
      '/',
      '/pages/browse.html?folder=operations',
      '/pages/table.html?new=1&folder=operations&table=untitled-file',
      '/pages/import.html?folder=operations'
    ]) {
      const protectedPage = await fetch(`${runtime.origin}${pathname}`, { redirect: 'manual' });
      assert.equal(protectedPage.status, 303);
      assert.equal(protectedPage.headers.get('location'), '/auth/login');
    }
    const login = await fetch(`${runtime.origin}/auth/login`);
    assert.equal(login.status, 200);
    assert.match(await login.text(), /Sign in to Tabular/);
    const invalid = await fetch(`${runtime.origin}/__test/invalid`);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      error: { code: 'invalid', message: 'Invalid input' }
    });
  const failed = await fetch(`${runtime.origin}/__test/throw`);
    assert.equal(failed.status, 500);
    const body = await failed.text();
    assert.deepEqual(JSON.parse(body), {
      error: { code: 'internal_error', message: 'The request could not be completed' }
    });
  assert.doesNotMatch(body, /TOP_SECRET_SENTINEL|LEAK_ATTEMPT|stack/);
  const oversized = await fetch(`${runtime.origin}/auth/logout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(1_048_576) })
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), {
    error: {
      code: 'request_too_large',
      message: 'The request exceeds 1048576 bytes'
    }
  });
  } finally {
    await runtime.close();
  }
  await assert.rejects(() => fetch(`${runtime.origin}/healthz`));
});
