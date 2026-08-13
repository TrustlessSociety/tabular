import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const specRoot = path.join(
  projectRoot,
  '.agents/specs/00003-tabular-direct-stackpress-libraries-architecture'
);
const packageJson = JSON.parse(
  await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8')
) as {
  plugins: string[];
  scripts: Record<string, string>;
};

for (const script of [
  'build',
  'package:release',
  'package:release:finalize',
  'lint',
  'preflight',
  'doctor',
  'migrate',
  'seed:demo',
  'start',
  'worker',
  'dev',
  'start:source',
  'local-review:setup',
  'local-review:start',
  'local-review:shutdown',
  'local-review:cleanup',
  'verify',
  'verify:release:browser',
  'verify:release',
  'test:postgres:foundation',
  'test:postgres:identity-catalog',
  'test:postgres:capability-actions',
  'test:postgres:files-ddl',
  'test:postgres:grid',
  'test:postgres:realtime-views',
  'test:postgres:import-export',
  'test:postgres:operations',
  'test:postgres:mcp-parity',
  'test:postgres:production-boundary',
  'test:postgres:all',
  'audit:production'
]) {
  assert.ok(packageJson.scripts[script], `Missing release script ${script}`);
}
assert.equal(
  packageJson.scripts.dev,
  'tsx scripts/develop.ts',
  'The normal development command must use the source development entrypoint'
);
assert.equal(packageJson.scripts['start:source'], 'npm run dev');
for (const script of [
  'local-review:setup',
  'local-review:start',
  'local-review:shutdown',
  'local-review:cleanup'
]) {
  assert.match(
    packageJson.scripts[script]!,
    /^tsx tests\/acceptance\/local-review\/(?:setup|start|shutdown|cleanup)\.ts(?: |$)/,
    `${script} must execute its centralized TypeScript acceptance coordinator`
  );
  assert.doesNotMatch(
    packageJson.scripts[script]!,
    /(?:--loader|--import\s+tsx)(?:\s|$)/,
    `${script} must not enter through a deprecated TypeScript loader hook`
  );
}
for (const script of Object.keys(packageJson.scripts)) {
  assert.doesNotMatch(
    script,
    /^test:postgres:(?:task\d+|p\d+|matrix)$/,
    `PostgreSQL script ${script} must describe its behavior, not its task or proof number`
  );
}

const envExample = await fs.readFile(path.join(projectRoot, '.env.example'), 'utf8');
for (const variable of [
  'NODE_ENV',
  'TABULAR_PUBLIC_ORIGIN',
  'TABULAR_DATABASE_CONNECTION_ID',
  'TABULAR_WEB_DATABASE_URL',
  'TABULAR_MIGRATOR_DATABASE_URL',
  'TABULAR_WORKER_DATABASE_URL',
  'TABULAR_SESSION_MAX_AGE_SECONDS',
  'TABULAR_SSE_REPLAY_LIMIT',
  'TABULAR_WORKER_CONCURRENCY',
  'TABULAR_GOOGLE_CLIENT_ID',
  'TABULAR_GOOGLE_CLIENT_SECRET',
  'TABULAR_GOOGLE_REDIRECT_URI',
  'TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY'
]) {
  assert.match(envExample, new RegExp(`^#? ?${variable}=`, 'm'), `${variable} is undocumented`);
}
assert.match(envExample, /does not load \.env files/);

const runbook = await fs.readFile(path.join(projectRoot, 'docs/operator-runbook.md'), 'utf8');
for (const heading of [
  'Supported release boundary',
  'PostgreSQL authority bootstrap',
  'Migrate and seed',
  'Start, probe, and stop',
  'Backup and restore',
  'Release, rollback, and incident recovery',
  'Release evidence commands'
]) {
  assert.match(runbook, new RegExp(`^## ${heading}$`, 'm'), `Runbook lacks ${heading}`);
}

const taskStatus = await fs.readFile(path.join(specRoot, 'tasks/status.md'), 'utf8');
for (let task = 1; task <= 13; task += 1) {
  assert.match(
    taskStatus,
    new RegExp(`\\| \\[[0]*${task} [^\\]]+\\]\\([^)]*\\) \\| verified \\|`),
    `Task ${String(task).padStart(5, '0')} is not verified`
  );
}
assert.match(
  taskStatus,
  /\| \[00014 Release readiness\]\([^)]*\) \| (?:started|verified) \|/,
  'Task 00014 must be the active or verified release gate'
);

const specStatus = await fs.readFile(path.join(specRoot, 'status.md'), 'utf8');
const specIndex = await fs.readFile(path.join(specRoot, 'index.md'), 'utf8');
assert.doesNotMatch(specStatus, /Implementation state: Not started/);
assert.doesNotMatch(specIndex, /implementation has not started/);

const traceability = await fs.readFile(path.join(specRoot, 'tasks/traceability.md'), 'utf8');
for (let task = 1; task <= 14; task += 1) {
  assert.match(
    traceability,
    new RegExp(`\\| 000${task < 10 ? `0${task}` : task}`),
    `Traceability omits Task ${String(task).padStart(5, '0')}`
  );
}
for (const authority of [
  'tabular-product-contract.md',
  'tabular-implementation-boundaries.md',
  'r005-spreadsheet-file-explorer',
  'r007-integrated-views-activity',
  'P-001',
  'P-002'
]) {
  assert.match(traceability, new RegExp(authority.replace('.', '\\.')));
}

const pluginRoot = path.join(projectRoot, 'src', 'plugins');
const pluginEntries = (await fs.readdir(pluginRoot, {
  withFileTypes: true
})).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const registered = packageJson.plugins.map((entry) => entry.split('/')[3]).sort();
assert.deepEqual(registered, pluginEntries, 'Every feature plugin must be registered exactly once');
for (const plugin of pluginEntries) {
  const entries = await fs.readdir(path.join(pluginRoot, plugin), {
    withFileTypes: true
  });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    assert.ok(
      (await fs.readdir(path.join(pluginRoot, plugin, entry.name))).length > 0,
      `${plugin}/${entry.name} is empty`
    );
  }
}

const productionSources = await sourceFiles(path.join(projectRoot, 'src'));
for (const file of productionSources.filter(
  (candidate) => !candidate.includes(`${path.sep}tests${path.sep}`)
)) {
  const source = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(
    source,
    /(?:from|import\()\s*['"][^'"]*(?:\/tests\/|\/output\/|review-data)/,
    `${path.relative(projectRoot, file)} imports a review or test-only runtime module`
  );
}

const artifactRoots = [
  path.join(projectRoot, 'public/client'),
  path.join(projectRoot, '.build/pages')
];
const forbiddenArtifactContent =
  /Acme Inc\.|TestIdentityProvider|__acceptance|REVIEW_COLUMNS|createReviewRows|review-data|plugins\/[A-Za-z0-9_-]+\/tests\//;
for (const root of artifactRoots) {
  const artifacts = await sourceFiles(root, true);
  assert.ok(artifacts.length > 0, `${path.relative(projectRoot, root)} has no built artifacts`);
  for (const artifact of artifacts) {
    const source = await fs.readFile(artifact, 'utf8');
    assert.doesNotMatch(
      source,
      forbiddenArtifactContent,
      `${path.relative(projectRoot, artifact)} contains release-forbidden fixture code`
    );
  }
}

const releaseRunner = await fs.readFile(
  path.join(projectRoot, 'tests/acceptance/release/run-release-readiness.ts'),
  'utf8'
);
assert.match(releaseRunner, /verify:release:browser/);
assert.doesNotMatch(releaseRunner, /browser-acceptance\.json|native-safari-voiceover\.json/);

process.stdout.write(`${JSON.stringify({
  result: 'passed',
  operations: 'environment-runbook-seed-backup-restore-recovery-documented',
  traceability: 'tasks-00001-through-00014-present',
  plugins: `${registered.length}-registered-no-empty-feature-directories`,
  secrets: 'verified-by-verify-secrets-content-audit',
  status: 'release-gate-current'
}, null, 2)}\n`);

/** Lists owned source or built artifacts without traversing absent roots. */
async function sourceFiles(root: string, javascriptOnly = false): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute, javascriptOnly);
    if (javascriptOnly && !/\.[cm]?js$/.test(entry.name)) return [];
    if (!javascriptOnly && !/\.[cm]?[jt]sx?$/.test(entry.name)) return [];
    return [absolute];
  }));
  return nested.flat();
}
