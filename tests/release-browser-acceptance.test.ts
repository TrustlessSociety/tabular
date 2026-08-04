//node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('release browser acceptance is fresh and uses only visible public controls', async () => {
  const source = await fs.readFile(
    path.resolve('scripts/release/browser-acceptance.mjs'),
    'utf8'
  );
  assert.doesNotMatch(source, /(?:from|import\()\s*['"][^'"]*(?:tests|output)\//);
  assert.doesNotMatch(source, /TestIdentityProvider|__acceptance|document\.cookie|setCookie/);
  assert.doesNotMatch(source, /browser-acceptance\.json|generatedAt|24 \* 60/);
  for (const selector of [
    '#postgres-login-form',
    '#postgres-role',
    '#postgres-password',
    '#postgres-login-submit',
    '#signed-in-identity',
    '#logout-form',
    '#logout-submit'
  ]) {
    assert.match(source, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /Target\.createBrowserContext/);
  assert.match(source, /unknown-file/);
  assert.match(source, /freshContexts: 3/);
  assert.match(source, /automatic blur save/);
  assert.doesNotMatch(source, /clickByText\('button', 'Commit'\)/);
});
