//node
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto';

//client
import { ApplicationError } from '../../../bootstrap/errors.js';
import { deterministicFingerprint } from './fingerprint.js';

const GOOGLE_SOURCE_BYTES = 8 * 1024 * 1024;
const GOOGLE_ROWS = 50_001;
const GOOGLE_COLUMNS = 200;
const SHEETS_MEDIA_TYPE = 'application/vnd.google-apps.spreadsheet';
//The google readonly scopes value exported for module callers
export const GOOGLE_READONLY_SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly'
] as const;
//The google readonly scope value exported for module callers
export const GOOGLE_READONLY_SCOPE = GOOGLE_READONLY_SCOPES.join(' ');

//The encrypted google secret contract exported for module callers
export type EncryptedGoogleSecret = {
  ciphertext: string,
  iv: string,
  tag: string,
};

/**
 * Provide the google token vault behavior used by this module.
 */
export class GoogleTokenVault {
  /**
   * Create a GoogleTokenVault instance.
   */
  public constructor(private readonly key: Buffer) {
    if (!Buffer.isBuffer(key) || key.byteLength !== 32) {
      throw new Error('TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes');
    }
  }

  /**
   * Handle the encrypt operation.
   */
  public encrypt(value: string, associatedData: string): EncryptedGoogleSecret {
    const secret = secretText(value);
    const aad = associatedDataText(associatedData);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64')
    };
  }

  /**
   * Handle the decrypt operation.
   */
  public decrypt(value: EncryptedGoogleSecret, associatedData: string) {
    const aad = associatedDataText(associatedData);
    try {
      const ciphertext = base64(value.ciphertext, 'ciphertext');
      const iv = base64(value.iv, 'initialization vector', 12);
      const tag = base64(value.tag, 'authentication tag', 16);
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(tag);
      return secretText(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'google_secret_invalid',
        500,
        'Stored Google credentials could not be decrypted'
      );
    }
  }
}

/**
 * Return the google token encryption key result.
 */
export function googleTokenEncryptionKey(value: string | undefined) {
  if (!value || value !== value.trim() || /[\u0000-\u0020\u007f]/.test(value)) {
    throw new Error('TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes');
  }
  const key = /^[a-fA-F0-9]{64}$/.test(value)
    ? Buffer.from(value, 'hex')
    : /^[A-Za-z0-9_-]{43}$/.test(value)
      ? Buffer.from(value, 'base64url')
      : undefined;
  if (!key || key.byteLength !== 32) {
    throw new Error('TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes');
  }
  return key;
}

//The google sheets credentials contract exported for module callers
export type GoogleSheetsCredentials = {
  clientId: string,
  clientSecret: string,
  redirectUri: string,
};

//The Google OAuth token contract exported for module callers
export type GoogleOAuthTokens = {
  accessToken: string,
  expiresIn: number,
  refreshToken?: string,
  scope: string,
};

//The google spreadsheet choice contract exported for module callers
export type GoogleSpreadsheetChoice = {
  id: string,
  name: string,
  modifiedTime: string,
  version: string,
};

//The google sheet values contract exported for module callers
export type GoogleSheetValues = {
  spreadsheetId: string,
  spreadsheetName: string,
  spreadsheetVersion: string,
  modifiedTime: string,
  sheetName: string,
  rows: Array<Array<string | null>>,
  rowCount: number,
  columnCount: number,
  sourceFingerprint: string,
  provenance: {
    provider: 'google-sheets',
    valueRenderOption: 'FORMATTED_VALUE',
    formulasImported: false,
    spreadsheetId: string,
    spreadsheetVersion: string,
    sheetName: string,
  },
};

/**
 * Real OAuth/Drive/Sheets boundary. It never returns or persists formula text.
 */
export class GoogleSheetsClient {
  /**
   * Create a GoogleSheetsClient instance.
   */
  public constructor(
    private readonly credentials: GoogleSheetsCredentials,
    private readonly fetcher: typeof fetch = fetch
  ) {
    for (const value of Object.values(credentials)) {
      if (!value || /[\u0000-\u001f\u007f]/.test(value)) invalid('Google OAuth configuration is invalid');
    }
  }

  /**
   * Handle the authorization URL operation.
   */
  public authorizationUrl(input: { state: string, codeChallenge: string, }) {
    boundedToken(input.state, 'Google OAuth state', 512);
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)) {
      invalid('Google OAuth PKCE challenge is invalid');
    }
    const query = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: this.credentials.redirectUri,
      response_type: 'code',
      scope: GOOGLE_READONLY_SCOPE,
      access_type: 'offline',
      include_granted_scopes: 'false',
      prompt: 'consent',
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }

  /**
   * Handle the exchange code operation.
   */
  public async exchangeCode(input: { code: string, codeVerifier: string, }) {
    boundedToken(input.code, 'Google OAuth code', 2_048);
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) {
      invalid('Google OAuth PKCE verifier is invalid');
    }
    return this.tokenRequest(new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      redirect_uri: this.credentials.redirectUri,
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier
    }), true);
  }

  /**
   * Handle the refresh operation.
   */
  public async refresh(refreshToken: string) {
    boundedToken(refreshToken, 'Google OAuth refresh token', 4_096);
    return this.tokenRequest(new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }), false);
  }

  /**
   * Revoke the current value.
   */
  public async revoke(token: string) {
    const response = await this.fetcher('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ token: bearer(token) })
    });
    if (response.ok) return;
    let body: Record<string, unknown> = {};
    try { body = await boundedJson<Record<string, unknown>>(response); } catch { /* sanitized below */ }
    throw providerError(response.status, body);
  }

  /**
   * List the spreadsheets.
   */
  public async listSpreadsheets(accessToken: string, pageToken?: string) {
    const token = bearer(accessToken);
    if (pageToken) boundedToken(pageToken, 'Google Drive page token', 2_048);
    const query = new URLSearchParams({
      q: `mimeType='${SHEETS_MEDIA_TYPE}' and trashed=false`,
      orderBy: 'modifiedTime desc,name',
      pageSize: '100',
      fields: 'nextPageToken,files(id,name,modifiedTime,version,mimeType)'
    });
    if (pageToken) query.set('pageToken', pageToken);
    const body = await this.googleJson<{
      nextPageToken?: unknown,
      files?: unknown,
    }>(`https://www.googleapis.com/drive/v3/files?${query}`, token);
    if (!Array.isArray(body.files) || body.files.length > 100) providerInvalid();
    const files = body.files.map((entry) => spreadsheetChoice(entry));
    return {
      files,
      ...(typeof body.nextPageToken === 'string'
        ? { nextPageToken: boundedToken(body.nextPageToken, 'Google Drive page token', 2_048) }
        : {})
    };
  }

  /**
   * Handle the worksheet names operation.
   */
  public async worksheetNames(accessToken: string, spreadsheetId: string) {
    const token = bearer(accessToken);
    const id = providerId(spreadsheetId, 'Google spreadsheet identity');
    const query = new URLSearchParams({ fields: 'spreadsheetId,properties.title,sheets.properties(sheetId,title,index,gridProperties)' });
    const body = await this.googleJson<Record<string, unknown>>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?${query}`,
      token
    );
    const sheets = Array.isArray(body.sheets) ? body.sheets : providerInvalid();
    if (sheets.length < 1 || sheets.length > 32) providerInvalid();
    return sheets.map((entry) => {
      const properties = record(record(entry, 'Google worksheet').properties, 'Google worksheet properties');
      return boundedText(properties.title, 'Google worksheet name', 100);
    });
  }

  /**
   * Import the values.
   */
  public async importValues(input: {
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
  }): Promise<GoogleSheetValues> {
    const token = bearer(input.accessToken);
    const id = providerId(input.spreadsheetId, 'Google spreadsheet identity');
    const sheetName = boundedText(input.sheetName, 'Google worksheet name', 100);
    const before = await this.fileRevision(token, id);
    const names = await this.worksheetNames(token, id);
    if (!names.includes(sheetName)) {
      throw new ApplicationError('google_sheet_unavailable', 409, 'The selected Google worksheet is unavailable');
    }
    const query = new URLSearchParams({
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });
    const body = await this.googleJson<{ range?: unknown, majorDimension?: unknown, values?: unknown, }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(sheetName)}?${query}`,
      token
    );
    const rows = normalizeValues(body.values);
    const after = await this.fileRevision(token, id);
    if (before.version !== after.version || before.modifiedTime !== after.modifiedTime) {
      throw new ApplicationError(
        'google_source_changed',
        409,
        'The Google spreadsheet changed while values were read. Review a fresh preview before importing.'
      );
    }
    const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    const normalized = rows.map((row) => [
      ...row,
      ...Array<string | null>(Math.max(0, columnCount - row.length)).fill(null)
    ]);
    const sourceFingerprint = deterministicFingerprint({
      contract: 'tabular-google-values-v1',
      spreadsheetId: id,
      spreadsheetVersion: before.version,
      sheetName,
      rows: normalized
    });
    return {
      spreadsheetId: id,
      spreadsheetName: before.name,
      spreadsheetVersion: before.version,
      modifiedTime: before.modifiedTime,
      sheetName,
      rows: normalized,
      rowCount: normalized.length,
      columnCount,
      sourceFingerprint,
      provenance: {
        provider: 'google-sheets',
        valueRenderOption: 'FORMATTED_VALUE',
        formulasImported: false,
        spreadsheetId: id,
        spreadsheetVersion: before.version,
        sheetName
      }
    };
  }

  /**
   * Handle the file revision operation.
   */
  public async fileRevision(accessToken: string, spreadsheetId: string) {
    const token = bearer(accessToken);
    const id = providerId(spreadsheetId, 'Google spreadsheet identity');
    const query = new URLSearchParams({ fields: 'id,name,modifiedTime,version,mimeType,trashed' });
    const body = await this.googleJson<Record<string, unknown>>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?${query}`,
      token
    );
    if (body.mimeType !== SHEETS_MEDIA_TYPE || body.trashed === true) providerInvalid();
    return spreadsheetChoice(body);
  }

  /**
   * Handle the token request operation.
   */
  private async tokenRequest(
    parameters: URLSearchParams,
    scopeRequired: boolean
  ): Promise<GoogleOAuthTokens> {
    const response = await this.fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: parameters
    });
    const body = await boundedJson<Record<string, unknown>>(response);
    if (!response.ok) throw providerError(response.status, body);
    if (body.token_type !== 'Bearer'
      || typeof body.access_token !== 'string'
      || !Number.isSafeInteger(body.expires_in)
      || Number(body.expires_in) < 1
      || Number(body.expires_in) > 86_400
      || (scopeRequired && typeof body.scope !== 'string')) providerInvalid();
    const scope = typeof body.scope === 'string'
      ? approvedScope(body.scope)
      : GOOGLE_READONLY_SCOPE;
    return {
      accessToken: boundedToken(body.access_token, 'Google access token', 8_192),
      expiresIn: Number(body.expires_in),
      ...(typeof body.refresh_token === 'string'
        ? { refreshToken: boundedToken(body.refresh_token, 'Google refresh token', 8_192) } : {}),
      scope
    };
  }

  /**
   * Handle the google JSON operation.
   */
  private async googleJson<T>(url: string, accessToken: string): Promise<T> {
    const response = await this.fetcher(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }
    });
    const body = await boundedJson<Record<string, unknown>>(response);
    if (!response.ok) throw providerError(response.status, body);
    return body as T;
  }
}

/**
 * Return the google pkce challenge result.
 */
export function googlePkceChallenge(verifier: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) invalid('Google OAuth PKCE verifier is invalid');
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Return the approved scope result.
 */
function approvedScope(value: string) {
  const scopes = boundedText(value, 'Google OAuth scope', 2_048).split(/\s+/).filter(Boolean);
  if (scopes.length !== GOOGLE_READONLY_SCOPES.length
    || GOOGLE_READONLY_SCOPES.some((scope) => !scopes.includes(scope))) {
    throw new ApplicationError(
      'google_scope_denied',
      403,
      'Google did not grant exactly the approved readonly scopes'
    );
  }
  return GOOGLE_READONLY_SCOPE;
}

/**
 * Return the associated data text result.
 */
function associatedDataText(value: string) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048 || value.includes('\u0000')) {
    throw new ApplicationError('google_secret_invalid', 500, 'Google credential binding is invalid');
  }
  return value;
}

/**
 * Return the secret text result.
 */
function secretText(value: string) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 8_192 || value.includes('\u0000')) {
    throw new ApplicationError('google_secret_invalid', 500, 'Google credential secret is invalid');
  }
  return value;
}

/**
 * Return the base64 result.
 */
function base64(value: string, label: string, exactLength?: number) {
  if (typeof value !== 'string'
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new ApplicationError('google_secret_invalid', 500, `Google credential ${label} is invalid`);
  }
  const bytes = Buffer.from(value, 'base64');
  if ((exactLength && bytes.byteLength !== exactLength) || (!exactLength && bytes.byteLength < 1)) {
    throw new ApplicationError('google_secret_invalid', 500, `Google credential ${label} is invalid`);
  }
  return bytes;
}

/**
 * Return the bounded JSON result.
 */
async function boundedJson<T>(response: Response): Promise<T> {
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > GOOGLE_SOURCE_BYTES) providerTooLarge();
  if (!response.body) providerInvalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > GOOGLE_SOURCE_BYTES) {
      await reader.cancel();
      providerTooLarge();
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch {
    providerInvalid();
  }
}

/**
 * Normalize the values.
 */
function normalizeValues(value: unknown) {
  if (typeof value === 'undefined') return [];
  if (!Array.isArray(value) || value.length > GOOGLE_ROWS) providerTooLarge();
  return value.map((row) => {
    if (!Array.isArray(row) || row.length > GOOGLE_COLUMNS) providerTooLarge();
    return row.map((cell) => {
      if (cell === null || typeof cell === 'undefined') return null;
      if (typeof cell !== 'string' || cell.length > 1_000_000 || cell.includes('\u0000')) providerInvalid();
      return cell;
    });
  });
}

/**
 * Return the spreadsheet choice result.
 */
function spreadsheetChoice(value: unknown): GoogleSpreadsheetChoice {
  const entry = record(value, 'Google spreadsheet');
  if (entry.mimeType !== SHEETS_MEDIA_TYPE) providerInvalid();
  return {
    id: providerId(entry.id, 'Google spreadsheet identity'),
    name: boundedText(entry.name, 'Google spreadsheet name', 255),
    modifiedTime: isoTime(entry.modifiedTime),
    version: boundedToken(String(entry.version), 'Google spreadsheet version', 80)
  };
}

/**
 * Return the provider error result.
 */
function providerError(status: number, body: Record<string, unknown>) {
  const message = providerMessage(body);
  if (status === 401) return new ApplicationError('google_reauthentication_required', 401, 'Google access was revoked or expired. Reconnect before importing.');
  if (status === 403) return new ApplicationError('google_permission_denied', 403, 'Google denied access to this spreadsheet.');
  if (status === 429 || status === 503) return new ApplicationError('google_rate_limited', 503, 'Google is temporarily rate limiting the import. Retry the staged read.', true);
  return new ApplicationError('google_provider_error', 502, message || 'Google Sheets is temporarily unavailable');
}

/**
 * Return the provider message result.
 */
function providerMessage(body: Record<string, unknown>) {
  const error = body.error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return undefined;
  const value = (error as Record<string, unknown>).message;
  return typeof value === 'string' && value.length <= 300 ? value : undefined;
}

/**
 * Return the bearer result.
 */
function bearer(value: string) {
  return boundedToken(value, 'Google access token', 8_192);
}

/**
 * Return the provider id result.
 */
function providerId(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{10,256}$/.test(value)) providerInvalid();
  return value;
}

/**
 * Return the bounded text result.
 */
function boundedText(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || /[\u0000-\u001f\u007f]/.test(value)) invalid(`${label} is invalid`);
  return value;
}

/**
 * Return the bounded token result.
 */
function boundedToken(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || /[\u0000-\u0020\u007f]/.test(value)) invalid(`${label} is invalid`);
  return value;
}

/**
 * Return the iso time result.
 */
function isoTime(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) providerInvalid();
  return new Date(value).toISOString();
}

/**
 * Return the record result.
 */
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} is invalid`);
  return value as Record<string, unknown>;
}

/**
 * Return the invalid result.
 */
function invalid(message: string): never {
  throw new ApplicationError('google_import_invalid', 400, message);
}

/**
 * Return the provider invalid result.
 */
function providerInvalid(): never {
  throw new ApplicationError('google_provider_invalid', 502, 'Google returned an invalid or unsupported response');
}

/**
 * Return the provider too large result.
 */
function providerTooLarge(): never {
  throw new ApplicationError('google_source_too_large', 413, 'Google source exceeds the bounded import limits');
}
