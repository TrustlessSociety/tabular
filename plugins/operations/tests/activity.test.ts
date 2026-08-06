//node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

//client
import type { ActivityItem } from '../components/activity-center.js';
import type { ActivityPageProps } from '../pages/contracts.js';
import { ActivityCenter, activityGroup, summarizeActivity } from '../components/activity-center.js';
import { presentOperationActivity } from '../pages/presenter.js';
import ActivityPage from '../views/activity-page.js';

const createdAt = '2026-08-02T08:00:00.000Z';
const updatedAt = '2026-08-02T08:01:00.000Z';

const running: ActivityItem = {
  id: `job_${'r'.repeat(32)}`,
  kind: 'import.values',
  title: 'Import values',
  target: 'Authorized file',
  state: 'running',
  unread: true,
  progress: { completed: 159, total: 248, label: '159 of 248 records' },
  attempt: 1,
  maxAttempts: 3,
  createdAt,
  updatedAt,
  startedAt: createdAt,
  timeline: [
    { label: 'Import queued', at: createdAt },
    { label: '159 records staged', at: updatedAt }
  ],
  actions: { canRetry: false, canCancel: true, canAcknowledge: false }
};

const deadLetter: ActivityItem = {
  id: `job_${'d'.repeat(32)}`,
  kind: 'import.values',
  title: 'Import values',
  target: 'Authorized file',
  state: 'dead-letter',
  unread: false,
  attempt: 3,
  maxAttempts: 3,
  createdAt,
  updatedAt,
  finishedAt: updatedAt,
  failure: {
    title: 'Source changed after preview',
    detail: 'Review the current source before retrying.',
    code: 'source_changed'
  },
  timeline: [
    { label: 'Import queued', at: createdAt },
    { label: 'Moved to dead letters', at: updatedAt }
  ],
  actions: { canRetry: true, canCancel: false, canAcknowledge: true }
};

const succeeded: ActivityItem = {
  id: `job_${'s'.repeat(32)}`,
  kind: 'export.csv',
  title: 'Export CSV',
  target: 'Authorized file',
  state: 'succeeded',
  unread: false,
  attempt: 1,
  maxAttempts: 3,
  createdAt,
  updatedAt,
  finishedAt: updatedAt,
  result: {
    label: 'Open authorized result',
    href: `/events/operations/result?jobId=job_${'s'.repeat(32)}`,
    summary: '126 authorized rows'
  },
  timeline: [{ label: 'Export completed', at: updatedAt }],
  actions: { canRetry: false, canCancel: false, canAcknowledge: false }
};

const handlers = {
  onFilter: () => undefined,
  onSelect: () => undefined,
  onClose: () => undefined,
  onRetry: () => undefined,
  onCancel: () => undefined,
  onAcknowledge: () => undefined,
  onRecover: () => undefined
};

test('activity center renders filters, unread progress, safe results, and recovery affordances', () => {
  const items = [running, deadLetter, succeeded];
  const html = renderToStaticMarkup(createElement(ActivityCenter, {
    items,
    summary: summarizeActivity(items),
    filter: 'all',
    error: 'The connection was interrupted.',
    ...handlers
  }));
  assert.match(html, /aria-label="Activity filters"/);
  assert.match(html, />All<span>3<\/span>/);
  assert.match(html, />Active<span>1<\/span>/);
  assert.match(html, />Needs attention<span>1<\/span>/);
  assert.match(html, />Completed<span>1<\/span>/);
  assert.match(html, /title="Unread"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="64"/);
  assert.match(html, /Activity could not catch up/);
  assert.match(html, /last visible snapshot is still shown/);
  assert.match(html, /data-icon="warning"/);
  assert.match(html, /data-icon="import"/);
  assert.match(html, /data-icon="file-down"/);
});

test('dead-letter details expose failure, retry, acknowledgement, and preserved-audit copy', () => {
  const acknowledged = {
    ...deadLetter,
    acknowledgedAt: updatedAt,
    actions: { canRetry: false, canCancel: false, canAcknowledge: false }
  };
  const actionable = renderToStaticMarkup(createElement(ActivityCenter, {
    items: [deadLetter],
    summary: summarizeActivity([deadLetter]),
    filter: 'attention',
    selected: deadLetter,
    ...handlers
  }));
  assert.match(actionable, /role="dialog"/);
  assert.match(actionable, /Failure detail/);
  assert.match(actionable, /Source changed after preview/);
  assert.match(actionable, />Acknowledge<\/button>/);
  assert.match(actionable, />Review and retry<\/button>/);

  const audit = renderToStaticMarkup(createElement(ActivityCenter, {
    items: [acknowledged],
    summary: summarizeActivity([acknowledged]),
    filter: 'attention',
    selected: acknowledged,
    ...handlers
  }));
  assert.match(audit, /Acknowledged dead letter/);
  assert.match(audit, /auditable activity record remains available/);
});

test('activity empty state and server-provided retention capability remain distinct', () => {
  const empty = renderToStaticMarkup(createElement(ActivityCenter, {
    items: [],
    summary: summarizeActivity([]),
    filter: 'attention',
    ...handlers
  }));
  assert.match(empty, /No matching activity/);
  assert.match(empty, /data-icon="activity"/);
  assert.match(empty, /Show all activity/);

  const loading = renderToStaticMarkup(createElement(ActivityCenter, {
    items: [],
    summary: summarizeActivity([]),
    filter: 'all',
    loading: true,
    ...handlers
  }));
  assert.match(loading, /data-icon="loader"/);

  const base: ActivityPageProps = {
    application: 'Tabular',
    status: 'ready',
    version: '0.1.0',
    surface: 'activity',
    connectionDisplayName: 'Test connection',
    identity: { displayName: 'Test User' },
    csrfToken: 'c'.repeat(64),
    snapshot: { items: [succeeded], cursor: 9, canManageRetention: false }
  };
  const regular = renderToStaticMarkup(createElement(ActivityPage, base));
  assert.doesNotMatch(regular, /Activity retention/);
  assert.doesNotMatch(regular, /Retention: 90 days/);

  const administrator = renderToStaticMarkup(createElement(ActivityPage, {
    ...base,
    snapshot: { ...base.snapshot, canManageRetention: true, retentionDays: 180 }
  }));
  assert.match(administrator, /Retention: 180 days/);
  assert.match(administrator, /Activity retention/);
  assert.match(administrator, /This control never changes PostgreSQL backup or audit-log retention/);
});

test('activity grouping covers every durable operation state', () => {
  assert.equal(activityGroup('queued'), 'active');
  assert.equal(activityGroup('running'), 'active');
  assert.equal(activityGroup('retrying'), 'active');
  assert.equal(activityGroup('failed'), 'attention');
  assert.equal(activityGroup('dead-letter'), 'attention');
  assert.equal(activityGroup('succeeded'), 'completed');
  assert.equal(activityGroup('cancelled'), 'completed');
});

test('server activity presentation keeps only authorized redacted fields and result links', () => {
  const presented = presentOperationActivity({
    id: `job_${'p'.repeat(32)}`,
    kind: 'export.csv',
    state: 'succeeded',
    progress: 100,
    attempt: 1,
    maxAttempts: 3,
    version: 4,
    fileId: `obj_${'f'.repeat(32)}`,
    createdAt,
    updatedAt,
    startedAt: createdAt,
    finishedAt: updatedAt,
    resultSummary: { rows: 126, format: 'csv', nested: { hidden: true } },
    resultLink: {
      kind: 'file',
      fileId: `obj_${'f'.repeat(32)}`,
      href: `/events/operations/result?jobId=job_${'p'.repeat(32)}`
    },
    unread: true,
    cancellable: false,
    retryable: false,
    acknowledgeable: false,
    irreversible: true
  });
  assert.equal(presented.title, 'Export CSV');
  assert.equal(presented.target, 'Authorized file · …ffffffff');
  assert.equal(presented.result?.summary, 'rows: 126 · format: csv');
  assert.match(presented.result?.href || '', /^\/events\/operations\/result\?jobId=/);
  assert.equal(JSON.stringify(presented).includes('hidden'), false);

  const external = presentOperationActivity({
    ...({
      id: `job_${'x'.repeat(32)}`,
      kind: 'export.csv',
      state: 'succeeded',
      progress: 100,
      attempt: 1,
      maxAttempts: 3,
      version: 1,
      createdAt,
      updatedAt,
      unread: false,
      cancellable: false,
      retryable: false,
      acknowledgeable: false,
      irreversible: true
    } as const),
    resultLink: {
      kind: 'file',
      fileId: `obj_${'f'.repeat(32)}`,
      href: 'https://untrusted.example/result'
    }
  });
  assert.equal(external.result, undefined);

  const activeTarget = presentOperationActivity({
    ...({
      id: `job_${'t'.repeat(32)}`,
      kind: 'import.commit',
      state: 'running',
      progress: 45,
      attempt: 1,
      maxAttempts: 3,
      version: 2,
      fileId: `obj_${'f'.repeat(32)}`,
      createdAt,
      updatedAt,
      unread: false,
      cancellable: true,
      retryable: false,
      acknowledgeable: false,
      irreversible: false
    } as const),
    resultLink: {
      kind: 'file',
      fileId: `obj_${'f'.repeat(32)}`,
      href: '/pages/table.html?folder=operations&table=customer-orders'
    }
  });
  assert.equal(activeTarget.target, 'Operations / Customer orders');
  assert.equal(activeTarget.result, undefined);
});

test('activity stylesheet stacks at phone width without document-level horizontal scrolling', () => {
  //read the shipped stylesheet so the assertion covers the real responsive
  // artifact without depending on a browser layout engine
  const css = readFileSync(new URL('../views/activity.css', import.meta.url), 'utf8');

  //allow ordinary style formatting while requiring the exact mobile ownership
  // and overflow behaviors that prevent document-level horizontal scrolling
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.activity-shell[\s\S]*overflow: hidden/);
  assert.match(css, /\.activity-main[\s\S]*overflow: auto/);
  assert.match(css, /\.activity-table tr[\s\S]*display: grid/);
  assert.match(css, /\.activity-detail\s*\{[^}]*width:\s*100vw/);

  //the reviewed grayscale activity surface does not introduce gradients
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
});
