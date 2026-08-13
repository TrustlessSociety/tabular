//modules
import { useEffect, useRef, useState } from 'react';

//client
import { normalizePhysicalName } from '../helpers/model.js';

/**
 * Render the file create dialog component.
 */
export function FileCreateDialog({
  busy,
  error,
  triggerRef,
  onCreate,
  onClose
}: {
  busy: boolean,
  error?: string,
  triggerRef: React.RefObject<HTMLElement | null>,
  onCreate: (displayName: string) => void,
  onClose: () => void,
}) {
  const dialog = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState('');
  const physicalName = normalizePhysicalName(displayName);

  useEffect(() => {
    requestAnimationFrame(() => input.current?.focus());
    /**
     * Handle the key down event.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button, input') || [])]
        .filter((item) => !item.hasAttribute('disabled'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose, triggerRef]);

  return (
    <div className="file-ddl-layer">
      <section
        ref={dialog}
        className="file-ddl-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-create-title"
        aria-describedby="file-create-description"
      >
        <span className="panel-kicker">NEW FILE</span>
        <h2 id="file-create-title">Create a blank spreadsheet</h2>
        <p id="file-create-description">
          Name the file now. Tabular creates its PostgreSQL table and opens it with blank rows ready for columns and values.
        </p>
        <label className="file-create-name">
          <span>File name</span>
          <input
            ref={input}
            value={displayName}
            maxLength={200}
            placeholder="For example, Product data"
            disabled={busy}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <dl>
          <div><dt>PostgreSQL table</dt><dd>{physicalName}</dd></div>
        </dl>
        <p className="file-create-help">Lowercase letters and underscores are inferred automatically. If the table name is already used, a number is added.</p>
        {busy && !error && <div className="file-ddl-status" role="status">Creating the PostgreSQL table and preparing the spreadsheet…</div>}
        {error && <div className="panel-error" role="alert">{error}</div>}
        <div className="file-ddl-actions">
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className="primary-action"
            type="button"
            disabled={busy || !displayName.trim()}
            onClick={() => onCreate(displayName)}
          >{busy ? 'Creating…' : 'Create file'}</button>
        </div>
      </section>
    </div>
  );
}
