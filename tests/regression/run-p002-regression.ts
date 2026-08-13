import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const connectionString = process.env.PROOF_DATABASE_URL;
assert.equal(
  process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
  'task00002-disposable',
  'TABULAR_TEST_POSTGRES_DISPOSABLE must authorize the P-002 destructive fixture cleanup'
);
assert.ok(connectionString, 'PROOF_DATABASE_URL is required');
const target = new URL(connectionString);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.equal(target.pathname, '/tabular_task00002');
assert.ok(target.port);

const projectRoot = process.cwd();
const proofRoot = path.join(projectRoot, 'proofs/tabular-direct-postgresql-boundary');
const copyRoot = path.join(projectRoot, '.build/p002-regression');
await fs.rm(copyRoot, { recursive: true, force: true });
await fs.mkdir(copyRoot, { recursive: true });
await Promise.all([
  fs.cp(path.join(proofRoot, 'src'), path.join(copyRoot, 'src'), { recursive: true }),
  fs.cp(path.join(proofRoot, 'test'), path.join(copyRoot, 'test'), { recursive: true })
]);

const status = await new Promise<number | null>((resolve, reject) => {
  const child = spawn(process.execPath, ['--test', path.join(copyRoot, 'test/proof.test.mjs')], {
    cwd: copyRoot,
    env: process.env,
    stdio: 'inherit'
  });
  child.once('error', reject);
  child.once('exit', resolve);
});
if (status !== 0) throw new Error(`P-002 regression exited with status ${status}`);
process.stdout.write('P-002 regression passed from an isolated copy; Frozen proof files were not changed.\n');
