//client
import type { ActivityItem, ActivityTimelineEntry } from '../components/activity-center.js';
import type { OperationActivity, OperationKind } from '../helpers/contracts.js';

/**
 * Return the present operation activity result.
 */
export function presentOperationActivity(operation: OperationActivity): ActivityItem {
  const progress = Math.max(0, Math.min(100, Math.round(operation.progress)));
  const resultHref = operation.resultLink ? sameOriginResultHref(operation.resultLink.href) : undefined;
  return {
    id: operation.id,
    kind: operation.kind,
    title: operationTitle(operation.kind),
    target: operationTarget(operation, resultHref),
    state: operation.state,
    unread: operation.unread,
    ...(operation.state === 'running' || operation.state === 'retrying' || progress > 0
      ? { progress: { completed: progress, total: 100, label: `${progress}% complete` } }
      : {}),
    attempt: operation.attempt,
    maxAttempts: operation.maxAttempts,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    ...(operation.startedAt ? { startedAt: operation.startedAt } : {}),
    ...(operation.finishedAt ? { finishedAt: operation.finishedAt } : {}),
    ...(operation.acknowledgedAt ? { acknowledgedAt: operation.acknowledgedAt } : {}),
    ...(operation.resultSummary || (operation.state === 'succeeded' && resultHref) ? {
      result: {
        label: operation.state === 'succeeded' && resultHref ? 'Open authorized result' : 'Operation result',
        ...(operation.state === 'succeeded' && resultHref ? { href: resultHref } : {}),
        ...(operation.resultSummary ? { summary: resultSummary(operation.resultSummary) } : {})
      }
    } : {}),
    ...(operation.errorSummary ? {
      failure: {
        title: errorTitle(operation.errorSummary.code),
        detail: operation.errorSummary.message,
        code: operation.errorSummary.code
      }
    } : {}),
    timeline: operationTimeline(operation),
    actions: {
      canRetry: operation.retryable,
      canCancel: operation.cancellable,
      canAcknowledge: operation.acknowledgeable
    }
  };
}

/**
 * Return the present operation list result.
 */
export function presentOperationList(input: {
  items: OperationActivity[],
  cursor: number,
  canManageRetention: boolean,
  retentionDays: number,
}) {
  return {
    items: input.items.map(presentOperationActivity),
    cursor: input.cursor,
    canManageRetention: input.canManageRetention,
    retentionDays: input.retentionDays
  };
}

/**
 * Return the operation title result.
 */
function operationTitle(kind: OperationKind) {
  const titles: Record<OperationKind, string> = {
    'import.commit': 'Import values',
    'export.csv': 'Export CSV',
    'ddl.apply': 'Apply schema change',
    'draft.promote': 'Promote draft',
    'row-order.maintenance': 'Row order maintenance',
    'maintenance.import-staging': 'Clean import staging',
    'operations.retention': 'Apply activity retention'
  };
  return titles[kind];
}

/**
 * Return the operation timeline result.
 */
function operationTimeline(operation: OperationActivity): ActivityTimelineEntry[] {
  const entries: ActivityTimelineEntry[] = [
    { label: 'Operation queued', at: operation.createdAt }
  ];
  if (operation.startedAt) entries.push({ label: 'Worker started', at: operation.startedAt });
  if (operation.cancelRequestedAt) entries.push({ label: 'Cancellation requested', at: operation.cancelRequestedAt });
  if (operation.finishedAt) entries.push({ label: terminalLabel(operation.state), at: operation.finishedAt });
  else if (operation.updatedAt !== operation.createdAt && operation.updatedAt !== operation.startedAt) {
    entries.push({ label: operation.state === 'retrying' ? 'Retry scheduled' : 'Progress updated', at: operation.updatedAt });
  }
  if (operation.acknowledgedAt) entries.push({ label: 'Failure acknowledged; record preserved', at: operation.acknowledgedAt });
  return entries;
}

/**
 * Return the terminal label result.
 */
function terminalLabel(state: OperationActivity['state']) {
  if (state === 'succeeded') return 'Operation completed';
  if (state === 'cancelled') return 'Operation cancelled';
  if (state === 'dead-letter') return 'Moved to dead letters';
  if (state === 'failed') return 'Attempt failed';
  return 'Operation updated';
}

/**
 * Return the result summary result.
 */
function resultSummary(summary: Record<string, unknown>) {
  const entries = Object.entries(summary)
    .filter((entry): entry is [string, string | number | boolean] => (
      typeof entry[1] === 'string' || typeof entry[1] === 'number' || typeof entry[1] === 'boolean'
    ))
    .slice(0, 4)
    .map(([key, value]) => `${humanLabel(key)}: ${String(value)}`);
  return entries.length ? entries.join(' · ') : 'The operation completed successfully.';
}

/**
 * Return the error title result.
 */
function errorTitle(code: string) {
  const label = humanLabel(code);
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Operation failed';
}

/**
 * Return the human label result.
 */
function humanLabel(value: string) {
  return value.replace(/[_-]+/g, ' ').trim();
}

/**
 * Report the same origin result href condition.
 */
function sameOriginResultHref(value: string) {
  return /^\/(?!\/)[^\u0000-\u0020\u007f]*$/.test(value) ? value : undefined;
}

/**
 * Return the operation target result.
 */
function operationTarget(operation: OperationActivity, href?: string) {
  if (href) {
    const target = new URL(href, 'http://tabular.local');
    const folder = target.searchParams.get('folder');
    const table = target.searchParams.get('table');
    if (target.pathname === '/pages/table.html' && folder && table) {
      return `${titleLabel(folder)} / ${titleLabel(table)}`;
    }
  }
  return operation.fileId ? `Authorized file · …${operation.fileId.slice(-8)}` : 'System operation';
}

/**
 * Return the title label result.
 */
function titleLabel(value: string) {
  const label = humanLabel(value);
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : value;
}
