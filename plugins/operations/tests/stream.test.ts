import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import { AuthorizedOperationEventStream } from '../events/stream.js';

const principal: BrowserPrincipal = {
  transport: 'browser',
  sessionId: `sess_${'s'.repeat(32)}`,
  identityId: `ident_${'i'.repeat(32)}`,
  connectionId: `conn_${'c'.repeat(32)}`,
  historyScopeId: `hist_${'h'.repeat(32)}`,
  idleExpiresAt: new Date(Date.now() + 60_000),
  absoluteExpiresAt: new Date(Date.now() + 120_000)
};

const config = {
  route: '/events',
  heartbeatMs: 15_000,
  replayLimit: 100,
  clientQueueLimit: 10,
  connectionLimit: 10,
  pollMs: 60_000
};

test('operations stream emits visible changes then an explicit invisible cursor advance', async () => {
  const calls: Array<{ identityId: string; after: number; limit: number }> = [];
  const stream = new AuthorizedOperationEventStream({
    async readEvents(caller, after, limit) {
      calls.push({ identityId: caller.identityId, after, limit });
      return {
        events: [{
          cursor: 3,
          jobId: `job_${'j'.repeat(32)}`,
          state: 'running' as const,
          kind: 'import.commit' as const,
          progress: 42,
          version: 2,
          createdAt: '2026-08-02T08:00:00.000Z'
        }],
        retainedFrom: 1,
        highWater: 5,
        scannedThrough: 5,
        gap: false
      };
    }
  }, principal, 1, config);
  const output = await readUntil(stream, 'event: tabular.cursor');
  stream.destroy();
  assert.deepEqual(calls[0], { identityId: principal.identityId, after: 1, limit: 100 });
  assert.match(output, /id: 3\nevent: tabular\.change/);
  assert.match(output, /"type":"operation.changed"/);
  assert.match(output, /"progress":42/);
  assert.match(output, /id: 5\nevent: tabular\.cursor\ndata: \{\}/);
  assert.equal(output.includes(principal.identityId), false);
  assert.equal(output.includes(principal.sessionId), false);
});

test('operations stream requests a snapshot at the permission-filtered high water after a gap', async () => {
  const stream = new AuthorizedOperationEventStream({
    async readEvents() {
      return {
        events: [],
        retainedFrom: 8,
        highWater: 12,
        scannedThrough: 12,
        gap: true
      };
    }
  }, principal, 2, config);
  const output = await readUntil(stream, 'event: snapshot.required');
  stream.destroy();
  assert.match(output, /id: 12\nevent: snapshot\.required/);
  assert.match(output, /"scope":"operations"/);
  assert.match(output, /"reason":"cursor-gap"/);
});

test('operations stream clamps the shared replay batch to its permission-filtered reader bound', async () => {
  let requestedLimit = 0;
  const stream = new AuthorizedOperationEventStream({
    async readEvents(_caller, _after, limit) {
      requestedLimit = limit;
      return {
        events: [], retainedFrom: 1, highWater: 0, scannedThrough: 0, gap: false
      };
    }
  }, principal, 0, { ...config, replayLimit: 1_000, heartbeatMs: 1, pollMs: 1 });
  await readUntil(stream, ': heartbeat');
  stream.destroy();
  assert.equal(requestedLimit, 500);
});

function readUntil(stream: AuthorizedOperationEventStream, pattern: string) {
  return new Promise<string>((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Stream did not emit ${pattern}`)), 1_000);
    stream.on('data', (chunk) => {
      output += String(chunk);
      if (!output.includes(pattern)) return;
      clearTimeout(timeout);
      resolve(output);
    });
    stream.on('error', reject);
  });
}
