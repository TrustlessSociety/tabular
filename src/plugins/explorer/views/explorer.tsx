//modules
import { useEffect, useMemo, useRef, useState } from 'react';

//client
import type { ContextMenuState } from '../../commands/components/context-menu.js';
import type { CommandContext, CommandId } from '../../commands/helpers/contracts.js';
import type { PlannedFileDdl } from '../../files/helpers/contracts.js';
import type { TableSettingsDraft } from '../components/table-settings-panel.js';
import type {
  ExplorerFile,
  ExplorerPageProps,
  ExplorerSavedView,
  ImportEntryPageProps
} from '../helpers/contracts.js';
import { CommandContextMenu } from '../../commands/components/context-menu.js';
import { Icon } from '../../app/components/icon.js';
import { TableSettingsPanel } from '../components/table-settings-panel.js';
import {
  applyExplorerDdlPlan,
  dispatchExplorerAction
} from '../events/actions.js';
import { FileCreateDialog } from '../components/file-ddl-confirmation.js';
import { ExplorerHeader } from '../components/explorer-header.js';
import { filterExplorerItems } from '../helpers/model.js';

type ViewMode = 'list' | 'grid';
type Tab = 'files' | 'views';
type ExplorerContextMenu = { file: ExplorerFile, menu: ContextMenuState, };

/**
 * Render the explorer page component.
 */
export default function ExplorerPage(props: ExplorerPageProps) {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const tab: Tab = props.route.tab || 'files';
  const [scenario, setScenario] = useState(props.route.scenario || 'ready');
  const [feedback, setFeedback] = useState('Explorer ready');
  const [creating, setCreating] = useState(false);
  const [fileUpdates] = useState<Record<string, ExplorerFile>>({});
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenu>();
  const [settingsFile, setSettingsFile] = useState<ExplorerFile>();
  const [settingsError, setSettingsError] = useState<string>();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const restoreContextFocus = useRef(true);
  const folders = useMemo(() => {
    const files = props.snapshot.folders.flatMap((item) => item.files)
      .map((item) => fileUpdates[item.id] || item);
    return props.snapshot.folders.map((item) => ({
      ...item,
      files: files.filter((file) => file.folderId === item.id)
    }));
  }, [fileUpdates, props.snapshot.folders]);
  const folder = folders.find((item) => item.slug === props.route.folder);
  const denied = scenario === 'denied';

  useEffect(() => {
    const saved = window.sessionStorage.getItem('tabular.explorer.view');
    if (saved === 'grid' || saved === 'list') setViewMode(saved);
  }, []);

  /**
   * Return the choose view mode result.
   */
  const chooseViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    window.sessionStorage.setItem('tabular.explorer.view', mode);
  };

  const source = useMemo(() => {
    if (!folder) return folders;
    if (scenario === 'empty') return [];
    return tab === 'files' ? folder.files : folder.views;
  }, [folder, folders, scenario, tab]);

  const visible = useMemo(() => filterExplorerItems(source, query, searchableText), [query, source]);
  const collectionName = folder ? (tab === 'files' ? 'files' : 'views') : 'folders';
  const count = `${visible.length} ${visible.length === 1 ? collectionName.slice(0, -1) : collectionName}`;
  const commandContext = useMemo<CommandContext>(() => ({
    selectionKind: 'none',
    canUndo: false,
    canRedo: false,
    hasDraft: false,
    readOnly: Boolean(contextMenu?.file.readOnly),
    canMutateValues: false,
    canMutateSelection: false,
    canCreateFile: Boolean(folder && !denied && folder.permissions.createFile),
    canImportFile: Boolean(folder && !denied && folder.permissions.importFile),
    canConfigureFile: Boolean(
      folder
      && contextMenu
      && !denied
      && folder.permissions.configureFile
      && !contextMenu.file.readOnly
    ),
    relationSelection: false
  }), [contextMenu, denied, folder]);

  /**
   * Open the context menu.
   */
  const openContextMenu = (
    file: ExplorerFile,
    trigger: HTMLAnchorElement,
    x: number,
    y: number
  ) => {
    restoreContextFocus.current = true;
    setContextMenu({ file, menu: { target: 'explorer', x, y, trigger } });
  };

  /**
   * Close the context menu.
   */
  const closeContextMenu = () => {
    const trigger = contextMenu?.menu.trigger;
    setContextMenu(undefined);
    if (restoreContextFocus.current) requestAnimationFrame(() => trigger?.focus());
    restoreContextFocus.current = true;
  };

  /**
   * Handle the context command.
   */
  const handleContextCommand = (id: CommandId) => {
    if (!contextMenu || !folder) return;
    if (id === 'file.open') {
      restoreContextFocus.current = false;
      window.location.assign(
        `/pages/table.html?folder=${folder.slug}&table=${contextMenu.file.slug}`
      );
      return;
    }
    if (id === 'file.table-settings') {
      restoreContextFocus.current = false;
      settingsTrigger.current = contextMenu.menu.trigger as HTMLButtonElement;
      setSettingsError(undefined);
      setSettingsFile(contextMenu.file);
    }
  };

  /**
   * Apply the settings.
   */
  const applySettings = async (draft: TableSettingsDraft) => {
    if (!settingsFile) return;
    const sourceFolder = folders.find((item) => item.id === settingsFile.folderId);
    const targetFolder = folders.find((item) => item.id === draft.folderId);
    if (!sourceFolder || !targetFolder) {
      setSettingsError('The selected folder is unavailable.');
      return;
    }
    const result = await dispatchExplorerAction({
      type: 'file.settings.apply',
      commandId: `cmd_settings_${Date.now()}`,
      folder: targetFolder,
      sourceFolder,
      file: settingsFile,
      displayName: draft.displayName,
      physicalName: draft.physicalName,
      physicalNameOverridden: draft.physicalNameOverridden
    }, { csrfToken: props.csrfToken });
    if (!result.ok) {
      setSettingsError(result.message);
      setFeedback(result.message);
      return;
    }
    if (!result.plan) {
      setSettingsError('The PostgreSQL rename plan was not returned. No change was saved.');
      return;
    }
    setSettingsFile(undefined);
    setSettingsError(undefined);
    setFeedback('Renaming the PostgreSQL table…');
    const message = await applyPlannedChange(result.plan, sourceFolder.slug);
    if (message) setFeedback(message);
  };

  /**
   * Create the blank.
   */
  const createBlank = async (displayName: string) => {
    if (!folder) return;
    setCreating(true);
    setCreateError(undefined);
    const result = await dispatchExplorerAction({
      type: 'file.create.blank',
      commandId: `cmd_create_${Date.now()}`,
      folder: denied ? { ...folder, permissions: { ...folder.permissions, createFile: false } } : folder,
      displayName
    }, { csrfToken: props.csrfToken });
    if (!result.ok) {
      setCreating(false);
      setCreateError(result.message);
      setFeedback(result.message);
      return;
    }
    if (!result.plan) {
      const message = 'The PostgreSQL creation plan was not returned. No file was created.';
      setCreating(false);
      setCreateError(message);
      setFeedback(message);
      return;
    }
    setFeedback('Creating the PostgreSQL table…');
    const message = await applyPlannedChange(result.plan, folder.slug);
    if (message) {
      setCreating(false);
      setCreateError(message);
      setFeedback(message);
    }
  };

  /**
   * Apply the planned change.
   */
  const applyPlannedChange = async (plan: PlannedFileDdl, folderSlug: string) => {
    const applied = await applyExplorerDdlPlan(plan, props.csrfToken);
    if (applied.status !== 'applied') {
      return applied.status === 'error'
        ? applied.error.message
        : 'The PostgreSQL change is still pending. Check System activity and try again.';
    }
    const targetFileId = applied.data.result.targetFileId;
    const physicalName = applied.data.result.physicalName;
    if (!targetFileId?.startsWith('obj_') || !physicalName) {
      return 'PostgreSQL applied the change, but the reconciled file route is unavailable. Return to Files and reload.';
    }
    const table = physicalName.toLocaleLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]+/g, '-');
    window.location.assign(`/pages/table.html?folder=${folderSlug}&table=${table}`);
    return undefined;
  };

  return (
    <div className="explorer-shell">
      <a className="skip-link" href="#explorer-content">Skip to files</a>
      <ExplorerHeader
        connectionDisplayName={props.snapshot.connection.displayName}
        identityDisplayName={props.identity.displayName}
        query={query}
        onQueryChange={setQuery}
        collection={folder && tab === 'views' ? 'views' : 'files'}
      />
      <main id="explorer-content" className="explorer-main" tabIndex={-1}>
        <section className="file-explorer" data-view={viewMode} aria-label="File explorer">
          <div className="explorer-heading-row">
            <nav className="explorer-crumbs" aria-label="Breadcrumb">
              <a href="/pages/browse.html">{props.snapshot.connection.displayName}</a>
              <span aria-hidden="true">›</span>
              {folder ? (
                <>
                  <a href="/pages/browse.html">{props.snapshot.database.displayName}</a>
                  <span aria-hidden="true">›</span>
                  <strong>{folder.displayName}</strong>
                </>
              ) : <strong>{props.snapshot.database.displayName}</strong>}
            </nav>
            <div className="explorer-heading-actions">
              {folder && !denied && folder.permissions.createFile && (
                <button ref={createTrigger} className="primary-action" type="button" disabled={creating} onClick={() => {
                  setCreateError(undefined);
                  setCreateDialogOpen(true);
                }}>
                  <Icon name="plus" /> {creating ? 'Creating…' : 'New file'}
                </button>
              )}
              {folder && !denied && folder.permissions.importFile && (
                <a className="secondary-action" href={`/pages/import.html?folder=${folder.slug}`}>
                  <Icon name="import" /> Import
                </a>
              )}
              <div className="explorer-view-toggle" role="group" aria-label="Explorer view">
                <button type="button" aria-label="List view" title="List view" aria-pressed={viewMode === 'list'} onClick={() => chooseViewMode('list')}><Icon name="list" /></button>
                <button type="button" aria-label="Grid view" title="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => chooseViewMode('grid')}><Icon name="grid" /></button>
              </div>
            </div>
          </div>

          <div className="explorer-toolbar">
            {folder ? (
              <div className="explorer-tabs" role="tablist" aria-label="Folder content">
                <a
                  role="tab"
                  aria-selected={tab === 'files'}
                  tabIndex={tab === 'files' ? 0 : -1}
                  href={`/pages/browse.html?folder=${folder.slug}&tab=files`}
                  onKeyDown={(event) => navigateTab(event, folder.slug, 'files')}
                >Files</a>
                <a
                  role="tab"
                  aria-selected={tab === 'views'}
                  tabIndex={tab === 'views' ? 0 : -1}
                  href={`/pages/browse.html?folder=${folder.slug}&tab=views`}
                  onKeyDown={(event) => navigateTab(event, folder.slug, 'views')}
                >Views</a>
              </div>
            ) : <h1>Folders</h1>}
            <span>{count}</span>
          </div>

          {denied && (
            <div className="explorer-notice" role="status">
              <strong>View only</strong>
              <span>You can browse this folder, but you do not have permission to create, import, rename, or configure files.</span>
            </div>
          )}

          {scenario === 'loading' ? (
            <div className="explorer-state" role="status" aria-live="polite">
              <Icon className="loading-mark" name="loader" />
              <strong>Loading {collectionName}</strong>
              <p>Your current folder and view will stay selected.</p>
              <button type="button" onClick={() => setScenario('ready')}>Show loaded items</button>
            </div>
          ) : scenario === 'error' ? (
            <div className="explorer-state explorer-state--error" role="alert">
              <strong>Files could not be loaded</strong>
              <p>The connection is still selected. Try loading this collection again.</p>
              <button type="button" onClick={() => setScenario('ready')}>Retry</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="explorer-state">
              <Icon name="search" />
              <strong>{query ? `No matching ${collectionName}` : `No ${collectionName} yet`}</strong>
              <p>{query ? 'Try another name or technical identity.' : folder && tab === 'views' ? 'Saved views created from files in this folder will appear here.' : 'This collection is currently empty.'}</p>
              {query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}
            </div>
          ) : (
            <div className="explorer-collection" aria-label={`${folder?.displayName || props.snapshot.database.displayName} ${collectionName}`}>
              {visible.map((item) => folder
                ? tab === 'files'
                  ? <FileItem
                    key={(item as ExplorerFile).id}
                    item={item as ExplorerFile}
                    folder={folder.slug}
                    onRequestContextMenu={openContextMenu}
                  />
                  : <ViewItem key={(item as ExplorerSavedView).id} item={item as ExplorerSavedView} folder={folder.slug} />
                : <FolderItem key={(item as typeof folders[number]).id} item={item as typeof folders[number]} />)}
            </div>
          )}
        </section>
      </main>
      <footer className="explorer-status">
        <span><i data-status={props.status} />Direct catalog boundary</span>
        <output aria-live="polite">{feedback}</output>
        <span>v{props.version}</span>
      </footer>
      {contextMenu && (
        <CommandContextMenu
          menu={contextMenu.menu}
          context={commandContext}
          onCommand={(id) => handleContextCommand(id)}
          onClose={closeContextMenu}
        />
      )}
      {settingsFile && folder && (
        <TableSettingsPanel
          open
          file={settingsFile}
          folder={folders.find((item) => item.id === settingsFile.folderId) || folder}
          folders={folders}
          triggerRef={settingsTrigger}
          error={settingsError}
          onClose={() => {
            setSettingsFile(undefined);
            setSettingsError(undefined);
            requestAnimationFrame(() => settingsTrigger.current?.focus());
          }}
          onApply={(draft) => void applySettings(draft)}
        />
      )}
      {createDialogOpen && (
        <FileCreateDialog
          busy={creating}
          error={createError}
          triggerRef={createTrigger}
          onClose={() => {
            if (creating) return;
            setCreateDialogOpen(false);
            setCreateError(undefined);
            requestAnimationFrame(() => createTrigger.current?.focus());
          }}
          onCreate={(displayName) => void createBlank(displayName)}
        />
      )}
    </div>
  );
}

/**
 * Render the import entry page component.
 */
export function ImportEntryPage(props: ImportEntryPageProps) {
  const folder = props.snapshot.folders.find((item) => item.slug === props.route.folder) || props.snapshot.folders[0]!;
  return (
    <div className="explorer-shell">
      <ExplorerHeader
        connectionDisplayName={props.snapshot.connection.displayName}
        identityDisplayName={props.identity.displayName}
        query=""
        onQueryChange={() => undefined}
      />
      <main className="explorer-main">
        <section className="import-entry" aria-labelledby="import-entry-title">
          <nav className="explorer-crumbs" aria-label="Breadcrumb">
            <a href="/pages/browse.html">Files</a><span aria-hidden="true">›</span>
            <a href={`/pages/browse.html?folder=${folder.slug}`}>{folder.displayName}</a><span aria-hidden="true">›</span>
            <strong>Import values</strong>
          </nav>
          <div className="import-entry-panel">
            <span className="panel-kicker">ONE-TIME IMPORT</span>
            <h1 id="import-entry-title">Choose a source</h1>
            <p>Import creates a new file in {folder.displayName}. Source connection, value preview, and transactional commit remain unavailable until an import connector is configured.</p>
            <div className="import-entry-choices" aria-label="Import source availability">
              <button type="button" disabled>CSV <small>Connector unavailable</small></button>
              <button type="button" disabled>XLSX <small>Connector unavailable</small></button>
              <button type="button" disabled>Google Sheets <small>Connector unavailable</small></button>
            </div>
            <div className="explorer-notice"><strong>Values only</strong><span>Formulas, formatting, comments, notes, and workbook behavior are not recreated.</span></div>
            <a className="secondary-action" href={`/pages/browse.html?folder=${folder.slug}`}>Back to {folder.displayName}</a>
          </div>
        </section>
      </main>
      <footer className="explorer-status"><span><i data-status={props.status} />Direct catalog boundary</span><output>Import entry ready</output><span>v{props.version}</span></footer>
    </div>
  );
}

/**
 * Render the folder item component.
 */
function FolderItem({ item }: { item: ExplorerPageProps['snapshot']['folders'][number], }) {
  return (
    <a className="explorer-item" href={`/pages/browse.html?folder=${item.slug}`}>
      <span className="explorer-item-identity"><span className="explorer-item-icon"><Icon name="folder" /></span><span><strong>{item.displayName}</strong></span></span>
      <span className="explorer-item-meta">{item.files.length} files</span>
      {item.updatedLabel && (
        <span className="explorer-item-meta">Edited {item.updatedLabel}</span>
      )}
      <span aria-hidden="true">›</span>
    </a>
  );
}

/**
 * Render the file item component.
 */
function FileItem({
  item,
  folder,
  onRequestContextMenu
}: {
  item: ExplorerFile,
  folder: string,
  onRequestContextMenu: (
    item: ExplorerFile,
    trigger: HTMLAnchorElement,
    x: number,
    y: number
  ) => void,
}) {
  return (
    <a
      className="explorer-item"
      href={`/pages/table.html?folder=${folder}&table=${item.slug}`}
      data-stable-id={item.id}
      aria-keyshortcuts="Shift+F10"
      onContextMenu={(event) => {
        event.preventDefault();
        onRequestContextMenu(
          item,
          event.currentTarget,
          event.clientX,
          event.clientY
        );
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onRequestContextMenu(
          item,
          event.currentTarget,
          bounds.left + 24,
          bounds.top + 24
        );
      }}
    >
      <span className="explorer-item-identity">
        <span className="explorer-item-icon"><Icon name="table" /></span>
        <span><strong>{item.displayName}</strong><small>{folder}.{item.physicalName}{item.readOnly ? ' · Read only' : ''}</small></span>
      </span>
      <span className="explorer-item-meta">
        {typeof item.recordCount === 'number'
          ? `${item.columnCount} x ${item.recordCount.toLocaleString()}`
          : `${item.columnCount} ${item.columnCount === 1 ? 'column' : 'columns'}`}
      </span>
      {item.updatedLabel && (
        <span className="explorer-item-meta">Edited {item.updatedLabel}</span>
      )}
      <span aria-hidden="true">›</span>
    </a>
  );
}

/**
 * Render the view item component.
 */
function ViewItem({ item, folder }: { item: ExplorerSavedView, folder: string, }) {
  return (
    <a className="explorer-item" href={`/pages/table.html?folder=${folder}&table=${item.fileSlug}&view=${item.slug}`} target="_blank" rel="noreferrer" data-stable-id={item.id}>
      <span className="explorer-item-identity">
        <span className="explorer-item-icon"><Icon name="list" /></span>
        <span><strong>{item.displayName}</strong><small>{item.summary}</small></span>
      </span>
      <span className="explorer-item-meta">{item.sourceFileName}</span>
      <span className="explorer-item-meta">{item.access} · {item.updatedLabel}</span>
      <Icon name="open" />
    </a>
  );
}

/**
 * Return the searchable text result.
 */
function searchableText(item: unknown) {
  if (!item || typeof item !== 'object') return '';
  return Object.values(item).filter((value) => typeof value === 'string').join(' ');
}

/**
 * Return the navigate tab result.
 */
function navigateTab(
  event: React.KeyboardEvent<HTMLAnchorElement>,
  folder: string,
  current: Tab
) {
  const next = event.key === 'ArrowRight' || event.key === 'End'
    ? 'views'
    : event.key === 'ArrowLeft' || event.key === 'Home'
      ? 'files'
      : undefined;
  if (!next || next === current) return;
  event.preventDefault();
  window.location.assign(`/pages/browse.html?folder=${folder}&tab=${next}`);
}
