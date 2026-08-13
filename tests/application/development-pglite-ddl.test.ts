//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { createApplication } from '../../src/bootstrap/application.js';
import { loadDevelopmentConfig } from '../../src/config/dev.js';
import { createPGliteDevelopmentRuntime } from '../../scripts/develop-pglite.js';

test('development PGlite creates and applies a blank file through the web workflow', async () => {
  const projectRoot = process.cwd();
  const origin = 'http://127.0.0.1:3999';
  const pglite = await createPGliteDevelopmentRuntime();
  let application: Awaited<ReturnType<typeof createApplication>> | undefined;
  try {
    const config = loadDevelopmentConfig({
      env: { ...process.env, NODE_ENV: 'development', TABULAR_PUBLIC_ORIGIN: origin },
      projectRoot,
      runtimeRoot: projectRoot
    });
    application = await createApplication({
      config,
      projectRoot,
      runtimeRoot: projectRoot,
      developmentDatabase: pglite.backend,
      developmentLogin: pglite.login,
      loadArtifacts: false,
      createReactus: false
    });
    const established = await application.identity.loginWithPostgreSqlCredentials({
      roleName: 'tabular_reviewer',
      password: 'review-local-only-2026',
      origin
    });
    const principal = await application.identity.requireBrowserMutation({
      cookieToken: established.cookieToken,
      csrfToken: established.csrfToken,
      origin
    });
    const snapshot = await application.explorer.discover(principal);
    const folder = snapshot.folders.find((candidate) => candidate.slug === 'operations');
    assert.ok(folder);

    const dispatched = await application.explorer.dispatch(principal, {
      type: 'file.create.blank',
      commandId: 'cmd_development_pglite_create',
      folder,
      displayName: 'Product Data'
    });
    assert.equal(dispatched.ok, true);
    if (!dispatched.ok) return;
    assert.ok(dispatched.plan);

    await application.files.confirm(
      principal,
      dispatched.plan.requestId,
      dispatched.plan.confirmationToken
    );
    const status = await application.files.status(principal, dispatched.plan.requestId);
    assert.equal(status.state, 'applied');
    assert.equal(status.result?.physicalName, 'product_data');

    const refreshed = await application.explorer.discover(principal);
    const created = refreshed.folders
      .flatMap((candidate) => candidate.files)
      .find((file) => file.displayName === 'Product Data');
    assert.equal(created?.physicalName, 'product_data');
  } finally {
    if (application) await application.runtime.resources.close();
    else await pglite.close();
  }
});
