//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { createApplication } from '../bootstrap/application.js';
import { resolveProcessPhases } from '../bootstrap/lifecycle.js';
import {
  PROCESS_PHASES,
  PROCESS_PHASE_PERMISSIONS
} from '../config/phases.js';
import { loadBuildConfig } from '../config/build.js';

test('process phase matrix keeps build away from runtime phases', () => {
  assert.deepEqual(PROCESS_PHASES, {
    build: ['config', 'route'],
    development: ['config', 'listen', 'route'],
    live: ['config', 'listen', 'route'],
    worker: ['config', 'worker'],
    migrator: ['config', 'migrate'],
    doctor: ['config', 'doctor'],
    preflight: ['config', 'preflight']
  });
  assert.deepEqual(PROCESS_PHASE_PERMISSIONS.migrator, [
    'config', 'migrate', 'worker'
  ]);
  const buildPermissions = PROCESS_PHASE_PERMISSIONS.build as readonly string[];
  assert.equal(buildPermissions.includes('listen'), false);
  assert.equal(buildPermissions.includes('worker'), false);
  assert.equal(buildPermissions.includes('migrate'), false);
});

test('build bootstrap resolves no listener, pool, worker, or migrator', async () => {
  const config = loadBuildConfig({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  const application = await createApplication({
    processKind: 'web',
    config,
    loadArtifacts: false,
    createReactus: false
  });

  try {
    assert.deepEqual(
      await resolveProcessPhases(application.app, 'build'),
      ['config', 'route']
    );
    assert.equal(application.runtime.reactus, undefined);
    assert.deepEqual((await application.runtime.resources.readiness()).checks, []);
    assert.equal(application.runtime.processKind, 'web');
  } finally {
    await application.runtime.resources.close(1_000);
  }
});
