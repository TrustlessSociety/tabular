import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpServer } from '@stackpress/ingest/types';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { FilesPluginService } from '../helpers/service.js';
import { registerFilesRoutes } from '../pages/routes.js';

test('file route describes files and reports owner-scoped DDL status through distinct queries', async () => {
  const harness = routeHarness();
  await harness.get['/events/files']!({
    req: request(`/events/files?fileId=obj_${'f'.repeat(43)}`),
    res: harness.response
  });
  assert.deepEqual(harness.calls.at(-1), {
    method: 'describe',
    identityId: harness.principal.identityId,
    id: `obj_${'f'.repeat(43)}`
  });

  await harness.get['/events/files']!({
    req: request(`/events/files?ddlRequestId=ddl_${'d'.repeat(43)}`),
    res: harness.response
  });
  assert.deepEqual(harness.calls.at(-1), {
    method: 'status',
    identityId: harness.principal.identityId,
    id: `ddl_${'d'.repeat(43)}`
  });
  assert.equal((harness.response.jsonBody as { status: string }).status, 'ok');
  assert.equal(harness.response.headers.get('x-tabular-csrf'), 'c'.repeat(64));
});

test('file route rejects ambiguous and expanded query envelopes', async () => {
  const harness = routeHarness();
  await assert.rejects(
    harness.get['/events/files']!({
      req: request(`/events/files?fileId=obj_${'f'.repeat(43)}&ddlRequestId=ddl_${'d'.repeat(43)}`),
      res: harness.response
    }),
    (error: unknown) => boundedInvalidQuery(error)
  );
  await assert.rejects(
    harness.get['/events/files']!({
      req: request(`/events/files?ddlRequestId=ddl_${'d'.repeat(43)}&identityId=id_attacker`),
      res: harness.response
    }),
    (error: unknown) => boundedInvalidQuery(error)
  );
  await assert.rejects(
    harness.get['/events/files']!({
      req: request(`/events/files?ddlRequestId=ddl_${'d'.repeat(43)}&ddlRequestId=ddl_${'e'.repeat(43)}`),
      res: harness.response
    }),
    (error: unknown) => boundedInvalidQuery(error)
  );
});

function boundedInvalidQuery(error: unknown) {
  return error instanceof Error
    && error.message === 'File query is invalid'
    && 'errorCode' in error
    && error.errorCode === 'invalid_query'
    && 'statusCode' in error
    && error.statusCode === 400;
}

function routeHarness() {
  type Request = ReturnType<typeof request>;
  type Handler = (context: { req: Request; res: typeof response }) => Promise<void>;
  const get: Record<string, Handler> = {};
  const server = {
    get(path: string, handler: Handler) { get[path] = handler; }
  } as unknown as HttpServer<any, any>;
  const principal: BrowserPrincipal = {
    transport: 'browser',
    sessionId: `sess_${'s'.repeat(32)}`,
    identityId: `id_${'i'.repeat(32)}`,
    connectionId: 'primary',
    historyScopeId: `hist_${'h'.repeat(32)}`,
    idleExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
    absoluteExpiresAt: new Date('2030-01-02T00:00:00.000Z')
  };
  const identity = {
    cookieName: () => 'tabular_session',
    resumeBrowserSession: async () => ({ principal, csrfToken: 'c'.repeat(64) })
  } as unknown as IdentityPluginService;
  const calls: Array<Record<string, string>> = [];
  const files = {
    async describe(caller: BrowserPrincipal, id: string) {
      calls.push({ method: 'describe', identityId: caller.identityId, id });
      return { id };
    },
    async status(caller: BrowserPrincipal, id: string) {
      calls.push({ method: 'status', identityId: caller.identityId, id });
      return { requestId: id, state: 'confirmed' };
    }
  } as unknown as FilesPluginService;
  response.headers = new Headers();
  response.jsonBody = undefined;
  registerFilesRoutes(server, identity, files);
  return { get, principal, calls, response };
}

const response = {
  headers: new Headers(),
  jsonBody: undefined as unknown,
  json(value: unknown) {
    this.jsonBody = value;
  }
};

function request(path: string) {
  return {
    url: new URL(path, 'http://tabular.test'),
    headers: new Headers(),
    session: () => 'cookie-token',
    data: new Map()
  };
}
