//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { VerifiedProviderSubject } from '../../../src/plugins/identity/helpers/contracts.js';
import { ApplicationError } from '../../../src/bootstrap/errors.js';
import { loadSessionConfig } from '../../../src/config/sessions.js';
import { assertVerifiedProviderSubject } from '../../../src/plugins/identity/helpers/contracts.js';
import { requireCapability } from '../../../src/plugins/identity/helpers/policy.js';
import {
  expiredSessionCookieOptions,
  matchesTokenHash,
  opaqueToken,
  requireExactOrigin,
  sessionCookieOptions,
  tokenHash
} from '../../../src/plugins/identity/helpers/security.js';
import { TestIdentityProvider } from './provider-double.js';

test('only a provider adapter can brand bounded provider-scoped subjects', async () => {
  const provider = new TestIdentityProvider();
  const subject = await provider.verify({
    assertion: 'verified-test-assertion',
    subject: 'opaque-subject-A',
    displayName: 'Ada',
    role: 'postgres',
    superuser: true,
    bypassRls: true
  });
  assert.equal(subject.subject, 'opaque-subject-A');
  assert.equal('role' in subject, false);
  assert.notEqual(
    (await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'Opaque-subject-A'
    })).subject,
    subject.subject,
    'opaque provider subjects must not be case-folded'
  );
  for (const invalid of ['', ' leading', 'trailing ', 'bad\u0000subject', 'x'.repeat(513)]) {
    await assert.rejects(() => provider.verify({
      assertion: 'verified-test-assertion',
      subject: invalid
    }));
  }
  await assert.rejects(() => provider.verify({
    assertion: 'invalid-raw-claim',
    subject: 'subject',
    email: 'fallback@example.test',
    role: 'tabular_member'
  }));
  assert.throws(() => assertVerifiedProviderSubject({
    provider: 'test-provider',
    issuer: 'https://issuer.test',
    subject: 'raw-unbranded-subject',
    authenticatedAt: new Date()
  } as VerifiedProviderSubject));
  assert.doesNotThrow(() => assertVerifiedProviderSubject(subject));
});

test('browser tokens are opaque, strict, hashed at rest, and timing-safe comparable', () => {
  const token = opaqueToken();
  const other = opaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, other);
  const hash = tokenHash(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(hash, new RegExp(token));
  assert.equal(matchesTokenHash(token, hash), true);
  assert.equal(matchesTokenHash(other, hash), false);
  assert.equal(matchesTokenHash('not-base64url', hash), false);
});

test('browser mutations require one exact configured origin', () => {
  const trusted = 'https://tabular.example:8443';
  assert.doesNotThrow(() => requireExactOrigin(trusted, trusted));
  for (const supplied of [
    undefined,
    'null',
    'http://tabular.example:8443',
    'https://tabular.example',
    'https://tabular.example:8443.evil.test',
    'https://sub.tabular.example:8443',
    'https://tabular.example.:8443',
    [trusted, 'https://evil.test']
  ]) {
    assert.throws(
      () => requireExactOrigin(supplied, trusted),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'invalid_origin'
    );
  }
  assert.throws(() => requireExactOrigin(trusted, 'https://tabular.example:8443/'));
});

test('session cookies use explicit __Host production policy and option-preserving expiry', () => {
  const production = loadSessionConfig({}, 'production');
  const development = loadSessionConfig({}, 'development');
  assert.deepEqual(sessionCookieOptions(production), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 28_800,
    priority: 'high'
  });
  assert.equal(production.cookieName, '__Host-tabular');
  assert.equal('domain' in sessionCookieOptions(production), false);
  assert.equal(development.secure, false);
  assert.equal(expiredSessionCookieOptions(production).maxAge, 0);
  assert.equal(expiredSessionCookieOptions(production).expires?.getTime(), 0);
});

test('application policy is deny-default and rejects transport-shaped objects', () => {
  const browser = {
    transport: 'browser' as const,
    sessionId: 'session',
    identityId: 'identity',
    connectionId: 'local',
    historyScopeId: 'history',
    idleExpiresAt: new Date(),
    absoluteExpiresAt: new Date()
  };
  assert.doesNotThrow(() => requireCapability(browser, 'catalog.discover'));
  assert.throws(
    () => requireCapability(browser, 'unknown.operation'),
    (error: unknown) => error instanceof ApplicationError && error.errorCode === 'capability_denied'
  );
  assert.throws(() => requireCapability({ ...browser, transport: 'mcp' } as never, 'catalog.discover'));
});
