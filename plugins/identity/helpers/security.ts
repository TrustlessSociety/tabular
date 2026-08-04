import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from '@stackpress/ingest/types';
import type { SessionConfig } from '../../../config/sessions.js';
import { ApplicationError } from '../../../bootstrap/errors.js';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function opaqueToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function opaqueId(
  prefix: 'id' | 'role' | 'sess' | 'hist' | 'obj' | 'schema' | 'col' | 'act' | 'draft'
    | 'view' | 'evt' | 'job'
) {
  return `${prefix}_${opaqueToken()}`;
}

export function tokenHash(token: string) {
  if (!TOKEN_PATTERN.test(token)) {
    throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function matchesTokenHash(token: string, expectedHash: string) {
  let actual: Buffer;
  let expected: Buffer;
  try {
    actual = Buffer.from(tokenHash(token), 'hex');
    expected = Buffer.from(expectedHash, 'hex');
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function canonicalOrigin(value: string | undefined) {
  if (!value) throw new Error('TABULAR_PUBLIC_ORIGIN is required for browser mutations');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('TABULAR_PUBLIC_ORIGIN must be a valid URL origin');
  }
  if (
    value !== parsed.origin
    || !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('TABULAR_PUBLIC_ORIGIN must be exactly one canonical HTTP(S) origin');
  }
  return value;
}

export function requireExactOrigin(
  supplied: string | string[] | undefined,
  trustedOrigin: string | undefined
) {
  const trusted = canonicalOrigin(trustedOrigin);
  if (typeof supplied !== 'string' || supplied !== trusted) {
    throw new ApplicationError('invalid_origin', 403, 'The request origin is not trusted');
  }
}

export function sessionCookieOptions(config: SessionConfig): CookieOptions {
  return {
    httpOnly: config.httpOnly,
    secure: config.secure,
    sameSite: config.sameSite,
    path: '/',
    maxAge: config.maxAgeSeconds,
    priority: 'high'
  };
}

export function expiredSessionCookieOptions(config: SessionConfig): CookieOptions {
  return {
    ...sessionCookieOptions(config),
    maxAge: 0,
    expires: new Date(0)
  };
}
