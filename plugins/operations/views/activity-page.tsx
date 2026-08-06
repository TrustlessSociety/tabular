//modules
import { useEffect, useMemo, useRef, useState } from 'react';

//client
import type { RealtimeState } from '../../realtime/events/controller.js';
import type { ActivityFilter, ActivityItem } from '../components/activity-center.js';
import type { OperationBrowserAction } from '../events/actions.js';
import type { ActivityPageProps, ActivitySnapshot } from '../pages/contracts.js';
import { Icon } from '../../ui/components/icon.js';
import { RealtimeController } from '../../realtime/events/controller.js';
import { ActivityCenter, summarizeActivity } from '../components/activity-center.js';
import {
  dispatchOperationAction,
  loadActivityOperation,
  loadActivitySnapshot
} from '../events/actions.js';

/**
 * Render the activity page component.
 */
export default function ActivityPage(props: ActivityPageProps) {
  const [snapshot, setSnapshot] = useState(props.snapshot);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState('Activity center ready');
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');
  const [pendingAction, setPendingAction] = useState<'retry' | 'cancel' | 'acknowledge'>();
  const [retentionDays, setRetentionDays] = useState(props.snapshot.retentionDays || 90);
  const [retentionPending, setRetentionPending] = useState(false);
  const retentionDialog = useRef<HTMLDialogElement>(null);
  const selectedTrigger = useRef<HTMLElement | undefined>(undefined);
  const realtimeController = useRef<RealtimeController | undefined>(undefined);
  const activityRefresh = useRef<() => Promise<boolean>>(async () => true);
  const selected = useMemo(
    () => snapshot.items.find((item) => item.id === selectedId),
    [selectedId, snapshot.items]
  );
  const summary = useMemo(() => summarizeActivity(snapshot.items), [snapshot.items]);

  /**
   * Replace the item.
   */
  const replaceItem = (item: ActivityItem) => {
    setSnapshot((current) => ({
      ...current,
      items: current.items.some((candidate) => candidate.id === item.id)
        ? current.items.map((candidate) => candidate.id === item.id ? item : candidate)
        : [item, ...current.items]
    }));
  };

  activityRefresh.current = async () => {
    const result = await loadActivitySnapshot<ActivitySnapshot>();
    if (result.status === 'error') {
      setError(result.error.message);
      setFeedback('Activity refresh failed; the last snapshot was retained');
      return false;
    }
    setSnapshot(result.data);
    setRetentionDays(result.data.retentionDays || 90);
    setError(undefined);
    setFeedback('Activity refreshed from the durable cursor');
    return true;
  };

  useEffect(() => {
    const controller = new RealtimeController({
      scope: 'operations',
      cursor: props.snapshot.cursor,
      onState: (state, message) => {
        setRealtimeState(state);
        setFeedback(message);
        if (state === 'access-lost') {
          setError('Your permission to view this activity ended.');
        }
      },
      onChange: async (change) => {
        if ((change.type.startsWith('operation.') || change.type.startsWith('operations.'))
          && !await activityRefresh.current()) {
          throw new Error('Activity could not be refreshed');
        }
      },
      onSnapshot: async () => {
        if (!await activityRefresh.current()) throw new Error('Activity snapshot could not be refreshed');
      }
    });
    realtimeController.current = controller;
    controller.start();
    return () => {
      controller.close(false);
      if (realtimeController.current === controller) realtimeController.current = undefined;
    };
  }, [props.snapshot.cursor]);

  useEffect(() => {
    if (!selected) return;
    /**
     * Close the on escape.
     */
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetails();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [selected]);

  /**
   * Open the details.
   */
  const openDetails = async (item: ActivityItem) => {
    selectedTrigger.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
    setSelectedId(item.id);
    if (item.unread) replaceItem({ ...item, unread: false });
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.activity-detail button')?.focus());
    const [detail, read] = await Promise.all([
      loadActivityOperation<ActivityItem>(item.id),
      item.unread
        ? dispatchOperationAction<ActivityItem>({ type: 'operation.mark-read', jobId: item.id }, props.csrfToken)
        : Promise.resolve(undefined)
    ]);
    if (detail.status === 'ok') replaceItem({ ...detail.data, unread: false });
    else setFeedback(`${detail.error.message} Summary details remain available.`);
    if (read?.status === 'error') {
      setFeedback(`${read.error.message} The unread marker may return after refresh.`);
    }
  };

  /**
   * Close the details.
   */
  const closeDetails = () => {
    setSelectedId(undefined);
    requestAnimationFrame(() => selectedTrigger.current?.focus());
  };

  /**
   * Return the mutate result.
   */
  const mutate = async (
    action: Extract<OperationBrowserAction, { jobId: string, }>,
    pending: 'retry' | 'cancel' | 'acknowledge'
  ) => {
    setPendingAction(pending);
    setError(undefined);
    const result = await dispatchOperationAction<ActivityItem>(action, props.csrfToken);
    setPendingAction(undefined);
    if (result.status === 'error') {
      setError(result.error.message);
      setFeedback(result.error.message);
      return;
    }
    replaceItem(result.data);
    setFeedback(pending === 'acknowledge'
      ? 'Failure acknowledged; its auditable record was preserved'
      : pending === 'retry'
        ? 'Retry queued without changing the operation identity'
        : 'Cancellation requested');
  };

  /**
   * Return the recover result.
   */
  const recover = async () => {
    setLoading(true);
    await activityRefresh.current();
    setLoading(false);
  };

  /**
   * Apply the retention.
   */
  const applyRetention = async () => {
    setRetentionPending(true);
    const result = await dispatchOperationAction<{ retentionDays: number, }>({
      type: 'operations.retention.apply',
      retentionDays,
      limit: 500
    }, props.csrfToken);
    setRetentionPending(false);
    if (result.status === 'error') {
      setError(result.error.message);
      return;
    }
    setRetentionDays(result.data.retentionDays);
    retentionDialog.current?.close();
    setFeedback(`Activity retention updated to ${result.data.retentionDays} days`);
  };

  return (
    <div className="activity-shell">
      <a className="skip-link" href="#activity-content">Skip to activity</a>
      <header className="activity-topbar">
        <a
          className="activity-brand"
          href="/pages/browse.html"
          aria-label={`${props.connectionDisplayName} files`}
        >
          <span className="activity-brand-mark"><Icon name="grid" /></span>
          <strong>{props.connectionDisplayName}</strong>
        </a>
        <span className="activity-crumb" aria-label="Current page">
          <span aria-hidden="true">›</span><strong>System activity</strong>
        </span>
        <div className="activity-topbar-actions">
          <a className="activity-back-link" href="/pages/browse.html"><Icon name="folder" /><span>Back to files</span></a>
          <a
            className="activity-account"
            href="/auth/account"
            aria-label={`Account: ${props.identity.displayName}`}
            title={props.identity.displayName}
          >{identityInitials(props.identity.displayName)}</a>
        </div>
      </header>

      <main id="activity-content" className="activity-main" tabIndex={-1}>
        <div className="activity-page">
          <header className="activity-heading">
            <span>
              <p className="activity-eyebrow">Operations</p>
              <h1>System activity</h1>
              <p>Background work, delivery attempts, results, and operations that need attention.</p>
            </span>
            <div className="activity-heading-actions">
              <span className="activity-live-state" data-state={realtimeState} role="status">
                <i aria-hidden="true" /><span>{realtimeLabel(realtimeState)}</span>
              </span>
              {snapshot.canManageRetention && (
                <button className="activity-button" type="button" onClick={() => retentionDialog.current?.showModal()}>
                  Retention: {retentionDays} days
                </button>
              )}
            </div>
          </header>

          <ActivityCenter
            items={snapshot.items}
            summary={summary}
            filter={filter}
            selected={selected}
            loading={loading}
            pendingAction={pendingAction}
            error={error}
            onFilter={setFilter}
            onSelect={openDetails}
            onClose={closeDetails}
            onRetry={(item) => mutate({ type: 'operation.retry', jobId: item.id }, 'retry')}
            onCancel={(item) => mutate({ type: 'operation.cancel', jobId: item.id }, 'cancel')}
            onAcknowledge={(item) => mutate({ type: 'operation.acknowledge', jobId: item.id }, 'acknowledge')}
            onRecover={recover}
          />
        </div>
      </main>

      <footer className="activity-statusbar">
        <span><i data-status={props.status} />{snapshot.items.length} authorized operations</span>
        <output aria-live="polite">{feedback}</output>
        <span>v{props.version}</span>
      </footer>

      {snapshot.canManageRetention && (
        <dialog className="activity-retention-dialog" ref={retentionDialog} aria-labelledby="activity-retention-title">
          <form method="dialog" onSubmit={(event) => {
            event.preventDefault();
            void applyRetention();
          }}>
            <header>
              <span><p className="activity-eyebrow">Administration</p><h2 id="activity-retention-title">Activity retention</h2></span>
              <button className="activity-icon-button" type="button" onClick={() => retentionDialog.current?.close()} aria-label="Close retention settings"><Icon name="close" /></button>
            </header>
            <div className="activity-retention-body">
              <p>Keep auditable job and delivery activity available to administrators. This control never changes PostgreSQL backup or audit-log retention.</p>
              <label>
                Retention period
                <select value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))}>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>365 days</option>
                </select>
              </label>
            </div>
            <footer>
              <button type="button" onClick={() => retentionDialog.current?.close()}>Cancel</button>
              <button className="activity-primary-button" type="submit" disabled={retentionPending}>{retentionPending ? 'Saving…' : 'Save retention'}</button>
            </footer>
          </form>
        </dialog>
      )}
    </div>
  );
}

/**
 * Creates a compact account mark from the verified server-side display name.
 */
function identityInitials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toLocaleUpperCase()).join('') || '?';
}

/**
 * Return the realtime label result.
 */
function realtimeLabel(state: RealtimeState) {
  if (state === 'live') return 'Live activity';
  if (state === 'connecting') return 'Connecting';
  if (state === 'reconnecting') return 'Reconnecting';
  if (state === 'refreshing') return 'Catching up';
  if (state === 'access-lost') return 'Access ended';
  return 'Live updates closed';
}
