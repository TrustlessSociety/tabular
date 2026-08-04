//node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = process.cwd();
const command = process.argv[2];
const supported = new Set(['setup', 'start', 'shutdown', 'cleanup']);

if (!command || !supported.has(command)) {
  throw new Error('Local review runner requires setup, start, shutdown, or cleanup');
}

// Compile only the guarded local-review coordinator scripts. This keeps the
// documented commands on ordinary Node and avoids the deprecated loader hook.
const compilation = spawnSync(
  process.execPath,
  [
    path.join(projectRoot, 'node_modules/typescript/bin/tsc'),
    '--project',
    path.join(projectRoot, 'tsconfig.local-review.json')
  ],
  {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'inherit'
  }
);

if (compilation.error) throw compilation.error;
if (compilation.status !== 0) {
  throw new Error(`Local review script compilation failed with status ${compilation.status}`);
}

const compiled = path.join(
  projectRoot,
  '.build/local-review-scripts/scripts/local-review',
  `${command}.js`
);
await import(pathToFileURL(compiled).href);
