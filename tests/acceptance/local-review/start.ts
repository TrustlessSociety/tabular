//node
import fs from 'node:fs/promises';
import path from 'node:path';

//client
import {
  LOCAL_REVIEW_PATHS,
  assertDisposableContainer,
  inspectContainer,
  localReviewEnvironment,
  localReviewOrigin,
  pause,
  processIsRunning,
  readProcessState,
  reviewBindHost,
  sourceRuntime,
  startDetached,
  stopProcesses,
  writeProcessState,
  type LocalReviewProcess
} from './common.js';

const projectRoot = process.cwd();
const processes: LocalReviewProcess[] = [];

const container = assertDisposableContainer(inspectContainer());
if (!container.State?.Running) {
  throw new Error(
    'The tmpfs-backed review database stopped and cannot be resumed; run npm run local-review:setup'
  );
}
await rejectExistingProcesses();
await assertSourceEntrypoints();

try {
  await truncateLogs();
  const environment = localReviewEnvironment();

  // Worker and continuous DDL migrator remain independent, non-HTTP authorities.
  processes.push(await startDetached(
    'worker',
    entrypoint('worker'),
    [],
    environment
  ));
  await writeProcessState(processes);
  processes.push(await startDetached(
    'migrator',
    entrypoint('migrate'),
    ['--consume-operations'],
    environment
  ));
  await writeProcessState(processes);

  // Start the ordinary application origin last so readiness covers every migration.
  processes.push(await startDetached(
    'web',
    entrypoint('web'),
    ['--host', reviewBindHost(), '--port', '3000'],
    environment
  ));
  await writeProcessState(processes);

  await Promise.all([
    waitForEvent(processes.find((item) => item.name === 'worker')!, 'worker_ready'),
    waitForEvent(
      processes.find((item) => item.name === 'migrator')!,
      'migrator_operations_started'
    ),
    waitForEvent(processes.find((item) => item.name === 'web')!, 'web_listening'),
    waitForReadiness()
  ]);
  await assertNoLoaderDeprecation();

  process.stdout.write(`${JSON.stringify({
    result: 'running',
    origin: localReviewOrigin(),
    username: 'tabular_reviewer',
    password: 'review-local-only-2026',
    processes: processes.map(({ name, pid, log }) => ({ name, pid, log })),
    shutdown: 'npm run local-review:shutdown',
    cleanup: 'npm run local-review:cleanup'
  }, null, 2)}\n`);
} catch (error) {
  await stopProcesses(processes).catch(() => undefined);
  await fs.unlink(LOCAL_REVIEW_PATHS.processes).catch(() => undefined);
  throw error;
}

/** Returns one absolute checked-in TypeScript entrypoint path. */
function entrypoint(name: 'web' | 'worker' | 'migrate') {
  return sourceRuntime(name).entrypoint;
}

/** Refuses a second coordinator while tolerating a fully stopped prior state. */
async function rejectExistingProcesses() {
  const existing = await readProcessState();
  if (!existing) return;
  const running = existing.processes.filter((record) => processIsRunning(record.pid));
  if (running.length) {
    throw new Error(
      `Local review is already running: ${running.map((record) => record.name).join(', ')}`
    );
  }
  await fs.unlink(LOCAL_REVIEW_PATHS.processes);
}

/** Confirms every source entrypoint exists before any process starts. */
async function assertSourceEntrypoints() {
  for (const name of ['web', 'worker', 'migrate'] as const) {
    const stat = await fs.stat(entrypoint(name)).catch(() => undefined);
    if (!stat?.isFile()) {
      throw new Error('Source entrypoints are missing from scripts/runtime');
    }
  }
}

/** Clears only the three fixed local-review logs so readiness cannot use stale output. */
async function truncateLogs() {
  await fs.mkdir(LOCAL_REVIEW_PATHS.logs, { recursive: true, mode: 0o700 });
  for (const name of ['web', 'worker', 'migrator']) {
    await fs.writeFile(path.join(LOCAL_REVIEW_PATHS.logs, `${name}.log`), '', {
      mode: 0o600
    });
  }
}

/** Waits at most 20 seconds for one structured process event in its fresh log. */
async function waitForEvent(record: LocalReviewProcess, event: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (!processIsRunning(record.pid)) {
      const diagnostic = await fs.readFile(record.log, 'utf8').catch(() => '');
      throw new Error(`${record.name} exited before ${event}: ${diagnostic.slice(-800)}`);
    }
    const body = await fs.readFile(record.log, 'utf8').catch(() => '');
    if (body.includes(`"event":"${event}"`)) return;
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${event} from ${record.name}`);
}

/** Waits at most 20 seconds for the normal loopback readiness endpoint. */
async function waitForReadiness() {
  const deadline = Date.now() + 20_000;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${localReviewOrigin()}/readyz`, {
        signal: AbortSignal.timeout(1_000)
      });
      lastStatus = response.status;
      if (response.status === 200) return;
    } catch {
      // The web listener may still be bootstrapping; the deadline remains authoritative.
    }
    await pause(100);
  }
  throw new Error(`Local review readiness timed out with last status ${lastStatus}`);
}

/** Fails the supported launch when the deprecated module.register loader path reappears. */
async function assertNoLoaderDeprecation() {
  for (const record of processes) {
    const body = await fs.readFile(record.log, 'utf8');
    if (/module\.register\(\).*deprecated|--experimental-loader.*deprecated/i.test(body)) {
      throw new Error(`The supported ${record.name} launch emitted a Node loader deprecation`);
    }
  }
}
