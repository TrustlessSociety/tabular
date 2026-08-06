import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const outputs = [
  path.join(projectRoot, 'dist'),
  path.join(projectRoot, 'public/assets'),
  path.join(projectRoot, 'public/client')
];

for (const output of outputs) {
  await fs.rm(output, { recursive: true, force: true });
}

// The supported local-review stack can remain running while a new release build is
// produced. Preserve its validated PID file, credentials, and logs so a later
// shutdown can still target only the recorded compiled processes.
const buildRoot = path.join(projectRoot, '.build');
const buildEntries = await fs.readdir(buildRoot).catch(() => []);
for (const entry of buildEntries) {
  if (entry === 'local-review') continue;
  await fs.rm(path.join(buildRoot, entry), { recursive: true, force: true });
}
