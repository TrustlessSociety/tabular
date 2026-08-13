//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { startWeb } from '../../src/bootstrap/application.js';
import { ApplicationError, mapError } from '../../src/bootstrap/errors.js';

test('structured errors hide unexpected internals', () => {
  //owned application errors may expose their stable code and safe message
  assert.deepEqual(mapError(new ApplicationError('invalid', 400, 'Invalid input')), {
    statusCode: 400,
    payload: { error: { code: 'invalid', message: 'Invalid input', requestId: undefined } }
  });

  //unexpected failures collapse to the generic internal message
  assert.equal(mapError(new Error('secret failure')).payload.error.message, 'The request could not be completed');
});

test('unexpected route diagnostics never serialize exception content', async () => {
  //inspect the source boundary that logs and sanitizes framework route errors
  const source = await import('node:fs/promises').then((fs) => (
    fs.readFile(new URL('../../src/bootstrap/application.ts', import.meta.url), 'utf8')
  ));

  //diagnostics may record error presence but never serialize the exception
  assert.match(source, /route_request_failed/);
  assert.match(source, /errorPresent: Boolean\(res\.error\)/);
  assert.doesNotMatch(source, /error:\s*(?:String\()?res\.error/);
});

test('source runtime serves health, readiness, Reactus, and releases the listener', async () => {
  //start the real source runtime on an ephemeral local port
  const runtime = await startWeb({
    env: { NODE_ENV: 'test', TABULAR_SHUTDOWN_TIMEOUT_MS: '500' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd(),
    port: 0
  });
  try {
    //add one owned and one unexpected failure route at the highest priority
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

    //prove infrastructure endpoints are live before exercising protected pages
    assert.equal((await fetch(`${runtime.origin}/healthz`)).status, 200);
    assert.equal((await fetch(`${runtime.origin}/readyz`)).status, 200);

    //every protected product route redirects a signed-out browser to login
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

    //the normal public login route remains visibly reachable
    const login = await fetch(`${runtime.origin}/auth/login`);
    assert.equal(login.status, 200);
    assert.match(login.headers.get('content-security-policy') || '', /style-src 'self'/);
    const loginHtml = await login.text();
    assert.match(loginHtml, /Sign in to Tabular/);
    const stylesheetHrefs = [...loginHtml.matchAll(/href="([^\"]+\.css(?:\?v=[a-f0-9]{16})?)"/g)].map(match => match[1]);
    assert.ok(stylesheetHrefs.length > 0);
    const stylesheets: string[] = [];
    for (const stylesheetHref of stylesheetHrefs) {
      const stylesheet = await fetch(`${runtime.origin}${stylesheetHref}`);
      assert.equal(stylesheet.status, 200);
      assert.match(stylesheet.headers.get('content-type') || '', /text\/css/);
      stylesheets.push(await stylesheet.text());
    }
    assert.ok(stylesheets.some(stylesheet => /\.auth-card/.test(stylesheet)));
    //owned failures preserve their public contract
    const invalid = await fetch(`${runtime.origin}/__test/invalid`);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      error: { code: 'invalid', message: 'Invalid input' }
    });

    //unexpected failures discard the sentinel and any later leaking handler
    const failed = await fetch(`${runtime.origin}/__test/throw`);
    assert.equal(failed.status, 500);
    const body = await failed.text();
    assert.deepEqual(JSON.parse(body), {
      error: { code: 'internal_error', message: 'The request could not be completed' }
    });
    assert.doesNotMatch(body, /TOP_SECRET_SENTINEL|LEAK_ATTEMPT|stack/);

    //the bounded adapter rejects a body that crosses the configured byte cap
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
    //close even after an assertion failure so the test never leaks a listener
    await runtime.close();
  }

  //the released port must no longer answer the health endpoint
  await assert.rejects(() => fetch(`${runtime.origin}/healthz`));
});
