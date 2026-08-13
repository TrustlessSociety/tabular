//node
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

// The local-review contract is intentionally fixed so the human handoff is exact.
export const LOCAL_REVIEW = Object.freeze({
  guard: 'task00014-local-review-disposable',
  container: 'tabular-task00014-review-pg18',
  containerLabel: 'com.trustless.tabular.disposable',
  image: 'postgres:18',
  host: '127.0.0.1',
  databasePort: 55432,
  webPort: 3000,
  database: 'tabular_review',
  connectionId: 'local_review',
  roles: {
    administrator: 'postgres',
    migrator: 'tabular_review_migrator',
    web: 'tabular_review_web',
    worker: 'tabular_review_worker',
    member: 'tabular_review_member',
    reviewer: 'tabular_reviewer'
  },
  passwords: {
    administrator: 'admin-local-only-2026',
    migrator: 'migrator-local-only-2026',
    web: 'web-local-only-2026',
    worker: 'worker-local-only-2026',
    reviewer: 'review-local-only-2026'
  }
});

// These paths hold generated credentials, process IDs, and local-only logs.
export const LOCAL_REVIEW_PATHS = Object.freeze({
  root: path.resolve('.build/local-review'),
  environment: path.resolve('.build/local-review/runtime.env'),
  processes: path.resolve('.build/local-review/processes.json'),
  logs: path.resolve('.build/local-review/logs')
});

/** Returns the checked-in TypeScript runtime and tsx CLI used by child processes. */
export function sourceRuntime(name: string) {
  return {
    entrypoint: path.resolve('scripts/runtime', `${name}.ts`),
    args: [path.resolve('node_modules/tsx/dist/cli.mjs')]
  };
}

export type LocalReviewAuthority = 'administrator' | 'migrator' | 'web' | 'worker';

export type LocalReviewProcess = {
  name: 'web' | 'worker' | 'migrator';
  pid: number;
  entrypoint: string;
  log: string;
};

export type LocalReviewProcessState = {
  schemaVersion: 1;
  projectRoot: string;
  origin: string;
  startedAt: string;
  processes: LocalReviewProcess[];
};

type DockerInspect = {
  Config?: {
    Image?: string;
    Labels?: Record<string, string>;
  };
  HostConfig?: {
    PortBindings?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
    Tmpfs?: Record<string, string>;
  };
  Mounts?: Array<{ Type?: string; Destination?: string }>;
  State?: { Running?: boolean };
};

/** Builds one exact PostgreSQL URL without keeping credential URLs in source text. */
export function databaseUrl(authority: LocalReviewAuthority) {
  const url = new URL('postgresql://127.0.0.1/');
  url.hostname = LOCAL_REVIEW.host;
  url.port = String(LOCAL_REVIEW.databasePort);
  url.pathname = authority === 'administrator' ? '/postgres' : `/${LOCAL_REVIEW.database}`;
  url.username = LOCAL_REVIEW.roles[authority];
  url.password = LOCAL_REVIEW.passwords[authority];
  return url.toString();
}

/** Returns the non-production runtime environment shared by all review processes. */
export function localReviewEnvironment() {
  return {
    ...process.env,
    NODE_ENV: 'development',
    LOG_LEVEL: 'info',
    TABULAR_INSTANCE_ID: 'local_review',
    TABULAR_PUBLIC_ORIGIN: localReviewOrigin(),
    TABULAR_DATABASE_CONNECTION_ID: LOCAL_REVIEW.connectionId,
    TABULAR_WEB_DATABASE_URL: databaseUrl('web'),
    TABULAR_MIGRATOR_DATABASE_URL: databaseUrl('migrator'),
    TABULAR_WORKER_DATABASE_URL: databaseUrl('worker'),
    TABULAR_DEMO_MEMBER_ROLE: LOCAL_REVIEW.roles.member,
    TABULAR_HOST: reviewBindHost(),
    TABULAR_PORT: String(LOCAL_REVIEW.webPort),
    TABULAR_SHUTDOWN_TIMEOUT_MS: '10000',
    TABULAR_WORKER_SHUTDOWN_TIMEOUT_MS: '10000'
  } as NodeJS.ProcessEnv;
}

/**
 * Returns the web bind address for the review process.
 *
 * `TABULAR_REVIEW_BIND_HOST` lets a reviewer reach the disposable environment
 * across a private network such as Tailscale. It moves only the web listener;
 * every database URL stays on loopback.
 */
export function reviewBindHost() {
  return process.env.TABULAR_REVIEW_BIND_HOST || LOCAL_REVIEW.host;
}

/**
 * Returns the one browser origin exposed by the supported workflow.
 *
 * `TABULAR_REVIEW_PUBLIC_ORIGIN` must match the URL the browser actually uses,
 * or the ordinary-origin checks reject sign-in.
 */
export function localReviewOrigin() {
  return process.env.TABULAR_REVIEW_PUBLIC_ORIGIN
    || `http://${reviewBindHost()}:${LOCAL_REVIEW.webPort}`;
}

/** Requires the destructive command's exact, visible confirmation argument. */
export function requireConfirmation(argument: string) {
  if (!process.argv.includes(argument)) {
    throw new Error(`Local review command requires the explicit ${argument} argument`);
  }
}

/** Runs Docker synchronously and reports a bounded diagnostic on failure. */
export function docker(args: string[], options: { allowFailure?: boolean } = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });
  if (result.error && !options.allowFailure) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const diagnostic = (result.stderr || result.stdout || 'no diagnostic').trim().slice(0, 800);
    throw new Error(`docker ${args[0]} failed: ${diagnostic}`);
  }
  return result;
}

/** Reads the fixed container when it exists, without treating absence as failure. */
export function inspectContainer() {
  const result = docker(['container', 'inspect', LOCAL_REVIEW.container], {
    allowFailure: true
  });
  if (result.status !== 0) return undefined;
  const records = JSON.parse(result.stdout) as DockerInspect[];
  return records[0];
}

/**
 * Proves that cleanup targets only this labeled, loopback-published, tmpfs-backed
 * PostgreSQL 18 container. Any retained or externally reachable target is refused.
 */
export function assertDisposableContainer(container: DockerInspect | undefined) {
  if (!container) throw new Error('The disposable local-review container does not exist');
  if (container.Config?.Image !== LOCAL_REVIEW.image) {
    throw new Error('Refusing cleanup because the local-review container image changed');
  }
  if (container.Config?.Labels?.[LOCAL_REVIEW.containerLabel] !== LOCAL_REVIEW.guard) {
    throw new Error('Refusing cleanup because the disposable container label is absent');
  }
  const bindings = container.HostConfig?.PortBindings?.['5432/tcp'] || [];
  if (
    bindings.length !== 1
    || bindings[0]?.HostIp !== LOCAL_REVIEW.host
    || bindings[0]?.HostPort !== String(LOCAL_REVIEW.databasePort)
  ) {
    throw new Error('Refusing cleanup because PostgreSQL is not bound to the exact loopback port');
  }
  const mounts = container.Mounts || [];
  const retained = mounts.some((mount) =>
    mount.Destination?.startsWith('/var/lib/postgresql') && mount.Type !== 'tmpfs'
  );
  if (retained) {
    throw new Error('Refusing cleanup because the PostgreSQL data directory is retained');
  }
  const declaredTmpfs = container.HostConfig?.Tmpfs || {};
  if (
    !mounts.some((mount) =>
      mount.Destination === '/var/lib/postgresql' && mount.Type === 'tmpfs'
    )
    && typeof declaredTmpfs['/var/lib/postgresql'] !== 'string'
  ) {
    throw new Error('Refusing cleanup because the PostgreSQL 18 tmpfs mount is absent');
  }
  return container;
}

/** Writes a sourceable local environment file with owner-only permissions. */
export async function writeEnvironmentFile() {
  await fsPromises.mkdir(LOCAL_REVIEW_PATHS.root, { recursive: true, mode: 0o700 });
  const environment = localReviewEnvironment();
  const keys = [
    'NODE_ENV',
    'LOG_LEVEL',
    'TABULAR_INSTANCE_ID',
    'TABULAR_PUBLIC_ORIGIN',
    'TABULAR_DATABASE_CONNECTION_ID',
    'TABULAR_WEB_DATABASE_URL',
    'TABULAR_MIGRATOR_DATABASE_URL',
    'TABULAR_WORKER_DATABASE_URL',
    'TABULAR_DEMO_MEMBER_ROLE',
    'TABULAR_HOST',
    'TABULAR_PORT',
    'TABULAR_SHUTDOWN_TIMEOUT_MS',
    'TABULAR_WORKER_SHUTDOWN_TIMEOUT_MS'
  ];
  const body = keys.map((key) => `${key}=${shellQuote(environment[key] || '')}`).join('\n');
  await fsPromises.writeFile(LOCAL_REVIEW_PATHS.environment, `${body}\n`, { mode: 0o600 });
  await fsPromises.chmod(LOCAL_REVIEW_PATHS.environment, 0o600);
}

/** Runs a foreground command with bounded retained output. */
export function runCommand(executable: string, args: string[], env = process.env) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: needsShellLookup(executable)
    });
    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', (chunk) => { stdout = boundedOutput(stdout, String(chunk)); });
    child.stderr!.on('data', (chunk) => { stderr = boundedOutput(stderr, String(chunk)); });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(
        `${executable} ${args[0] || ''} exited with ${code ?? signal}: `
        + `${(stderr || stdout || 'no diagnostic').trim().slice(-1200)}`
      ));
    });
  });
}

/** Starts one detached application process with append-only local logs. */
export async function startDetached(
  name: LocalReviewProcess['name'],
  entrypoint: string,
  args: string[],
  env: NodeJS.ProcessEnv
) {
  await fsPromises.mkdir(LOCAL_REVIEW_PATHS.logs, { recursive: true, mode: 0o700 });
  const log = path.join(LOCAL_REVIEW_PATHS.logs, `${name}.log`);
  const descriptor = fs.openSync(log, 'a', 0o600);
  try {
    const child = spawn(
      process.execPath,
      [path.resolve('node_modules/tsx/dist/cli.mjs'), entrypoint, ...args],
      {
      cwd: process.cwd(),
      env,
      detached: true,
      stdio: ['ignore', descriptor, descriptor]
      }
    );
    await waitForSpawn(child);
    if (!child.pid) throw new Error(`${name} did not receive a process ID`);
    child.unref();
    return { name, pid: child.pid, entrypoint, log } satisfies LocalReviewProcess;
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Reads a previously written process state after validating its local scope. */
export async function readProcessState() {
  const body = await fsPromises.readFile(LOCAL_REVIEW_PATHS.processes, 'utf8')
    .catch(() => undefined);
  if (!body) return undefined;
  const state = JSON.parse(body) as LocalReviewProcessState;
  if (
    state.schemaVersion !== 1
    || path.resolve(state.projectRoot) !== process.cwd()
    || state.origin !== localReviewOrigin()
  ) {
    throw new Error('Refusing to use process state from another project or origin');
  }
  return state;
}

/** Writes process state atomically enough for the single local coordinator. */
export async function writeProcessState(processes: LocalReviewProcess[]) {
  const state: LocalReviewProcessState = {
    schemaVersion: 1,
    projectRoot: process.cwd(),
    origin: localReviewOrigin(),
    startedAt: new Date().toISOString(),
    processes
  };
  await fsPromises.mkdir(LOCAL_REVIEW_PATHS.root, { recursive: true, mode: 0o700 });
  await fsPromises.writeFile(
    LOCAL_REVIEW_PATHS.processes,
    `${JSON.stringify(state, null, 2)}\n`,
    { mode: 0o600 }
  );
}

/** Returns whether a PID still exists. */
export function processIsRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EPERM');
  }
}

/** Refuses a stale/reused PID unless its command still names the recorded entrypoint. */
export function assertOwnedProcess(record: LocalReviewProcess) {
  if (!Number.isSafeInteger(record.pid) || record.pid < 2) {
    throw new Error(`Refusing invalid ${record.name} process ID`);
  }
  if (!processIsRunning(record.pid)) return false;
  //Windows has no ps, so the owning command line comes from the process table
  const result = process.platform === 'win32'
    ? spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${record.pid}").CommandLine`
    ], { encoding: 'utf8' })
    : spawnSync('ps', ['-p', String(record.pid), '-o', 'command='], {
      encoding: 'utf8'
    });
  const expected = path.resolve(record.entrypoint);
  if (result.status !== 0 || !result.stdout.includes(expected)) {
    throw new Error(`Refusing to signal PID ${record.pid}; it is not the recorded ${record.name}`);
  }
  return true;
}

/** Sends SIGTERM and waits only for the configured bounded shutdown window. */
export async function stopProcesses(records: LocalReviewProcess[], timeoutMs = 12_000) {
  const running = records.filter(assertOwnedProcess);
  for (const record of running) process.kill(record.pid, 'SIGTERM');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && running.some((record) => processIsRunning(record.pid))) {
    await pause(100);
  }
  const survivors = running.filter((record) => processIsRunning(record.pid));
  if (survivors.length) {
    throw new Error(
      `Bounded shutdown expired; refusing force-kill for ${survivors.map((item) => item.name).join(', ')}`
    );
  }
}

/** Pauses a bounded async poll without blocking the event loop. */
export function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/** Converts one value into a POSIX-shell-safe single-quoted literal. */
function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Keeps child diagnostics bounded while preserving the newest output. */
function boundedOutput(current: string, chunk: string) {
  return `${current}${chunk}`.slice(-64 * 1024);
}

/** Resolves once a child was spawned or rejects on an immediate launch failure. */
function waitForSpawn(child: ChildProcess) {
  return new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
}

/**
 * Report whether Windows needs a shell to resolve a bare command name.
 *
 * npm resolves through npm.cmd, which Node refuses to spawn without a shell.
 * Absolute paths must not use one: the shell would split them at spaces.
 */
function needsShellLookup(executable: string) {
  return process.platform === 'win32' && !path.isAbsolute(executable);
}
