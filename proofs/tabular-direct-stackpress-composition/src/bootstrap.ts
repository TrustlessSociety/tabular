import fs from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { server } from '@stackpress/ingest/http';
import { serve } from 'reactus';
import { createProofDatabase } from './database.js';
import { CapabilityError, createCapability, type RenameAction } from './capability.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  issueProofSession,
  loadPrincipal,
  requireCsrf,
  requireSameOrigin,
  setSessionCookie,
  type Principal
} from './security.js';

type RuntimeOptions = {
  cwd?: string;
  port?: number;
  secureCookie?: boolean;
};

function contentType(file: string) {
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function safeBootstrap(props: Record<string, unknown>) {
  for (const value of Object.values(props)) {
    if (typeof value === 'string' && !/^[A-Za-z0-9._:-]+$/.test(value)) {
      throw new Error('Unsafe value at Reactus hydration-props boundary');
    }
  }
  return props;
}

function statusOf(error: unknown) {
  return typeof error === 'object' && error && 'statusCode' in error
    ? Number(error.statusCode)
    : 500;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function createProofRuntime(options: RuntimeOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const database = await createProofDatabase();
  const capability = createCapability(database);
  const reactus = serve({
    cwd,
    clientRoute: '/client',
    cssRoute: '/assets',
    pagePath: path.join(cwd, '.build/pages')
  });
  const app = server();
  let origin = '';

  async function principalFor(req: Parameters<typeof loadPrincipal>[0]) {
    return await loadPrincipal(req, database);
  }

  async function serveBuiltFile(
    pathname: string,
    prefix: string,
    root: string,
    res: any
  ) {
    const relative = decodeURIComponent(pathname.slice(prefix.length)).replace(/^\/+/, '');
    const base = path.resolve(root);
    const absolute = path.resolve(base, relative);
    if (!absolute.startsWith(`${base}${path.sep}`)) {
      res.json({ error: 'Asset path denied' }, 403);
      return;
    }
    const body = await fs.readFile(absolute).catch(() => undefined);
    if (!body) {
      res.json({ error: 'Asset not found' }, 404);
      return;
    }
    res.set(contentType(absolute), body);
  }

  app.get('/client/**', async ({ req, res }) => {
    await serveBuiltFile(req.url.pathname, '/client', path.join(cwd, 'public/client'), res);
  });
  app.get('/assets/**', async ({ req, res }) => {
    await serveBuiltFile(req.url.pathname, '/assets', path.join(cwd, 'public/assets'), res);
  });
  app.get('/favicon.ico', ({ res }) => {
    res.set('image/x-icon', Buffer.alloc(0), 204);
  });

  app.get('/proof', async ({ req, res }) => {
    try {
      const principal = await principalFor(req);
      const record = principal ? await database.readRecord(1) : undefined;
      const props = safeBootstrap(principal ? {
        authenticated: true,
        capability: 'tabular.capability',
        csrfToken: principal.csrfToken,
        expectedVersion: record.version,
        recordId: record.id
      } : {
        authenticated: false,
        capability: 'tabular.capability'
      });
      res.headers.set('Cache-Control', 'no-store');
      res.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      );
      res.html(await reactus.render('@/pages/proof', props));
    } catch (error) {
      res.json({ error: messageOf(error) }, statusOf(error));
    }
  });

  app.post('/proof/login', async ({ req, res }) => {
    try {
      requireSameOrigin(req, origin);
      if (req.data.get('credential') !== 'proof-secret') {
        res.json({ error: 'Proof identity denied' }, 401);
        return;
      }
      const prior = req.session.get(SESSION_COOKIE);
      const session = await issueProofSession(
        database,
        typeof prior === 'string' ? prior : undefined
      );
      setSessionCookie(res, session.id, Boolean(options.secureCookie));
      res.json({ authenticated: true });
    } catch (error) {
      res.json({ error: messageOf(error) }, statusOf(error));
    }
  });

  app.post('/proof/rename', async ({ req, res }) => {
    try {
      const principal = await principalFor(req);
      if (!principal) throw new CapabilityError('Authentication required', 401);
      requireCsrf(req, principal, origin);
      const action: RenameAction = {
        action: 'record.rename',
        expectedVersion: Number(req.data.get('expectedVersion')),
        id: Number(req.data.get('id')),
        name: String(req.data.get('name') || '')
      };
      const record = await capability.execute(principal, action);
      res.json(record);
    } catch (error) {
      res.json({ error: messageOf(error) }, statusOf(error));
    }
  });

  app.post('/proof/mcp', async ({ req, res }) => {
    try {
      if (
        req.headers.get('authorization') !== 'Proof alice'
        || req.headers.get('x-proof-role') !== 'tabular_member'
      ) {
        throw new CapabilityError('MCP identity denied', 401);
      }
      const principal: Principal = {
        subject: 'alice',
        databaseRole: 'tabular_member',
        sessionId: 'mcp-proof-transport',
        csrfToken: 'not-used-by-mcp'
      };
      const action: RenameAction = {
        action: 'record.rename',
        expectedVersion: Number(req.data.get('expectedVersion')),
        id: Number(req.data.get('id')),
        name: String(req.data.get('name') || '')
      };
      res.json(await capability.execute(principal, action));
    } catch (error) {
      res.json({ error: messageOf(error) }, statusOf(error));
    }
  });

  app.post('/proof/logout', async ({ req, res }) => {
    try {
      const principal = await principalFor(req);
      if (!principal) throw new CapabilityError('Authentication required', 401);
      requireCsrf(req, principal, origin);
      await database.revokeSession(principal.sessionId);
      clearSessionCookie(res);
      res.json({ revoked: true });
    } catch (error) {
      res.json({ error: messageOf(error) }, statusOf(error));
    }
  });

  app.get('/proof/render-error', async ({ res }) => {
    try {
      res.html(await reactus.render('@/pages/missing'));
    } catch (error) {
      res.json({ error: 'Render boundary contained', detail: messageOf(error) }, 500);
    }
  });

  app.get('/**', ({ res }) => {
    if (!res.code) res.json({ error: 'Not found' }, 404);
  });

  const httpServer = app.create();
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port || 0, '127.0.0.1', () => resolve());
  });
  const address = httpServer.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;

  return {
    app,
    capability,
    database,
    httpServer,
    origin,
    async close() {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      });
      await database.close();
    }
  };
}
