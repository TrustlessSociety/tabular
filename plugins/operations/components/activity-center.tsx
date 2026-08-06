//modules
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

//client
import type { IconName } from '../../ui/components/icon.js';
import { Icon } from '../../ui/components/icon.js';

//The activity filter contract exported for module callers
export type ActivityFilter = 'all' | 'active' | 'attention' | 'completed';

//The activity state contract exported for module callers
export type ActivityState =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'dead-letter';

//The activity progress contract exported for module callers
export type ActivityProgress = {
  completed: number,
  total: number,
  label: string,
};

//The activity result contract exported for module callers
export type ActivityResult = {
  label: string,
  href?: string,
  summary?: string,
};

//The activity failure contract exported for module callers
export type ActivityFailure = {
  title: string,
  detail: string,
  code?: string,
};

//The activity timeline entry contract exported for module callers
export type ActivityTimelineEntry = {
  label: string,
  at: string,
};

/**
 * Deliberately presentation-only. Server contracts are normalized into this
 * shape so authorization-bearing identities never enter component state.
 */
export type ActivityItem = {
  id: string,
  kind: string,
  title: string,
  target: string,
  state: ActivityState,
  unread: boolean,
  progress?: ActivityProgress,
  attempt: number,
  maxAttempts: number,
  createdAt: string,
  updatedAt: string,
  startedAt?: string,
  finishedAt?: string,
  acknowledgedAt?: string,
  result?: ActivityResult,
  failure?: ActivityFailure,
  timeline: ActivityTimelineEntry[],
  actions: {
    canRetry: boolean,
    canCancel: boolean,
    canAcknowledge: boolean,
  },
};

//The activity summary contract exported for module callers
export type ActivitySummary = {
  running: number,
  queued: number,
  attention: number,
  completed: number,
};

//The activity center props contract exported for module callers
export type ActivityCenterProps = {
  items: ActivityItem[],
  summary: ActivitySummary,
  filter: ActivityFilter,
  selected?: ActivityItem,
  loading?: boolean,
  pendingAction?: 'retry' | 'cancel' | 'acknowledge',
  error?: string,
  onFilter: (filter: ActivityFilter) => void,
  onSelect: (item: ActivityItem) => void,
  onClose: () => void,
  onRetry: (item: ActivityItem) => void,
  onCancel: (item: ActivityItem) => void,
  onAcknowledge: (item: ActivityItem) => void,
  onRecover: () => void,
};

const FILTERS: Array<{ value: ActivityFilter, label: string, }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'completed', label: 'Completed' }
];

/**
 * Render the activity center component.
 */
export function ActivityCenter(props: ActivityCenterProps) {
  const visible = props.items.filter((item) => activityGroup(item.state) === props.filter || props.filter === 'all');
  const counts = {
    all: props.items.length,
    active: props.summary.running + props.summary.queued,
    attention: props.summary.attention,
    completed: props.summary.completed
  };

  return (
    <>
      <section className="activity-metrics" aria-label="Activity summary">
        <MetricCard label="Running" value={props.summary.running} detail="Work in progress" state="running" />
        <MetricCard label="Queued" value={props.summary.queued} detail="Waiting for a worker" />
        <MetricCard label="Needs attention" value={props.summary.attention} detail="Failed or dead-lettered" state="attention" />
        <MetricCard label="Completed" value={props.summary.completed} detail="Succeeded or cancelled" />
      </section>

      <section className="activity-collection" aria-labelledby="activity-list-title">
        <h2 id="activity-list-title" className="sr-only">Operations</h2>
        <div className="activity-filters" role="tablist" aria-label="Activity filters">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              id={`activity-filter-${item.value}`}
              data-activity-filter={item.value}
              type="button"
              role="tab"
              aria-selected={props.filter === item.value}
              aria-controls="activity-results"
              tabIndex={props.filter === item.value ? 0 : -1}
              onClick={() => props.onFilter(item.value)}
              onKeyDown={(event) => navigateFilter(event, item.value, props.onFilter)}
            >
              {item.label}<span>{counts[item.value]}</span>
            </button>
          ))}
        </div>

        {props.error ? (
          <div className="activity-recovery" role="alert">
            <span className="activity-recovery-mark" aria-hidden="true"><Icon name="warning" /></span>
            <span>
              <strong>Activity could not catch up</strong>
              <small>{props.error} Your last visible snapshot is still shown.</small>
            </span>
            <button type="button" onClick={props.onRecover}>Try again</button>
          </div>
        ) : props.loading ? (
          <div className="activity-recovery" role="status" aria-live="polite">
            <Icon className="activity-loading-mark" name="loader" />
            <span>
              <strong>Refreshing activity</strong>
              <small>Replaying from the last durable event cursor.</small>
            </span>
          </div>
        ) : null}

        <div id="activity-results" role="tabpanel" aria-labelledby={`activity-filter-${props.filter}`}>
          {visible.length ? (
            <div className="activity-table-wrap">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <ActivityRow
                      key={item.id}
                      item={item}
                      selected={props.selected?.id === item.id}
                      onSelect={props.onSelect}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="activity-empty">
              <span className="activity-empty-mark" aria-hidden="true"><Icon name="activity" /></span>
              <h3>{props.filter === 'all' ? 'No system activity yet' : 'No matching activity'}</h3>
              <p>{props.filter === 'all'
                ? 'Long-running imports, exports, and maintenance will appear here.'
                : 'There are no operations in this state.'}</p>
              {props.filter !== 'all' && <button type="button" onClick={() => props.onFilter('all')}>Show all activity</button>}
            </div>
          )}
        </div>
      </section>

      {props.selected && (
        <ActivityDetail
          item={props.selected}
          pendingAction={props.pendingAction}
          onClose={props.onClose}
          onRetry={props.onRetry}
          onCancel={props.onCancel}
          onAcknowledge={props.onAcknowledge}
        />
      )}
    </>
  );
}

/**
 * Render the metric card component.
 */
function MetricCard({ label, value, detail, state }: {
  label: string,
  value: number,
  detail: string,
  state?: 'running' | 'attention',
}) {
  return (
    <article className="activity-metric" data-state={state}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <small>{detail}</small>
    </article>
  );
}

/**
 * Render the activity row component.
 */
function ActivityRow({ item, selected, onSelect }: {
  item: ActivityItem,
  selected: boolean,
  onSelect: (item: ActivityItem) => void,
}) {
  const progress = boundedProgress(item.progress);
  return (
    <tr data-state={item.state} data-unread={item.unread} aria-selected={selected}>
      <td>
        <button className="activity-operation" type="button" onClick={() => onSelect(item)} aria-label={`Open ${item.title} details`}>
          <span className="activity-kind-mark" aria-hidden="true"><Icon name={iconForKind(item.kind)} /></span>
          <span>
            <span className="activity-title-line">
              {item.unread && <i className="activity-unread" title="Unread"><span className="sr-only">Unread</span></i>}
              <strong>{item.title}</strong>
            </span>
            <small>{humanKind(item.kind)} · attempt {item.attempt} of {item.maxAttempts}</small>
          </span>
          <Icon className="activity-open-icon" name="open" />
        </button>
      </td>
      <td data-label="Target"><span className="activity-cell-value">{item.target}</span></td>
      <td data-label="Status"><StatusBadge state={item.state} acknowledged={Boolean(item.acknowledgedAt)} /></td>
      <td data-label="Progress">
        {item.progress ? (
          <span className="activity-progress-block">
            <span
              className="activity-progress"
              role="progressbar"
              aria-label={`${item.title} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            ><span style={{ width: `${progress}%` }} /></span>
            <small>{item.progress.label}</small>
          </span>
        ) : <small>{progressLabel(item)}</small>}
      </td>
      <td data-label="Updated"><time dateTime={item.updatedAt}>{formatRelativeTime(item.updatedAt)}</time></td>
    </tr>
  );
}

/**
 * Render the activity detail component.
 */
function ActivityDetail(props: {
  item: ActivityItem,
  pendingAction?: ActivityCenterProps['pendingAction'],
  onClose: () => void,
  onRetry: (item: ActivityItem) => void,
  onCancel: (item: ActivityItem) => void,
  onAcknowledge: (item: ActivityItem) => void,
}) {
  const item = props.item;
  const progress = boundedProgress(item.progress);
  const pending = Boolean(props.pendingAction);
  return (
    <div className="activity-detail-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <aside className="activity-detail" role="dialog" aria-modal="true" aria-labelledby="activity-detail-title">
        <header>
          <span>
            <small>{humanKind(item.kind)}</small>
            <h2 id="activity-detail-title">{item.title}</h2>
          </span>
          <button className="activity-icon-button" type="button" onClick={props.onClose} aria-label="Close activity details"><Icon name="close" /></button>
        </header>
        <div className="activity-detail-body">
          <div className="activity-detail-state">
            <span>
              <small>Current status</small>
              <StatusBadge state={item.state} acknowledged={Boolean(item.acknowledgedAt)} />
            </span>
            {item.progress && (
              <span className="activity-progress-block activity-progress-block--detail">
                <span
                  className="activity-progress"
                  role="progressbar"
                  aria-label={`${item.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                ><span style={{ width: `${progress}%` }} /></span>
                <small>{item.progress.label}</small>
              </span>
            )}
          </div>

          <dl className="activity-detail-list">
            <div><dt>Target</dt><dd>{item.target}</dd></div>
            <div><dt>Operation ID</dt><dd><code>{item.id}</code></dd></div>
            <div><dt>Attempts</dt><dd>{item.attempt} of {item.maxAttempts}</dd></div>
            <div><dt>Created</dt><dd><time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time></dd></div>
            {item.startedAt && <div><dt>Started</dt><dd><time dateTime={item.startedAt}>{formatTimestamp(item.startedAt)}</time></dd></div>}
            {item.finishedAt && <div><dt>Finished</dt><dd><time dateTime={item.finishedAt}>{formatTimestamp(item.finishedAt)}</time></dd></div>}
          </dl>

          {item.failure && (
            <section className="activity-detail-section" aria-labelledby="activity-failure-title">
              <h3 id="activity-failure-title">Failure detail</h3>
              <div className="activity-failure">
                <strong>{item.failure.title}</strong>
                <p>{item.failure.detail}</p>
                {item.failure.code && <code>{item.failure.code}</code>}
              </div>
            </section>
          )}

          {item.result && (
            <section className="activity-detail-section" aria-labelledby="activity-result-title">
              <h3 id="activity-result-title">Result</h3>
              <div className="activity-result">
                <span>{item.result.summary || 'The operation completed successfully.'}</span>
                {item.result.href && <a href={item.result.href}>{item.result.label}<Icon name="open" /></a>}
              </div>
            </section>
          )}

          <section className="activity-detail-section" aria-labelledby="activity-history-title">
            <h3 id="activity-history-title">History</h3>
            <ol className="activity-timeline">
              {item.timeline.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <strong>{entry.label}</strong>
                  <time dateTime={entry.at}>{formatTimestamp(entry.at)}</time>
                </li>
              ))}
            </ol>
          </section>

          {item.acknowledgedAt && (
            <p className="activity-audit-note">
              This failure was acknowledged. Its auditable activity record remains available.
            </p>
          )}
        </div>
        {(item.actions.canCancel || item.actions.canRetry || item.actions.canAcknowledge) && (
          <footer>
            {item.actions.canAcknowledge && (
              <button type="button" disabled={pending} onClick={() => props.onAcknowledge(item)}>
                {props.pendingAction === 'acknowledge' ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            )}
            {item.actions.canCancel && (
              <button type="button" disabled={pending} onClick={() => props.onCancel(item)}>
                {props.pendingAction === 'cancel' ? 'Cancelling…' : 'Cancel operation'}
              </button>
            )}
            {item.actions.canRetry && (
              <button className="activity-primary-button" type="button" disabled={pending} onClick={() => props.onRetry(item)}>
                {props.pendingAction === 'retry' ? 'Queuing retry…' : 'Review and retry'}
              </button>
            )}
          </footer>
        )}
      </aside>
    </div>
  );
}

/**
 * Return the summarize activity result.
 */
export function summarizeActivity(items: ActivityItem[]): ActivitySummary {
  return items.reduce<ActivitySummary>((summary, item) => {
    const group = activityGroup(item.state);
    if (item.state === 'running' || item.state === 'retrying') summary.running += 1;
    else if (item.state === 'queued') summary.queued += 1;
    else if (group === 'attention') summary.attention += 1;
    else if (group === 'completed') summary.completed += 1;
    return summary;
  }, { running: 0, queued: 0, attention: 0, completed: 0 });
}

/**
 * Return the activity group result.
 */
export function activityGroup(state: ActivityState): Exclude<ActivityFilter, 'all'> {
  if (state === 'queued' || state === 'running' || state === 'retrying') return 'active';
  if (state === 'failed' || state === 'dead-letter') return 'attention';
  return 'completed';
}

/**
 * Return the bounded progress result.
 */
function boundedProgress(progress?: ActivityProgress) {
  if (!progress || !Number.isFinite(progress.completed) || !Number.isFinite(progress.total) || progress.total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress.completed / progress.total) * 100)));
}

/**
 * Return the progress label result.
 */
function progressLabel(item: ActivityItem) {
  if (item.state === 'queued') return 'Waiting for a worker';
  if (item.state === 'retrying') return `Retry ${item.attempt} of ${item.maxAttempts}`;
  if (item.state === 'dead-letter') return `${item.attempt} attempts exhausted`;
  if (item.state === 'cancelled') return 'Cancelled safely';
  if (item.state === 'succeeded') return item.result?.summary || 'Completed';
  return item.failure?.title || 'No progress reported';
}

/**
 * Render the status badge component.
 */
function StatusBadge({ state, acknowledged }: { state: ActivityState, acknowledged: boolean, }) {
  return (
    <span className="activity-status" data-state={state}>
      {(state === 'running' || state === 'retrying') && <i aria-hidden="true" />}
      {acknowledged && state === 'dead-letter' ? 'Acknowledged dead letter' : statusLabel(state)}
    </span>
  );
}

/**
 * Return the status label result.
 */
function statusLabel(state: ActivityState) {
  return state === 'dead-letter'
    ? 'Dead letter'
    : state.charAt(0).toUpperCase() + state.slice(1);
}

/**
 * Return the human kind result.
 */
function humanKind(kind: string) {
  return kind.split(/[._-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'Operation';
}

/**
 * Return the icon for kind result.
 */
function iconForKind(kind: string): IconName {
  const normalized = kind.toLowerCase();
  if (normalized.includes('import')) return 'import';
  if (normalized.includes('export')) return 'file-down';
  if (normalized.includes('view') || normalized.includes('schema')) return 'table';
  return 'operation';
}

/**
 * Format the timestamp.
 */
function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

/**
 * Format the relative time.
 */
function formatRelativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Unavailable';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Return the navigate filter result.
 */
function navigateFilter(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  current: ActivityFilter,
  onFilter: (filter: ActivityFilter) => void
) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = FILTERS.findIndex((item) => item.value === current);
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? FILTERS.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + FILTERS.length) % FILTERS.length;
  const next = FILTERS[nextIndex]!.value;
  onFilter(next);
  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-activity-filter="${next}"]`)?.focus());
}
