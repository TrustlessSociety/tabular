//client
import { Icon } from '../../ui/components/icon.js';

/**
 * Render the explorer header component.
 */
export function ExplorerHeader({
  connectionDisplayName,
  identityDisplayName,
  query,
  onQueryChange,
  collection = 'files'
}: {
  connectionDisplayName: string,
  identityDisplayName: string,
  query: string,
  onQueryChange: (value: string) => void,
  collection?: 'files' | 'views',
}) {
  return (
    <header className="explorer-topbar">
      <a className="explorer-brand" href="/pages/browse.html" aria-label={`${connectionDisplayName} files`}>
        <span className="explorer-brand-mark"><Icon name="grid" /></span>
        <strong>{connectionDisplayName}</strong>
      </a>
      <label className="explorer-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label={`Search ${collection}`}
          placeholder={`Search ${collection}`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <div className="explorer-account-actions">
        <a className="square-action" href="/pages/system-activity.html" aria-label="System activity" title="System activity">
          <Icon name="activity" />
        </a>
        <a
          className="account-action"
          href="/auth/account"
          aria-label={`Account: ${identityDisplayName}`}
          title={identityDisplayName}
        >{initials(identityDisplayName)}</a>
      </div>
    </header>
  );
}

/**
 * Creates a compact account mark from the verified server-side display name.
 */
function initials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toLocaleUpperCase()).join('') || '?';
}
