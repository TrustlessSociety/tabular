//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { ApplicationError } from '../../../src/bootstrap/errors.js';
import {
  GOOGLE_READONLY_SCOPE,
  GoogleSheetsClient,
  GoogleTokenVault,
  googlePkceChallenge,
  googleTokenEncryptionKey
} from '../../../src/plugins/import-export/helpers/google-sheets.js';

const credentials = {
  clientId: 'client.apps.googleusercontent.com',
  clientSecret: 'server-secret',
  redirectUri: 'https://tabular.example/events/import-google-callback'
};
const verifier = 'a'.repeat(64);

test('Google OAuth uses read-only scopes, PKCE and server-side token exchange', async () => {
  let exchangeBody = '';
  const client = new GoogleSheetsClient(credentials, async (input, init) => {
    assert.equal(String(input), 'https://oauth2.googleapis.com/token');
    exchangeBody = String(init?.body);
    return json({
      token_type: 'Bearer',
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      scope: GOOGLE_READONLY_SCOPE
    });
  });
  const challenge = googlePkceChallenge(verifier);
  const url = new URL(client.authorizationUrl({ state: 'state-value', codeChallenge: challenge }));

  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('scope') || '', /drive\.metadata\.readonly/);
  assert.match(url.searchParams.get('scope') || '', /spreadsheets\.readonly/);
  assert.equal(url.searchParams.get('scope')?.includes('drive.file'), false);
  assert.equal(url.toString().includes(credentials.clientSecret), false);

  const tokens = await client.exchangeCode({ code: 'one-time-code', codeVerifier: verifier });
  assert.equal(tokens.accessToken, 'access-token');
  assert.match(exchangeBody, /code_verifier=/);
  assert.match(exchangeBody, /client_secret=server-secret/);
  assert.equal(tokens.scope, GOOGLE_READONLY_SCOPE);
});

test('Google OAuth rejects missing or broader scopes and accepts scope-less refresh responses', async () => {
  const broader = new GoogleSheetsClient(credentials, async () => json({
    token_type: 'Bearer',
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    scope: `${GOOGLE_READONLY_SCOPE} https://www.googleapis.com/auth/drive`
  }));
  await assert.rejects(
    () => broader.exchangeCode({ code: 'one-time-code', codeVerifier: verifier }),
    (error: unknown) => error instanceof ApplicationError && error.errorCode === 'google_scope_denied'
  );

  const refreshed = new GoogleSheetsClient(credentials, async () => json({
    token_type: 'Bearer',
    access_token: 'refreshed-access-token',
    expires_in: 3600
  }));
  assert.equal((await refreshed.refresh('refresh-token')).scope, GOOGLE_READONLY_SCOPE);
});

test('Google credential vault validates a 256-bit key and binds AES-GCM ciphertext to session context', () => {
  const key = googleTokenEncryptionKey(Buffer.alloc(32, 7).toString('base64url'));
  const vault = new GoogleTokenVault(key);
  const encrypted = vault.encrypt('provider-access-token', 'identity:session-a:history:database');
  assert.equal(vault.decrypt(encrypted, 'identity:session-a:history:database'), 'provider-access-token');
  assert.notEqual(encrypted.ciphertext, 'provider-access-token');
  assert.throws(
    () => vault.decrypt(encrypted, 'identity:session-b:history:database'),
    (error: unknown) => error instanceof ApplicationError && error.errorCode === 'google_secret_invalid'
  );
  assert.throws(() => googleTokenEncryptionKey('too-short'), /exactly 32 bytes/);
});

test('Google import reads one reviewed worksheet as displayed values without formulas and pins revision', async () => {
  const calls: string[] = [];
  const client = new GoogleSheetsClient(credentials, async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer provider-token');
    if (url.includes('/drive/v3/files/')) return json({
      id: 'spreadsheet_1234567890',
      name: 'Q3 orders',
      modifiedTime: '2026-08-02T03:04:05.000Z',
      version: '17',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      trashed: false
    });
    if (url.includes('/v4/spreadsheets/') && !url.includes('/values/')) return json({
      spreadsheetId: 'spreadsheet_1234567890',
      properties: { title: 'Q3 orders' },
      sheets: [
        { properties: { sheetId: 1, title: 'Orders', index: 0 } },
        { properties: { sheetId: 2, title: 'Archive', index: 1 } }
      ]
    });
    if (url.includes('/values/Orders')) return json({
      range: 'Orders!A1:C3',
      majorDimension: 'ROWS',
      values: [
        ['Code', 'Amount', 'Calculated'],
        ['001', '₱1,280.00', 'cached result'],
        ['002', '₱845.50']
      ]
    });
    throw new Error(`Unexpected URL ${url}`);
  });

  const imported = await client.importValues({
    accessToken: 'provider-token',
    spreadsheetId: 'spreadsheet_1234567890',
    sheetName: 'Orders'
  });

  assert.deepEqual(imported.rows[1], ['001', '₱1,280.00', 'cached result']);
  assert.deepEqual(imported.rows[2], ['002', '₱845.50', null]);
  assert.equal(imported.provenance.formulasImported, false);
  assert.equal(imported.spreadsheetVersion, '17');
  assert.equal(calls.filter((url) => url.includes('/drive/v3/files/')).length, 2);
  assert.equal(calls.some((url) => url.includes('valueRenderOption=FORMATTED_VALUE')), true);
  assert.doesNotMatch(JSON.stringify(imported), /formulaValue|DO_NOT_EXPOSE/);
});

test('Google import fails closed for changed revisions, revoked access, denial and rate limiting', async () => {
  for (const [status, code] of [[401, 'google_reauthentication_required'], [403, 'google_permission_denied'], [429, 'google_rate_limited']] as const) {
    const client = new GoogleSheetsClient(credentials, async () => json({ error: { message: 'provider detail' } }, status));
    await assert.rejects(
      () => client.listSpreadsheets('provider-token'),
      (error: unknown) => error instanceof ApplicationError && error.errorCode === code
    );
  }

  let revision = 0;
  const changed = new GoogleSheetsClient(credentials, async (input) => {
    const url = String(input);
    if (url.includes('/drive/v3/files/')) {
      revision += 1;
      return json({
        id: 'spreadsheet_1234567890',
        name: 'Changing',
        modifiedTime: `2026-08-02T03:04:0${revision}.000Z`,
        version: String(revision),
        mimeType: 'application/vnd.google-apps.spreadsheet',
        trashed: false
      });
    }
    if (url.includes('/values/')) return json({ values: [['a'], ['1']] });
    return json({ sheets: [{ properties: { title: 'Orders' } }] });
  });
  await assert.rejects(
    () => changed.importValues({
      accessToken: 'provider-token',
      spreadsheetId: 'spreadsheet_1234567890',
      sheetName: 'Orders'
    }),
    (error: unknown) => error instanceof ApplicationError && error.errorCode === 'google_source_changed'
  );
});

/**
 * Return the JSON result.
 */
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
