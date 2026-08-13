//node
import fs from 'node:fs/promises';
import path from 'node:path';

//client
import {
  LOCAL_REVIEW,
  LOCAL_REVIEW_PATHS,
  assertDisposableContainer,
  docker,
  inspectContainer,
  readProcessState,
  requireConfirmation,
  stopProcesses
} from './common.js';

requireConfirmation('--confirm-destroy-task00014-disposable');
assertGeneratedCleanupPath();

// Cleanup inherits the same bounded, PID-identity-checked process shutdown.
const state = await readProcessState();
if (state) await stopProcesses(state.processes);

// The container is deleted only after exact image, label, loopback, and tmpfs proof.
const container = inspectContainer();
if (container) {
  assertDisposableContainer(container);
  docker(['rm', '--force', '--volumes', LOCAL_REVIEW.container]);
}

await fs.rm(LOCAL_REVIEW_PATHS.root, { recursive: true, force: true });
process.stdout.write(`${JSON.stringify({
  result: 'cleaned',
  container: container ? LOCAL_REVIEW.container : 'already-absent',
  dataRecovery: 'not-available-explicitly-disposable-tmpfs',
  generatedStateRemoved: '.build/local-review'
}, null, 2)}\n`);

/** Proves cleanup cannot escape the project's one fixed generated directory. */
function assertGeneratedCleanupPath() {
  const expectedParent = path.resolve('.build');
  if (
    LOCAL_REVIEW_PATHS.root !== path.join(expectedParent, 'local-review')
    || LOCAL_REVIEW_PATHS.root === process.cwd()
  ) {
    throw new Error('Refusing cleanup outside the fixed .build/local-review directory');
  }
}
