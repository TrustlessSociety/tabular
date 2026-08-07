//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { OperationActivity, OperationActivityList } from '../helpers/contracts.js';
import type { OperationsRouteService } from '../helpers/routes.js';
import { operationAction } from '../helpers/routes.js';
import eventsOperationsGet from '../pages/events-operations-get.js';
import eventsOperationsPost from '../pages/events-operations-post.js';
import systemActivity from '../pages/system-activity.js';

test('operation route accepts only opaque job-ID mutations', () => {
  assert.deepEqual(operationAction({
    type: 'operation.retry',
    jobId: `job_${'r'.repeat(32)}`
  }), {
    type: 'operation.retry',
    jobId: `job_${'r'.repeat(32)}`
  });
  assert.throws(() => operationAction({
    type: 'operation.retry',
    jobId: `job_${'r'.repeat(32)}`,
    identityId: `ident_${'i'.repeat(32)}`
  }), /action envelope/);
  assert.throws(() => operationAction({
    type: 'operation.cancel',
    jobId: 'someone-elses-job'
  }), /operation ID/);
});

test('retention input is bounded to server-supported administrator choices', () => {
  assert.deepEqual(operationAction({
    type: 'operations.retention.apply',
    retentionDays: 90,
    limit: 500
  }), {
    type: 'operations.retention.apply',
    retentionDays: 90,
    limit: 500
  });
  assert.throws(() => operationAction({
    type: 'operations.retention.apply',
    retentionDays: 91,
    limit: 500
  }), /retention period/);
  assert.throws(() => operationAction({
    type: 'operations.retention.apply',
    retentionDays: 90,
    limit: 501
  }), /retention limit/);
});

test('activity page route hydrates only the service-authorized snapshot and capability flag', async () => {
  const harness = routeHarness();
  await harness.get['/pages/system-activity.html']!({
    req: request('/pages/system-activity.html'),
    res: harness.response
  });
  assert.equal(harness.rendered?.surface, 'activity');
  assert.equal(harness.rendered?.connectionDisplayName, 'Primary');
  assert.deepEqual(harness.rendered?.identity, { displayName: 'Test Operator' });
  assert.equal(harness.rendered?.csrfToken, 'c'.repeat(64));
  const snapshot = harness.rendered?.snapshot as { items: Array<{ title: string, }>, canManageRetention: boolean, };
  assert.equal(snapshot.items[0]?.title, 'Import values');
  assert.equal(snapshot.canManageRetention, false);
  assert.equal(JSON.stringify(harness.rendered).includes(harness.principal.identityId), false);
  assert.equal(harness.response.code, 200);
  assert.equal(harness.response.body, '');
});

test('activity event routes pass only the authenticated principal and opaque job ID to service methods', async () => {
  const harness = routeHarness();
  const id = `job_${'r'.repeat(32)}`;
  await harness.get['/events/operations']!({
    req: request(`/events/operations?jobId=${id}`),
    res: harness.response
  });
  assert.deepEqual(harness.calls.at(-1), {
    method: 'get', identityId: harness.principal.identityId, jobId: id
  });
  assert.equal((harness.response.jsonBody as { status: string, }).status, 'ok');

  await harness.post['/events/operations']!({
    req: request('/events/operations', {
      method: 'POST',
      action: { type: 'operation.cancel', jobId: id }
    }),
    res: harness.response
  });
  assert.deepEqual(harness.calls.at(-1), {
    method: 'cancel', identityId: harness.principal.identityId, jobId: id
  });
});

/**
 * Return the route harness result.
 */
function routeHarness() {
  response.headers = new Headers();
  response.code = 0;
  response.body = '';
  response.jsonBody = undefined;
  type Handler = (context: { req: ReturnType<typeof request>, res: typeof response, }) => Promise<void>;
  const get: Record<string, Handler> = {};
  const post: Record<string, Handler> = {};
  const principal: BrowserPrincipal = {
    transport: 'browser',
    sessionId: `sess_${'s'.repeat(32)}`,
    identityId: `id_${'i'.repeat(32)}`,
    connectionId: 'primary',
    displayName: 'Test Operator',
    historyScopeId: `hist_${'h'.repeat(32)}`,
    idleExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
    absoluteExpiresAt: new Date('2030-01-02T00:00:00.000Z')
  };
  const runtime = {
    lifecycle: { phase: 'ready' },
    resources: { readiness: async () => ({ ready: true }) },
    config: { app: { version: '0.1.0' } }
  } as unknown as ApplicationRuntimeService;
  const identity = {
    cookieName: () => 'tabular_session',
    resumeBrowserSession: async () => ({ principal, csrfToken: 'c'.repeat(64) }),
    requireBrowserMutation: async () => principal
  } as unknown as IdentityPluginService;
  const calls: Array<Record<string, string>> = [];
  const item = operationActivity();
  const operations = {
    /**
     * Return the deterministic activity page collection.
     */
    async list(): Promise<OperationActivityList> {
      return { items: [item], cursor: 4, canManageRetention: false, retentionDays: 90 };
    },
    /**
     * Record the authorized detail lookup and return its fixture item.
     */
    async get(caller: BrowserPrincipal, jobId: string) {
      calls.push({ method: 'get', identityId: caller.identityId, jobId });
      return item;
    },
    /**
     * Mark read.
     */
    async markRead() { return item; },
    /**
     * Cancel the current value.
     */
    async cancel(caller: BrowserPrincipal, jobId: string) {
      calls.push({ method: 'cancel', identityId: caller.identityId, jobId });
      return { ...item, state: 'cancelled' as const };
    },
    /**
     * Handle the retry operation.
     */
    async retry() { return item; },
    /**
     * Handle the acknowledge operation.
     */
    async acknowledge() { return item; },
    /**
     * Handle the retention operation.
     */
    async retention() { return {}; }
  } as unknown as OperationsRouteService;
  const plugins = new Map<string, unknown>([
    ['tabular.runtime', runtime],
    ['tabular.identity', identity],
    ['tabular.operations', operations]
  ]);
  const ctx = { plugin: <T>(name: string) => plugins.get(name) as T };
  get['/pages/system-activity.html'] = async (context) => { await systemActivity({ ...context, ctx } as never); };
  get['/events/operations'] = async (context) => { await eventsOperationsGet({ ...context, ctx } as never); };
  post['/events/operations'] = async (context) => { await eventsOperationsPost({ ...context, ctx } as never); };
  return {
    get,
    post,
    principal,
    calls,
    response,
    /**
     * Return the rendered value.
     */
    get rendered() { return response.data.value as Record<string, unknown> | undefined; }
  };
}

/**
 * Return the operation activity result.
 */
function operationActivity(): OperationActivity {
  return {
    id: `job_${'r'.repeat(32)}`,
    kind: 'import.commit',
    state: 'running',
    progress: 35,
    attempt: 1,
    maxAttempts: 3,
    version: 2,
    createdAt: '2026-08-02T08:00:00.000Z',
    updatedAt: '2026-08-02T08:01:00.000Z',
    unread: true,
    cancellable: true,
    retryable: false,
    acknowledgeable: false,
    irreversible: false
  };
}

const response = {
  headers: new Headers(),
  code: 0,
  body: '',
  data: {
    value: undefined as unknown,
    set(value: unknown) { this.value = value; },
    get() { return this.value; }
  },
  jsonBody: undefined as unknown,
  /**
   * Handle the JSON operation.
   */
  json(value: unknown, code = 200) {
    this.jsonBody = value;
    this.code = code;
  },
  /**
   * Handle the html operation.
   */
  html(value: string, code = 200) {
    this.body = value;
    this.code = code;
  },
  statusCode(code: number) {
    this.code = code;
  }
};

/**
 * Return the request with the bounded body loader attached.
 */
function request(path: string, input?: { method?: 'POST', action?: unknown, }) {
  return {
    url: new URL(path, 'http://tabular.test'),
    headers: new Headers(input?.method ? {
      'content-type': 'application/json',
      origin: 'http://tabular.test'
    } : undefined),
    session: () => 'cookie-token',
    data: new Map(input?.action ? [['action', input.action]] : [])
  };
}
