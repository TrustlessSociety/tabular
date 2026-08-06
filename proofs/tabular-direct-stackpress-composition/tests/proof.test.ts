import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createProofRuntime } from '../src/bootstrap.js';

function cookieValue(setCookie: string | null) {
  return setCookie?.split(';', 1)[0] || '';
}

function sessionId(cookie: string) {
  return cookie.split('=', 2)[1] || '';
}

function bootstrapProps(html: string) {
  const match = html.match(/<script id="props" type="text\/json">(.*?)<\/script>/s);
  assert.ok(match, 'Reactus hydration props should be present');
  return JSON.parse(match[1]);
}

test('P-001 direct-library composition signals', async () => {
  const cwd = process.cwd();
  const packageJson = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(cwd, 'package-lock.json'), 'utf8'));
  assert.equal(packageJson.dependencies.stackpress, undefined);
  assert.equal(lock.packages['node_modules/stackpress'], undefined);
  await Promise.all([
    import('@stackpress/ingest/http'),
    import('@stackpress/inquire'),
    import('@stackpress/inquire-pglite'),
    import('@stackpress/lib/EventEmitter'),
    import('reactus')
  ]);

  const runtime = await createProofRuntime({ cwd });
  const signals: Record<string, boolean> = {
    directPackageGraph: true,
    explicitBootstrap: true,
    sessionRotation: false,
    csrfDenial: false,
    reactusBuildAndHydration: false,
    transactionalCapability: false,
    independentMcpAdapter: false,
    rollback: false,
    renderContainment: false,
    resourceCleanup: false
  };

  try {
    assert.equal(await runtime.database.migrationCount(), 1);

    const anonymous = await fetch(`${runtime.origin}/proof`);
    assert.equal(anonymous.status, 200);
    const anonymousHtml = await anonymous.text();
    assert.match(anonymousHtml, /Sign in to proof/);
    assert.match(anonymousHtml, /\/client\/[A-Za-z0-9-]+\.js/);

    const deniedOrigin = await fetch(`${runtime.origin}/proof/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://attacker.example'
      },
      body: 'credential=proof-secret'
    });
    assert.equal(deniedOrigin.status, 403);

    const loginOne = await fetch(`${runtime.origin}/proof/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: runtime.origin
      },
      body: 'credential=proof-secret'
    });
    assert.equal(loginOne.status, 200);
    const firstSetCookie = loginOne.headers.get('set-cookie');
    assert.match(firstSetCookie || '', /HttpOnly/);
    assert.match(firstSetCookie || '', /SameSite=Strict/);
    assert.doesNotMatch(firstSetCookie || '', /Secure/);
    const firstCookie = cookieValue(firstSetCookie);

    const loginTwo = await fetch(`${runtime.origin}/proof/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: firstCookie,
        Origin: runtime.origin
      },
      body: 'credential=proof-secret'
    });
    const secondCookie = cookieValue(loginTwo.headers.get('set-cookie'));
    assert.notEqual(secondCookie, firstCookie);
    assert.equal(await runtime.database.findSession(sessionId(firstCookie)), undefined);
    signals.sessionRotation = true;

    const page = await fetch(`${runtime.origin}/proof`, {
      headers: { Cookie: secondCookie }
    });
    const html = await page.text();
    const props = bootstrapProps(html);
    assert.equal(props.authenticated, true);
    assert.match(props.csrfToken, /^[a-f0-9]{64}$/);
    const clientPath = html.match(/src="(\/client\/[A-Za-z0-9-]+\.js)"/)?.[1];
    const stylePath = html.match(/href="(\/assets\/[A-Za-z0-9-]+\.css)"/)?.[1];
    assert.ok(clientPath);
    assert.ok(stylePath);
    assert.equal((await fetch(`${runtime.origin}${clientPath}`)).status, 200);
    assert.equal((await fetch(`${runtime.origin}${stylePath}`)).status, 200);
    signals.reactusBuildAndHydration = true;

    const before = await runtime.database.readRecord(1);
    const deniedCsrf = await fetch(`${runtime.origin}/proof/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: secondCookie,
        Origin: runtime.origin,
        'X-CSRF-Token': 'invalid'
      },
      body: JSON.stringify({ id: 1, name: 'Denied', expectedVersion: before.version })
    });
    assert.equal(deniedCsrf.status, 403);
    assert.deepEqual(await runtime.database.readRecord(1), before);
    signals.csrfDenial = true;

    const renamed = await fetch(`${runtime.origin}/proof/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: secondCookie,
        Origin: runtime.origin,
        'X-CSRF-Token': props.csrfToken
      },
      body: JSON.stringify({
        id: 1,
        name: 'Plan </script> remains JSON data',
        expectedVersion: before.version
      })
    });
    assert.equal(renamed.status, 200);
    const renamedRecord = await renamed.json();
    assert.equal(renamedRecord.version, before.version + 1);
    assert.equal((await runtime.database.readRecord(1)).name, 'Plan </script> remains JSON data');
    signals.transactionalCapability = true;

    const stale = await fetch(`${runtime.origin}/proof/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: secondCookie,
        Origin: runtime.origin,
        'X-CSRF-Token': props.csrfToken
      },
      body: JSON.stringify({ id: 1, name: 'Stale', expectedVersion: before.version })
    });
    assert.equal(stale.status, 409);

    await assert.rejects(() => runtime.capability.execute({
      subject: 'alice',
      databaseRole: 'tabular_member',
      sessionId: sessionId(secondCookie),
      csrfToken: props.csrfToken
    }, {
      action: 'record.rename',
      id: 1,
      name: 'Must roll back',
      expectedVersion: renamedRecord.version,
      forceFailure: true
    }), /Forced rollback/);
    assert.equal((await runtime.database.readRecord(1)).name, 'Plan </script> remains JSON data');
    signals.rollback = true;

    const mcp = await fetch(`${runtime.origin}/proof/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Proof alice',
        'Content-Type': 'application/json',
        'X-Proof-Role': 'tabular_member'
      },
      body: JSON.stringify({
        id: 1,
        name: 'MCP Plan',
        expectedVersion: renamedRecord.version
      })
    });
    assert.equal(mcp.status, 200);
    assert.equal((await mcp.json()).name, 'MCP Plan');
    signals.independentMcpAdapter = true;

    const renderError = await fetch(`${runtime.origin}/proof/render-error`);
    assert.equal(renderError.status, 500);
    assert.match(await renderError.text(), /Render boundary contained/);
    signals.renderContainment = true;

    const logout = await fetch(`${runtime.origin}/proof/logout`, {
      method: 'POST',
      headers: {
        Cookie: secondCookie,
        Origin: runtime.origin,
        'X-CSRF-Token': props.csrfToken
      }
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie') || '', /Expires=Thu, 01 Jan 1970/);
    assert.equal(await runtime.database.findSession(sessionId(secondCookie)), undefined);
  } finally {
    await runtime.close();
  }

  await assert.rejects(() => fetch(`${runtime.origin}/proof`));
  signals.resourceCleanup = true;
  assert.ok(Object.values(signals).every(Boolean));

  await fs.writeFile(path.join(cwd, 'results.json'), `${JSON.stringify({
    proof: 'P-001-direct-library-composition',
    result: 'proved-with-explicit-boundaries',
    runtime: { node: process.version },
    signals,
    boundaries: {
      identity: 'provider-neutral proof double, not live authentication',
      session: 'PGlite-backed durable contract for proof lifetime',
      secureCookie: 'required in production; omitted on local HTTP proof',
      hydrationProps: 'allowlisted shell bootstrap only; user data travels through JSON actions',
      database: 'PGlite programming evidence, not PostgreSQL server evidence'
    }
  }, null, 2)}\n`);
});
