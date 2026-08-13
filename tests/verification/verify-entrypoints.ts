import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { entrypointPaths } from '../../src/bootstrap/entrypoint-paths.js';
import { PROCESS_PHASES, PROCESS_PHASE_PERMISSIONS } from '../../src/config/phases.js';

const projectRoot = process.cwd();
type VerifierChild = ChildProcess & { stdout: Readable; stderr: Readable };

const tsxCli = path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs');
assert.deepEqual(PROCESS_PHASES.build, ['config', 'route']);
const buildPermissions = PROCESS_PHASE_PERMISSIONS.build as readonly string[];
assert.equal(buildPermissions.includes('listen'), false);
assert.equal(buildPermissions.includes('worker'), false);
assert.equal(buildPermissions.includes('migrate'), false);
for (const entrypoint of [
  'scripts/develop.ts',
  'scripts/runtime/web.ts',
  'scripts/runtime/migrate.ts',
  'scripts/runtime/worker.ts'
]) {
  const resolved = entrypointPaths(
    pathToFileURL(path.join(projectRoot, entrypoint)).href
  );
  assert.equal(resolved.projectRoot, projectRoot);
  assert.equal(resolved.runtimeRoot, projectRoot);
}

function runtimeArgs(name: string, ...args: string[]) {
  return [tsxCli, path.join(projectRoot, 'scripts/runtime', `${name}.ts`), ...args];
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

const web = spawn(process.execPath, runtimeArgs('web'), {
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
const webExitCode = await webExit;
if (process.platform === 'win32') {
  assert.ok(webExitCode === 0 || webExitCode === null);
} else {
  assert.equal(webExitCode, 0);
}
await provePortAvailable(port);

const migration = spawnSync(process.execPath, runtimeArgs('migrate'), {
  cwd: os.tmpdir(),
  env: { ...process.env, NODE_ENV: 'test' },
  encoding: 'utf8'
});
assert.equal(migration.status, 1, migration.stderr);
assert.match(migration.stdout, /"ownsHttpListener":false/);
assert.match(migration.stderr, /"event":"migrator_authority_missing"/);

const worker = spawnSync(process.execPath, runtimeArgs('worker'), {
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
  runtimeArgs('preflight'),
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
  web: 'source-listen-health-ready-sigterm-port-released',
  migrate: 'fail-closed-without-authority-no-http-listener',
  worker: 'fail-closed-without-authority-no-http-listener',
  productionAuthorities: 'deploy-preflight-rejects-shared-credentials'
}, null, 2) + '\n');
