//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import pg from 'pg';

//client
import { startWeb } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { ManagedPostgresPool } from '../../database/helpers/pool.js';
import { runMigrations } from '../../database/helpers/migrator.js';
import { withPostgreSqlTransaction } from '../../database/helpers/transactions.js';
import { loadMigrations } from '../../database/migrations/index.js';
import { TestIdentityProvider } from './provider-double.js';

const { Pool } = pg;
const connectionString = process.env.TABULAR_TEST_POSTGRES_URL;

/**
 * Assert the disposable target.
 */
function assertDisposableTarget(value: string | undefined): asserts value is string {
  assert.equal(
    process.env.TABULAR_TEST_POSTGRES_DISPOSABLE,
    'task00003-disposable',
    'TABULAR_TEST_POSTGRES_DISPOSABLE must explicitly authorize destructive test cleanup'
  );
  assert.ok(value, 'TABULAR_TEST_POSTGRES_URL is required');
  const target = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/tabular_task00003');
  assert.ok(target.port);
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
}

/**
 * Return the transaction result.
 */
function transaction(pool: ManagedPostgresPool) {
  return <Result>(callback: Parameters<typeof withPostgreSqlTransaction<Result>>[2]) =>
    withPostgreSqlTransaction(pool, {
      settings: {
        statement_timeout: '5000',
        lock_timeout: '5000',
        idle_in_transaction_session_timeout: '5000'
      }
    }, callback);
}

/**
 * Return the postgres code result.
 */
function postgresCode(code: string) {
  return (error: unknown) => Boolean(
    error && typeof error === 'object' && 'code' in error && error.code === code
  );
}

test('PostgreSQL 18 identity, authority, and caller-filtered catalog boundary', {
  timeout: 60_000
}, async () => {
  assertDisposableTarget(connectionString);
  const admin = new Pool({ connectionString, max: 4, allowExitOnIdle: true });
  const migrationPool = new ManagedPostgresPool({
    name: 'task00003-migrator',
    connectionString,
    maximum: 2,
    applicationName: 'tabular-task00003-migrator'
  });
  let application: Awaited<ReturnType<typeof startWeb>> | undefined;
  let primaryFailure: unknown;
  const cleanupFailures: Error[] = [];
  try {
    const version = await admin.query(`
      SELECT current_setting('server_version_num')::integer AS number, version() AS label
    `);
    assert.ok(version.rows[0].number >= 180000 && version.rows[0].number < 190000);

    await admin.query('DROP SCHEMA IF EXISTS tabular CASCADE');
    await admin.query('DROP SCHEMA IF EXISTS app_data CASCADE');
    await admin.query('DROP SCHEMA IF EXISTS app_data_renamed CASCADE');
    await admin.query('DROP SCHEMA IF EXISTS hidden_data CASCADE');
    for (const role of [
      'tabular_task00003_reviewer',
      'tabular_member',
      'tabular_other',
      'tabular_drift_role',
      'tabular_business_owner'
    ]) {
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await admin.query(`
      CREATE ROLE tabular_member NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_other NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_drift_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_business_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE tabular_task00003_reviewer LOGIN PASSWORD 'task00014-reviewer-password'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT tabular_member TO tabular_task00003_reviewer WITH INHERIT TRUE, SET TRUE;
    `);
    const migrations = await loadMigrations();
    assert.deepEqual(await runMigrations(transaction(migrationPool), migrations), {
      applied: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011'],
      total: 11
    });

    await admin.query(`
      CREATE SCHEMA app_data AUTHORIZATION tabular_business_owner;
      CREATE SCHEMA hidden_data AUTHORIZATION tabular_business_owner;
      CREATE TABLE app_data.records (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        owner_role name NOT NULL,
        title text NOT NULL,
        secret text NOT NULL,
        score integer NOT NULL CHECK (score BETWEEN 0 AND 100)
      );
      ALTER TABLE app_data.records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app_data.records FORCE ROW LEVEL SECURITY;
      CREATE POLICY records_owner ON app_data.records
        USING (owner_role = current_user)
        WITH CHECK (owner_role = current_user);
      INSERT INTO app_data.records (owner_role, title, secret, score)
      VALUES
        ('tabular_member', 'Member row', 'MEMBER_SECRET', 10),
        ('tabular_other', 'Other row', 'OTHER_SECRET', 20);
      CREATE FUNCTION app_data.reject_blocked_title() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.title = 'blocked' THEN
          RAISE EXCEPTION 'blocked title';
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER records_title_guard
        BEFORE UPDATE ON app_data.records
        FOR EACH ROW EXECUTE FUNCTION app_data.reject_blocked_title();
      CREATE VIEW app_data.record_view WITH (security_invoker = true) AS
        SELECT id, owner_role, title FROM app_data.records;
      CREATE TABLE app_data.replace_me (id integer PRIMARY KEY, label text NOT NULL);
      CREATE TABLE hidden_data.hidden_table (id integer PRIMARY KEY, hidden_value text);
      GRANT USAGE ON SCHEMA app_data TO tabular_member, tabular_other;
      GRANT SELECT (id, owner_role, title, score), UPDATE (title, score)
        ON app_data.records TO tabular_member;
      GRANT SELECT ON app_data.records TO tabular_other;
      GRANT SELECT ON app_data.record_view, app_data.replace_me TO tabular_member;
    `);

    application = await startWeb({
      env: {
        NODE_ENV: 'test',
        TABULAR_PUBLIC_ORIGIN: 'https://tabular.test',
        TABULAR_DATABASE_CONNECTION_ID: 'task00003',
        TABULAR_WEB_DATABASE_URL: connectionString,
        TABULAR_SESSION_IDLE_TIMEOUT_SECONDS: '600',
        TABULAR_SESSION_MAX_AGE_SECONDS: '3600'
      },
      projectRoot: process.cwd(),
      runtimeRoot: process.cwd(),
      host: '127.0.0.1',
      port: 0
    });
    const webPool = application.database.openPool('web');
    const provider = new TestIdentityProvider();

    const loginPage = await fetch(`${application.origin}/auth/login`);
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /id="postgres-login-form"/);
    const loginResponse = await fetch(`${application.origin}/auth/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://tabular.test'
      },
      body: new URLSearchParams({
        username: 'tabular_task00003_reviewer',
        password: 'task00014-reviewer-password'
      })
    });
    assert.equal(loginResponse.status, 303);
    assert.equal(loginResponse.headers.get('location'), '/');
    const loginCookie = (loginResponse.headers.get('set-cookie') || '').split(';', 1)[0];
    assert.match(loginCookie, /^tabular_session=[A-Za-z0-9_-]{43}$/);
    const binding = await admin.query(`
      SELECT binding.database_oid::text,
             binding.role_oid::text,
             binding.role_name::text,
             identity.provider_subject
        FROM tabular.postgresql_login_identities binding
        JOIN tabular.identities identity ON identity.id = binding.identity_id
       WHERE binding.role_name = 'tabular_task00003_reviewer'
    `);
    assert.equal(binding.rows.length, 1);
    assert.equal(
      binding.rows[0].provider_subject,
      `${binding.rows[0].database_oid}:${binding.rows[0].role_oid}`
    );
    const passwordColumns = await admin.query(`
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = 'tabular'
         AND column_name ILIKE '%password%'
    `);
    assert.deepEqual(passwordColumns.rows, []);
    const accountResponse = await fetch(`${application.origin}/auth/account`, {
      headers: { cookie: loginCookie }
    });
    assert.equal(accountResponse.status, 200);
    const accountHtml = await accountResponse.text();
    assert.match(accountHtml, /id="signed-in-identity">tabular_task00003_reviewer/);
    const csrfToken = accountHtml.match(/name="csrfToken" value="([A-Za-z0-9_-]{43})"/)?.[1];
    assert.ok(csrfToken);
    const logoutResponse = await fetch(`${application.origin}/auth/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://tabular.test',
        cookie: loginCookie
      },
      body: new URLSearchParams({ csrfToken })
    });
    assert.equal(logoutResponse.status, 303);
    assert.equal(logoutResponse.headers.get('location'), '/auth/login');
    assert.match(logoutResponse.headers.get('set-cookie') || '', /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    assert.equal((await fetch(`${application.origin}/auth/session`, {
      headers: { cookie: loginCookie }
    })).status, 401);

    const genericFailures = await Promise.all(Array.from({ length: 6 }, () =>
      fetch(`${application!.origin}/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://tabular.test'
        },
        body: new URLSearchParams({ username: 'absent_role', password: 'wrong' })
      })
    ));
    assert.deepEqual(genericFailures.map((response) => response.status), [401, 401, 401, 401, 401, 401]);
    assert.equal(new Set(await Promise.all(genericFailures.map((response) => response.text()))).size, 1);
    assert.equal((await admin.query(`
      SELECT attempt_count >= 6 AS bounded, blocked_until > clock_timestamp() AS blocked
        FROM tabular.postgresql_login_attempts
    `)).rows[0].bounded, true);

    const memberSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'immutable-member-subject',
      displayName: 'Member',
      role: 'postgres',
      superuser: true,
      bypassRls: true
    });
    const otherSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'immutable-other-subject',
      displayName: 'Other'
    });
    const memberProvision = await application.identity.provisionIdentityRole(
      memberSubject,
      'tabular_member'
    );
    await application.identity.provisionIdentityRole(otherSubject, 'tabular_other');
    await assert.rejects(
      application.identity.provisionIdentityRole({
        provider: 'test-provider',
        issuer: 'https://issuer.test',
        subject: 'raw-forged-subject',
        authenticatedAt: new Date()
      } as never, 'tabular_member'),
      /not verified by a registered adapter/
    );

    const firstMember = await application.identity.establishBrowserSession(memberSubject);
    const member = await application.identity.establishBrowserSession(memberSubject);
    assert.ok(
      await application.identity.authenticateBrowserSession(firstMember.cookieToken),
      'independent browser sessions for one identity must remain active'
    );
    assert.ok(await application.identity.authenticateBrowserSession(member.cookieToken));
    const other = await application.identity.establishBrowserSession(otherSubject);
    const storedTokens = await admin.query(`
      SELECT token_hash, csrf_token_hash FROM tabular.browser_sessions WHERE id = $1
    `, [member.principal.sessionId]);
    assert.match(storedTokens.rows[0].token_hash, /^[a-f0-9]{64}$/);
    assert.match(storedTokens.rows[0].csrf_token_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(storedTokens.rows[0].token_hash, member.cookieToken);
    assert.notEqual(storedTokens.rows[0].csrf_token_hash, member.csrfToken);

    await assert.rejects(
      application.identity.requireBrowserMutation({
        cookieToken: member.cookieToken,
        csrfToken: member.csrfToken,
        origin: 'https://tabular.test.evil.example'
      }),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'invalid_origin'
    );
    await assert.rejects(
      application.identity.requireBrowserMutation({
        cookieToken: member.cookieToken,
        csrfToken: other.csrfToken,
        origin: 'https://tabular.test'
      }),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'invalid_csrf'
    );
    assert.equal((await application.identity.requireBrowserMutation({
      cookieToken: member.cookieToken,
      csrfToken: member.csrfToken,
      origin: 'https://tabular.test'
    })).identityId, memberProvision.identityId);

    const httpSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'immutable-http-subject',
      displayName: 'HTTP Member'
    });
    await application.identity.provisionIdentityRole(httpSubject, 'tabular_member');
    const httpSession = await application.identity.establishBrowserSession(httpSubject);
    const sessionResponse = await fetch(`${application.origin}/auth/session`, {
      headers: { cookie: `tabular_session=${httpSession.cookieToken}` }
    });
    assert.equal(sessionResponse.status, 200);
    assert.match(sessionResponse.headers.get('cache-control') || '', /no-store/);
    const resumedBody = await sessionResponse.json() as {
      authenticated: boolean,
      csrfToken: string,
    };
    assert.equal(resumedBody.authenticated, true);
    assert.match(resumedBody.csrfToken, /^[A-Za-z0-9_-]{43}$/);
    const secondTabResponse = await fetch(`${application.origin}/auth/session`, {
      headers: { cookie: `tabular_session=${httpSession.cookieToken}` }
    });
    assert.equal(secondTabResponse.status, 200);
    const secondTabBody = await secondTabResponse.json() as { csrfToken: string, };
    assert.notEqual(secondTabBody.csrfToken, resumedBody.csrfToken);
    for (const csrfToken of [resumedBody.csrfToken, secondTabBody.csrfToken]) {
      assert.equal((await application.identity.requireBrowserMutation({
        cookieToken: httpSession.cookieToken,
        csrfToken,
        origin: 'https://tabular.test'
      })).identityId.length > 0, true);
    }
    const httpRotated = await fetch(`${application.origin}/auth/session/rotate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://tabular.test',
        cookie: `tabular_session=${httpSession.cookieToken}`,
        'x-tabular-csrf': resumedBody.csrfToken
      },
      body: '{}'
    });
    assert.equal(httpRotated.status, 200);
    const setCookie = httpRotated.headers.get('set-cookie') || '';
    assert.match(setCookie, /^tabular_session=[A-Za-z0-9_-]{43};/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Path=\//i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Priority=High/i);
    assert.doesNotMatch(setCookie, /Domain=|Secure/i);
    const httpRotationBody = await httpRotated.json() as { csrfToken: string, };
    assert.match(httpRotationBody.csrfToken, /^[A-Za-z0-9_-]{43}$/);
    const rotatedCookie = setCookie.split(';', 1)[0];
    assert.equal(
      (await fetch(`${application.origin}/auth/session`, {
        headers: { cookie: `tabular_session=${httpSession.cookieToken}` }
      })).status,
      401
    );
    const rejectedLogout = await fetch(`${application.origin}/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://tabular.test',
        cookie: rotatedCookie,
        'x-tabular-csrf': other.csrfToken
      },
      body: '{}'
    });
    assert.equal(rejectedLogout.status, 403);
    assert.equal(rejectedLogout.headers.get('set-cookie'), null);
    const afterRejectedLogout = await fetch(`${application.origin}/auth/session`, {
      headers: { cookie: rotatedCookie }
    });
    assert.equal(afterRejectedLogout.status, 200, 'rejected logout must preserve the session');
    const afterRejectedBody = await afterRejectedLogout.json() as { csrfToken: string, };
    const httpLogout = await fetch(`${application.origin}/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://tabular.test',
        cookie: rotatedCookie,
        'x-tabular-csrf': afterRejectedBody.csrfToken
      },
      body: '{}'
    });
    assert.equal(httpLogout.status, 200);
    assert.match(httpLogout.headers.get('set-cookie') || '', /Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    let callbackRan = false;
    await assert.rejects(
      async () => application!.identity.authorizedTransaction(
        member.principal,
        'unknown.operation',
        async () => { callbackRan = true; }
      ),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'capability_denied'
    );
    assert.equal(callbackRan, false);
    assert.equal(webPool.checkedOutCount, 0);

    const visibleRows = await application.identity.authorizedTransaction(
      member.principal,
      'catalog.discover',
      (database) => database.execute<{ current_user: string, title: string, }>(`
        SELECT current_user, title FROM app_data.records ORDER BY id
      `)
    );
    assert.deepEqual(visibleRows.rows, [{ current_user: 'tabular_member', title: 'Member row' }]);
    assert.equal(webPool.checkedOutCount, 0);

    const rlsWrite = await application.identity.authorizedTransaction(
      member.principal,
      'catalog.discover',
      (database) => database.execute(`
        UPDATE app_data.records SET title = 'not-visible' WHERE owner_role = 'tabular_other'
      `)
    );
    assert.equal(rlsWrite.affectedRows, 0);
    await assert.rejects(
      application.identity.authorizedTransaction(
        member.principal,
        'catalog.discover',
        (database) => database.execute(`
          UPDATE app_data.records SET secret = 'leak' WHERE owner_role = current_user
        `)
      ),
      postgresCode('42501')
    );
    await assert.rejects(
      application.identity.authorizedTransaction(
        member.principal,
        'catalog.discover',
        (database) => database.execute(`
          UPDATE app_data.records SET score = -1 WHERE owner_role = current_user
        `)
      ),
      postgresCode('23514')
    );
    await assert.rejects(
      application.identity.authorizedTransaction(
        member.principal,
        'catalog.discover',
        (database) => database.execute(`
          UPDATE app_data.records SET title = 'blocked' WHERE owner_role = current_user
        `)
      ),
      postgresCode('P0001')
    );
    await assert.rejects(
      application.identity.authorizedTransaction(
        member.principal,
        'catalog.discover',
        async (database) => {
          await database.execute(`
            UPDATE app_data.records SET title = 'must-rollback' WHERE owner_role = current_user
          `);
          throw new Error('forced callback rollback');
        }
      ),
      /forced callback rollback/
    );
    assert.equal(
      (await admin.query(`SELECT title FROM app_data.records WHERE owner_role = 'tabular_member'`))
        .rows[0].title,
      'Member row'
    );
    assert.equal(webPool.checkedOutCount, 0);

    const initialCatalog = await application.catalog.discover(member.principal);
    const appSchema = initialCatalog.schemas.find((schema) => schema.name === 'app_data');
    assert.ok(appSchema);
    const records = appSchema.files.find((file) => file.name === 'records');
    const view = appSchema.files.find((file) => file.name === 'record_view');
    const replacement = appSchema.files.find((file) => file.name === 'replace_me');
    assert.ok(records && view && replacement);
    assert.equal(view.readOnly, true);
    assert.deepEqual(records.columns.map((column) => column.name), [
      'id', 'owner_role', 'title', 'score'
    ]);
    const serialized = JSON.stringify(initialCatalog);
    assert.doesNotMatch(serialized, /hidden_data|hidden_table|MEMBER_SECRET|OTHER_SECRET|secret/);
    assert.doesNotMatch(serialized, /postgres:\/\/|role_oid|role_name|rolsuper|policy|view_definition/);
    assert.equal(webPool.checkedOutCount, 0);

    const [memberConcurrentCatalog, otherConcurrentCatalog] = await Promise.all([
      application.catalog.discover(member.principal),
      application.catalog.discover(other.principal)
    ]);
    const memberConcurrentRecord = memberConcurrentCatalog.schemas
      .find((schema) => schema.name === 'app_data')!
      .files.find((file) => file.name === 'records');
    const otherConcurrentRecord = otherConcurrentCatalog.schemas
      .find((schema) => schema.name === 'app_data')!
      .files.find((file) => file.name === 'records');
    assert.ok(memberConcurrentRecord && otherConcurrentRecord);
    assert.equal(memberConcurrentRecord.id, otherConcurrentRecord.id);
    assert.equal(webPool.checkedOutCount, 0);

    const concurrentExplorerSnapshots = await Promise.all([
      application.explorer.discover(member.principal),
      application.explorer.discover(other.principal),
      application.explorer.discover(member.principal)
    ]);
    assert.equal(concurrentExplorerSnapshots.length, 3);
    for (const snapshot of concurrentExplorerSnapshots) {
      assert.ok(snapshot.folders.some((folder) => (
        folder.files.some((file) => file.id === records.id)
      )));
    }
    assert.equal(webPool.checkedOutCount, 0);

    const titleColumn = records.columns.find((column) => column.name === 'title')!;
    const scoreColumn = records.columns.find((column) => column.name === 'score')!;
    await admin.query(`
      ALTER SCHEMA app_data RENAME TO app_data_renamed;
      ALTER TABLE app_data_renamed.records RENAME TO records_renamed;
      ALTER TABLE app_data_renamed.records_renamed RENAME COLUMN title TO label;
      ALTER TABLE app_data_renamed.records_renamed ALTER COLUMN score TYPE bigint;
      CREATE OR REPLACE VIEW app_data_renamed.record_view WITH (security_invoker = true) AS
        SELECT id, owner_role, label AS title
          FROM app_data_renamed.records_renamed WHERE id > 0;
    `);
    const renamedCatalog = await application.catalog.discover(member.principal);
    const renamedSchema = renamedCatalog.schemas.find((schema) => schema.name === 'app_data_renamed');
    assert.ok(renamedSchema);
    assert.equal(renamedSchema.id, appSchema.id);
    const renamedRecords = renamedSchema.files.find((file) => file.name === 'records_renamed');
    const changedView = renamedSchema.files.find((file) => file.name === 'record_view');
    assert.ok(renamedRecords && changedView);
    assert.equal(renamedRecords.id, records.id);
    assert.equal(renamedRecords.drift, 'renamed');
    assert.equal(changedView.id, view.id);
    assert.equal(changedView.drift, 'changed');
    assert.equal(renamedRecords.columns.find((column) => column.name === 'label')?.id, titleColumn.id);
    assert.equal(renamedRecords.columns.find((column) => column.name === 'score')?.id, scoreColumn.id);
    assert.equal(renamedRecords.columns.find((column) => column.name === 'score')?.drift, 'changed');

    await admin.query(`
      DROP TABLE app_data_renamed.replace_me;
      CREATE TABLE app_data_renamed.replace_me (id integer PRIMARY KEY, label text NOT NULL);
      GRANT SELECT ON app_data_renamed.replace_me TO tabular_member;
    `);
    const replacementCatalog = await application.catalog.discover(member.principal);
    const replacedFile = replacementCatalog.schemas
      .find((schema) => schema.name === 'app_data_renamed')!
      .files.find((file) => file.name === 'replace_me');
    assert.ok(replacedFile);
    assert.notEqual(replacedFile.id, replacement.id);
    assert.equal(
      (await admin.query('SELECT state FROM tabular.catalog_objects WHERE id = $1', [replacement.id]))
        .rows[0].state,
      'replaced'
    );

    const rotationRaceSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'rotation-race-subject'
    });
    await application.identity.provisionIdentityRole(rotationRaceSubject, 'tabular_member');
    const rotationRaceSession = await application.identity.establishBrowserSession(
      rotationRaceSubject
    );
    const rotationRace = await Promise.allSettled([
      application.identity.rotateBrowserSession({
        cookieToken: rotationRaceSession.cookieToken,
        csrfToken: rotationRaceSession.csrfToken,
        origin: 'https://tabular.test'
      }),
      application.identity.rotateBrowserSession({
        cookieToken: rotationRaceSession.cookieToken,
        csrfToken: rotationRaceSession.csrfToken,
        origin: 'https://tabular.test'
      })
    ]);
    assert.equal(rotationRace.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(rotationRace.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(
      await application.identity.authenticateBrowserSession(rotationRaceSession.cookieToken),
      undefined
    );
    const raceWinner = rotationRace.find((result) => result.status === 'fulfilled');
    assert.ok(raceWinner && raceWinner.status === 'fulfilled');
    assert.ok(await application.identity.authenticateBrowserSession(raceWinner.value.cookieToken));

    const remapRaceSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'remap-race-subject'
    });
    const remapRaceProvision = await application.identity.provisionIdentityRole(
      remapRaceSubject,
      'tabular_member'
    );
    const remapRaceSession = await application.identity.establishBrowserSession(remapRaceSubject);
    let actionEntered!: () => void;
    const entered = new Promise<void>((resolve) => { actionEntered = resolve; });
    const heldAction = application.identity.authorizedTransaction(
      remapRaceSession.principal,
      'catalog.discover',
      async (database) => {
        actionEntered();
        await database.execute('SELECT pg_sleep(0.1)');
        return database.execute<{ current_user: string, }>('SELECT current_user');
      }
    );
    await entered;
    const concurrentRemap = application.identity.remapIdentityRole(
      remapRaceProvision.identityId,
      'tabular_other'
    );
    const [heldResult] = await Promise.all([heldAction, concurrentRemap]);
    assert.equal(heldResult.rows[0].current_user, 'tabular_member');
    assert.equal(
      await application.identity.authenticateBrowserSession(remapRaceSession.cookieToken),
      undefined
    );
    assert.equal(webPool.checkedOutCount, 0);

    const rotated = await application.identity.rotateBrowserSession({
      cookieToken: member.cookieToken,
      csrfToken: member.csrfToken,
      origin: 'https://tabular.test'
    });
    assert.equal(
      rotated.principal.absoluteExpiresAt.getTime(),
      member.principal.absoluteExpiresAt.getTime(),
      'rotation must preserve the original absolute deadline'
    );
    assert.equal(await application.identity.authenticateBrowserSession(member.cookieToken), undefined);
    assert.ok(await application.identity.authenticateBrowserSession(rotated.cookieToken));
    await application.identity.logoutBrowserSession({
      cookieToken: rotated.cookieToken,
      csrfToken: rotated.csrfToken,
      origin: 'https://tabular.test'
    });
    assert.equal(await application.identity.authenticateBrowserSession(rotated.cookieToken), undefined);

    const expiring = await application.identity.establishBrowserSession(memberSubject);
    await admin.query(`
      UPDATE tabular.browser_sessions
         SET issued_at = clock_timestamp() - interval '2 hours',
             last_seen_at = clock_timestamp() - interval '1 hour',
             idle_expires_at = clock_timestamp() - interval '1 minute',
             absolute_expires_at = clock_timestamp() + interval '1 hour'
       WHERE id = $1
    `, [expiring.principal.sessionId]);
    assert.equal(await application.identity.authenticateBrowserSession(expiring.cookieToken), undefined);

    const remapped = await application.identity.establishBrowserSession(memberSubject);
    await application.identity.remapIdentityRole(memberProvision.identityId, 'tabular_other');
    assert.equal(await application.identity.authenticateBrowserSession(remapped.cookieToken), undefined);

    const revokedIdentity = await application.identity.establishBrowserSession(memberSubject);
    await application.identity.setIdentityStatus(memberProvision.identityId, 'revoked');
    assert.equal(await application.identity.authenticateBrowserSession(revokedIdentity.cookieToken), undefined);

    const unsafeSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'unsafe-role-subject'
    });
    await assert.rejects(
      application.identity.provisionIdentityRole(unsafeSubject, 'postgres'),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === 'role_not_allowed'
    );

    const driftSubject = await provider.verify({
      assertion: 'verified-test-assertion',
      subject: 'role-drift-subject'
    });
    await application.identity.provisionIdentityRole(driftSubject, 'tabular_drift_role');
    const driftSession = await application.identity.establishBrowserSession(driftSubject);
    await admin.query('DROP ROLE tabular_drift_role');
    await admin.query(`
      CREATE ROLE tabular_drift_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOREPLICATION NOBYPASSRLS
    `);
    assert.equal(await application.identity.authenticateBrowserSession(driftSession.cookieToken), undefined);
    assert.equal(webPool.checkedOutCount, 0);

    const state = await application.database.transaction('web', {}, (database) =>
      database.execute<{ current_user: string, session_user: string, }>(`
        SELECT current_user, session_user
      `)
    );
    assert.equal(state.rows[0].current_user, state.rows[0].session_user);
    assert.equal(webPool.checkedOutCount, 0);
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (application) {
      try {
        await application.close();
      } catch (error) {
        cleanupFailures.push(error instanceof Error ? error : new Error('Application cleanup failed'));
      }
    }
    try {
      await migrationPool.close();
    } catch (error) {
      cleanupFailures.push(error instanceof Error ? error : new Error('Migration pool cleanup failed'));
    }
    try {
      await admin.end();
    } catch (error) {
      cleanupFailures.push(error instanceof Error ? error : new Error('Admin pool cleanup failed'));
    }
  }
  if (primaryFailure || cleanupFailures.length) {
    throw new AggregateError(
      [
        ...(primaryFailure
          ? [primaryFailure instanceof Error ? primaryFailure : new Error('Task 00003 failed')]
          : []),
        ...cleanupFailures
      ],
      'Task 00003 PostgreSQL integration failed',
      { cause: primaryFailure }
    );
  }
});
