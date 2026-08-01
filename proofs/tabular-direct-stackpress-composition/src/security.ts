import crypto from 'node:crypto';
import type { Request, Response } from '@stackpress/ingest/http';
import type { ProofDatabase, SessionRow } from './database.js';

export const SESSION_COOKIE = 'id';

export type Principal = {
  subject: string;
  databaseRole: string;
  sessionId: string;
  csrfToken: string;
};

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function equalToken(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function issueProofSession(
  database: ProofDatabase,
  priorId?: string
) {
  if (priorId) await database.revokeSession(priorId);
  const now = new Date();
  const row: SessionRow = {
    id: randomToken(),
    subject: 'alice',
    database_role: 'tabular_member',
    csrf_token: randomToken(),
    created_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString()
  };
  await database.createSession(row);
  return row;
}

export async function loadPrincipal(
  req: Request,
  database: ProofDatabase
): Promise<Principal | undefined> {
  const raw = req.session.get(SESSION_COOKIE);
  if (!raw || Array.isArray(raw)) return undefined;
  const session = await database.findActiveSession(raw);
  if (!session) return undefined;
  return {
    subject: session.subject,
    databaseRole: session.database_role,
    sessionId: session.id,
    csrfToken: session.csrf_token
  };
}

export function requireSameOrigin(req: Request, origin: string) {
  if (req.headers.get('origin') !== origin) {
    throw Object.assign(new Error('Origin denied'), { statusCode: 403 });
  }
}

export function requireCsrf(req: Request, principal: Principal, origin: string) {
  requireSameOrigin(req, origin);
  const token = req.headers.get('x-csrf-token');
  if (typeof token !== 'string' || !equalToken(token, principal.csrfToken)) {
    throw Object.assign(new Error('CSRF token denied'), { statusCode: 403 });
  }
}

export function setSessionCookie(res: Response, sessionId: string, secure: boolean) {
  res.session.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    maxAge: 30 * 60,
    path: '/',
    sameSite: 'strict',
    secure
  });
  res.headers.set('Cache-Control', 'no-store');
}

export function clearSessionCookie(res: Response) {
  res.session.delete(SESSION_COOKIE);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"');
}
