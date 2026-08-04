import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const projectRoot = process.cwd();
type VerifierChild = ChildProcess & { stdout: Readable; stderr: Readable };

const entrypointPathModule = await import(
  pathToFileURL(path.join(projectRoot, 'dist/bootstrap/entrypoint-paths.js')).href
);
for (const entrypoint of ['web.js', 'migrate.js', 'worker.js']) {
  const resolved = entrypointPathModule.entrypointPaths(
    pathToFileURL(path.join(projectRoot, 'dist/entrypoints', entrypoint)).href
  );
  assert.equal(resolved.projectRoot, projectRoot);
  assert.equal(resolved.runtimeRoot, path.join(projectRoot, 'dist'));
}

function waitForEvent(
  child: VerifierChild,
  event: string,
  timeoutMs = 5_000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          if (record.event === event) {
            clearTimeout(timeout);
            child.stdout.off('data', onData);
            resolve(record);
          }
        } catch {
          // Ignore non-JSON dependency/runtime diagnostics.
        }
      }
    };
    child.stdout.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Process exited with ${code} before ${event}`));
    });
  });
}

function waitForExit(child: VerifierChild, timeoutMs = 5_000) {
  return new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for process exit')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

async function provePortAvailable(port: number) {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', resolve);
  });
  await new Promise<void>((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
}

const web = spawn(process.execPath, [path.join(projectRoot, 'dist/entrypoints/web.js')], {
  cwd: os.tmpdir(),
  env: { ...process.env, NODE_ENV: 'test', PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe']
});
const listening = await waitForEvent(web, 'web_listening');
assert.equal(typeof listening.origin, 'string');
const origin = String(listening.origin);
assert.equal((await fetch(`${origin}/healthz`)).status, 200);
assert.equal((await fetch(`${origin}/readyz`)).status, 200);
const port = Number(new URL(origin).port);
const webExit = waitForExit(web);
web.kill('SIGTERM');
assert.equal(await webExit, 0);
await provePortAvailable(port);

const migration = spawnSync(process.execPath, [path.join(projectRoot, 'dist/entrypoints/migrate.js')], {
  cwd: os.tmpdir(),
  env: { ...process.env, NODE_ENV: 'test' },
  encoding: 'utf8'
});
assert.equal(migration.status, 1, migration.stderr);
assert.match(migration.stdout, /"ownsHttpListener":false/);
assert.match(migration.stderr, /"event":"migrator_authority_missing"/);

const worker = spawnSync(process.execPath, [path.join(projectRoot, 'dist/entrypoints/worker.js')], {
  cwd: os.tmpdir(),
  env: { ...process.env, NODE_ENV: 'test' },
  encoding: 'utf8'
});
assert.equal(worker.status, 1, worker.stderr);
assert.match(worker.stdout, /"ownsHttpListener":false/);
assert.match(worker.stderr, /"event":"worker_authority_missing"/);
await provePortAvailable(port);

const sharedAuthorityEnvironment = {
  ...process.env,
  NODE_ENV: 'production',
  TABULAR_PUBLIC_ORIGIN: 'https://tabular.example',
  TABULAR_DATABASE_CONNECTION_ID: 'production',
  TABULAR_WEB_DATABASE_URL: 'postgresql://shared:one@db.example:5432/tabular',
  TABULAR_WORKER_DATABASE_URL: 'postgresql://shared:two@db.example:5432/tabular',
  TABULAR_MIGRATOR_DATABASE_URL: 'postgresql://migrator:three@db.example:5432/tabular'
};
const rejectedPreflight = spawnSync(
  process.execPath,
  [path.join(projectRoot, 'dist/entrypoints/preflight.js')],
  {
    cwd: os.tmpdir(),
    env: sharedAuthorityEnvironment,
    encoding: 'utf8'
  }
);
assert.equal(rejectedPreflight.status, 1, rejectedPreflight.stderr);
assert.match(rejectedPreflight.stderr, /distinct database users/);

process.stdout.write(JSON.stringify({
  result: 'passed',
  web: 'built-listen-health-ready-sigterm-port-released',
  migrate: 'fail-closed-without-authority-no-http-listener',
  worker: 'fail-closed-without-authority-no-http-listener',
  productionAuthorities: 'deploy-preflight-rejects-shared-credentials'
}, null, 2) + '\n');
