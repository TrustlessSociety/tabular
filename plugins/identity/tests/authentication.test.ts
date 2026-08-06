//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import type { ClientConfig } from 'pg';

//client
import type { PostgreSqlLoginClient } from '../helpers/postgresql-login.js';
import { PostgreSqlIdentityProvider } from '../helpers/postgresql-login.js';
import {
  renderPostgreSqlLogin,
  renderSignedInAccount
} from '../views/authentication.js';

/**
 * Builds a fake ordinary client at the authentication network boundary.
 */
function loginClient(overrides: Record<string, unknown> = {}) {
  let ended = false;
  const client: PostgreSqlLoginClient = {
    connect: async () => undefined,
    query: async <Row>() => ({
      rows: [{
        database_oid: '16384',
        role_oid: '16385',
        role_name: 'tabular_reviewer',
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolcanlogin: true,
        rolreplication: false,
        rolbypassrls: false,
        direct_session: true,
        ...overrides
      } as Row]
    }),
    end: async () => { ended = true; }
  };
  return { client, ended: () => ended };
}

test('short-lived PostgreSQL verification returns only OID-bound identity data', async () => {
  const fake = loginClient();
  let clientConfig: ClientConfig | undefined;
  const provider = new PostgreSqlIdentityProvider(
    'local',
    'postgresql://web:secret@127.0.0.1:5432/tabular',
    10_000,
    (config) => {
      clientConfig = config;
      return fake.client;
    }
  );
  const verified = await provider.verify({
    roleName: 'tabular_reviewer',
    password: 'disposable-review-password'
  });

  const loginUrl = new URL(String(clientConfig?.connectionString));
  assert.equal(loginUrl.username, 'tabular_reviewer');
  assert.equal(loginUrl.password, 'disposable-review-password');
  assert.equal(fake.ended(), true);
  assert.equal(verified.provider, 'postgresql');
  assert.equal(verified.subject, '16384:16385');
  assert.equal(verified.databaseOid, '16384');
  assert.equal(verified.roleOid, '16385');
  assert.doesNotMatch(JSON.stringify(verified), /disposable-review-password|secret/);
});

test('unsafe PostgreSQL roles fail after closing the authentication connection', async () => {
  const fake = loginClient({ rolsuper: true });
  const provider = new PostgreSqlIdentityProvider(
    'local',
    'postgresql://web:secret@127.0.0.1:5432/tabular',
    10_000,
    () => fake.client
  );
  await assert.rejects(() => provider.verify({
    roleName: 'tabular_reviewer',
    password: 'not-retained'
  }), /unsafe/);
  assert.equal(fake.ended(), true);
});

test('identity documents expose stable accessible sign-in and logout controls', () => {
  const login = renderPostgreSqlLogin(true);
  assert.match(login, /id="postgres-login-form"/);
  assert.match(login, /for="postgres-role">PostgreSQL role/);
  assert.match(login, /autocomplete="current-password"/);
  assert.match(login, /id="postgres-login-error" role="alert"/);
  assert.doesNotMatch(login, /value=".*password/);

  const account = renderSignedInAccount('<reviewer>', 'c'.repeat(43));
  assert.match(account, /id="signed-in-identity">&lt;reviewer&gt;/);
  assert.match(account, /id="logout-form" method="post" action="\/auth\/logout"/);
  assert.match(account, /name="csrfToken"/);
  assert.match(account, /id="logout-submit"/);
});
