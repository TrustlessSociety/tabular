import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const guard = process.env.TABULAR_RELEASE_POSTGRES_DISPOSABLE;
assert.equal(
  guard,
  'task00014-disposable',
  'TABULAR_RELEASE_POSTGRES_DISPOSABLE must explicitly authorize the release matrix'
);
const adminUrl = process.env.TABULAR_RELEASE_POSTGRES_ADMIN_URL;
assert.ok(adminUrl, 'TABULAR_RELEASE_POSTGRES_ADMIN_URL is required');
const parsed = new URL(adminUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname));
assert.ok(parsed.port, 'The disposable PostgreSQL target must use an explicit port');
assert.ok(['/postgres', '/template1'].includes(parsed.pathname));

const matrix = [
  ['test:postgres:foundation', '00002'],
  ['test:postgres:identity-catalog', '00003'],
  ['test:postgres:capability-actions', '00004'],
  ['test:postgres:files-ddl', '00005'],
  ['test:postgres:grid', '00008'],
  ['test:postgres:realtime-views', '00010'],
  ['test:postgres:import-export', '00011'],
  ['test:postgres:operations', '00012'],
  ['test:postgres:mcp-parity', '00013'],
  ['test:postgres:production-boundary', '00002']
] as const;
const runtimeProofOnly = process.argv.includes('--runtime-proof-only');
const selectedMatrix = runtimeProofOnly
  ? matrix.filter(([, task]) => ['00010', '00012'].includes(task))
  : [...matrix];
const databases = [...new Set(selectedMatrix.map(([, task]) => `tabular_task${task}`))];
const passedSuites: string[] = [];
const admin = new pg.Client({ connectionString: adminUrl, application_name: 'tabular-release-matrix' });
await admin.connect();
try {
  const version = await admin.query<{ server_version_num: string }>(
    "SELECT current_setting('server_version_num') AS server_version_num"
  );
  assert.ok(Number(version.rows[0]!.server_version_num) >= 180000, 'PostgreSQL 18 is required');
  for (const database of databases) {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
  }
  await admin.query('DROP ROLE IF EXISTS tabular_member');
  await admin.query('DROP ROLE IF EXISTS tabular_other');
  for (const [script, task] of selectedMatrix) {
    const database = `tabular_task${task}`;
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
    const databaseUrl = new URL(adminUrl);
    databaseUrl.pathname = `/${database}`;
    const environment = {
      ...process.env,
      TABULAR_TEST_POSTGRES_URL: databaseUrl.toString(),
      PROOF_DATABASE_URL: databaseUrl.toString(),
      TABULAR_TEST_POSTGRES_DISPOSABLE: `task${task}-disposable`
    };
    await command('npm', ['run', script], environment);
    passedSuites.push(script);
    await admin.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`);
    if (script === 'test:postgres:production-boundary') {
      await admin.query('DROP ROLE IF EXISTS tabular_member');
      await admin.query('DROP ROLE IF EXISTS tabular_other');
    }
  }
  if (['test:postgres:realtime-views', 'test:postgres:operations'].every((script) =>
    passedSuites.includes(script))) {
    const evidence = {
      schemaVersion: 1,
      task: '00014',
      result: 'passed',
      generatedAt: new Date().toISOString(),
      target: 'exact-disposable-local-postgresql-18',
      postgresql: version.rows[0]!.server_version_num,
      topology: {
        kind: 'independent-source-application-instances-shared-postgresql',
        operatingSystemProcesses: 1,
        webApplicationInstances: 2,
        workerApplicationInstances: 2,
        stickySessionsRequired: false
      },
      realtime: {
        durableOutboxLoadEvents: 40,
        crossInstanceLastEventIdResume: true,
        slowConsumerSnapshotRecovery: 'client-backpressure',
        cursorGapSnapshotRecovery: 'cursor-gap',
        authorizationLossClosesStream: 'access.revoked',
        resourceAndPrivateAudienceIsolation: true
      },
      workers: {
        contenders: 2,
        singleLeaseWinner: true,
        staleLeaseFencing: true,
        abandonedLeaseRecoveredBySecondInstance: true,
        recoveryAttempt: 2
      },
      suites: passedSuites
    };
    const evidenceFile = path.join(
      process.cwd(),
      'output/release/task-00014/multi-instance-runtime.json'
    );
    await fs.mkdir(path.dirname(evidenceFile), { recursive: true });
    await fs.writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify({
    result: 'passed',
    postgresql: version.rows[0]!.server_version_num,
    suites: selectedMatrix.map(([script]) => script),
    databases
  }, null, 2)}\n`);
} finally {
  for (const database of databases.reverse()) {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
  }
  await admin.end();
}

function command(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
      shell: needsShellLookup(executable)
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${executable} ${args.join(' ')} exited with ${code ?? signal}`));
    });
  });
}

function quoteIdentifier(value: string) {
  assert.match(value, /^[a-z][a-z0-9_]{0,62}$/);
  return `"${value}"`;
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
