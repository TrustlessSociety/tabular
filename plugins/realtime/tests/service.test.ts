//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { SseConfig } from '../../../config/sse.js';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { DatabaseExecutor } from '../../database/helpers/executor.js';
import { RealtimePluginService } from '../helpers/service.js';

const fileId = `obj_${'f'.repeat(32)}`;
const otherFileId = `obj_${'o'.repeat(32)}`;
const principal: BrowserPrincipal = {
  transport: 'browser',
  sessionId: `sess_${'s'.repeat(32)}`,
  identityId: `id_${'i'.repeat(32)}`,
  connectionId: 'primary',
  historyScopeId: `hist_${'h'.repeat(32)}`,
  idleExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  absoluteExpiresAt: new Date('2030-01-02T00:00:00.000Z')
};
const config: SseConfig = {
  route: '/events', heartbeatMs: 5, replayLimit: 100,
  clientQueueLimit: 2, connectionLimit: 10, pollMs: 2
};

/**
 * Return the identity with result.
 */
function identityWith(rows: unknown[][]) {
  let call = 0;
  const database = new DatabaseExecutor({
    /**
     * Handle the raw operation.
     */
    async raw<Row>() {
      return { rows: (rows[call++] || []) as Row[] };
    }
  });
  const identity = {
    /**
     * Report the authorized transaction condition.
     */
    async authorizedTransaction(
      current: BrowserPrincipal,
      _capability: string,
      target: (database: DatabaseExecutor) => Promise<unknown>,
      prepare?: (database: DatabaseExecutor) => Promise<void>,
      finalize?: (database: DatabaseExecutor, result: unknown, principal: BrowserPrincipal) => Promise<unknown>
    ) {
      await prepare?.(database);
      const result = await target(database);
      return finalize ? finalize(database, result, current) : result;
    }
  } as unknown as IdentityPluginService;
  return { identity, calls: () => call };
}

test('authorized replay scans one global cursor while filtering resource and private audiences', async () => {
  const { identity, calls } = identityWith([
    [{ retained_from_cursor: 1, high_water: 8 }],
    [{ file_id: fileId, relation_oid: 91, state: 'current' }],
    [
      { sequence: 6, file_id: otherFileId, audience_identity_id: null, event_type: 'grid.changed', payload: { actionId: 'other' }, created_at: '2026-08-01T00:00:00Z' },
      { sequence: 7, file_id: fileId, audience_identity_id: `id_${'x'.repeat(32)}`, event_type: 'saved-view.changed', payload: { viewId: 'private' }, created_at: '2026-08-01T00:00:01Z' },
      { sequence: 8, file_id: fileId, audience_identity_id: null, event_type: 'row-order.changed', payload: { version: 4 }, created_at: '2026-08-01T00:00:02Z' }
    ],
    [{ allowed: true }]
  ]);
  const batch = await new RealtimePluginService(identity, config).readBatch(principal, fileId, 5);
  assert.deepEqual(batch, {
    events: [{
      cursor: 8,
      fileId,
      type: 'row-order.changed',
      payload: { version: 4 },
      createdAt: '2026-08-01T00:00:02.000Z'
    }],
    retainedFrom: 1,
    highWater: 8,
    scannedThrough: 8,
    gap: false
  });
  assert.equal(calls(), 4);
});

test('authorized replay reports retention and discontinuity gaps without disclosing rows', async () => {
  const { identity } = identityWith([
    [{ retained_from_cursor: 5, high_water: 9 }],
    [{ file_id: fileId, relation_oid: 91, state: 'current' }],
    [{ sequence: 7, file_id: fileId, audience_identity_id: null, event_type: 'grid.changed', payload: {}, created_at: '2026-08-01T00:00:00Z' }],
    [{ allowed: true }]
  ]);
  const batch = await new RealtimePluginService(identity, config).readBatch(principal, fileId, 2);
  assert.equal(batch.gap, true);
  assert.deepEqual(batch.events, []);
  assert.equal(batch.highWater, 9);
});

test('streams emit snapshot recovery, heartbeat, clean shutdown, and no process-local authority', async () => {
  const batch = {
    events: [{ cursor: 1, fileId, type: 'grid.changed' as const, payload: { actionId: 'a' }, createdAt: '2026-08-01T00:00:00.000Z' }],
    retainedFrom: 1, highWater: 1, scannedThrough: 1, gap: false
  };
  const first = new RealtimePluginService({} as IdentityPluginService, config);
  const second = new RealtimePluginService({} as IdentityPluginService, config);
  first.readBatch = async () => batch;
  second.readBatch = async () => batch;
  const firstStream = first.open(principal, { fileId, cursor: 0 });
  const secondStream = second.open(principal, { fileId, cursor: 0 });
  const [firstText, secondText] = await Promise.all([
    collectUntil(firstStream, (text) => text.includes('id: 1\nevent: tabular.change')),
    collectUntil(secondStream, (text) => text.includes('id: 1\nevent: tabular.change'))
  ]);
  assert.match(firstText, /"actionId":"a"/);
  assert.match(secondText, /"actionId":"a"/);
  assert.equal(first.connectionCount(), 1);
  assert.equal(second.connectionCount(), 1);
  const firstShutdown = collectUntil(firstStream, (text) => text.includes('event: server.shutdown'));
  const secondShutdown = collectUntil(secondStream, (text) => text.includes('event: server.shutdown'));
  first.closeConnections();
  second.closeConnections();
  const [firstEnd, secondEnd] = await Promise.all([
    firstShutdown,
    secondShutdown
  ]);
  assert.match(firstEnd, /server is restarting/i);
  assert.match(secondEnd, /server is restarting/i);
});

test('slow-consumer batches switch to one bounded snapshot instruction', async () => {
  const service = new RealtimePluginService({} as IdentityPluginService, {
    ...config,
    clientQueueLimit: 1
  });
  service.readBatch = async () => ({
    events: [
      { cursor: 1, fileId, type: 'grid.changed', payload: {}, createdAt: '2026-08-01T00:00:00.000Z' },
      { cursor: 2, fileId, type: 'grid.changed', payload: {}, createdAt: '2026-08-01T00:00:01.000Z' }
    ],
    retainedFrom: 1, highWater: 2, scannedThrough: 2, gap: false
  });
  const stream = service.open(principal, { fileId, cursor: 0 });
  const text = await collectUntil(stream, (value) => value.includes('event: snapshot.required'));
  assert.match(text, /"reason":"client-backpressure"/);
  assert.doesNotMatch(text, /event: tabular.change/);
  service.closeConnections();
});

test('instance-wide connection capacity fails closed before allocating another stream', () => {
  const service = new RealtimePluginService({} as IdentityPluginService, {
    ...config,
    connectionLimit: 1
  });
  const stream = service.open(principal, { fileId, cursor: 0 });
  assert.throws(
    () => service.open(principal, { fileId, cursor: 0 }),
    (error: unknown) => error instanceof ApplicationError
      && error.errorCode === 'realtime_capacity'
      && error.statusCode === 503
  );
  stream.destroy();
});

test('idle streams send heartbeat comments without inventing an event cursor', async () => {
  const service = new RealtimePluginService({} as IdentityPluginService, config);
  service.readBatch = async (_principal, _fileId, after) => ({
    events: [], retainedFrom: 1, highWater: after, scannedThrough: after, gap: false
  });
  const stream = service.open(principal, { fileId, cursor: 0 });
  const text = await collectUntil(stream, (value) => value.includes(': heartbeat '));
  assert.match(text, /: connected /);
  assert.match(text, /: heartbeat /);
  assert.doesNotMatch(text, /event: tabular\.change/);
  service.closeConnections();
});

test('file streams name invisible cursor advancement so explicit reconnect can resume from it', async () => {
  const service = new RealtimePluginService({} as IdentityPluginService, config);
  service.readBatch = async (_principal, _fileId, after) => ({
    events: [],
    retainedFrom: 1,
    highWater: Math.max(after, 4),
    scannedThrough: Math.max(after, 4),
    gap: false
  });
  const stream = service.open(principal, { fileId, cursor: 1 });
  const text = await collectUntil(stream, (value) => value.includes('event: tabular.cursor'));
  assert.match(text, /id: 4\nevent: tabular\.cursor\ndata: \{\}/);
  assert.doesNotMatch(text, /event: tabular\.change/);
  service.closeConnections();
});

test('realtime service owns operations streams for one graceful shutdown path', async () => {
  const service = new RealtimePluginService({} as IdentityPluginService, config);
  const stream = service.openOperations(principal, {
    /**
     * Read the events.
     */
    async readEvents(_principal, after) {
      return {
        events: after ? [] : [{
          cursor: 1,
          jobId: `job_${'j'.repeat(32)}`,
          state: 'queued' as const,
          kind: 'import.commit' as const,
          progress: 0,
          version: 1,
          createdAt: '2026-08-02T08:00:00.000Z'
        }],
        retainedFrom: 1,
        highWater: 1,
        scannedThrough: 1,
        gap: false
      };
    }
  }, { cursor: 0 });
  const visible = await collectUntil(stream, (value) => value.includes('event: tabular.change'));
  assert.match(visible, /"type":"operation.changed"/);
  assert.equal(service.connectionCount(), 1);
  const shutdown = collectUntil(stream, (value) => value.includes('event: server.shutdown'));
  service.closeConnections();
  assert.match(await shutdown, /server is restarting/i);
});

/**
 * Collect the until.
 */
async function collectUntil(
  stream: NodeJS.ReadableStream,
  complete: (text: string) => boolean
) {
  let text = '';
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out with ${text}`)), 500);
    /**
     * Handle the data event.
     */
    const onData = (chunk: Buffer | string) => {
      text += chunk.toString();
      if (!complete(text)) return;
      clearTimeout(timeout);
      stream.off('data', onData);
      resolve(text);
    };
    stream.on('data', onData);
  });
}
