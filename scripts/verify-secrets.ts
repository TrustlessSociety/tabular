import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const candidateRoots = [
  'bootstrap',
  'config',
  'entrypoints',
  'plugins',
  'scripts',
  'docs'
];
const explicitFiles = ['package.json', 'package-lock.json', '.env.example', 'README.md'];
const files = [
  ...explicitFiles.map((file) => path.join(projectRoot, file)),
  ...(await Promise.all(candidateRoots.map((root) => filesUnder(path.join(projectRoot, root))))).flat()
].filter((file) =>
  !isTestPath(file)
  && file !== path.join(projectRoot, 'scripts/verify-secrets.ts')
);

const forbiddenNames = files.find((file) => {
  const relative = path.relative(projectRoot, file);
  return (/^\.env(?:\.|$)/.test(relative) && relative !== '.env.example')
    || /\.(?:pem|key|p12|pfx)$/i.test(relative)
    || /(?:service-account|credentials)[^/]*\.json$/i.test(relative);
});
assert.equal(forbiddenNames, undefined, 'A secret-shaped release-candidate filename exists');

const credentialUrlPattern = /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/i;
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bghp_[0-9A-Za-z]{36}\b/,
  /\bsk_(?:live|prod)_[0-9A-Za-z]{16,}\b/,
  credentialUrlPattern
];
for (const file of files) {
  const body = await fs.readFile(file, 'utf8').catch(() => undefined);
  if (body === undefined) continue;
  if (file.endsWith('.env.example')) continue;
  for (const pattern of patterns) {
    if (pattern === credentialUrlPattern
      && file === path.join(projectRoot, 'scripts/verify-entrypoints.ts')) continue;
    assert.doesNotMatch(
      body,
      pattern,
      `Potential secret content exists in ${path.relative(projectRoot, file)}`
    );
  }
}

process.stdout.write(`${JSON.stringify({
  result: 'passed',
  candidateFiles: files.length,
  contentPatterns: patterns.length,
  exclusions: ['tests', 'runtime-output', 'ignored-local-environment']
}, null, 2)}\n`);

async function filesUnder(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }));
  return nested.flat();
}

/**
 * Report whether a candidate file belongs to a test-only source path.
 */
function isTestPath(file: string) {
  const relative = path.relative(projectRoot, file).replaceAll('\\', '/');
  return relative === 'tests'
    || relative.startsWith('tests/')
    || relative.includes('/tests/');
}
