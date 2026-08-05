import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../ui/components/icon.js';
import type {
  SavedView,
  SavedViewAccess,
  SavedViewCapabilities
} from '../helpers/contracts.js';

export type SavedViewIncludes = {
  filtersAndSorting: boolean;
  columnLayout: boolean;
  cellPresentation: boolean;
};

export type SavedViewsDialogProps = {
  mode: 'list' | 'create';
  views: SavedView[];
  capabilities: SavedViewCapabilities;
  folderSlug: string;
  fileSlug: string;
  busy?: boolean;
  error?: string;
  onModeChange: (mode: 'list' | 'create') => void;
  onCreate: (input: { name: string; access: SavedViewAccess; includes: SavedViewIncludes }) => void;
  onUpdate: (view: SavedView) => void;
  onDuplicate: (view: SavedView) => void;
  onDelete: (view: SavedView) => void;
  onClose: () => void;
};

export function SavedViewsDialog(props: SavedViewsDialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);
  const deleteConfirmation = useRef<HTMLDivElement>(null);
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const closeCallback = useRef(props.onClose);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<SavedViewAccess>('private');
  const [includes, setIncludes] = useState<SavedViewIncludes>({
    filtersAndSorting: true,
    columnLayout: true,
    cellPresentation: true
  });
  const [deleteCandidate, setDeleteCandidate] = useState<SavedView>();
  closeCallback.current = props.onClose;

  useEffect(() => {
    if (deleteCandidate) return;
    requestAnimationFrame(() => {
      if (deleteTrigger.current?.isConnected) {
        deleteTrigger.current.focus();
        deleteTrigger.current = null;
        return;
      }
      dialog.current?.querySelector<HTMLElement>(
        props.mode === 'create' ? 'input[name="saved-view-name"]' : 'button, a'
      )?.focus();
    });
  }, [deleteCandidate, props.mode]);

  useEffect(() => {
    if (!deleteCandidate || !dialog.current || !deleteConfirmation.current) return;
    const confirmation = deleteConfirmation.current;
    const background = [...dialog.current.children].filter((child) => child !== confirmation);
    for (const child of background) {
      if (child instanceof HTMLElement) child.inert = true;
    }
    requestAnimationFrame(() => confirmation.querySelector<HTMLButtonElement>('button')?.focus());
    return () => {
      for (const child of background) {
        if (child instanceof HTMLElement) child.inert = false;
      }
    };
  }, [deleteCandidate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (deleteCandidate) setDeleteCandidate(undefined);
        else closeCallback.current();
        return;
      }
      const focusRoot = deleteCandidate ? deleteConfirmation.current : dialog.current;
      if (event.key !== 'Tab' || !focusRoot) return;
      const focusable = [...focusRoot.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled])'
      )].filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
      if (!focusable.length) return;
      event.preventDefault();
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1
        : activeIndex < 0 || activeIndex === focusable.length - 1 ? 0 : activeIndex + 1;
      focusable[nextIndex]?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deleteCandidate, props.mode]);

  const requestDelete = (view: SavedView, trigger: HTMLElement) => {
    deleteTrigger.current = trigger;
    setDeleteCandidate(view);
  };

  const personal = props.views.filter((view) => view.access === 'private');
  const shared = props.views.filter((view) => view.access === 'shared');
  const validName = name.trim().length > 0;

  return (
    <div className="saved-view-layer" role="presentation" onMouseDown={(event) => {
      if (!deleteCandidate && event.target === event.currentTarget) props.onClose();
    }}>
      <section
        ref={dialog}
        className="saved-view-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <span className="panel-kicker">SAVED PRESENTATION</span>
            <h2 id={titleId}>{props.mode === 'create' ? 'Create new view' : 'Views'}</h2>
          </div>
          <button type="button" className="saved-view-close" aria-label="Close saved views" onClick={props.onClose}><Icon name="close" /></button>
        </header>

        {props.mode === 'list' ? (
          <div className="saved-view-body">
            {!props.views.length ? (
              <div className="saved-view-empty">
                <strong>No saved views</strong>
                <p>Save this tab’s filters, column layout, and presentation for later.</p>
                <button className="primary-action" type="button" onClick={() => props.onModeChange('create')}>
                  Create new view
                </button>
              </div>
            ) : (
              <>
                <ViewGroup
                  label="Personal"
                  views={personal}
                  folderSlug={props.folderSlug}
                  fileSlug={props.fileSlug}
                  onUpdate={props.onUpdate}
                  onDuplicate={props.onDuplicate}
                  onDelete={requestDelete}
                />
                <ViewGroup
                  label="Shared"
                  views={shared}
                  folderSlug={props.folderSlug}
                  fileSlug={props.fileSlug}
                  onUpdate={props.onUpdate}
                  onDuplicate={props.onDuplicate}
                  onDelete={requestDelete}
                />
              </>
            )}
            {props.error && <p className="saved-view-error" role="alert">{props.error}</p>}
          </div>
        ) : (
          <form className="saved-view-body saved-view-form" onSubmit={(event) => {
            event.preventDefault();
            if (!validName || props.busy) return;
            props.onCreate({ name: name.trim(), access, includes });
          }}>
            <label>
              <span>Name</span>
              <input
                name="saved-view-name"
                value={name}
                maxLength={120}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
                placeholder="Ready to ship"
              />
            </label>
            <fieldset>
              <legend>Access</legend>
              <label><input type="radio" name="saved-view-access" checked={access === 'private'} onChange={() => setAccess('private')} />Private <small>Only you</small></label>
              <label title={props.capabilities.canPublishShared ? undefined : 'Only the table owner or an owning-role member can publish shared views.'}>
                <input
                  type="radio"
                  name="saved-view-access"
                  checked={access === 'shared'}
                  disabled={!props.capabilities.canPublishShared}
                  onChange={() => setAccess('shared')}
                />Shared <small>{props.capabilities.canPublishShared ? 'Authorized table readers' : 'Table owner permission required'}</small>
              </label>
            </fieldset>
            <fieldset>
              <legend>Include current sheet settings</legend>
              <IncludeChoice label="Filters and sorting" checked={includes.filtersAndSorting} onChange={(checked) => setIncludes((current) => ({ ...current, filtersAndSorting: checked }))} />
              <IncludeChoice label="Column order and visibility" checked={includes.columnLayout} onChange={(checked) => setIncludes((current) => ({ ...current, columnLayout: checked }))} />
              <IncludeChoice label="Cell presentation" checked={includes.cellPresentation} onChange={(checked) => setIncludes((current) => ({ ...current, cellPresentation: checked }))} />
            </fieldset>
            {props.error && <p className="saved-view-error" role="alert">{props.error}</p>}
            <footer>
              <button type="button" onClick={() => props.onModeChange('list')}>Cancel</button>
              <button className="primary-action" type="submit" disabled={!validName || props.busy}>
                {props.busy ? 'Creating…' : 'Create view'}
              </button>
            </footer>
          </form>
        )}

        {props.mode === 'list' && props.views.length > 0 && (
          <footer className="saved-view-list-footer">
            <button type="button" onClick={props.onClose}>Close</button>
            <button className="primary-action" type="button" onClick={() => props.onModeChange('create')}>New view</button>
          </footer>
        )}

        {deleteCandidate && (
          <div
            ref={deleteConfirmation}
            className="saved-view-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete saved view"
          >
            <strong>Delete “{deleteCandidate.name}”?</strong>
            <p>The source PostgreSQL table and its rows are not changed.</p>
            <div>
              <button type="button" onClick={() => setDeleteCandidate(undefined)}>Cancel</button>
              <button className="danger-action" type="button" onClick={() => {
                props.onDelete(deleteCandidate);
                deleteTrigger.current = null;
                setDeleteCandidate(undefined);
              }}>Delete view</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ViewGroup(props: {
  label: 'Personal' | 'Shared';
  views: SavedView[];
  folderSlug: string;
  fileSlug: string;
  onUpdate: (view: SavedView) => void;
  onDuplicate: (view: SavedView) => void;
  onDelete: (view: SavedView, trigger: HTMLElement) => void;
}) {
  return (
    <section className="saved-view-group" aria-label={`${props.label} views`}>
      <h3>{props.label}<span>{props.views.length}</span></h3>
      {!props.views.length ? <p className="saved-view-group-empty">No {props.label.toLocaleLowerCase()} views</p> : props.views.map((view) => (
        <div className="saved-view-row" key={view.id}>
          <a
            href={`/pages/table.html?folder=${props.folderSlug}&table=${props.fileSlug}&view=${view.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            <strong>{view.name}</strong>
            <small>Updated {new Date(view.updatedAt).toLocaleString()}</small>
          </a>
          <details>
            <summary aria-label={`Actions for ${view.name}`}><Icon name="ellipsis" /></summary>
            <div role="menu">
              <button type="button" role="menuitem" disabled={!view.permissions.update} onClick={() => props.onUpdate(view)}>Update from current sheet</button>
              <button type="button" role="menuitem" disabled={!view.permissions.duplicate} onClick={() => props.onDuplicate(view)}>Duplicate as private</button>
              <button
                type="button"
                role="menuitem"
                disabled={!view.permissions.delete}
                onClick={(event) => props.onDelete(view, event.currentTarget)}
              >Delete</button>
            </div>
          </details>
        </div>
      ))}
    </section>
  );
}

function IncludeChoice(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label><input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />{props.label}</label>
  );
}
