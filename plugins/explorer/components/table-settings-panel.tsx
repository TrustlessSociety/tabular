//modules
import { useEffect, useRef, useState } from 'react';

//client
import type { ExplorerFile, ExplorerFolder } from '../helpers/contracts.js';
import { Icon } from '../../ui/components/icon.js';
import { derivePhysicalName } from '../events/actions.js';

//The table settings draft contract exported for module callers
export type TableSettingsDraft = {
  displayName: string,
  folderId: string,
  physicalName: string,
  physicalNameOverridden: boolean,
};

/**
 * Render the table settings panel component.
 */
export function TableSettingsPanel({
  open,
  file,
  folder,
  folders,
  derivePhysicalFromDisplay = true,
  initialPhysicalNameOverridden = false,
  triggerRef,
  error,
  onClose,
  onApply
}: {
  open: boolean,
  file: ExplorerFile,
  folder: ExplorerFolder,
  folders: ExplorerFolder[],
  derivePhysicalFromDisplay?: boolean,
  initialPhysicalNameOverridden?: boolean,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  error?: string,
  onClose: () => void,
  onApply: (draft: TableSettingsDraft) => void,
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<TableSettingsDraft>({
    displayName: file.displayName,
    folderId: folder.id,
    physicalName: file.physicalName,
    physicalNameOverridden: initialPhysicalNameOverridden
  });

  useEffect(() => {
    if (!open) return;
    setDraft({
      displayName: file.displayName,
      folderId: folder.id,
      physicalName: file.physicalName,
      physicalNameOverridden: initialPhysicalNameOverridden
    });
    close.current?.focus();
    /**
     * Handle the key down event.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('button, input, select') || [])]
        .filter((item) => !item.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
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
  }, [file.id, folder.id, open]);

  if (!open) return null;

  return (
    <div className="table-settings-layer">
      <aside ref={panel} className="table-settings-panel" role="dialog" aria-modal="true" aria-labelledby="table-settings-title">
        <header>
          <div>
            <span className="panel-kicker">TABLE</span>
            <h2 id="table-settings-title">Table settings</h2>
          </div>
          <button ref={close} className="icon-button" type="button" aria-label="Close table settings" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>
          <div className="table-settings-body">
            <label>
              <span>Display name</span>
              <input
                value={draft.displayName}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  displayName: event.target.value,
                  physicalName: derivePhysicalFromDisplay
                    ? derivePhysicalName(event.target.value, current.physicalNameOverridden, current.physicalName)
                    : current.physicalName
                }))}
              />
              <small>Shown in Files and at the top of this spreadsheet.</small>
            </label>
            <label>
              <span>Folder</span>
              <select value={draft.folderId} onChange={(event) => setDraft((current) => ({ ...current, folderId: event.target.value }))}>
                {folders.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
              </select>
            </label>
            <label>
              <span>PostgreSQL table name</span>
              <input
                className="technical-input"
                aria-describedby="physical-name-help"
                value={draft.physicalName}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  physicalName: event.target.value.toLocaleLowerCase().replace(/[^a-z0-9_]/g, ''),
                  physicalNameOverridden: true
                }))}
              />
              <small id="physical-name-help">Lowercase letters, numbers, and underscores. It follows the display name unless you edit this technical name directly.</small>
            </label>
            {error && <div className="panel-error" role="alert">{error}</div>}
          </div>
          <footer>
            <button type="button" onClick={onClose}>Cancel</button>
            <button className="primary-action" type="submit">Apply changes</button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
