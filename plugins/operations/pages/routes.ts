import type { HttpServer } from '@stackpress/ingest/types';
import type { Response } from '@stackpress/ingest/http';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import { versionPublicArtifactReferences } from '../../app/helpers/assets.js';
import type {
  OperationActivity,
  OperationActivityList,
  OperationState
} from '../helpers/contracts.js';
import { presentOperationActivity, presentOperationList } from './presenter.js';

export const OPERATIONS_ROUTES = [
  '/pages/system-activity.html',
  '/events/operations'
] as const;

/** Structural route boundary keeps HTTP/browser concerns out of the worker service. */
export type OperationsRouteService = {
  list(principal: BrowserPrincipal, input: { status?: OperationState[]; limit?: number }): Promise<OperationActivityList>;
  get(principal: BrowserPrincipal, jobId: string): Promise<OperationActivity | undefined>;
  markRead(principal: BrowserMutationPrincipal, jobId: string): Promise<OperationActivity | undefined>;
  cancel(principal: BrowserMutationPrincipal, jobId: string): Promise<OperationActivity | undefined>;
  retry(principal: BrowserMutationPrincipal, jobId: string): Promise<OperationActivity | undefined>;
  acknowledge(principal: BrowserMutationPrincipal, jobId: string): Promise<OperationActivity | undefined>;
  retention(principal: BrowserMutationPrincipal, input: { retentionDays: number; limit: number }): Promise<unknown>;
};

export function registerOperationsRoutes(
  server: HttpServer<any, any>,
  runtime: ApplicationRuntimeService,
  identity: IdentityPluginService,
  operations: OperationsRouteService
) {
  server.get('/pages/system-activity.html', async ({ req, res }) => {
    exactQuery(req.url.searchParams, []);
    const resumed = await identity.resumeBrowserSession(req.session(identity.cookieName()));
    if (!resumed) {
      await renderProductPage(res, runtime, { surface: 'auth-required' }, 401);
      return;
    }
    const snapshot = await operations.list(resumed.principal, { limit: 100 });
    await renderProductPage(res, runtime, {
      surface: 'activity',
      connectionDisplayName: displayConnectionName(resumed.principal.connectionId),
      identity: {
        displayName: resumed.principal.displayName || resumed.principal.identityId
      },
      snapshot: presentOperationList(snapshot),
      csrfToken: resumed.csrfToken
    });
  });

  server.get('/events/operations', async ({ req, res }) => {
    exactQuery(req.url.searchParams, ['jobId']);
    const resumed = await identity.resumeBrowserSession(req.session(identity.cookieName()));
    if (!resumed) invalidSession();
    res.headers.set('Cache-Control', 'no-store, private');
    res.headers.set('X-Tabular-CSRF', resumed.csrfToken);
    const requested = req.url.searchParams.get('jobId');
    if (requested) {
      const operation = await operations.get(resumed.principal, jobId(requested));
      if (!operation) unavailable();
      res.json({ status: 'ok', data: presentOperationActivity(operation) });
      return;
    }
    res.json({
      status: 'ok',
      data: presentOperationList(await operations.list(resumed.principal, { limit: 100 }))
    });
  });

  server.post('/events/operations', async ({ req, res }) => {
    requireJson(req.headers.get('content-type'));
    const principal = await identity.requireBrowserMutation({
      cookieToken: req.session(identity.cookieName()),
      csrfToken: req.headers.get('x-tabular-csrf'),
      origin: req.headers.get('origin')
    });
    const action = operationAction(req.data.get('action'));
    res.headers.set('Cache-Control', 'no-store, private');
    if (action.type === 'operations.retention.apply') {
      await operations.retention(principal, {
        retentionDays: action.retentionDays,
        limit: action.limit
      });
      res.json({ status: 'ok', data: { retentionDays: action.retentionDays } });
      return;
    }
    const operation = action.type === 'operation.retry'
      ? await operations.retry(principal, action.jobId)
      : action.type === 'operation.cancel'
        ? await operations.cancel(principal, action.jobId)
        : action.type === 'operation.acknowledge'
          ? await operations.acknowledge(principal, action.jobId)
          : await operations.markRead(principal, action.jobId);
    if (!operation) unavailable();
    res.json({ status: 'ok', data: presentOperationActivity(operation) });
  });
}

/** Converts the configured connection slug into a readable product label. */
function displayConnectionName(connectionId: string) {
  const words = connectionId.replace(/[_-]+/g, ' ').trim();
  return words
    ? words[0]!.toLocaleUpperCase() + words.slice(1)
    : connectionId;
}

export type OperationRouteAction =
  | { type: 'operation.retry'; jobId: string }
  | { type: 'operation.cancel'; jobId: string }
  | { type: 'operation.acknowledge'; jobId: string }
  | { type: 'operation.mark-read'; jobId: string }
  | { type: 'operations.retention.apply'; retentionDays: number; limit: number };

export function operationAction(input: unknown): OperationRouteAction {
  const record = object(input, 'Operation action');
  const type = record.type;
  if (type === 'operations.retention.apply') {
    exactKeys(record, ['type', 'retentionDays', 'limit']);
    const retentionDays = boundedInteger(record.retentionDays, 'retention days', 30, 365);
    if (![30, 90, 180, 365].includes(retentionDays)) {
      throw new ApplicationError('invalid_action', 400, 'The retention period is invalid');
    }
    return {
      type,
      retentionDays,
      limit: boundedInteger(record.limit, 'retention limit', 1, 500)
    };
  }
  if (type === 'operation.retry' || type === 'operation.cancel'
    || type === 'operation.acknowledge' || type === 'operation.mark-read') {
    exactKeys(record, ['type', 'jobId']);
    return { type, jobId: jobId(record.jobId) };
  }
  throw new ApplicationError('invalid_action', 400, 'The operation action is invalid');
}

async function renderProductPage(
  res: Response,
  runtime: ApplicationRuntimeService,
  page: Record<string, unknown>,
  code = 200
) {
  const resources = await runtime.resources.readiness();
  const status = runtime.lifecycle.phase === 'ready' && resources.ready ? 'ready' : 'starting';
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );
  if (!runtime.reactus) throw new Error('Reactus is available only in the web process');
  const html = await runtime.reactus.render(runtime.config.reactus.entry, {
    application: 'Tabular',
    status,
    version: runtime.config.app.version,
    ...page
  });
  res.html(versionPublicArtifactReferences(html, runtime.artifacts), code);
}

function exactQuery(parameters: URLSearchParams, allowed: string[]) {
  if ([...parameters.keys()].some((key) => !allowed.includes(key))
    || allowed.some((key) => parameters.getAll(key).length > 1)) {
    throw new ApplicationError('invalid_query', 400, 'The operation query is invalid');
  }
}

function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).length !== allowed.length
    || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new ApplicationError('invalid_action', 400, 'The operation action envelope is invalid');
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApplicationError('invalid_action', 400, `${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function jobId(value: unknown) {
  if (typeof value !== 'string' || !/^job_[A-Za-z0-9_-]{32,64}$/.test(value)) {
    throw new ApplicationError('invalid_action', 400, 'The operation ID is invalid');
  }
  return value;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new ApplicationError('invalid_action', 400, `The ${label} is invalid`);
  }
  return Number(value);
}

function requireJson(contentType: string | string[] | undefined) {
  if (typeof contentType !== 'string' || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new ApplicationError('invalid_content_type', 415, 'Operation actions require JSON');
  }
}

function invalidSession(): never {
  throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
}

function unavailable(): never {
  // Deliberately identical for unauthorized and absent operation IDs.
  throw new ApplicationError('operation_unavailable', 404, 'The requested operation is unavailable');
}
