import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

assert.equal(
  process.env.TABULAR_RELEASE_POSTGRES_DISPOSABLE,
  'task00014-disposable',
  'TABULAR_RELEASE_POSTGRES_DISPOSABLE must authorize the release gate'
);
assert.ok(process.env.TABULAR_RELEASE_POSTGRES_ADMIN_URL);
assert.ok(process.env.TABULAR_ACCEPTANCE_ORIGIN);
assert.ok(process.env.TABULAR_ACCEPTANCE_USERNAME);
assert.ok(process.env.TABULAR_ACCEPTANCE_PASSWORD);

const projectRoot = process.cwd();
const startedAt = new Date();
const outputRoot = path.join(projectRoot, 'output/release/task-00014');
const logRoot = path.join(outputRoot, 'logs');
await fs.mkdir(logRoot, { recursive: true });
const commands: Array<{
  name: string;
  command: string;
  result: 'passed';
  durationMs: number;
  log: string;
}> = [];

await run('verify', 'npm', ['run', 'verify']);
await run('package-release', 'npm', ['run', 'package:release']);
await run(
  'production-install',
  'npm',
  ['ci', '--omit=dev', '--ignore-scripts'],
  path.join(projectRoot, '.build/release-package')
);
await run('finalize-package-manifest', 'npm', ['run', 'package:release:finalize']);
await run('postgresql18-matrix', 'npm', ['run', 'test:postgres:all']);
await run('process-lifecycle', 'npm', ['run', 'test:release:lifecycle']);
await run('postgresql-resilience', 'npm', ['run', 'test:release:resilience']);
await run('browser-acceptance', 'npm', ['run', 'verify:release:browser']);
delete process.env.TABULAR_ACCEPTANCE_PASSWORD;
await run(
  'production-audit',
  'npm',
  ['audit', '--omit=dev'],
  path.join(projectRoot, '.build/release-package')
);
await run('full-audit', 'npm', ['run', 'audit:full']);

const evidenceNames = [
  'postgresql-crash-recovery.json',
  'physical-backup-restore.json',
  'multi-instance-runtime.json'
];
const evidence = await Promise.all(evidenceNames.map(async (name) => {
  const file = path.join(outputRoot, name);
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as {
    task: string;
    result: string;
    generatedAt: string;
  };
  assert.equal(parsed.task, '00014', `${name} has the wrong task`);
  assert.equal(parsed.result, 'passed', `${name} did not pass`);
  const generatedAt = new Date(parsed.generatedAt);
  assert.ok(Number.isFinite(generatedAt.getTime()), `${name} has an invalid timestamp`);
  assert.ok(
    generatedAt.getTime() >= startedAt.getTime() - 24 * 60 * 60_000,
    `${name} is stale`
  );
  const body = await fs.readFile(file);
  return {
    file: path.relative(projectRoot, file),
    sha256: crypto.createHash('sha256').update(body).digest('hex')
  };
}));
const releasePackage = await auditReleasePackage(
  path.join(projectRoot, '.build/release-package')
);

const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: projectRoot,
  encoding: 'utf8'
});
const status = spawnSync('git', ['status', '--porcelain=v1'], {
  cwd: projectRoot,
  encoding: 'utf8'
});
const manifest = {
  schemaVersion: 1,
  task: '00014',
  result: 'passed',
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    postgresqlTarget: 'disposable-local-postgresql-18',
    secretsRetained: false
  },
  source: {
    revision: revision.status === 0 ? revision.stdout.trim() : 'unavailable',
    worktreeClean: status.status === 0 && status.stdout.length === 0,
    cleanCheckoutProof: false,
    isolatedProductionPackage: true,
    note: 'Commit/stage/branch actions were outside the authorized task boundary.'
  },
  commands,
  evidence,
  releasePackage,
  knownDeploymentInputs: [
    'live Google OAuth sandbox credentials',
    'hosting and TLS termination',
    'secret manager and alert destinations',
    'backup owner and accepted RPO/RTO'
  ]
};
await fs.writeFile(
  path.join(outputRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { mode: 0o600 }
);
process.stdout.write(`${JSON.stringify({
  result: 'passed',
  commands: commands.length,
  evidence: evidence.length,
  manifest: path.relative(projectRoot, path.join(outputRoot, 'manifest.json'))
}, null, 2)}\n`);

async function run(name: string, executable: string, args: string[], cwd = projectRoot) {
  const commandStartedAt = Date.now();
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      const safe = sanitize(`${stdout}\n${stderr}`);
      void fs.writeFile(path.join(logRoot, `${name}.log`), safe, { mode: 0o600 })
        .then(() => {
          if (code === 0) resolve({ stdout, stderr });
          else reject(new Error(`${name} failed with ${code ?? signal}; see its redacted log`));
        }, reject);
    });
  });
  void result;
  commands.push({
    name,
    command: `${executable} ${args.join(' ')}`,
    result: 'passed',
    durationMs: Date.now() - commandStartedAt,
    log: path.relative(projectRoot, path.join(logRoot, `${name}.log`))
  });
  process.stdout.write(`${JSON.stringify({ event: 'release_check_passed', name })}\n`);
}

async function auditReleasePackage(packageRoot: string) {
  const manifestFile = path.join(packageRoot, 'release-manifest.json');
  const manifestBody = await fs.readFile(manifestFile);
  const packageManifest = JSON.parse(manifestBody.toString('utf8')) as {
    installedProductionDependencies: boolean;
    coverage: string;
    files: Array<{ file: string; bytes: number; sha256: string }>;
  };
  assert.equal(packageManifest.installedProductionDependencies, true);
  assert.equal(
    packageManifest.coverage,
    'all packaged files except release-manifest.json itself'
  );
  assert.ok(packageManifest.files.some(({ file }) => file.startsWith('node_modules/')));
  for (const artifact of packageManifest.files) {
    const absolute = path.resolve(packageRoot, artifact.file);
    const relative = path.relative(packageRoot, absolute);
    assert.ok(
      relative && !relative.startsWith('..') && !path.isAbsolute(relative),
      `Packaged artifact escapes the release root: ${artifact.file}`
    );
    const body = await fs.readFile(absolute);
    assert.equal(body.byteLength, artifact.bytes, `Packaged artifact size drift: ${artifact.file}`);
    assert.equal(
      crypto.createHash('sha256').update(body).digest('hex'),
      artifact.sha256,
      `Packaged artifact hash drift: ${artifact.file}`
    );
  }
  return {
    root: path.relative(projectRoot, packageRoot),
    manifest: path.relative(projectRoot, manifestFile),
    manifestSha256: crypto.createHash('sha256').update(manifestBody).digest('hex'),
    filesVerified: packageManifest.files.length,
    productionDependencyFiles: packageManifest.files.filter(
      ({ file }) => file.startsWith('node_modules/')
    ).length,
    selfReferentialManifestExcluded: true
  };
}

function sanitize(value: string) {
  let sanitized = value
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://[redacted]')
    .replace(/\b(TABULAR_GOOGLE_CLIENT_SECRET|TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY)=\S+/g,
      '$1=[redacted]');
  for (const secret of [process.env.TABULAR_ACCEPTANCE_PASSWORD]) {
    if (secret) sanitized = sanitized.replaceAll(secret, '[redacted]');
  }
  return sanitized;
}
