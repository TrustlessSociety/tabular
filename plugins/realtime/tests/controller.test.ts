import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RealtimeController,
  type RealtimeChange,
  type RealtimeState
} from '../events/controller.js';

class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  readonly url: string;
  readonly withCredentials: boolean;
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string | URL, options?: EventSourceInit) {
    this.url = String(url);
    this.withCredentials = Boolean(options?.withCredentials);
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = typeof listener === 'function'
      ? listener as (event: unknown) => void
      : (event: unknown) => listener.handleEvent(event as Event);
    this.listeners.set(type, [...(this.listeners.get(type) || []), callback]);
  }

  dispatch(type: string, data: string, lastEventId = '') {
    for (const listener of this.listeners.get(type) || []) {
      listener({ data, lastEventId });
    }
  }

  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
}

test('client controller ignores duplicate cursors and refreshes once across a gap', async () => {
  const original = globalThis.EventSource;
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  try {
    const changes: RealtimeChange[] = [];
    const snapshots: number[] = [];
    const states: RealtimeState[] = [];
    const controller = new RealtimeController({
      fileId: `obj_${'f'.repeat(32)}`,
      cursor: 4,
      onState: (state) => states.push(state),
      onChange: (change) => { changes.push(change); },
      onSnapshot: (cursor) => { snapshots.push(cursor); }
    });
    controller.start();
    const source = FakeEventSource.instances[0]!;
    assert.match(source.url, /cursor=4/);
    assert.equal(new URL(source.url, 'http://tabular.test').searchParams.get('fileId'), `obj_${'f'.repeat(32)}`);
    assert.equal(new URL(source.url, 'http://tabular.test').searchParams.has('scope'), false);
    assert.equal(source.withCredentials, true);
    source.onopen?.();
    const message = JSON.stringify({
      fileId: `obj_${'f'.repeat(32)}`,
      type: 'grid.changed',
      payload: { actionId: 'act' }
    });
    source.dispatch('tabular.change', message, '5');
    source.dispatch('tabular.change', message, '5');
    source.dispatch('snapshot.required', JSON.stringify({ highWater: 8 }), '8');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(changes.length, 1);
    assert.deepEqual(snapshots, [8]);
    assert.equal(controller.cursor(), 8);
    assert.deepEqual(states, ['connecting', 'live', 'refreshing', 'live']);
    controller.close();
    assert.equal(source.closed, true);
    assert.equal(states.at(-1), 'closed');
  } finally {
    globalThis.EventSource = original;
  }
});

test('operations subscription advances an invisible durable cursor without refreshing UI', async () => {
  const original = globalThis.EventSource;
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  try {
    let refreshes = 0;
    const controller = new RealtimeController({
      scope: 'operations',
      cursor: 11,
      retryMs: 0,
      onState: () => undefined,
      onChange: () => { refreshes += 1; },
      onSnapshot: () => undefined
    });
    controller.start();
    const first = FakeEventSource.instances[0]!;
    const url = new URL(first.url, 'http://tabular.test');
    assert.equal(url.pathname, '/events');
    assert.equal(url.searchParams.get('scope'), 'operations');
    assert.equal(url.searchParams.get('cursor'), '11');
    assert.equal(url.searchParams.has('fileId'), false);
    first.dispatch('tabular.cursor', '{}', '14');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(controller.cursor(), 14);
    assert.equal(refreshes, 0);
    first.onerror?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const replay = new URL(FakeEventSource.instances[1]!.url, 'http://tabular.test');
    assert.equal(replay.searchParams.get('cursor'), '14');
    controller.close();
  } finally {
    globalThis.EventSource = original;
  }
});

test('client controller narrows malformed delivery and access revocation safely', async () => {
  const original = globalThis.EventSource;
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  try {
    const states: RealtimeState[] = [];
    const controller = new RealtimeController({
      fileId: `obj_${'f'.repeat(32)}`,
      cursor: 1,
      retryMs: 0,
      onState: (state) => states.push(state),
      onChange: () => assert.fail('Malformed delivery must not reach application state'),
      onSnapshot: () => undefined
    });
    controller.start();
    const source = FakeEventSource.instances[0]!;
    source.dispatch('tabular.change', '{', '2');
    assert.equal(controller.cursor(), 1);
    assert.equal(states.at(-1), 'reconnecting');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(source.closed, true);
    const replay = FakeEventSource.instances[1]!;
    assert.match(replay.url, /cursor=1/);
    replay.dispatch('access.revoked', '{}');
    assert.equal(states.at(-1), 'access-lost');
    assert.equal(replay.closed, true);
  } finally {
    globalThis.EventSource = original;
  }
});

test('client controller applies bounded backoff and resets it after a committed refresh', async () => {
  const original = globalThis.EventSource;
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  try {
    const delays: number[] = [];
    const controller = new RealtimeController({
      fileId: `obj_${'f'.repeat(32)}`,
      cursor: 3,
      retryMs: 2,
      maximumRetryMs: 4,
      stableConnectionMs: 10_000,
      onRetryScheduled: (delay) => delays.push(delay),
      onState: () => undefined,
      onChange: () => undefined,
      onSnapshot: () => undefined
    });
    controller.start();
    FakeEventSource.instances[0]!.onerror?.();
    await new Promise((resolve) => setTimeout(resolve, 3));
    FakeEventSource.instances[1]!.onerror?.();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(delays, [2, 4]);
    const healthy = FakeEventSource.instances[2]!;
    healthy.dispatch('tabular.change', JSON.stringify({
      fileId: `obj_${'f'.repeat(32)}`,
      type: 'grid.changed',
      payload: { actionId: 'act' }
    }), '4');
    await new Promise((resolve) => setTimeout(resolve, 0));
    healthy.onerror?.();
    assert.deepEqual(delays, [2, 4, 2]);
    controller.close();
  } finally {
    globalThis.EventSource = original;
  }
});

test('client controller replays from the last applied cursor after a refresh failure', async () => {
  const original = globalThis.EventSource;
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  try {
    let attempts = 0;
    const controller = new RealtimeController({
      fileId: `obj_${'f'.repeat(32)}`,
      cursor: 7,
      retryMs: 0,
      onState: () => undefined,
      onChange: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient refresh failure');
      },
      onSnapshot: () => undefined
    });
    controller.start();
    const first = FakeEventSource.instances[0]!;
    const message = JSON.stringify({
      fileId: `obj_${'f'.repeat(32)}`,
      type: 'grid.changed',
      payload: { actionId: 'act' }
    });
    first.dispatch('tabular.change', message, '8');
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(first.closed, true);
    assert.equal(controller.cursor(), 7);
    const replay = FakeEventSource.instances[1]!;
    assert.match(replay.url, /cursor=7/);
    replay.dispatch('tabular.change', message, '8');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(attempts, 2);
    assert.equal(controller.cursor(), 8);
    controller.close();
  } finally {
    globalThis.EventSource = original;
  }
});
