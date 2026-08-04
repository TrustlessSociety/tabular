import type { Response } from '@stackpress/ingest/http';
import type { HttpServer } from '@stackpress/ingest/types';
import { ApplicationError } from '../../../bootstrap/errors.js';
import type { IdentityPluginService } from '../helpers/service.js';
import {
  renderPostgreSqlLogin,
  renderSignedInAccount
} from '../views/authentication.js';

export const IDENTITY_ROUTES = [
  '/auth/login',
  '/auth/account',
  '/auth/session',
  '/auth/session/rotate',
  '/auth/logout'
] as const;

export function registerIdentityRoutes(
  server: HttpServer<any, any>,
  identity: IdentityPluginService
) {
  server.get('/auth/login', async ({ req, res }) => {
    if (await identity.authenticateBrowserSession(req.session(identity.cookieName()))) {
      res.redirect('/', 303);
      return;
    }
    renderIdentityHtml(res, renderPostgreSqlLogin());
  });

  server.post('/auth/login', async ({ req, res }) => {
    identity.requireLoginOrigin(req.headers.get('origin'));
    try {
      requireForm(req.headers.get('content-type'));
      const credentials = loginCredentials(
        req.data.get('username'),
        req.data.get('password')
      );
      await identity.loginWithPostgreSqlCredentials({
        ...credentials,
        origin: req.headers.get('origin')
      }, res);
      res.redirect('/', 303);
    } catch (error) {
      if (
        error instanceof ApplicationError
        && error.errorCode === 'invalid_origin'
      ) {
        throw error;
      }
      renderIdentityHtml(res, renderPostgreSqlLogin(true), 401);
    }
  });

  server.get('/auth/account', async ({ req, res }) => {
    const resumed = await identity.resumeBrowserSession(
      req.session(identity.cookieName())
    );
    if (!resumed) {
      res.redirect('/auth/login', 303);
      return;
    }
    renderIdentityHtml(
      res,
      renderSignedInAccount(
        resumed.principal.displayName || 'PostgreSQL user',
        resumed.csrfToken
      )
    );
  });

  server.get('/auth/session', async ({ req, res }) => {
    res.headers.set('Cache-Control', 'no-store, private');
    const resumed = await identity.resumeBrowserSession(
      req.session(identity.cookieName())
    );
    if (!resumed) {
      res.json({ authenticated: false }, 401);
      return;
    }
    res.json({
      authenticated: true,
      csrfToken: resumed.csrfToken,
      identity: {
        id: resumed.principal.identityId,
        ...(resumed.principal.displayName
          ? { displayName: resumed.principal.displayName }
          : {})
      },
      expires: {
        idle: resumed.principal.idleExpiresAt.toISOString(),
        absolute: resumed.principal.absoluteExpiresAt.toISOString()
      }
    });
  });

  server.post('/auth/session/rotate', async ({ req, res }) => {
    requireJson(req.headers.get('content-type'));
    const rotated = await identity.rotateBrowserSession({
      cookieToken: req.session(identity.cookieName()),
      csrfToken: req.headers.get('x-tabular-csrf'),
      origin: req.headers.get('origin')
    }, res);
    res.json({
      csrfToken: rotated.csrfToken,
      expires: {
        idle: rotated.principal.idleExpiresAt.toISOString(),
        absolute: rotated.principal.absoluteExpiresAt.toISOString()
      }
    });
  });

  server.post('/auth/logout', async ({ req, res }) => {
    const contentType = req.headers.get('content-type');
    const isForm = isFormContentType(contentType);
    if (!isForm) requireJson(contentType);
    await identity.logoutBrowserSession({
      cookieToken: req.session(identity.cookieName()),
      csrfToken: isForm
        ? req.data.get('csrfToken') as string | string[] | undefined
        : req.headers.get('x-tabular-csrf'),
      origin: req.headers.get('origin')
    });
    identity.clearSessionCookie(res);
    if (isForm) res.redirect('/auth/login', 303);
    else res.json({ loggedOut: true });
  });
}

function loginCredentials(username: unknown, password: unknown) {
  if (
    typeof username !== 'string'
    || username !== username.trim()
    || username.length < 1
    || Buffer.byteLength(username, 'utf8') > 63
    || /[\u0000-\u001f\u007f]/.test(username)
    || typeof password !== 'string'
    || password.length < 1
    || password.length > 1_024
    || password.includes('\u0000')
  ) {
    throw new ApplicationError('authentication_failed', 401, 'Sign-in failed');
  }
  return { roleName: username, password };
}

function renderIdentityHtml(
  response: Response,
  html: string,
  status = 200
) {
  response.headers.set('Cache-Control', 'no-store, private');
  response.headers.set('Referrer-Policy', 'strict-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  );
  response.html(html, status);
}

function requireForm(contentType: string | string[] | undefined) {
  if (!isFormContentType(contentType)) {
    throw new ApplicationError('authentication_failed', 401, 'Sign-in failed');
  }
}

function isFormContentType(contentType: string | string[] | undefined) {
  return typeof contentType === 'string'
    && /^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(contentType);
}

function requireJson(contentType: string | string[] | undefined) {
  if (
    typeof contentType !== 'string'
    || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)
  ) {
    throw new ApplicationError('invalid_content_type', 415, 'A JSON request is required');
  }
}
