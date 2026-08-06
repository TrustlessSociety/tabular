//node
import type { IncomingMessage, ServerResponse } from 'node:http';

//client
import type { ApplicationServer } from '../../../bootstrap/application.js';
import type { TabularConfig } from '../../../config/index.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { OperationEventReader } from '../../operations/events/stream.js';
import type { RealtimePluginService } from '../helpers/service.js';
import { ApplicationError } from '../../../bootstrap/errors.js';

//The realtime routes value exported for module callers
export const REALTIME_ROUTES = ['/events'] as const;

/**
 * Register the realtime routes.
 */
export function registerRealtimeRoutes(
  //Stackpress resolves installed services dynamically, so this route boundary
  // cannot name a complete static service map yet
  server: ApplicationServer,
  config: TabularConfig,
  identity: IdentityPluginService,
  realtime: RealtimePluginService,
  operations: OperationEventReader
) {
  server.get(config.sse.route, async ({ req, res }) => {
    exactQuery(req.url.searchParams, ['fileId', 'scope', 'cursor']);
    requireSameOrigin(
      req.headers.get('origin'),
      req.headers.get('sec-fetch-site'),
      config.environment.publicOrigin
    );
    const principal = await identity.authenticateBrowserSession(
      req.session(identity.cookieName())
    );
    if (!principal) invalidSession();
    const headerCursor = cursor(req.headers.get('last-event-id'));
    const queryCursor = cursor(req.url.searchParams.get('cursor'));
    const requestedScope = req.url.searchParams.get('scope');
    const requestedFileId = req.url.searchParams.get('fileId');
    const startCursor = headerCursor ?? queryCursor ?? 0;
    const stream = requestedScope === 'operations'
      ? requestedFileId === null
        ? realtime.openOperations(principal, operations, { cursor: startCursor })
        : invalidSubscription()
      : requestedScope === null
        ? realtime.open(principal, {
          fileId: identifier(requestedFileId, 'file ID', /^obj_[A-Za-z0-9_-]{32,64}$/),
          cursor: startCursor
        })
        : invalidSubscription();
    const response = res.resource as ServerResponse;
    const request = req.resource as IncomingMessage;
    /**
     * Close the current value.
     */
    const close = () => stream.destroy();
    response.once('close', close);
    request.once('aborted', close);
    stream.once('close', () => {
      response.off('close', close);
      request.off('aborted', close);
    });
    res.headers.set('Cache-Control', 'no-cache, no-store, no-transform, private');
    res.headers.set('X-Accel-Buffering', 'no');
    res.headers.set('Connection', 'keep-alive');
    res.set('text/event-stream; charset=utf-8', stream, 200);
  });
}

/**
 * Return the exact query result.
 */
function exactQuery(parameters: URLSearchParams, allowed: string[]) {
  if ([...parameters.keys()].some((key) => !allowed.includes(key))
    || allowed.some((key) => parameters.getAll(key).length > 1)) {
    throw new ApplicationError('invalid_query', 400, 'The event subscription query is invalid');
  }
}

/**
 * Return the require same origin result.
 */
function requireSameOrigin(
  origin: string | string[] | undefined,
  fetchSite: string | string[] | undefined,
  trustedOrigin: string | undefined
) {
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin') {
    throw new ApplicationError('invalid_origin', 403, 'The event subscription is not same-origin');
  }
  if (origin !== undefined && (
    typeof origin !== 'string' || !trustedOrigin || origin !== trustedOrigin
  )) {
    throw new ApplicationError('invalid_origin', 403, 'The request origin is not trusted');
  }
}

/**
 * Return the identifier result.
 */
function identifier(value: string | null, label: string, expression: RegExp) {
  if (!value || !expression.test(value)) {
    throw new ApplicationError('invalid_query', 400, `The event ${label} is invalid`);
  }
  return value;
}

/**
 * Return the cursor result.
 */
function cursor(value: string | string[] | null | undefined) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^[0-9]{1,19}$/.test(value)) {
    throw new ApplicationError('invalid_cursor', 400, 'The event cursor is invalid');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ApplicationError('invalid_cursor', 400, 'The event cursor is invalid');
  }
  return parsed;
}

/**
 * Report the invalid session condition.
 */
function invalidSession(): never {
  throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
}

/**
 * Report the invalid subscription condition.
 */
function invalidSubscription(): never {
  throw new ApplicationError('invalid_query', 400, 'The event subscription scope is invalid');
}
