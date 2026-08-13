//node
import type { IncomingMessage, ServerResponse } from 'node:http';

//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { RUNTIME_SERVICE, type ApplicationRuntimeService } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { OPERATIONS_SERVICE } from '../../operations/helpers/service.js';
import type { OperationEventReader } from '../../operations/events/stream.js';
import { REALTIME_SERVICE, type RealtimePluginService } from '../helpers/service.js';

const realtimeEvents: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const runtime = ctx.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const realtime = ctx.plugin<RealtimePluginService>(REALTIME_SERVICE);
  const operations = ctx.plugin<OperationEventReader>(OPERATIONS_SERVICE);
  exactQuery(req.url.searchParams, ['fileId', 'scope', 'cursor']);
  requireSameOrigin(
    req.headers.get('origin'),
    req.headers.get('sec-fetch-site'),
    runtime.config.environment.publicOrigin
  );
  const principal = await identity.authenticateBrowserSession(req.session(identity.cookieName()));
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
};

function exactQuery(parameters: URLSearchParams, allowed: string[]) {
  if ([...parameters.keys()].some((key) => !allowed.includes(key))
    || allowed.some((key) => parameters.getAll(key).length > 1)) {
    throw new ApplicationError('invalid_query', 400, 'The event subscription query is invalid');
  }
}

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

function identifier(value: string | null, label: string, expression: RegExp) {
  if (!value || !expression.test(value)) {
    throw new ApplicationError('invalid_query', 400, `The event ${label} is invalid`);
  }
  return value;
}

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

function invalidSession(): never {
  throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
}

function invalidSubscription(): never {
  throw new ApplicationError('invalid_query', 400, 'The event subscription scope is invalid');
}

export default realtimeEvents;
