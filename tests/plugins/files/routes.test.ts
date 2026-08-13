//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { BrowserPrincipal } from '../../../src/plugins/identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../../src/plugins/identity/helpers/service.js';
import type { FilesPluginService } from '../../../src/plugins/files/helpers/service.js';
import eventsFiles from '../../../src/plugins/files/pages/events-files.js';

test('file route describes files and reports owner-scoped DDL status through distinct queries', async () => {
  const harness = routeHarness();
  await harness.handler({
    req: request(`/events/files?fileId=obj_${'f'.repeat(43)}`),
    res: harness.response
  });
  assert.deepEqual(harness.calls.at(-1), {
    method: 'describe',
    identityId: harness.principal.identityId,
    id: `obj_${'f'.repeat(43)}`
  });

  await harness.handler({
    req: request(`/events/files?ddlRequestId=ddl_${'d'.repeat(43)}`),
    res: harness.response
  });
  assert.deepEqual(harness.calls.at(-1), {
    method: 'status',
    identityId: harness.principal.identityId,
    id: `ddl_${'d'.repeat(43)}`
  });
  assert.equal((harness.response.jsonBody as { status: string, }).status, 'ok');
  assert.equal(harness.response.headers.get('x-tabular-csrf'), 'c'.repeat(64));
});

test('file route rejects ambiguous and expanded query envelopes', async () => {
  const harness = routeHarness();
  await assert.rejects(
    harness.handler({
      req: request(`/events/files?fileId=obj_${'f'.repeat(43)}&ddlRequestId=ddl_${'d'.repeat(43)}`),
      res: harness.response
    }),
    (error: unknown) => boundedInvalidQuery(error)
  );
  await assert.rejects(
    harness.handler({
      req: request(`/events/files?ddlRequestId=ddl_${'d'.repeat(43)}&identityId=id_attacker`),
      res: harness.response
    }),
    (error: unknown) => boundedInvalidQuery(error)
  );
  await assert.rejects(
    harness.handler({
      req: request(`/events/files?ddlRequestId=ddl_${'d'.repeat(43)}&ddlRequestId=ddl_${'e'.repeat(43)}`),
      res: harness.response
    }),
    (error: unknown) => boundedInvalidQuery(error)
  );
});

/**
 * Return the bounded invalid query result.
 */
function boundedInvalidQuery(error: unknown) {
  return error instanceof Error
    && error.message === 'File query is invalid'
    && 'errorCode' in error
    && error.errorCode === 'invalid_query'
    && 'statusCode' in error
    && error.statusCode === 400;
}

/**
 * Return the route harness result.
 */
function routeHarness() {
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
    /**
     * Describe the current value.
     */
    async describe(caller: BrowserPrincipal, id: string) {
      calls.push({ method: 'describe', identityId: caller.identityId, id });
      return { id };
    },
    /**
     * Handle the status operation.
     */
    async status(caller: BrowserPrincipal, id: string) {
      calls.push({ method: 'status', identityId: caller.identityId, id });
      return { requestId: id, state: 'confirmed' };
    }
  } as unknown as FilesPluginService;
  response.headers = new Headers();
  response.jsonBody = undefined;
  const plugins = new Map<string, unknown>([
    ['tabular.identity', identity],
    ['tabular.files', files]
  ]);
  return {
    handler: async (context: { req: ReturnType<typeof request>, res: typeof response, }) => {
      await eventsFiles({ ...context, ctx: { plugin: <T>(name: string) => plugins.get(name) as T } } as never);
    },
    principal,
    calls,
    response
  };
}

const response = {
  headers: new Headers(),
  jsonBody: undefined as unknown,
  /**
   * Handle the JSON operation.
   */
  json(value: unknown) {
    this.jsonBody = value;
  }
};

/**
 * Return the request with the bounded body loader attached.
 */
function request(path: string) {
  return {
    url: new URL(path, 'http://tabular.test'),
    headers: new Headers(),
    session: () => 'cookie-token',
    data: new Map()
  };
}
