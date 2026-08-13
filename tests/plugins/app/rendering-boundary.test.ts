//node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

//client
import {
  projectBrowserProvider,
  serializeBrowserProjection,
  type BrowserProjectionInput
} from '../../../src/plugins/app/helpers/projection.js';
import { resolveDevelopmentPublicFile } from '../../../src/plugins/app/helpers/assets.js';

test('D-008 hydration projection excludes every denied server field', () => {
  const input = {
    application: { name: 'Tabular', version: '0.1.0' },
    shell: { status: 'ready', title: 'Tabular', density: 'comfortable' },
    request: {
      method: 'GET',
      path: '/pages/table.html',
      route: { surface: 'table', folder: 'operations', table: 'orders' }
    },
    identity: { authenticated: true, displayName: 'Visible operator' },
    capabilities: { canEditCells: true },
    csrf: 'csrf-visible',
    response: { code: 200, status: 'ok' },
    Cookie: 'cookie-secret',
    Authorization: 'Bearer authorization-secret',
    headers: { Cookie: 'cookie-secret' },
    body: 'raw-body-secret',
    form: { password: 'form-secret' },
    opaqueSessionId: 'opaque-session-secret',
    sessionMap: { opaque: 'server-session-secret' },
    password: 'database-password-secret',
    connectionString: 'postgres://database-secret',
    pool: { secret: 'pool-secret' },
    serverConfig: { secret: 'config-secret' },
    responseHeaders: { secret: 'response-header-secret' },
    error: 'internal-error-secret',
    stack: 'internal-stack-secret',
    rows: [{ secret: 'mutable-row-secret' }],
    token: 'opaque-token-secret'
  } as unknown as BrowserProjectionInput;
  const serialized = serializeBrowserProjection(projectBrowserProvider(input));

  const quote = String.fromCharCode(34);
  assert.ok(serialized.includes(`${quote}csrf${quote}:${quote}csrf-visible${quote}`));
  for (const denied of [
    'Cookie', 'Authorization', 'headers', 'body', 'form', 'opaqueSessionId',
    'sessionMap', 'password', 'connectionString', 'pool', 'serverConfig',
    'responseHeaders', 'error', 'stack', 'rows', 'token'
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`${quote}${denied}${quote}`, 'i'));
  }
  for (const secret of [
    'cookie-secret', 'authorization-secret', 'raw-body-secret',
    'database-password-secret', 'mutable-row-secret', 'opaque-token-secret'
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
});

test('development public lookup rejects traversal, absolute, directory, and outside paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-public-root-'));
  const publicRoot = path.join(root, 'public');
  const outside = path.join(root, 'outside.txt');
  try {
    await fs.mkdir(path.join(publicRoot, 'assets'), { recursive: true });
    await fs.writeFile(path.join(publicRoot, 'assets', 'safe.txt'), 'safe');
    await fs.writeFile(outside, 'outside');
    assert.equal(
      (await resolveDevelopmentPublicFile(publicRoot, '/assets/safe.txt')).relative,
      'assets/safe.txt'
    );
    for (const requestPath of [
      '/../outside.txt',
      '/%2e%2e/outside.txt',
      'C:\\outside.txt',
      '/assets'
    ]) {
      await assert.rejects(
        () => resolveDevelopmentPublicFile(publicRoot, requestPath),
        /Development public path/
      );
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('development public lookup rejects a symlink that escapes the real public root', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-public-symlink-'));
  const publicRoot = path.join(root, 'public');
  const outside = path.join(root, 'outside.txt');
  const link = path.join(publicRoot, 'link.txt');
  try {
    await fs.mkdir(publicRoot, { recursive: true });
    await fs.writeFile(outside, 'outside');
    try {
      await fs.symlink(path.relative(publicRoot, outside), link);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error
        && ['EACCES', 'EPERM'].includes(String(error.code))) {
        context.skip('Symlink creation is not permitted in this environment');
        return;
      }
      throw error;
    }
    await assert.rejects(
      () => resolveDevelopmentPublicFile(publicRoot, '/link.txt'),
      /Development public path escapes its root/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
