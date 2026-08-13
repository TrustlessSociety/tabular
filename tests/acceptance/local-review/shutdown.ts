//node
import fs from 'node:fs/promises';

//client
import {
  LOCAL_REVIEW_PATHS,
  assertDisposableContainer,
  inspectContainer,
  readProcessState,
  requireConfirmation,
  stopProcesses
} from './common.js';

requireConfirmation('--confirm-task00014-local-processes');

// Stop only PIDs whose live commands still match the recorded source entrypoints.
const state = await readProcessState();
if (state) {
  await stopProcesses(state.processes);
  await fs.unlink(LOCAL_REVIEW_PATHS.processes).catch(() => undefined);
}

// Prove the database is still the exact disposable target, but keep its tmpfs alive
// so an application-only shutdown/start cycle preserves the review data.
const container = inspectContainer();
if (container) {
  assertDisposableContainer(container);
  if (!container.State?.Running) {
    throw new Error('The tmpfs-backed review database stopped; run npm run local-review:setup');
  }
}

process.stdout.write(`${JSON.stringify({
  result: 'stopped',
  applicationProcesses: state?.processes.map((record) => record.name) || [],
  databaseContainer: container ? 'running-retained-until-cleanup' : 'absent',
  restart: container ? 'npm run local-review:start' : 'npm run local-review:setup',
  cleanup: 'npm run local-review:cleanup'
}, null, 2)}\n`);
