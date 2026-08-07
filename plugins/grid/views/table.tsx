//modules
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

//client
import type { PresentationToolbarState } from '../../commands/components/command-surface.js';
import type { ContextMenuState } from '../../commands/components/context-menu.js';
import type {
  CommandContext,
  CommandId,
  CommandState,
  PresentationHistoryFrame
} from '../../commands/helpers/contracts.js';
import type { TableSettingsDraft } from '../../explorer/components/table-settings-panel.js';
import type {
  ExplorerFile,
  TablePageProps
} from '../../explorer/helpers/contracts.js';
import type { BrowserProviderProjection } from '../../app/helpers/projection.js';
import Provider from '../../app/components/Provider.js';
import type { FileDescription, PlannedFileDdl } from '../../files/helpers/contracts.js';
import type { GridCommand } from '../components/grid-canvas.js';
import type { GridGesture } from '../components/grid-canvas.js';
import type {
  GridCellIssue,
  GridCellPresentation,
  GridCellValue,
  GridColumn,
  GridFilter,
  GridResource,
  GridRow,
  GridSort,
  LogicalGridSelection
} from '../helpers/contracts.js';
import type { GridEditDraft, GridHistoryFrame } from '../helpers/editing.js';
import type { RealtimeState } from '../../realtime/events/controller.js';
import type { SavedViewIncludes } from '../../saved-views/components/saved-views-dialog.js';
import type {
  SavedView,
  SavedViewCapabilities,
  SavedViewDefinition
} from '../../saved-views/helpers/contracts.js';
import type { BlankColumnInsertion, ColumnInsertionRequest } from '../helpers/column-insertion.js';
import { GridCanvas } from '../components/grid-canvas.js';
import { ColumnSettingsPanel } from '../components/column-settings-panel.js';
import { GRID_HEADER_ROW_ID } from '../helpers/contracts.js';
import { spreadsheetRowNumber } from '../helpers/selection.js';
import {
  applyGridDraft,
  applyMutationVersions,
  capabilityActionForDraft,
  clearInsertDraftSelection,
  draftIssues,
  gridDraftFromPersistent,
  hiddenRowRank,
  insertDraftIsEmpty,
  insertedRowIdentity,
  persistentDraftPatch,
  pointsForSelection,
  stageCellEdit,
  stageDeleteRow,
  stageInsertRow,
  stageRelationChoice,
  stageScalarRange,
  updateInsertDraft,
  updateInsertRelationDraft
} from '../helpers/editing.js';
import {
  dispatchGridCapability,
  confirmGridDdl,
  createUnstructuredGridColumn,
  loadFileDescription,
  loadGridResource,
  loadRelationOptions,
  planGridDdl
} from '../events/actions.js';
import { TableSettingsPanel } from '../../explorer/components/table-settings-panel.js';
import { FileCreateDialog } from '../../explorer/components/file-ddl-confirmation.js';
import {
  applyExplorerDdlPlan,
  dispatchExplorerAction,
  waitForExplorerDdl
} from '../../explorer/events/actions.js';
import { normalizePhysicalName } from '../../explorer/helpers/model.js';
import { downloadAuthorizedCsv } from '../../import-export/events/actions.js';
import { Icon } from '../../app/components/icon.js';
import {
  SpreadsheetMenuBar,
  FormattingToolbar
} from '../../commands/components/command-surface.js';
import { CommandContextMenu } from '../../commands/components/context-menu.js';
import {
  applyPresentationPatch,
  clearPresentation,
  decodePresentation,
  encodePresentation,
  presentationPoints,
  presentationValue,
  remapPresentationRow
} from '../../commands/helpers/presentation.js';
import { presentationPatchForCommand } from '../../commands/events/dispatcher.js';
import { commandState, shortcutCommand } from '../../commands/helpers/registry.js';
import { DraftPersistenceRegistry } from '../helpers/draft-persistence.js';
import {
  applyBlankColumnInsertions,
  applyColumnInsertion,
  reconcileBlankColumnInsertions,
  removeBlankColumnInsertion
} from '../helpers/column-insertion.js';
import {
  committedRowIdsInVisibleOrder,
  padSpreadsheetRows,
  rankForInsertedRow
} from '../helpers/spreadsheet-rows.js';
import {
  applyServerDraftIssues,
  conflictingDraftTargets,
  draftForSchemaRevalidation,
  projectDraftCellIssues
} from '../helpers/draft-errors.js';
import {
  dispatchSavedViewAction,
  loadSavedView,
  loadSavedViews
} from '../../saved-views/events/actions.js';
import { SavedViewsDialog } from '../../saved-views/components/saved-views-dialog.js';
import { RealtimeController } from '../../realtime/events/controller.js';

//The workbench page props contract exported for module callers
export type WorkbenchPageProps = TablePageProps;

type RemoteDraftHandle = { id: string, version: number, };
type DraftState = 'none' | 'pending' | 'invalid' | 'failed' | 'stale';
type RetainedGridDraft = {
  draft: GridEditDraft,
  state: Exclude<DraftState, 'none'>,
  needsSchemaRevalidation?: boolean,
};
type PendingUnnamedCell = {
  columnId: string,
  rowId: string,
  value: GridCellValue,
};
type PendingInsertDraft = Extract<GridEditDraft, { kind: 'insert', }>;
type PendingColumnInsertion = ColumnInsertionRequest & {
  confirmed: boolean,
  sourceDraftId?: string,
};
type WorkbenchHistoryFrame =
  | { kind: 'data', frame: GridHistoryFrame, }
  | PresentationHistoryFrame;

type WorkbenchViewState = {
  gridlines: boolean,
  compact: boolean,
  zoom: 50 | 75 | 90 | 100 | 125 | 150 | 200,
  frozenRows: 'none' | 'one' | 'two' | 'current',
  frozenColumns: 'none' | 'one' | 'two' | 'current',
};

const BLANK_COLUMNS: GridColumn[] = Array.from({ length: 12 }, (_, index) => ({
  id: `draft_${String.fromCharCode(97 + index)}`,
  label: '',
  coordinate: String.fromCharCode(65 + index),
  width: 132,
  editable: true,
  kind: 'text',
  field: 'text',
  format: 'plain-text',
  storageCodec: 'text'
}));
const BLANK_ROWS: GridRow[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `placeholder_row_${index + 1}`
}));

/**
 * Render the head component.
 */
export function Head({ styles = [] }: { styles?: string[], }) {
  return (
    <>
      <title>Tabular spreadsheet</title>
      <meta name="description" content="Tabular direct PostgreSQL spreadsheet workbench" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {[...styles, '/styles/base.css', '/styles/grid.css', '/styles/commands.css', '/styles/saved-views.css', '/styles/tabulator.css'].map((href) => (
        <link key={href} rel="stylesheet" type="text/css" href={href} />
      ))}
    </>
  );
}

/**
 * Adapt the server-owned table data and Provider projection to the grid page.
 */
export default function TableView({ data, provider }: {
  data: WorkbenchPageProps,
  provider: BrowserProviderProjection,
}) {
  return <Provider {...provider}><WorkbenchPage {...data} /></Provider>;
}

/**
 * Render the workbench page component.
 */
export function WorkbenchPage(props: WorkbenchPageProps) {
  const initialFolder = props.snapshot.folders.find((item) => item.slug === props.route.folder) || props.snapshot.folders[0]!;
  const initialFile = initialWorkbenchFile(props, initialFolder.id);
  const initialSavedView = initialFolder.views.find((item) => item.slug === props.route.view);
  const [feedback, setFeedback] = useState('Workbench ready');
  const [selection, setSelection] = useState<LogicalGridSelection | null>(null);
  const [command, setCommand] = useState<GridCommand>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState<string>();
  const [folder] = useState(initialFolder);
  const [file, setFile] = useState(initialFile);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(initialFile.displayName);
  const [renameError, setRenameError] = useState<string>();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [initializingBlankFile, setInitializingBlankFile] = useState(false);
  const [creatingColumnId, setCreatingColumnId] = useState<string>();
  const [pendingUnnamedCell, setPendingUnnamedCell] = useState<PendingUnnamedCell>();
  const [physicalNameOverridden] = useState(false);
  const [baseRows, setBaseRows] = useState<GridRow[]>([]);
  const [gridColumns, setGridColumns] = useState<GridColumn[]>(() => props.route.newFile ? BLANK_COLUMNS : []);
  const [blankColumnInsertions, setBlankColumnInsertions] = useState<BlankColumnInsertion[]>([]);
  const allGridColumns = useRef<GridColumn[]>([]);
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [rowRanks, setRowRanks] = useState<Record<string, string>>({});
  const [schemaVersion, setSchemaVersion] = useState<string>();
  const [gridMode, setGridMode] = useState<'loading' | 'live' | 'draft' | 'unavailable'>(
    props.route.newFile ? 'draft' : 'loading'
  );
  const [gridUnavailable, setGridUnavailable] = useState<string>();
  const [editDraft, setEditDraft] = useState<GridEditDraft>();
  const [retainedDrafts, setRetainedDrafts] = useState<RetainedGridDraft[]>([]);
  const [pendingInsertDrafts, setPendingInsertDrafts] = useState<PendingInsertDraft[]>([]);
  const [automaticDrafts, setAutomaticDrafts] = useState<GridEditDraft[]>([]);
  const [draftState, setDraftState] = useState<DraftState>('none');
  const draftPersistence = useRef(
    new DraftPersistenceRegistry<string, RemoteDraftHandle>()
  );
  const automaticSaveTail = useRef<Promise<void>>(Promise.resolve());
  const commitGridDraftRef = useRef<(
    candidate: GridEditDraft,
    automatic: boolean
  ) => Promise<void>>(undefined);
  const [undoStack, setUndoStack] = useState<WorkbenchHistoryFrame[]>([]);
  const [redoStack, setRedoStack] = useState<WorkbenchHistoryFrame[]>([]);
  const [presentation, setPresentation] = useState<Record<string, GridCellPresentation>>({});
  const presentationLoaded = useRef(false);
  const [viewState, setViewState] = useState<WorkbenchViewState>({
    gridlines: true,
    compact: false,
    zoom: 100,
    frozenRows: 'none',
    frozenColumns: 'none'
  });
  const [sorts, setSorts] = useState<GridSort[]>([]);
  const [filters, setFilters] = useState<GridFilter[]>([]);
  const [transientSort, setTransientSort] = useState<GridSort>();
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewCapabilities, setSavedViewCapabilities] = useState<SavedViewCapabilities>(
    initialFile.savedViewCapabilities || {
      canCreatePrivate: false,
      canPublishShared: false,
      canMoveRows: false,
      rowOrderState: 'install-required',
      rowOrderReason: 'The shared row-order field is not installed.'
    }
  );
  const [savedViewDialog, setSavedViewDialog] = useState<'list' | 'create' | undefined>(
    props.route.dialog === 'create' ? 'create' : props.route.dialog === 'views' ? 'list' : undefined
  );
  const [savedViewBusy, setSavedViewBusy] = useState(false);
  const [savedViewError, setSavedViewError] = useState<string>();
  const [activeSavedView, setActiveSavedView] = useState<SavedView>();
  const [savedViewResolved, setSavedViewResolved] = useState(!props.route.view);
  const [rowOrderVersion, setRowOrderVersion] = useState<number>();
  const [streamCursor, setStreamCursor] = useState<number>();
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');
  const realtimeController = useRef<RealtimeController | undefined>(undefined);
  const realtimeRefresh = useRef<() => Promise<boolean>>(async () => true);
  const savedViewsRefresh = useRef<() => Promise<boolean>>(async () => true);
  const liveGridReadFailure = useRef<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const restoreContextFocus = useRef(true);
  const [deleteCandidate, setDeleteCandidate] = useState<string>();
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [columnSettingsId, setColumnSettingsId] = useState<string>();
  const pendingColumnInsertion = useRef<PendingColumnInsertion | undefined>(undefined);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const columnSettingsTrigger = useRef<HTMLElement>(null);
  const deleteTrigger = useRef<HTMLElement>(null);
  const deleteDialog = useRef<HTMLElement>(null);
  const fileTitleButton = useRef<HTMLButtonElement>(null);
  const fileTitleInput = useRef<HTMLInputElement>(null);
  const findTrigger = useRef<HTMLButtonElement>(null);
  const savedViewTrigger = useRef<HTMLElement>(null);
  const createFileTrigger = useRef<HTMLElement>(null);
  const commandSequence = useRef(0);
  const mutationSequence = useRef(0);
  const cancelRename = useRef(false);
  const workbenchClipboard = useRef('');
  const baseRowsRef = useRef(baseRows);
  const versionsRef = useRef(versions);
  const selectionRef = useRef(selection);
  const editDraftRef = useRef(editDraft);
  baseRowsRef.current = baseRows;
  versionsRef.current = versions;
  selectionRef.current = selection;
  editDraftRef.current = editDraft;
  const visibleRowRanks = useMemo(() => {
    const visibleRanks = { ...rowRanks };
    for (const draft of [
      ...retainedDrafts.map((entry) => entry.draft),
      ...pendingInsertDrafts,
      ...automaticDrafts,
      ...(editDraft ? [editDraft] : [])
    ]) {
      if (draft.kind === 'insert' && draft.rowRank) {
        visibleRanks[draft.row.id] = draft.rowRank;
      }
    }
    return visibleRanks;
  }, [rowRanks, retainedDrafts, pendingInsertDrafts, automaticDrafts, editDraft]);
  const rows = useMemo(() => {
    const retainedRows = retainedDrafts.reduce(
      (current, entry) => applyGridDraft(current, entry.draft),
      baseRows
    );
    const pendingRows = pendingInsertDrafts.reduce(
      (current, draft) => applyGridDraft(current, draft),
      retainedRows
    );
    const automaticRows = automaticDrafts.reduce(
      (current, draft) => applyGridDraft(current, draft),
      pendingRows
    );
    const visibleRows = editDraft ? applyGridDraft(automaticRows, editDraft) : automaticRows;
    return padSpreadsheetRows(visibleRows, visibleRowRanks, BLANK_ROWS);
  }, [baseRows, retainedDrafts, pendingInsertDrafts, automaticDrafts, editDraft, visibleRowRanks]);
  const committedRowIds = useMemo(
    () => committedRowIdsInVisibleOrder(rows, baseRows),
    [rows, baseRows]
  );
  const columns = useMemo(() => spreadsheetColumns(
    applyBlankColumnInsertions(gridColumns, blankColumnInsertions)
  ), [gridColumns, blankColumnInsertions]);
  const cellIssues = useMemo<GridCellIssue[]>(
    () => [
      ...retainedDrafts.flatMap((entry) => (
        projectDraftCellIssues(entry.draft, entry.state)
      )),
      ...(editDraft ? projectDraftCellIssues(editDraft, draftState) : [])
    ],
    [retainedDrafts, editDraft, draftState]
  );
  const visibleDraftState = editDraft
    ? draftState
    : strongestDraftState(retainedDrafts.map((entry) => entry.state));
  const formattingPoints = useMemo(
    () => presentationPoints(selection, rows, columns),
    [selection, rows, columns]
  );
  const toolbarPresentation = useMemo<PresentationToolbarState>(() => ({
    fontFamily: presentationValue(presentation, formattingPoints, 'fontFamily') || 'Arial',
    fontSize: presentationValue(presentation, formattingPoints, 'fontSize') || 12,
    bold: presentationValue(presentation, formattingPoints, 'bold') || false,
    italic: presentationValue(presentation, formattingPoints, 'italic') || false,
    underline: presentationValue(presentation, formattingPoints, 'underline') || false,
    textColor: presentationValue(presentation, formattingPoints, 'textColor') || '#20242a',
    fillColor: presentationValue(presentation, formattingPoints, 'fillColor') || 'transparent',
    horizontal: presentationValue(presentation, formattingPoints, 'horizontal') || 'auto',
    vertical: presentationValue(presentation, formattingPoints, 'vertical') || 'middle',
    wrap: presentationValue(presentation, formattingPoints, 'wrap') || 'clip',
    border: presentationValue(presentation, formattingPoints, 'border') || 'none',
    borderColor: presentationValue(presentation, formattingPoints, 'borderColor') || '#4b5563',
    borderStyle: presentationValue(presentation, formattingPoints, 'borderStyle') || 'solid',
    numberFormat: presentationValue(presentation, formattingPoints, 'numberFormat') || 'automatic'
  }), [presentation, formattingPoints]);
  /**
   * Apply the resolved view.
   */
  const applyResolvedView = (
    resolvedView: NonNullable<GridResource['view']>,
    resolvedRows: GridRow[],
    resolvedColumns: GridColumn[]
  ) => {
    const definition = resolvedView.definition;
    setActiveSavedView((current) => {
      if (!current || current.id !== resolvedView.id) return current;
      if (current.version === resolvedView.version
        && JSON.stringify(current.definition) === JSON.stringify(definition)) return current;
      return { ...current, version: resolvedView.version, definition };
    });
    setSorts(transientSort
      ? [transientSort]
      : definition.includes.filtersAndSorting ? definition.sorts : []);
    setFilters(definition.includes.filtersAndSorting ? definition.filters : []);
    if (definition.includes.cellPresentation) {
      setPresentation(intersectPresentation(
        definition.presentation,
        resolvedRows,
        resolvedColumns
      ));
    }
  };
  const commandContext = useMemo<CommandContext>(() => {
    const rowId = selectedRowFrom(selection);
    const committedRowIndex = rowId ? committedRowIds.indexOf(rowId) : -1;
    const column = columns.find((candidate) => candidate.id === selectedColumnFrom(selection));
    const blankInsertion = blankColumnInsertions.find((insertion) => (
      insertion.id === column?.id
    ));
    const committedRowRequired = 'Select a committed row before moving it.';
    const persistedColumn = Boolean(column?.label.trim() && !column.id.startsWith('draft_'));
    return {
      selectionKind: selection?.kind || 'none',
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      hasDraft: Boolean(editDraft),
      readOnly: file.readOnly,
      canMutateValues: !file.readOnly && columns.some((candidate) => candidate.editable !== false),
      canMutateSelection: !file.readOnly && Boolean(selection) && (
        selection?.kind === 'row'
          ? columns.some((candidate) => candidate.editable !== false)
          : selection?.kind === 'column'
            ? columns.find((candidate) => candidate.id === selection.columnId)?.editable !== false
              && columns.some((candidate) => candidate.id === selection.columnId)
            : formattingPoints.some((point) =>
              columns.find((candidate) => candidate.id === point.columnId)?.editable !== false
            )
      ),
      canCreateFile: folder.permissions.createFile,
      canImportFile: folder.permissions.importFile,
      canConfigureFile: folder.permissions.configureFile && !file.readOnly,
      canSaveViews: gridMode === 'live' && file.id.startsWith('obj_'),
      canMoveRows: savedViewCapabilities.canMoveRows && sorts.length === 0
        && realtimeState !== 'access-lost',
      canMoveRowUp: committedRowIndex > 0,
      canMoveRowDown: committedRowIndex >= 0 && committedRowIndex < committedRowIds.length - 1,
      rowMoveUpReason: committedRowIndex < 0
        ? committedRowRequired
        : 'The selected committed row is already first.',
      rowMoveDownReason: committedRowIndex < 0
        ? committedRowRequired
        : 'The selected committed row is already last.',
      rowOrderReason: sorts.length
        ? 'Clear the explicit sort before changing shared row order.'
        : savedViewCapabilities.rowOrderReason,
      canDeleteColumn: Boolean(blankInsertion) && creatingColumnId !== column?.id,
      columnDeleteReason: creatingColumnId === column?.id
        ? 'Finish creating this column first.'
        : 'Deleting PostgreSQL columns requires the confirmed DDL workflow.',
      canSortSelection: persistedColumn && gridMode === 'live',
      sortReason: persistedColumn
        ? 'Sorting requires a live PostgreSQL-backed file.'
        : 'Name this column before sorting it.',
      relationSelection: column?.kind === 'relation',
      currentRowLabel: selectedRowLabel(selection, rows),
      currentColumnLabel: column?.coordinate
    };
  }, [selection, undoStack.length, redoStack.length, editDraft, file.readOnly, folder.permissions, rows, committedRowIds, columns, blankColumnInsertions, creatingColumnId, realtimeState, savedViewCapabilities, sorts.length, gridMode, file.id, formattingPoints]);

  useEffect(() => {
    document.title = activeSavedView || initialSavedView
      ? `${activeSavedView?.name || initialSavedView?.displayName} — ${file.displayName} — Tabular`
      : `${file.displayName} — Tabular`;
  }, [file.displayName, initialSavedView, activeSavedView]);

  useEffect(() => {
    presentationLoaded.current = false;
    const key = `tabular.presentation.${file.id}`;
    setPresentation(decodePresentation(
      typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key)
    ));
    presentationLoaded.current = true;
  }, [file.id]);

  useEffect(() => {
    setBlankColumnInsertions([]);
    pendingColumnInsertion.current = undefined;
  }, [file.id]);

  useEffect(() => {
    if (!presentationLoaded.current || typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(`tabular.presentation.${file.id}`, encodePresentation(presentation));
  }, [file.id, presentation]);

  useEffect(() => {
    if (!deleteCandidate) return;
    const dialog = deleteDialog.current;
    requestAnimationFrame(() => dialog?.querySelector<HTMLButtonElement>('button')?.focus());
    /**
     * Handle the key down event.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDeleteCandidate(undefined);
        requestAnimationFrame(() => deleteTrigger.current?.focus());
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
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
  }, [deleteCandidate]);

  useEffect(() => {
    if (props.route.newFile) return;
    if (props.route.view && !savedViewResolved) return;
    let active = true;
    setGridMode('loading');
    setGridUnavailable(undefined);
    void (async () => {
      const resource = await loadGridResource(props.route.folder, props.route.table, {
        ...(activeSavedView ? {
          viewId: activeSavedView.id,
          expectedViewVersion: activeSavedView.version
        } : {}),
        ...(transientSort ? { sort: transientSort } : {})
      });
      if (!active) return;
      if (resource.status !== 'ok') {
        const reason = resource.status === 'unavailable'
          ? resource.reason
          : resource.error.message;
        setBaseRows([]);
        setGridColumns([]);
        setGridMode('unavailable');
        setGridUnavailable(reason);
        setFeedback(reason);
        return;
      }
      let nextColumns = resource.data.columns;
      const described = await loadFileDescription(resource.data.fileId);
      if (described.ok) {
        nextColumns = enrichGridColumns(nextColumns, described.data, props.snapshot.folders);
        nextColumns = await hydrateRelationOptions(resource.data.fileId, nextColumns, resource.data.rows);
      }
      if (!activeSavedView?.definition.includes.columnLayout) {
        nextColumns = restoreColumnOrder(nextColumns, file.id);
      }
      if (!active) return;
      allGridColumns.current = nextColumns;
      if (resource.data.view && activeSavedView?.id === resource.data.view.id) {
        applyResolvedView(resource.data.view, resource.data.rows, nextColumns);
      }
      setBaseRows(resource.data.rows);
      setGridColumns(spreadsheetColumns(nextColumns));
      setVersions(resource.data.versions);
      setRowRanks(resource.data.rowRanks || {});
      setSchemaVersion(resource.data.schemaVersion);
      setStreamCursor(resource.data.cursor);
      setRowOrderVersion(resource.data.rowOrderVersion);
      setGridMode('live');
      draftPersistence.current.clear();
      const recovered: RetainedGridDraft[] = [];
      let discardedEmptyDrafts = 0;
      for (const stored of resource.data.drafts) {
        const stale = stored.schemaVersion !== resource.data.schemaVersion
          || stored.validation.some((issue) => issue.code === 'schema_changed');
        const draft = gridDraftFromPersistent(
          stale ? { ...stored, validation: [] } : stored,
          resource.data.rows,
          nextColumns
        );
        if (!draft) continue;

        //Empty insert drafts have no spreadsheet value to recover. Remove
        // them remotely so reload restores the untouched logical row instead
        // of reviving required-field errors forever.
        if (draft.kind === 'insert' && insertDraftIsEmpty(draft, nextColumns)) {
          const removed = await dispatchGridCapability({
            type: 'draft.delete',
            commandId: nextCommandId('draft_delete_empty'),
            draftId: stored.id,
            expectedDraftVersion: stored.version
          }, props.csrfToken);
          if (!active) return;
          if (removed.status === 'ok') {
            discardedEmptyDrafts += 1;
            continue;
          }
        }
        draftPersistence.current.replace(draft.id, {
          id: stored.id,
          version: stored.version
        });
        recovered.push({
          draft,
          state: draftIssues(draft).length
            ? 'invalid' as const
            : stale
              ? 'stale' as const
              : 'pending' as const,
          ...(stale ? { needsSchemaRevalidation: true } : {})
        });
      }
      setEditDraft(undefined);
      editDraftRef.current = undefined;
      setPendingInsertDrafts([]);
      setAutomaticDrafts([]);
      setDraftState('none');
      setRetainedDrafts(recovered);
      if (recovered.length) {
        const staleCount = recovered.filter((entry) => entry.state === 'stale').length;
        setFeedback(staleCount
          ? `Recovered ${recovered.length} persistent ${recovered.length === 1 ? 'draft' : 'drafts'}; ${staleCount} need table-structure revalidation.`
          : `Recovered ${recovered.length} persistent ${recovered.length === 1 ? 'draft' : 'drafts'}.`);
      } else if (discardedEmptyDrafts) {
        setFeedback(
          `Cleared ${discardedEmptyDrafts} empty retained ${discardedEmptyDrafts === 1 ? 'row' : 'rows'} and restored the blank spreadsheet state.`
        );
      } else {
        setFeedback(resource.data.view
          ? `Loaded ${resource.data.rows.length} server-authorized saved-view rows`
          : transientSort
            ? `Loaded ${resource.data.rows.length} server-sorted PostgreSQL rows`
            : `Loaded ${resource.data.rows.length} live PostgreSQL rows`);
      }
    })();
    return () => { active = false; };
  }, [
    file.id,
    props.route.folder,
    props.route.table,
    props.route.newFile,
    props.route.view,
    savedViewResolved,
    activeSavedView?.id,
    activeSavedView?.version,
    transientSort?.columnId,
    transientSort?.direction
  ]);

  useEffect(() => {
    setActiveSavedView(undefined);
    setSavedViewResolved(!props.route.view);
    if (!file.id.startsWith('obj_')) {
      setSavedViewResolved(true);
      return;
    }
    let active = true;
    void (async () => {
      const result = await loadSavedViews(file.id);
      if (!active) return;
      if (result.status === 'error') {
        setSavedViewError(result.error.message);
        setSavedViewResolved(true);
        return;
      }
      setSavedViews(result.data.views);
      const capabilities = result.data.capabilities[file.id];
      if (capabilities) {
        setSavedViewCapabilities(capabilities);
        setRowOrderVersion(capabilities.rowOrderVersion);
      }
      const requested = props.route.view
        ? result.data.views.find((view) => view.slug === props.route.view)
        : undefined;
      if (!requested) {
        setSavedViewResolved(true);
        return;
      }
      const loaded = await loadSavedView(requested.id);
      if (!active) return;
      if (loaded.status === 'error') {
        setSavedViewError(loaded.error.message);
        setFeedback(loaded.error.message);
        setSavedViewResolved(true);
        return;
      }
      setActiveSavedView(loaded.data);
      setSavedViewResolved(true);
    })();
    return () => { active = false; };
  }, [file.id, props.route.view]);

  useEffect(() => {
    if (!activeSavedView || !allGridColumns.current.length) return;
    const definition = activeSavedView.definition;
    setSorts(definition.includes.filtersAndSorting ? definition.sorts : []);
    setFilters(definition.includes.filtersAndSorting ? definition.filters : []);
    if (definition.includes.columnLayout) {
      setGridColumns(spreadsheetColumns(projectSavedViewColumns(allGridColumns.current, definition)));
    }
    if (definition.includes.cellPresentation) {
      setPresentation(intersectPresentation(
        definition.presentation,
        baseRows,
        allGridColumns.current
      ));
    }
    setFeedback(`Applied server-authorized saved view ${activeSavedView.name}`);
  }, [activeSavedView, schemaVersion]);

  useEffect(() => {
    setTransientSort(undefined);
  }, [activeSavedView?.id, activeSavedView?.version]);

  /**
   * Return the request grid selection result.
   */
  const requestGridSelection = (next: LogicalGridSelection | null) => {
    if (!next) return;
    commandSequence.current += 1;
    setCommand({ id: commandSequence.current, action: 'select', selection: next });
  };

  /**
   * Return the next command id result.
   */
  const nextCommandId = (prefix: string) => {
    mutationSequence.current += 1;
    return `cmd_${prefix}_${Date.now()}_${mutationSequence.current}`;
  };

  /**
   * Read the live grid snapshot.
   */
  const readLiveGridSnapshot = async () => {
    const resource = await loadGridResource(props.route.folder, props.route.table, {
      ...(activeSavedView ? {
        viewId: activeSavedView.id,
        expectedViewVersion: activeSavedView.version
      } : {}),
      ...(transientSort ? { sort: transientSort } : {})
    });
    if (resource.status !== 'ok') {
      liveGridReadFailure.current = resource.status === 'error'
        ? `${resource.error.code}: ${resource.error.message}`
        : resource.reason;
      return undefined;
    }
    liveGridReadFailure.current = undefined;
    let refreshedColumns = resource.data.columns;
    const described = await loadFileDescription(resource.data.fileId);
    if (described.ok) {
      refreshedColumns = enrichGridColumns(
        refreshedColumns,
        described.data,
        props.snapshot.folders
      );
      refreshedColumns = await hydrateRelationOptions(
        resource.data.fileId,
        refreshedColumns,
        resource.data.rows
      );
    }
    if (!activeSavedView?.definition.includes.columnLayout) {
      refreshedColumns = restoreColumnOrder(refreshedColumns, file.id);
    }
    const pendingInsertion = pendingColumnInsertion.current;
    let appliedInsertion: PendingColumnInsertion | undefined;
    if (pendingInsertion?.confirmed) {
      const applied = applyColumnInsertion(refreshedColumns, pendingInsertion);
      if (applied) {
        refreshedColumns = applied.columns;
        appliedInsertion = pendingInsertion;
        pendingColumnInsertion.current = undefined;
        if (pendingInsertion.sourceDraftId) {
          setBlankColumnInsertions((current) => current.filter((insertion) => (
            insertion.id !== pendingInsertion.sourceDraftId
          )));
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(
            `tabular.column-order.${file.id}`,
            JSON.stringify(refreshedColumns.map((column) => column.id))
          );
        }
        setFeedback(
          `Inserted ${applied.createdColumn.label} ${pendingInsertion.placement} of the selected column`
        );
      }
    }
    allGridColumns.current = refreshedColumns;
    if (resource.data.view && activeSavedView?.id === resource.data.view.id) {
      applyResolvedView(resource.data.view, resource.data.rows, refreshedColumns);
    }
    const projectedColumns = activeSavedView?.definition.includes.columnLayout
      ? projectSavedViewColumns(refreshedColumns, activeSavedView.definition)
      : refreshedColumns;
    const visibleColumns = appliedInsertion
      ? applyColumnInsertion(projectedColumns, appliedInsertion)?.columns || projectedColumns
      : projectedColumns;
    return {
      rows: resource.data.rows,
      columns: spreadsheetColumns(visibleColumns),
      versions: resource.data.versions,
      rowRanks: resource.data.rowRanks || {},
      schemaVersion: resource.data.schemaVersion,
      cursor: resource.data.cursor,
      rowOrderVersion: resource.data.rowOrderVersion
    };
  };

  realtimeRefresh.current = async () => {
    const refreshed = await readLiveGridSnapshot();
    if (!refreshed) {
      setRealtimeState('reconnecting');
      setFeedback(`Live refresh could not complete${liveGridReadFailure.current ? ` (${liveGridReadFailure.current})` : ''}; reconnecting from the durable cursor…`);
      return false;
    }
    setBaseRows(refreshed.rows);
    setGridColumns(refreshed.columns);
    setVersions(refreshed.versions);
    setRowRanks(refreshed.rowRanks);
    setSchemaVersion(refreshed.schemaVersion);
    setRowOrderVersion(refreshed.rowOrderVersion);
    if (!editDraft && !retainedDrafts.length) {
      setFeedback(`Live update applied · ${refreshed.rows.length} PostgreSQL rows`);
    }
    return true;
  };

  savedViewsRefresh.current = async () => {
    const result = await loadSavedViews(file.id);
    if (result.status === 'error') {
      setSavedViewError(result.error.message);
      return false;
    }
    setSavedViews(result.data.views);
    const capabilities = result.data.capabilities[file.id];
    if (capabilities) {
      setSavedViewCapabilities(capabilities);
      setRowOrderVersion(capabilities.rowOrderVersion);
    }
    if (activeSavedView) {
      const current = result.data.views.find((view) => view.id === activeSavedView.id);
      if (current && current.version !== activeSavedView.version) {
        const loaded = await loadSavedView(current.id);
        if (loaded.status === 'ok') setActiveSavedView(loaded.data);
      }
    }
    return true;
  };

  useEffect(() => {
    if (gridMode !== 'live' || !file.id.startsWith('obj_') || streamCursor === undefined) return;
    const controller = new RealtimeController({
      fileId: file.id,
      cursor: streamCursor,
      onState: (state, message) => {
        setRealtimeState(state);
        setFeedback(message);
        if (state === 'access-lost') {
          setFile((current) => ({ ...current, readOnly: true }));
        }
      },
      onChange: async (change) => {
        if (change.type.startsWith('saved-view.') && !await savedViewsRefresh.current()) {
          throw new Error('Saved views could not be refreshed');
        }
        if (change.type === 'grid.changed' || change.type === 'schema.changed'
          || change.type === 'row-order.changed') {
          if (!await realtimeRefresh.current()) throw new Error('Grid could not be refreshed');
        }
      },
      onSnapshot: async () => {
        const results = await Promise.all([realtimeRefresh.current(), savedViewsRefresh.current()]);
        if (results.some((result) => !result)) throw new Error('Snapshot could not be refreshed');
      }
    });
    realtimeController.current = controller;
    controller.start();
    return () => {
      controller.close(false);
      if (realtimeController.current === controller) realtimeController.current = undefined;
    };
  }, [file.id, gridMode, streamCursor]);

  /**
   * Adds or replaces one row-scoped retained draft without touching its peers.
   */
  const retainGridDraft = (
    draft: GridEditDraft,
    state: RetainedGridDraft['state'],
    needsSchemaRevalidation?: boolean
  ) => {
    setRetainedDrafts((current) => {
      const retained = current.find((entry) => entry.draft.id === draft.id);
      const revalidation = needsSchemaRevalidation
        ?? retained?.needsSchemaRevalidation;
      return [
        ...current.filter((entry) => entry.draft.id !== draft.id),
        {
          draft,
          state,
          ...(revalidation ? { needsSchemaRevalidation: true } : {})
        }
      ];
    });
  };

  /**
   * Persists one draft through its own sequenced remote handle.
   */
  const persistGridDraft = (candidate: GridEditDraft, preserveFeedback = false) => {
    if (gridMode !== 'live' || !schemaVersion) return;
    const persistent = persistentDraftPatch(candidate, columns);
    if (!persistent) return;
    return draftPersistence.current.enqueue<RemoteDraftHandle | undefined>(
      candidate.id,
      async (handle) => {
      const action = handle
        ? {
          type: 'draft.update' as const,
          commandId: nextCommandId('draft_update'),
          draftId: handle.id,
          expectedDraftVersion: handle.version,
          patch: persistent.patch
        }
        : {
          type: 'draft.create' as const,
          commandId: nextCommandId('draft_create'),
          fileId: file.id,
          ...(persistent.rowId ? { rowId: persistent.rowId } : {}),
          ...(persistent.rowRank ? { rowRank: persistent.rowRank } : {}),
          schemaVersion,
          patch: persistent.patch,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
      const result = await dispatchGridCapability(action, props.csrfToken);
      if (result.status === 'error') {
        setFeedback(`${result.error.message} The in-tab draft is still retained.`);
        return { result: undefined };
      }
      const summary = result.data as { id?: unknown, version?: unknown, };
      if (typeof summary.id !== 'string' || typeof summary.version !== 'number') {
        return { result: undefined };
      }
      const retained = { id: summary.id, version: summary.version };
      if (!preserveFeedback) setFeedback('Draft retained in your authenticated session');
      return { result: retained, handle: retained };
      }
    );
  };

  /**
   * Return the stage grid draft result.
   */
  const stageGridDraft = (draft: GridEditDraft) => {
    const issues = draftIssues(draft);
    const changed = draft.changes.some((change) => (
      change.before !== change.after || Boolean(change.issue)
    ));
    if (!changed) {
      setFeedback('No value change to save');
      return false;
    }
    if (issues.length) {
      retainGridDraft(draft, 'invalid');
      setFeedback(`${issues[0]!.message} The value is retained for correction.`);
      const persistence = persistGridDraft(draft, true);
      if (persistence) {
        void persistence.then((retained) => {
          if (!retained) retainGridDraft(draft, 'failed');
        });
      }
      return true;
    }
    setAutomaticDrafts((current) => [...current, draft]);
    setFeedback(`Saving ${draft.changes.length} ${draft.changes.length === 1 ? 'cell' : 'cells'}…`);
    automaticSaveTail.current = automaticSaveTail.current.then(async () => {
      await commitGridDraftRef.current?.(draft, true);
    }).catch((caught) => {
      setAutomaticDrafts((current) => current.filter((candidate) => candidate.id !== draft.id));
      retainGridDraft(draft, 'failed');
      setFeedback(caught instanceof Error
        ? `${caught.message} Your value is retained.`
        : 'The value could not be saved. Your value is retained.');
    });
    return true;
  };

  /**
   * Cancel the grid draft.
   */
  const cancelGridDraft = async (
    message = 'Draft canceled; accepted PostgreSQL values restored',
    requested?: GridEditDraft
  ) => {
    const selectedRowId = selection && (
      selection.kind === 'row'
        ? selection.rowId
        : selection.kind === 'cell' || selection.kind === 'range'
          ? selection.focus.rowId
          : undefined
    );
    const candidate = requested
      || editDraft
      || pendingInsertDrafts.find((draft) => (
        selectedRowId && draftContainsRow(draft, selectedRowId)
      ))
      || retainedDrafts.find((entry) => (
        selectedRowId && draftContainsRow(entry.draft, selectedRowId)
      ))?.draft;
    if (!candidate) return;
    await draftPersistence.current.settle(candidate.id);
    const retained = draftPersistence.current.current(candidate.id);
    if (retained) {
      const result = await dispatchGridCapability({
        type: 'draft.delete',
        commandId: nextCommandId('draft_delete'),
        draftId: retained.id,
        expectedDraftVersion: retained.version
      }, props.csrfToken);
      if (result.status === 'error') {
        setDraftState('failed');
        setFeedback(`${result.error.message} The persistent draft was not discarded.`);
        return;
      }
    }
    if (candidate.kind === 'insert') {
      setPresentation((current) => remapPresentationRow(current, candidate.row.id));
      setUndoStack((current) => remapPresentationHistory(current, candidate.row.id));
      setRedoStack((current) => remapPresentationHistory(current, candidate.row.id));
    }
    setRetainedDrafts((current) => current.filter((entry) => (
      entry.draft.id !== candidate.id
    )));
    setPendingInsertDrafts((current) => current.filter((draft) => (
      draft.id !== candidate.id
    )));
    setAutomaticDrafts((current) => current.filter((draft) => draft.id !== candidate.id));
    if (editDraft?.id === candidate.id) {
      setEditDraft(undefined);
      editDraftRef.current = undefined;
      setDraftState('none');
    }
    draftPersistence.current.remove(candidate.id);
    setFeedback(message);
  };

  /**
   * Return the commit grid draft result.
   */
  const commitGridDraft = async (candidate = editDraft, automatic = false) => {
    if (!candidate) return;
    const retainedEntry = retainedDrafts.find((entry) => entry.draft.id === candidate!.id);
    const activeDraftState = automatic
      ? 'pending'
      : retainedEntry?.state || draftState;
    const needsSchemaRevalidation = retainedEntry?.needsSchemaRevalidation
      || activeDraftState === 'stale';
    if (needsSchemaRevalidation) candidate = draftForSchemaRevalidation(candidate);
    const issues = draftIssues(candidate);
    if (issues.length) {
      if (automatic) {
        setAutomaticDrafts((current) => current.filter((draft) => draft.id !== candidate!.id));
      }
      retainGridDraft(candidate, 'invalid');
      if (editDraft?.id === candidate.id) {
        setEditDraft(undefined);
        editDraftRef.current = undefined;
        setDraftState('none');
      }
      setFeedback(`${issues[0]!.message} Correct the retained value and blur again.`);
      return;
    }
    const beforeRows = baseRowsRef.current.map((row) => ({ ...row }));
    const beforeVersions = { ...versionsRef.current };
    let resultData: unknown;
    let actionUsesRemoteDraft = false;
    if (gridMode === 'live') {
      let action;
      let actionForVersions: ((current: Record<string, string>) => ReturnType<
        typeof capabilityActionForDraft
      >) | undefined;
      try {
        //A final editor event can finish persistence immediately before the
        // click. Read the sequencer-owned handle instead of a lagging React
        // render so promotion always uses its newest draft version.
        if (!automatic) await draftPersistence.current.settle(candidate.id);
        if (automatic && candidate.kind === 'insert') {
          await persistGridDraft(candidate, true);
          await draftPersistence.current.settle(candidate.id);
        }
        let promotableDraft = automatic && candidate.kind !== 'insert'
          ? undefined
          : draftPersistence.current.current(candidate.id);
        if (automatic && candidate.kind === 'insert' && candidate.rowRank && !promotableDraft) {
          throw new Error('The logical row could not be retained before saving');
        }
        actionUsesRemoteDraft = Boolean(promotableDraft);
        if (!automatic && needsSchemaRevalidation && promotableDraft) {
          setFeedback('Updating the retained row for the current table structure…');
          const retained = promotableDraft;
          const removed = await dispatchGridCapability({
            type: 'draft.delete',
            commandId: nextCommandId('draft_rebase_delete'),
            draftId: retained.id,
            expectedDraftVersion: retained.version
          }, props.csrfToken);
          if (removed.status === 'error') {
            retainGridDraft(candidate, 'failed');
            setFeedback(`The old retained row could not be replaced: ${removed.error.message}. Your values remain in this tab.`);
            return;
          }
          draftPersistence.current.replace(candidate.id, undefined);
          promotableDraft = undefined;
          actionUsesRemoteDraft = false;
          retainGridDraft(candidate, 'pending', false);
        }
        actionForVersions = (currentVersions) => promotableDraft
          ? {
            type: 'draft.promote' as const,
            commandId: nextCommandId('draft_promote'),
            draftId: promotableDraft.id,
            expectedDraftVersion: promotableDraft.version,
            ...(candidate.kind !== 'insert' ? {
              expectedRowVersion: currentVersions[candidate.changes[0]!.point.rowId]
            } : {})
          }
          : capabilityActionForDraft(candidate, {
            commandId: nextCommandId(candidate.kind),
            fileId: file.id,
            versions: currentVersions,
            columns
          });
        action = actionForVersions(versionsRef.current);
      } catch (caught) {
        setAutomaticDrafts((current) => current.filter((draft) => draft.id !== candidate!.id));
        retainGridDraft(candidate, 'failed');
        if (editDraft?.id === candidate.id) {
          setEditDraft(undefined);
          editDraftRef.current = undefined;
          setDraftState('none');
        }
        setFeedback(caught instanceof Error ? caught.message : 'Reload before saving this draft.');
        return;
      }
      if (!automatic) setDraftState('pending');
      setFeedback('Saving typed PostgreSQL action…');
      let result = await dispatchGridCapability(action, props.csrfToken);

      //A newly inserted row or a just-applied live refresh can leave the UI
      // with an older version token even though the edited cell itself has not
      // changed. Refresh and retry once only when doing so cannot overwrite an
      // unexpected value in any target cell.
      if (
        result.status === 'error'
        && result.error.code === 'conflict'
        && candidate.kind === 'cells'
        && actionForVersions
      ) {
        const refreshed = await readLiveGridSnapshot();
        const conflicts = refreshed
          ? conflictingDraftTargets(candidate, refreshed.rows)
          : candidate.changes;
        if (refreshed && conflicts.length === 0) {
          setFeedback('Refreshing the saved row version and retrying your retained values…');
          result = await dispatchGridCapability(
            actionForVersions(refreshed.versions),
            props.csrfToken
          );
        } else if (refreshed) {
          const conflictingIds = new Set(conflicts.map((change) => (
            `${change.point.rowId}\u0000${change.point.columnId}`
          )));
          const rejectedDraft: GridEditDraft = {
            ...candidate,
            changes: candidate.changes.map((change) => {
              if (!conflictingIds.has(
                `${change.point.rowId}\u0000${change.point.columnId}`
              )) return change;
              const label = columns.find((column) => (
                column.id === change.point.columnId
              ))?.label || 'This cell';
              return {
                ...change,
                issue: {
                  columnId: change.point.columnId,
                  code: 'concurrent_change',
                  message: `${label} changed after this draft started. Your value is retained; cancel or reload before replacing it.`
                }
              };
            })
          };
          retainGridDraft(rejectedDraft, 'failed');
          if (automatic) {
            setAutomaticDrafts((current) => current.filter((draft) => draft.id !== candidate!.id));
          }
          if (editDraft?.id === candidate.id) {
            setEditDraft(undefined);
            editDraftRef.current = undefined;
            setDraftState('none');
          }
          setFeedback('The edited PostgreSQL cell changed in another action. Your typed value is retained and has not overwritten it.');
          return;
        }
      }
      if (result.status === 'error') {
        const rejectedDraft = applyServerDraftIssues(candidate, result.error.issues);
        if (automatic) {
          setAutomaticDrafts((current) => current.filter((draft) => draft.id !== candidate!.id));
        }
        retainGridDraft(
          rejectedDraft,
          result.error.code === 'validation_failed' ? 'invalid' : 'failed'
        );
        if (editDraft?.id === candidate.id) {
          setEditDraft(undefined);
          editDraftRef.current = undefined;
          setDraftState('none');
        }
        setFeedback(`${actionIssueMessage(result.error, columns) || result.error.message} Your typed values are retained.`);
        if (!actionUsesRemoteDraft) {
          const retained = await persistGridDraft(rejectedDraft, true);
          if (retained && result.error.code === 'validation_failed') {
            //Promotion replays the server-side validation against the retained
            // draft and stores those PostgreSQL issues for reload recovery.
            const retainedResult = await dispatchGridCapability({
              type: 'draft.promote',
              commandId: nextCommandId('draft_validate'),
              draftId: retained.id,
              expectedDraftVersion: retained.version,
              ...(candidate.kind !== 'insert' ? {
                expectedRowVersion: versionsRef.current[candidate.changes[0]!.point.rowId]
              } : {})
            }, props.csrfToken);
            if (retainedResult.status === 'error') return;
            resultData = retainedResult.data;
          } else {
            return;
          }
        } else {
          return;
        }
      } else {
        resultData = result.data;
      }
    }
    let afterRows = applyGridDraft(beforeRows, candidate);
    const insertedId = candidate.kind === 'insert' ? insertedRowIdentity(resultData) : undefined;
    if (candidate.kind === 'insert' && insertedId) {
      setPresentation((current) => remapPresentationRow(current, candidate.row.id, insertedId));
      setUndoStack((current) => remapPresentationHistory(current, candidate.row.id, insertedId));
      setRedoStack((current) => remapPresentationHistory(current, candidate.row.id, insertedId));
      afterRows = afterRows.map((row) => row.id === candidate.row.id
        ? { ...row, id: insertedId }
        : row);
    }
    let afterVersions = applyMutationVersions(beforeVersions, resultData, candidate);
    afterVersions = versionsForRows(afterVersions, afterRows);
    if (gridMode === 'live') {
      const refreshed = await readLiveGridSnapshot();
      if (refreshed) {
        afterRows = refreshed.rows;
        afterVersions = refreshed.versions;
        setRowRanks(refreshed.rowRanks);
        setGridColumns(refreshed.columns);
        setSchemaVersion(refreshed.schemaVersion);
      }
    }
    const frame: GridHistoryFrame = {
      beforeRows,
      afterRows: afterRows.map((row) => ({ ...row })),
      beforeVersions,
      afterVersions: { ...afterVersions },
      selection: selectionRef.current,
      label: candidate.kind === 'insert'
        ? 'Insert row'
        : candidate.kind === 'delete'
          ? 'Delete row'
          : `${candidate.source === 'edit' ? 'Edit' : candidate.source} ${candidate.changes.length} ${candidate.changes.length === 1 ? 'cell' : 'cells'}`
    };
    baseRowsRef.current = afterRows;
    versionsRef.current = afterVersions;
    setBaseRows(afterRows);
    setVersions(afterVersions);
    setUndoStack((current) => [...current, { kind: 'data' as const, frame }].slice(-100));
    setRedoStack([]);
    setAutomaticDrafts((current) => current.filter((draft) => draft.id !== candidate!.id));
    setRetainedDrafts((current) => current.filter((entry) => entry.draft.id !== candidate!.id));
    draftPersistence.current.remove(candidate.id);
    if (editDraft?.id === candidate.id) {
      setEditDraft(undefined);
      editDraftRef.current = undefined;
      setDraftState('none');
    }
    setFeedback(`Saved · ${frame.label}`);
    if (candidate.kind === 'delete') {
      requestGridSelection(selectionAfterRowRemoval(
        selection,
        afterRows,
        columns,
        candidate.index
      ));
    }
  };
  commitGridDraftRef.current = commitGridDraft;

  /**
   * Revalidates a retained invalid value and saves it as soon as it is valid.
   */
  const saveCorrectedGridDraft = async (candidate: GridEditDraft) => {
    const issues = draftIssues(candidate);
    if (issues.length) {
      retainGridDraft(candidate, 'invalid');
      setFeedback(`${issues[0]!.message} The value is retained for correction.`);
      const retained = await persistGridDraft(candidate, true);
      if (!retained) retainGridDraft(candidate, 'failed');
      return;
    }
    retainGridDraft(candidate, 'pending');
    setFeedback('Saving corrected value…');
    if (gridMode === 'live') {
      const retained = await persistGridDraft(candidate, true);
      if (!retained) {
        retainGridDraft(candidate, 'failed');
        setFeedback('The corrected value could not be retained for saving. It remains in this tab.');
        return;
      }
    }
    await commitGridDraft(candidate);
  };

  /**
   * Return the perform history result.
   */
  const performHistory = async (mode: 'undo' | 'redo') => {
    if (editDraft) {
      setFeedback('Correct the retained value before using history');
      return;
    }
    const source = mode === 'undo' ? undoStack : redoStack;
    const entry = source[source.length - 1];
    if (!entry) {
      setFeedback(`Nothing to ${mode}`);
      return;
    }
    if (entry.kind === 'presentation') {
      const target = mode === 'undo' ? entry.before : entry.after;
      setPresentation(structuredClone(target));
      if (mode === 'undo') {
        setUndoStack((current) => current.slice(0, -1));
        setRedoStack((current) => [...current, entry].slice(-100));
      } else {
        setRedoStack((current) => current.slice(0, -1));
        setUndoStack((current) => [...current, entry].slice(-100));
      }
      setFeedback(`${mode === 'undo' ? 'Undid' : 'Redid'} · ${entry.label}`);
      return;
    }
    const frame = entry.frame;
    let resultData: unknown;
    if (gridMode === 'live') {
      const result = await dispatchGridCapability({
        type: `history.${mode}`,
        commandId: nextCommandId(mode),
        fileId: file.id
      }, props.csrfToken);
      if (result.status === 'error') {
        setFeedback(`${result.error.message} Current rows were not changed.`);
        return;
      }
      resultData = result.data;
    }
    let targetRows = mode === 'undo' ? frame.beforeRows : frame.afterRows;
    let targetVersions = mode === 'undo' ? frame.beforeVersions : frame.afterVersions;
    if (gridMode === 'live') {
      const refreshed = await readLiveGridSnapshot();
      if (refreshed) {
        targetRows = refreshed.rows;
        targetVersions = refreshed.versions;
        setGridColumns(refreshed.columns);
        setSchemaVersion(refreshed.schemaVersion);
      }
    }
    const nextVersions = versionsForRows(
      applyMutationVersions(targetVersions, resultData),
      targetRows
    );
    setBaseRows(targetRows.map((row) => ({ ...row })));
    setVersions(nextVersions);
    requestGridSelection(selectionForRows(frame.selection, targetRows, columns));
    if (mode === 'undo') {
      setUndoStack((current) => current.slice(0, -1));
      setRedoStack((current) => [...current, entry].slice(-100));
    } else {
      setRedoStack((current) => current.slice(0, -1));
      setUndoStack((current) => [...current, entry].slice(-100));
    }
    setFeedback(`${mode === 'undo' ? 'Undid' : 'Redid'} · ${frame.label}`);
  };

  /**
   * Return the saved view definition result.
   */
  const savedViewDefinition = (includes: SavedViewIncludes): SavedViewDefinition => ({
    schemaVersion: 1,
    columnOrder: columns
      .filter((column) => !column.id.startsWith('draft_'))
      .map((column) => column.id),
    hiddenColumnIds: [],
    sorts: includes.filtersAndSorting ? sorts : [],
    filters: includes.filtersAndSorting ? filters : [],
    presentation: includes.cellPresentation ? structuredClone(presentation) : {},
    includes
  });

  /**
   * Create the saved view.
   */
  const createSavedView = async (input: {
    name: string,
    access: 'private' | 'shared',
    includes: SavedViewIncludes,
  }) => {
    setSavedViewBusy(true);
    setSavedViewError(undefined);
    const result = await dispatchSavedViewAction({
      type: 'saved-view.create',
      commandId: nextCommandId('view_create'),
      fileId: file.id,
      name: input.name,
      access: input.access,
      definition: savedViewDefinition(input.includes)
    }, props.csrfToken);
    setSavedViewBusy(false);
    if (result.status === 'error') {
      setSavedViewError(result.error.message);
      return;
    }
    await savedViewsRefresh.current();
    setSavedViewDialog('list');
    setFeedback(`Created ${input.access === 'shared' ? 'shared' : 'private'} view ${input.name}`);
  };

  /**
   * Update the saved view.
   */
  const updateSavedView = async (view: SavedView) => {
    setSavedViewBusy(true);
    setSavedViewError(undefined);
    const result = await dispatchSavedViewAction({
      type: 'saved-view.update',
      commandId: nextCommandId('view_update'),
      viewId: view.id,
      expectedVersion: view.version,
      name: view.name,
      access: view.access,
      definition: savedViewDefinition(view.definition.includes)
    }, props.csrfToken);
    setSavedViewBusy(false);
    if (result.status === 'error') {
      setSavedViewError(result.error.message);
      return;
    }
    await savedViewsRefresh.current();
    setFeedback(`Updated saved view ${view.name}`);
  };

  /**
   * Return the duplicate saved view result.
   */
  const duplicateSavedView = async (view: SavedView) => {
    setSavedViewBusy(true);
    setSavedViewError(undefined);
    const result = await dispatchSavedViewAction({
      type: 'saved-view.duplicate',
      commandId: nextCommandId('view_duplicate'),
      viewId: view.id,
      name: `Copy of ${view.name}`.slice(0, 120),
      access: 'private'
    }, props.csrfToken);
    setSavedViewBusy(false);
    if (result.status === 'error') {
      setSavedViewError(result.error.message);
      return;
    }
    await savedViewsRefresh.current();
    setFeedback(`Duplicated ${view.name} as a private view`);
  };

  /**
   * Delete the saved view.
   */
  const deleteSavedView = async (view: SavedView) => {
    setSavedViewBusy(true);
    setSavedViewError(undefined);
    const result = await dispatchSavedViewAction({
      type: 'saved-view.delete',
      commandId: nextCommandId('view_delete'),
      viewId: view.id,
      expectedVersion: view.version
    }, props.csrfToken);
    setSavedViewBusy(false);
    if (result.status === 'error') {
      setSavedViewError(result.error.message);
      return;
    }
    await savedViewsRefresh.current();
    if (activeSavedView?.id === view.id) setActiveSavedView(undefined);
    setFeedback(`Deleted saved view ${view.name}`);
  };

  /**
   * Move the shared row.
   */
  const moveSharedRow = async (move: {
    rowId: string,
    beforeRowId?: string,
    afterRowId?: string,
  }) => {
    if (editDraft) {
      setFeedback('Correct the retained value before moving a row');
      return;
    }
    if (sorts.length) {
      setFeedback('Clear the explicit sort before changing shared row order');
      await realtimeRefresh.current();
      return;
    }
    if (!savedViewCapabilities.canMoveRows || !rowOrderVersion) {
      setFeedback(savedViewCapabilities.rowOrderReason || 'Shared row order is unavailable');
      await realtimeRefresh.current();
      return;
    }
    const before = baseRows;
    setBaseRows(reorderRows(baseRows, move));
    setFeedback('Saving shared row order…');
    const result = await dispatchSavedViewAction({
      type: 'row-order.move',
      commandId: nextCommandId('row_move'),
      fileId: file.id,
      rowId: move.rowId,
      ...(move.beforeRowId ? { beforeRowId: move.beforeRowId } : {}),
      ...(move.afterRowId ? { afterRowId: move.afterRowId } : {}),
      expectedVersion: rowOrderVersion
    }, props.csrfToken);
    if (result.status === 'error') {
      setBaseRows(before);
      setFeedback(result.error.message);
      await realtimeRefresh.current();
      return;
    }
    const data = result.data as { version?: unknown, };
    if (typeof data.version === 'number') setRowOrderVersion(data.version);
    setFeedback('Shared row order saved');
    await realtimeRefresh.current();
  };

  /**
   * Move the columns.
   */
  const moveColumns = (columnIds: string[]) => {
    const reordered = reorderColumns(columns, columnIds);
    const namedIds = columnIds.filter((columnId) => !columnId.startsWith('draft_'));
    allGridColumns.current = reorderColumns(allGridColumns.current, namedIds);
    setBlankColumnInsertions((current) => (
      reconcileBlankColumnInsertions(columnIds, current)
    ));
    setGridColumns(spreadsheetColumns(reordered.filter((column) => !column.id.startsWith('draft_'))));
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(`tabular.column-order.${file.id}`, JSON.stringify(namedIds));
    }
    setFeedback(activeSavedView?.definition.includes.columnLayout
      ? 'Column order changed · update this saved view to share it'
      : 'Column order saved for this browser session');
  };

  /**
   * Handle the grid gesture.
   */
  const handleGridGesture = (gesture: GridGesture) => {
    if (gesture.type === 'context-menu') {
      const relation = gesture.target === 'cell'
        && columns.find((column) => column.id === gesture.columnId)?.kind === 'relation';
      restoreContextFocus.current = true;
      setContextMenu({
        target: relation ? 'relation' : gesture.target,
        x: gesture.x,
        y: gesture.y,
        trigger: gesture.trigger
      });
      return;
    }
    if (gesture.type === 'cancel-draft') {
      void cancelGridDraft();
      return;
    }
    if (gesture.type === 'undo' || gesture.type === 'redo') {
      void performHistory(gesture.type);
      return;
    }
    if (gesture.type === 'copy') {
      copySelectionValue();
      return;
    }
    if (gesture.type === 'paste-request') {
      const state = commandState('edit.paste', commandContext);
      if (!state.enabled) {
        setFeedback(state.reason || 'The selected cells cannot be pasted');
        return;
      }
      pasteSelectionValue();
      return;
    }
    if (gesture.type === 'row-move') {
      void moveSharedRow(gesture);
      return;
    }

    //Backspace and Delete operate on retained insert values too. A row whose
    // last raw value is cleared is discarded; a partially filled invalid row
    // keeps its other raw values and row-number validation summary.
    if (
      gesture.type === 'clear'
      && selection
      && selection.kind !== 'header-row'
      && selection.kind !== 'header'
      && selection.kind !== 'column'
    ) {
      const retainedSelection = selection.kind === 'row' && columns.length
        ? {
          kind: 'range' as const,
          anchor: { rowId: selection.rowId, columnId: columns[0]!.id },
          focus: { rowId: selection.rowId, columnId: columns.at(-1)!.id }
        }
        : selection;
      const selectedPoints = pointsForSelection(retainedSelection, rows, columns);
      const retainedInsertDrafts = retainedDrafts.flatMap((entry) => {
        const draft = entry.draft;
        if (draft.kind !== 'insert') return [];
        if (!selectedPoints.some((point) => point.rowId === draft.row.id)) return [];
        return [{ ...entry, draft }];
      });
      if (retainedInsertDrafts.length) {
        for (const entry of retainedInsertDrafts) {
          const corrected = clearInsertDraftSelection(
            entry.draft,
            columns,
            selectedPoints
          );
          if (insertDraftIsEmpty(corrected, columns)) {
            void cancelGridDraft(
              'Cleared the empty row and removed its retained errors',
              corrected
            );
          } else {
            void saveCorrectedGridDraft(corrected);
          }
        }
        return;
      }
    }
    if (editDraft) {
      setFeedback('Correct the retained value first');
      return;
    }
    try {
      const draft = stageScalarRange(
        rows,
        columns,
        selection,
        gesture.type === 'clear' ? null : gesture.value,
        gesture.type,
        nextCommandId(gesture.type)
      );
      stageGridDraft(draft);
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'The range action is unavailable');
    }
  };

  /**
   * Open the column settings.
   */
  const openColumnSettings = (columnId?: string, trigger?: HTMLElement) => {
    if (trigger) columnSettingsTrigger.current = trigger;
    setColumnSettingsId(columnId?.startsWith('draft_') ? undefined : columnId);
    setColumnSettingsOpen(true);
  };

  /**
   * Return the selected row id result.
   */
  const selectedRowId = () => {
    if (!selection) return undefined;
    if (selection.kind === 'row') return selection.rowId;
    if (selection.kind === 'cell' || selection.kind === 'range') return selection.focus.rowId;
    return undefined;
  };

  /**
   * Return the selected column id result.
   */
  const selectedColumnId = () => {
    if (!selection) return undefined;
    if (selection.kind === 'header' || selection.kind === 'column') {
      return selection.columnId;
    }
    if (selection.kind === 'cell' || selection.kind === 'range') return selection.focus.columnId;
    return undefined;
  };

  /**
   * Insert the row.
   */
  const insertRow = (placement: 'above' | 'below' = 'below') => {
    if (editDraft) {
      setFeedback('Correct the retained value first');
      return;
    }
    try {
      const selectedIndex = rows.findIndex((row) => row.id === selectedRowId());
      if (selectedIndex < 0) throw new Error('Select a spreadsheet row first');
      const insertAt = selectedIndex + (placement === 'below' ? 1 : 0);
      const actualColumns = columns.filter((column) => !column.id.startsWith('draft_'));
      const staged = stageInsertRow(
        baseRows,
        actualColumns,
        insertAt,
        nextCommandId('insert'),
        rankForInsertedRow(rows, visibleRowRanks, insertAt)
      );
      if (staged.kind !== 'insert') throw new Error('The new row draft is unavailable');
      setPendingInsertDrafts((current) => [...current, staged]);
      const firstEditable = actualColumns.find((column) => (
        column.editable !== false && !column.generated
      ));
      if (firstEditable) {
        requestGridSelection({
          kind: 'cell',
          anchor: { rowId: staged.row.id, columnId: firstEditable.id },
          focus: { rowId: staged.row.id, columnId: firstEditable.id }
        });
      }
      setFeedback(`Inserted a blank row ${placement}; type a value to begin validation`);
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'A row could not be inserted');
    }
  };

  /**
   * Return the request delete row result.
   */
  const requestDeleteRow = (trigger?: HTMLElement) => {
    const rowId = selectedRowId();
    if (!rowId || rowId.startsWith('draft_row_')) {
      setFeedback('Select a committed row before deleting');
      return;
    }
    if (trigger) deleteTrigger.current = trigger;
    setDeleteCandidate(rowId);
  };

  /**
   * Return the confirm delete row result.
   */
  const confirmDeleteRow = () => {
    if (!deleteCandidate) return;
    try {
      const draft = stageDeleteRow(baseRows, columns, deleteCandidate, nextCommandId('delete'));
      setDeleteCandidate(undefined);
      void commitGridDraft(draft);
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'The row could not be deleted');
    }
  };

  /**
   * Copy the selection value.
   */
  const copySelectionValue = () => {
    if (!selection) return;
    if (selection.kind === 'header-row') {
      const labels = columns.map((column) => column.label).join('\t');
      workbenchClipboard.current = labels;
      void navigator.clipboard?.writeText(labels).catch(() => undefined);
      setFeedback(`Copied ${columns.length} headers`);
      return;
    }
    if (selection.kind === 'header') {
      const label = columns.find((column) => column.id === selection.columnId)?.label || '';
      workbenchClipboard.current = label;
      void navigator.clipboard?.writeText(label).catch(() => undefined);
      setFeedback('Copied header');
      return;
    }
    const points = presentationPoints(selection, rows, columns);
    const rowOrder = new Map(rows.map((row, index) => [row.id, index]));
    const columnOrder = new Map(columns.map((column, index) => [column.id, index]));
    const selectedRows = [...new Set(points.map((point) => point.rowId))]
      .sort((a, b) => (rowOrder.get(a) || 0) - (rowOrder.get(b) || 0));
    const selectedColumns = [...new Set(points.map((point) => point.columnId))]
      .sort((a, b) => (columnOrder.get(a) || 0) - (columnOrder.get(b) || 0));
    workbenchClipboard.current = selectedRows.map((rowId) => {
      const row = rows.find((candidate) => candidate.id === rowId);
      return selectedColumns.map((columnId) => {
        const value = row?.[columnId];
        return value === null || typeof value === 'undefined' ? '' : String(value);
      }).join('\t');
    }).join('\n');
    void navigator.clipboard?.writeText(workbenchClipboard.current).catch(() => undefined);
    setFeedback(`Copied ${points.length} ${points.length === 1 ? 'cell' : 'cells'}`);
  };

  /**
   * Return the paste selection value result.
   */
  const pasteSelectionValue = () => {
    void (async () => {
      let value = workbenchClipboard.current;
      try { value = await navigator.clipboard?.readText() || value; } catch { /* use internal copy */ }
      handleGridGesture({ type: 'paste', value });
    })();
  };

  /**
   * Return the commit rename result.
   */
  const commitRename = async () => {
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    const sourceFolder = props.snapshot.folders.find((item) => item.id === file.folderId) || folder;
    const result = await dispatchExplorerAction({
      type: 'file.rename.display',
      commandId: nextCommandId('rename'),
      folder: props.route.scenario === 'denied'
        ? { ...folder, permissions: { ...folder.permissions, renameFile: false } }
        : folder,
      sourceFolder: props.route.scenario === 'denied'
        ? { ...sourceFolder, permissions: { ...sourceFolder.permissions, renameFile: false } }
        : sourceFolder,
      file,
      displayName: renameDraft
    }, { fail: props.route.scenario === 'error', csrfToken: props.csrfToken });
    if (!result.ok) {
      setRenameError(result.message);
      setFeedback(result.message);
      requestAnimationFrame(() => fileTitleInput.current?.focus());
      return;
    }
    if (!result.plan) {
      setRenameError('The PostgreSQL rename plan was not returned. No change was saved.');
      requestAnimationFrame(() => fileTitleInput.current?.focus());
      return;
    }
    setRenameError(undefined);
    setRenaming(false);
    setFeedback(`Renaming the PostgreSQL table to ${result.file.physicalName}…`);
    const message = await applyPlannedFileChange(result.plan, folder.slug);
    if (message) {
      setRenameError(message);
      setFeedback(message);
      setRenaming(true);
      requestAnimationFrame(() => fileTitleInput.current?.focus());
    }
  };

  /**
   * Apply the settings.
   */
  const applySettings = async (draft: TableSettingsDraft) => {
    const targetFolder = props.snapshot.folders.find((item) => item.id === draft.folderId) || folder;
    const sourceFolder = props.snapshot.folders.find((item) => item.id === file.folderId) || folder;
    const result = await dispatchExplorerAction({
      type: 'file.settings.apply',
      commandId: nextCommandId('settings'),
      folder: props.route.scenario === 'denied'
        ? { ...targetFolder, permissions: { ...targetFolder.permissions, configureFile: false } }
        : targetFolder,
      sourceFolder: props.route.scenario === 'denied'
        ? { ...sourceFolder, permissions: { ...sourceFolder.permissions, configureFile: false } }
        : sourceFolder,
      file,
      displayName: draft.displayName,
      physicalName: draft.physicalName,
      physicalNameOverridden: draft.physicalNameOverridden
    }, { fail: props.route.scenario === 'error', csrfToken: props.csrfToken });
    if (!result.ok) {
      setSettingsError(result.message);
      setFeedback(result.message);
      return;
    }
    if (!result.plan) {
      setSettingsError('The PostgreSQL rename plan was not returned. No change was saved.');
      return;
    }
    setSettingsError(undefined);
    setSettingsOpen(false);
    setFeedback(`Renaming the PostgreSQL table to ${result.file.physicalName}…`);
    const message = await applyPlannedFileChange(result.plan, sourceFolder.slug);
    if (message) {
      setSettingsError(message);
      setSettingsOpen(true);
      setFeedback(message);
    }
  };

  /**
   * Return the plan blank file result.
   */
  const planBlankFile = async (trigger: HTMLElement) => {
    createFileTrigger.current = trigger;
    setCreateError(undefined);
    setCreateDialogOpen(true);
  };

  /**
   * Create the blank file.
   */
  const createBlankFile = async (displayName: string) => {
    setCreateBusy(true);
    setCreateError(undefined);
    setFeedback('Creating the PostgreSQL table…');
    const result = await dispatchExplorerAction({
      type: 'file.create.blank',
      commandId: nextCommandId('file_create'),
      folder,
      displayName
    }, { csrfToken: props.csrfToken });
    if (!result.ok) {
      setCreateBusy(false);
      setCreateError(result.message);
      setFeedback(result.message);
      return;
    }
    if (!result.plan) {
      const message = 'The PostgreSQL creation plan was not returned. No file was created.';
      setCreateBusy(false);
      setCreateError(message);
      setFeedback(message);
      return;
    }
    const message = await applyPlannedFileChange(result.plan, folder.slug);
    if (message) {
      setCreateBusy(false);
      setCreateError(message);
      setFeedback(message);
    }
  };

  /**
   * Apply the planned file change.
   */
  const applyPlannedFileChange = async (plan: PlannedFileDdl, folderSlug: string) => {
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

  /**
   * Apply the planned grid change.
   */
  const applyPlannedGridChange = async (plan: PlannedFileDdl) => {
    const confirmation = await confirmGridDdl(
      plan.requestId,
      plan.confirmationToken,
      props.csrfToken
    );
    if (confirmation.status === 'error') return confirmation.error.message;
    const applied = await waitForExplorerDdl(plan.requestId);
    if (applied.status === 'applied') return undefined;
    return applied.status === 'error'
      ? applied.error.message
      : 'The PostgreSQL change is still pending. Check System activity and try again.';
  };

  /**
   * Return the initialize legacy blank file result.
   */
  const initializeLegacyBlankFile = async () => {
    if (initializingBlankFile || !file.id.startsWith('obj_')) return;
    setInitializingBlankFile(true);
    setFeedback('Initializing this older blank spreadsheet…');
    const planned = await planGridDdl({
      type: 'hidden.install',
      commandId: nextCommandId('row_id'),
      fileId: file.id,
      purpose: 'row-id'
    }, props.csrfToken);
    if (planned.status === 'error') {
      setInitializingBlankFile(false);
      setFeedback(planned.error.message);
      return;
    }
    const message = await applyPlannedGridChange(planned.data);
    if (message) {
      setInitializingBlankFile(false);
      setFeedback(message);
      return;
    }
    window.location.reload();
  };

  /**
   * Create the named column.
   */
  const createNamedColumn = async (columnId: string, displayName: string) => {
    const name = displayName.trim();
    if (!columnId.startsWith('draft_') || !name || creatingColumnId) return;
    const blankInsertion = blankColumnInsertions.find((insertion) => (
      insertion.id === columnId
    ));
    const existingColumnIds = new Set(allGridColumns.current.map((column) => column.id));
    setCreatingColumnId(columnId);
    setFeedback(`Creating PostgreSQL column ${normalizePhysicalName(name)}…`);
    const planned = await planGridDdl({
      type: 'column.create',
      commandId: nextCommandId('column_create'),
      fileId: file.id,
      displayName: name,
      storageType: 'text',
      field: 'text',
      format: 'plain-text'
    }, props.csrfToken);
    if (planned.status === 'error') {
      setCreatingColumnId(undefined);
      setFeedback(planned.error.message);
      return;
    }
    const message = await applyPlannedGridChange(planned.data);
    if (message) {
      setCreatingColumnId(undefined);
      setFeedback(message);
      return;
    }
    if (blankInsertion) {
      pendingColumnInsertion.current = {
        anchorColumnId: blankInsertion.anchorColumnId,
        knownColumnIds: [...existingColumnIds],
        placement: blankInsertion.placement,
        confirmed: true,
        sourceDraftId: blankInsertion.id
      };
    }
    const refreshed = await readLiveGridSnapshot();
    if (!refreshed) {
      setCreatingColumnId(undefined);
      setFeedback('The column was created. Reload the spreadsheet to use it.');
      return;
    }
    setBaseRows(refreshed.rows);
    setGridColumns(refreshed.columns);
    setVersions(refreshed.versions);
    setSchemaVersion(refreshed.schemaVersion);
    setStreamCursor(refreshed.cursor);
    setCreatingColumnId(undefined);
    setFeedback(`Created Text column ${name}. Double-click any blank cell to enter a value.`);
    return refreshed.columns.find((column) => (
      !column.id.startsWith('draft_') && !existingColumnIds.has(column.id)
    ));
  };

  /**
   * Creates unnamed metadata columns backed by Tabular's hidden JSON field.
   */
  const createUnnamedCellColumn = async (
    point: { rowId: string, columnId: string, },
    value: GridCellValue
  ) => {
    if (value === null || String(value).trim() === '') {
      setFeedback('No value change to save');
      return;
    }
    const placeholder = columns.find((column) => column.id === point.columnId);
    if (!placeholder?.id.startsWith('draft_')) return;
    const blankInsertion = blankColumnInsertions.find((insertion) => (
      insertion.id === placeholder.id
    ));
    const logicalColumnIndex = columns.findIndex((column) => column.id === placeholder.id);
    const actualColumnCount = columns.filter((column) => !column.id.startsWith('draft_')).length;
    const missingColumnCount = blankInsertion
      ? 1
      : logicalColumnIndex - actualColumnCount + 1;
    if (missingColumnCount < 1) return;
    setCreatingColumnId(placeholder.id);
    setFeedback(`Preparing unnamed column ${placeholder.coordinate}…`);
    let description = await loadFileDescription(file.id);
    if (!description.ok) {
      setCreatingColumnId(undefined);
      setFeedback(description.message);
      return;
    }
    for (const purpose of ['unstructured-json', 'shared-rank'] as const) {
      const ready = purpose === 'unstructured-json'
        ? description.data.hiddenSupport?.unstructuredJson
        : description.data.hiddenSupport?.sharedRank;
      if (ready) continue;
      const planned = await planGridDdl({
        type: 'hidden.install',
        commandId: nextCommandId(purpose === 'unstructured-json' ? 'json' : 'rank'),
        fileId: file.id,
        purpose
      }, props.csrfToken);
      if (planned.status === 'error') {
        setCreatingColumnId(undefined);
        setFeedback(planned.error.message);
        return;
      }
      const message = await applyPlannedGridChange(planned.data);
      if (message) {
        setCreatingColumnId(undefined);
        setFeedback(message);
        return;
      }
      description = await loadFileDescription(file.id);
      if (!description.ok) {
        setCreatingColumnId(undefined);
        setFeedback(description.message);
        return;
      }
    }
    if (blankInsertion) {
      pendingColumnInsertion.current = {
        anchorColumnId: blankInsertion.anchorColumnId,
        knownColumnIds: allGridColumns.current.map((column) => column.id),
        placement: blankInsertion.placement,
        confirmed: true,
        sourceDraftId: blankInsertion.id
      };
    }
    const created = await createUnstructuredGridColumn(
      file.id,
      missingColumnCount,
      props.csrfToken
    );
    if (created.status === 'error') {
      if (blankInsertion) pendingColumnInsertion.current = undefined;
      setCreatingColumnId(undefined);
      setFeedback(created.error.message);
      return;
    }
    const target = created.data.at(-1);
    if (!target) {
      if (blankInsertion) pendingColumnInsertion.current = undefined;
      setCreatingColumnId(undefined);
      setFeedback('The unnamed spreadsheet column could not be retained');
      return;
    }
    const refreshed = await readLiveGridSnapshot();
    if (!refreshed) {
      setCreatingColumnId(undefined);
      setFeedback('The unnamed column was retained. Reload the spreadsheet to continue.');
      return;
    }
    setBaseRows(refreshed.rows);
    setGridColumns(refreshed.columns);
    setVersions(refreshed.versions);
    setRowRanks(refreshed.rowRanks);
    setSchemaVersion(refreshed.schemaVersion);
    setStreamCursor(refreshed.cursor);
    setCreatingColumnId(undefined);
    setPendingUnnamedCell({
      columnId: target.id,
      rowId: point.rowId,
      value
    });
    setFeedback(`Retained unnamed column ${placeholder.coordinate}; saving the value…`);
  };

  useEffect(() => {
    if (!pendingUnnamedCell) return;
    const actualColumns = columns.filter((column) => !column.id.startsWith('draft_'));
    if (!actualColumns.some((column) => column.id === pendingUnnamedCell.columnId)) return;
    setPendingUnnamedCell(undefined);
    try {
      if (isPlaceholderRow(pendingUnnamedCell.rowId)) {
        const inserted = stageInsertRow(
          baseRows,
          actualColumns,
          baseRows.length,
          nextCommandId('insert'),
          hiddenRowRank(logicalRowNumber(pendingUnnamedCell.rowId, rows))
        );
        if (inserted.kind !== 'insert') throw new Error('The new row draft is unavailable');
        stageGridDraft(updateInsertDraft(inserted, actualColumns, {
          rowId: inserted.row.id,
          columnId: pendingUnnamedCell.columnId
        }, pendingUnnamedCell.value));
        requestGridSelection({
          kind: 'cell',
          anchor: { rowId: inserted.row.id, columnId: pendingUnnamedCell.columnId },
          focus: { rowId: inserted.row.id, columnId: pendingUnnamedCell.columnId }
        });
        return;
      }
      stageGridDraft(stageCellEdit(
        rows,
        actualColumns,
        {
          rowId: pendingUnnamedCell.rowId,
          columnId: pendingUnnamedCell.columnId
        },
        pendingUnnamedCell.value,
        nextCommandId('edit')
      ));
    } catch (caught) {
      setFeedback(caught instanceof Error
        ? caught.message
        : 'The value could not be saved under the new column');
    }
  }, [pendingUnnamedCell, columns, baseRows]);

  /**
   * Return the selection for band action result.
   */
  const selectionForBandAction = () => {
    if (!selection || !rows.length || !columns.length) return selection;
    if (selection.kind === 'row') return {
      kind: 'range' as const,
      anchor: { rowId: selection.rowId, columnId: columns[0]!.id },
      focus: { rowId: selection.rowId, columnId: columns.at(-1)!.id }
    };
    if (selection.kind === 'column') return {
      kind: 'range' as const,
      anchor: { rowId: rows[0]!.id, columnId: selection.columnId },
      focus: { rowId: rows.at(-1)!.id, columnId: selection.columnId }
    };
    return selection;
  };

  /**
   * Clear the band selection.
   */
  const clearBandSelection = () => {
    if (editDraft) { setFeedback('Correct the retained value first'); return; }
    try {
      stageGridDraft(stageScalarRange(
        rows,
        columns,
        selectionForBandAction(),
        null,
        'clear',
        nextCommandId('clear')
      ));
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'The selection cannot be cleared');
    }
  };

  /**
   * Apply the formatting.
   */
  const applyFormatting = (id: CommandId) => {
    if (!formattingPoints.length) return;
    const before = structuredClone(presentation);
    const current = {
      bold: toolbarPresentation.bold === true,
      italic: toolbarPresentation.italic === true,
      underline: toolbarPresentation.underline === true
    };
    const after = id === 'format.clear'
      ? clearPresentation(before, formattingPoints)
      : applyPresentationPatch(before, formattingPoints, presentationPatchForCommand(id, current) || {});
    if (JSON.stringify(before) === JSON.stringify(after)) {
      setFeedback('The selected presentation already uses that setting');
      return;
    }
    const label = commandFeedbackLabel(id);
    setPresentation(after);
    setUndoStack((history) => [...history, { kind: 'presentation' as const, label, before, after }].slice(-100));
    setRedoStack([]);
    const target = selection?.kind === 'header-row' || selection?.kind === 'header'
      ? formattingPoints.length === 1 ? 'header' : 'headers'
      : formattingPoints.length === 1 ? 'cell' : 'cells';
    setFeedback(`${label} applied to ${formattingPoints.length} ${target} · current tab`);
  };

  /**
   * Return the state for command result.
   */
  const stateForCommand = (id: CommandId, base: CommandState): CommandState => {
    if (!base.enabled) return base;
    const states: Partial<Record<CommandId, unknown>> = {
      'format.bold': toolbarPresentation.bold,
      'format.italic': toolbarPresentation.italic,
      'format.underline': toolbarPresentation.underline,
      'format.font.arial': toolbarPresentation.fontFamily === 'mixed' ? 'mixed' : toolbarPresentation.fontFamily === 'Arial',
      'format.font.georgia': toolbarPresentation.fontFamily === 'mixed' ? 'mixed' : toolbarPresentation.fontFamily === 'Georgia',
      'format.font.mono': toolbarPresentation.fontFamily === 'mixed' ? 'mixed' : toolbarPresentation.fontFamily === 'Courier New',
      'format.align.left': toolbarPresentation.horizontal === 'mixed' ? 'mixed' : toolbarPresentation.horizontal === 'left',
      'format.align.center': toolbarPresentation.horizontal === 'mixed' ? 'mixed' : toolbarPresentation.horizontal === 'center',
      'format.align.right': toolbarPresentation.horizontal === 'mixed' ? 'mixed' : toolbarPresentation.horizontal === 'right',
      'format.vertical.top': toolbarPresentation.vertical === 'mixed' ? 'mixed' : toolbarPresentation.vertical === 'top',
      'format.vertical.middle': toolbarPresentation.vertical === 'mixed' ? 'mixed' : toolbarPresentation.vertical === 'middle',
      'format.vertical.bottom': toolbarPresentation.vertical === 'mixed' ? 'mixed' : toolbarPresentation.vertical === 'bottom',
      'format.wrap.wrap': toolbarPresentation.wrap === 'mixed' ? 'mixed' : toolbarPresentation.wrap === 'wrap',
      'format.wrap.clip': toolbarPresentation.wrap === 'mixed' ? 'mixed' : toolbarPresentation.wrap === 'clip',
      'format.wrap.overflow': toolbarPresentation.wrap === 'mixed' ? 'mixed' : toolbarPresentation.wrap === 'overflow',
      'format.number.auto': toolbarPresentation.numberFormat === 'mixed' ? 'mixed' : toolbarPresentation.numberFormat === 'automatic',
      'format.number.plain': toolbarPresentation.numberFormat === 'mixed' ? 'mixed' : toolbarPresentation.numberFormat === 'number',
      'format.number.currency': toolbarPresentation.numberFormat === 'mixed' ? 'mixed' : toolbarPresentation.numberFormat === 'currency',
      'format.number.percent': toolbarPresentation.numberFormat === 'mixed' ? 'mixed' : toolbarPresentation.numberFormat === 'percent',
      'view.gridlines': viewState.gridlines,
      'view.compact': viewState.compact
    };
    if (id.startsWith('format.size.')) {
      const expected = Number(id.split('.').at(-1));
      return toolbarPresentation.fontSize === 'mixed'
        ? { ...base, mixed: true }
        : { ...base, checked: toolbarPresentation.fontSize === expected };
    }
    if (id.startsWith('view.zoom.')) return { ...base, checked: id === `view.zoom.${viewState.zoom}` };
    if (id.startsWith('view.freeze.rows.')) return {
      ...base,
      checked: id === `view.freeze.rows.${viewState.frozenRows}`
    };
    if (id.startsWith('view.freeze.columns.')) return {
      ...base,
      checked: id === `view.freeze.columns.${viewState.frozenColumns}`
    };
    const value = states[id];
    return value === 'mixed' ? { ...base, mixed: true } : typeof value === 'boolean' ? { ...base, checked: value } : base;
  };

  /**
   * Handle the command.
   */
  const handleCommand = (id: CommandId, trigger: HTMLElement) => {
    if (id.startsWith('format.')) { applyFormatting(id); return; }
    if (id === 'view.list' || id === 'view.new') {
      if (contextMenu) restoreContextFocus.current = false;
      savedViewTrigger.current = contextMenu?.trigger || trigger;
      setSavedViewError(undefined);
      setSavedViewDialog(id === 'view.new' ? 'create' : 'list');
      return;
    }
    if (id === 'file.table-settings') {
      if (contextMenu) restoreContextFocus.current = false;
      settingsTrigger.current = (contextMenu?.trigger || trigger) as HTMLButtonElement;
      setSettingsError(undefined);
      setSettingsOpen(true);
      return;
    }
    if (id === 'file.new') {
      if (contextMenu) restoreContextFocus.current = false;
      void planBlankFile(contextMenu?.trigger || trigger);
      return;
    }
    if (id === 'file.open') {
      if (contextMenu) restoreContextFocus.current = false;
      window.location.assign(`/pages/browse.html?folder=${folder.slug}`);
      return;
    }
    if (id === 'file.import') {
      if (contextMenu) restoreContextFocus.current = false;
      window.location.assign(`/pages/import.html?folder=${folder.slug}`);
      return;
    }
    if (id === 'file.export') {
      if (!file.id.startsWith('obj_') || gridMode !== 'live') {
        setFeedback('CSV export requires a live PostgreSQL-backed file');
        return;
      }
      setFeedback('Authorizing the current CSV export on the server…');
      void downloadAuthorizedCsv({
        type: 'export.csv',
        fileId: file.id,
        ...(activeSavedView && !transientSort ? {
          viewId: activeSavedView.id,
          expectedViewVersion: activeSavedView.version
        } : {
          columnIds: columns.filter((column) => column.label).map((column) => column.id),
          sorts: transientSort ? [transientSort] : sorts,
          filters,
          presentation
        })
      }, props.csrfToken).then((result) => {
        if (result.status === 'error') {
          setFeedback(result.error.message);
          return;
        }
        const url = URL.createObjectURL(result.data.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = result.data.filename;
        anchor.click();
        URL.revokeObjectURL(url);
        setFeedback(`Exported ${result.data.rows.toLocaleString()} server-authorized rows as CSV`);
      });
      return;
    }
    if (id === 'history.undo' || id === 'history.redo') {
      void performHistory(id === 'history.undo' ? 'undo' : 'redo');
      return;
    }
    if (id === 'edit.copy') {
      copySelectionValue();
      return;
    }
    if (id === 'edit.cut') {
      copySelectionValue();
      handleGridGesture({ type: 'clear' });
      return;
    }
    if (id === 'edit.paste') {
      pasteSelectionValue();
      return;
    }
    if (id === 'edit.cell') {
      if (contextMenu) restoreContextFocus.current = false;
      commandSequence.current += 1;
      setCommand({ id: commandSequence.current, action: 'edit-active' });
      return;
    }
    if (id === 'edit.clear') { handleGridGesture({ type: 'clear' }); return; }
    if (id === 'row.clear' || id === 'column.clear') { clearBandSelection(); return; }
    if (id === 'row.insert-above' || id === 'row.insert-below') {
      insertRow(id === 'row.insert-above' ? 'above' : 'below');
      return;
    }
    if (id === 'row.delete') {
      if (contextMenu) restoreContextFocus.current = false;
      requestDeleteRow(contextMenu?.trigger || trigger);
      return;
    }
    if (id === 'row.move-up' || id === 'row.move-down') {
      const rowId = selectedRowId();
      if (!rowId) return;
      const move = rowMoveByDirection(
        committedRowIds,
        rowId,
        id === 'row.move-up' ? 'up' : 'down'
      );
      if (move) void moveSharedRow(move);
      return;
    }
    if (id === 'column.insert-left' || id === 'column.insert-right') {
      const columnId = selectedColumnId();
      const selectedColumn = columns.find((column) => column.id === columnId);
      if (!selectedColumn) {
        setFeedback('Select a column header first');
        return;
      }
      const insertion = {
        id: `draft_${nextCommandId('column_insert')}`,
        anchorColumnId: selectedColumn.id,
        placement: id === 'column.insert-left' ? 'left' as const : 'right' as const
      };
      if (contextMenu) restoreContextFocus.current = false;
      setBlankColumnInsertions((current) => [...current, insertion]);
      requestGridSelection({ kind: 'header', columnId: insertion.id });
      setFeedback(`Inserted a blank column to the ${insertion.placement}`);
      return;
    }
    if (id === 'column.delete') {
      const columnId = selectedColumnId();
      const columnIndex = columns.findIndex((column) => column.id === columnId);
      const selectedColumn = columns[columnIndex];
      const removable = blankColumnInsertions.some((insertion) => (
        insertion.id === columnId
      ));
      if (!columnId || !selectedColumn || !removable) {
        setFeedback('Deleting PostgreSQL columns requires the confirmed DDL workflow');
        return;
      }
      const nextColumn = columns[columnIndex + 1] || columns[columnIndex - 1];
      if (contextMenu) restoreContextFocus.current = false;
      setBlankColumnInsertions((current) => removeBlankColumnInsertion(
        columns.map((column) => column.id),
        current,
        columnId
      ));
      if (nextColumn) requestGridSelection({ kind: 'header', columnId: nextColumn.id });
      setFeedback(`Removed blank column ${selectedColumn.coordinate}`);
      return;
    }
    if (id === 'column.rename' || id === 'column.configure' || id === 'relation.configure') {
      if (contextMenu) restoreContextFocus.current = false;
      openColumnSettings(selectedColumnId(), contextMenu?.trigger || trigger);
      return;
    }
    if (id === 'column.sort-asc' || id === 'column.sort-desc') {
      const columnId = selectedColumnId();
      if (!columnId) return;
      const selectedColumn = columns.find((column) => column.id === columnId);
      if (!selectedColumn?.label.trim() || selectedColumn.id.startsWith('draft_')) {
        setFeedback('Name this column before sorting it');
        return;
      }
      const nextSort: GridSort = {
        columnId,
        direction: id === 'column.sort-asc' ? 'asc' : 'desc'
      };
      setSorts([nextSort]);
      setTransientSort(nextSort);
      setFeedback('Authorizing the current sort on the server…');
      return;
    }
    if (id === 'selection.all' && rows.length && columns.length) {
      requestGridSelection({
        kind: 'range',
        anchor: { rowId: rows[0]!.id, columnId: columns[0]!.id },
        focus: { rowId: rows.at(-1)!.id, columnId: columns.at(-1)!.id }
      });
      return;
    }
    if (id === 'find') { findTrigger.current?.focus(); setFeedback('Find is ready'); return; }
    if (id === 'view.gridlines') { setViewState((current) => ({ ...current, gridlines: !current.gridlines })); return; }
    if (id === 'view.compact') { setViewState((current) => ({ ...current, compact: !current.compact })); return; }
    if (id.startsWith('view.zoom.')) {
      setViewState((current) => ({ ...current, zoom: Number(id.split('.').at(-1)) as WorkbenchViewState['zoom'] }));
      setFeedback(`Zoom set to ${id.split('.').at(-1)}% for this tab`);
      return;
    }
    if (id.startsWith('view.freeze.rows.')) {
      setViewState((current) => ({ ...current, frozenRows: id.split('.').at(-1) as WorkbenchViewState['frozenRows'] }));
      setFeedback('Frozen-row view state updated for this tab');
      return;
    }
    if (id.startsWith('view.freeze.columns.')) {
      setViewState((current) => ({ ...current, frozenColumns: id.split('.').at(-1) as WorkbenchViewState['frozenColumns'] }));
      setFeedback('Frozen-column view state updated for this tab');
      return;
    }
    setFeedback(`${commandFeedbackLabel(id)} selected`);
  };

  useEffect(() => {
    /**
     * Handle the key down event.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, [contenteditable="true"]')) return;
      const id = shortcutCommand(event);
      if (!id) return;
      const state = stateForCommand(id, commandState(id, commandContext));
      if (!state.enabled) return;
      event.preventDefault();
      handleCommand(id, target);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div
      className="workbench-shell"
      data-gridlines={viewState.gridlines}
      data-compact={viewState.compact}
      data-zoom={viewState.zoom}
      data-frozen-rows={viewState.frozenRows}
      data-frozen-columns={viewState.frozenColumns}
      style={{ '--tabular-view-scale': viewState.zoom / 100 } as CSSProperties}
    >
      <a className="skip-link" href="#spreadsheet-canvas">Skip to spreadsheet</a>
      <header className="application-header">
        <div className="top-bar">
          <a
            className="product-mark"
            href="/pages/browse.html"
            aria-label={`${props.snapshot.connection.displayName} files`}
          >
            <span className="mark-icon"><Icon name="sheet" /></span>
            <span className="product-name">
              {props.snapshot.connection.displayName}
            </span>
          </a>
          <nav className="breadcrumb" aria-label="File location">
            <a href={`/pages/browse.html?folder=${folder.slug}`}>{folder.displayName}</a>
            <span aria-hidden="true">/</span>
            {renaming ? (
              <input
                ref={fileTitleInput}
                className="file-title-input"
                aria-label="File name"
                autoFocus
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRename.current = true;
                    setRenameDraft(file.displayName);
                    setRenameError(undefined);
                    setRenaming(false);
                    requestAnimationFrame(() => fileTitleButton.current?.focus());
                  }
                }}
              />
            ) : (
              <button ref={fileTitleButton} className="file-title-button" type="button" onClick={() => {
                cancelRename.current = false;
                setRenameDraft(file.displayName);
                setRenaming(true);
              }}>{file.displayName}</button>
            )}
            {(activeSavedView || initialSavedView) && (
              <>
                <span aria-hidden="true">/</span>
                <strong>{activeSavedView?.name || initialSavedView?.displayName}</strong>
              </>
            )}
            {renameError && <span className="file-name-error" role="alert">{renameError}</span>}
          </nav>
          <div className="header-actions">
            <span className="runtime-state" data-status={visibleDraftState !== 'none' ? visibleDraftState : gridMode === 'unavailable' ? 'unavailable' : realtimeState}>
              <span aria-hidden="true" />{visibleDraftState !== 'none'
                ? visibleDraftState === 'stale' ? 'Retained value ready to revalidate' : visibleDraftState === 'failed' ? 'Save failed · value retained' : visibleDraftState === 'invalid' ? 'Value needs attention' : 'Value waiting to save'
                : gridMode === 'loading' ? 'Loading'
                  : gridMode === 'unavailable' ? 'Setup required'
                    : gridMode === 'draft' ? 'Draft workspace'
                      : realtimeState === 'live' ? 'Saved · Live'
                        : realtimeState === 'access-lost' ? 'Access ended'
                          : realtimeState === 'refreshing' ? 'Refreshing'
                            : 'Reconnecting'}
            </span>
            <a className="header-icon-action" href="/pages/system-activity.html" aria-label="System activity" title="System activity"><Icon name="activity" /></a>
            <a
              className="header-account"
              href="/auth/account"
              aria-label={`Account: ${props.identity.displayName}`}
              title={props.identity.displayName}
            >{identityInitials(props.identity.displayName)}</a>
          </div>
        </div>
        <div className="command-bar">
          <SpreadsheetMenuBar
            context={commandContext}
            stateFor={stateForCommand}
            onCommand={handleCommand}
          />
          <button
            ref={findTrigger}
            className="search-control"
            type="button"
            onClick={(event) => handleCommand('find', event.currentTarget)}
          >
            <Icon name="search" />
            <span>Find in file</span>
            <kbd>⌘F</kbd>
          </button>
        </div>
        <FormattingToolbar
          context={commandContext}
          presentation={toolbarPresentation}
          stateFor={stateForCommand}
          onCommand={handleCommand}
        />
      </header>
      <main id="spreadsheet-canvas" className="spreadsheet-canvas" tabIndex={-1}>
        {gridMode === 'loading' ? (
          <section className="grid-load-state" aria-live="polite">
            <Icon name="grid" /><h2>Loading live rows…</h2><p>Resolving stable keys and current PostgreSQL versions.</p>
          </section>
        ) : gridMode === 'unavailable' ? (
          <section className="grid-load-state" role="status">
            <Icon name="table" /><h2>Spreadsheet setup required</h2><p>{gridUnavailable}</p>
            {file.columnCount === 0 && file.id.startsWith('obj_') && folder.permissions.configureFile
              ? <button type="button" disabled={initializingBlankFile} onClick={() => void initializeLegacyBlankFile()}>{initializingBlankFile ? 'Initializing…' : 'Initialize spreadsheet'}</button>
              : <button type="button" onClick={() => setSettingsOpen(true)}>Open table settings</button>}
          </section>
        ) : (
          <>
          {allGridColumns.current.length === 0 && (
            <div className="blank-grid-guidance" role="status">
              Name a blank header for a PostgreSQL column, or type below it to retain an unnamed value.
            </div>
          )}
          <GridCanvas
            rows={rows}
            columns={columns}
            command={command}
            draftState={visibleDraftState}
            issues={cellIssues}
            presentation={presentation}
            canMoveRows={Boolean(commandContext.canMoveRows)}
            canMoveColumns={!file.readOnly}
            onSelectionChange={setSelection}
            onFeedback={setFeedback}
            onEdit={(point, value) => {
              const editedColumn = columns.find((column) => column.id === point.columnId);
              const retainedEntry = retainedDrafts.find((entry) => (
                draftContainsRow(entry.draft, point.rowId)
              ));
              const pendingInsertDraft = pendingInsertDrafts.find((draft) => (
                draftContainsRow(draft, point.rowId)
              ));
              const currentDraft = retainedEntry?.draft
                || pendingInsertDraft
                || (editDraft && draftContainsRow(editDraft, point.rowId)
                  ? editDraft
                  : undefined);
              const savingDraft = automaticDrafts.find((draft) => (
                draftContainsRow(draft, point.rowId)
              ));
              if (editedColumn?.id.startsWith('draft_')) {
                void createUnnamedCellColumn(point, value);
                return;
              }
              if (isPlaceholderRow(point.rowId)) {
                const actualColumns = columns.filter((column) => !column.id.startsWith('draft_'));
                try {
                  const inserted = stageInsertRow(
                    baseRows,
                    actualColumns,
                    baseRows.length,
                    nextCommandId('insert'),
                    hiddenRowRank(logicalRowNumber(point.rowId, rows))
                  );
                  if (inserted.kind !== 'insert') throw new Error('The new row draft is unavailable');
                  const updated = updateInsertDraft(inserted, actualColumns, {
                    rowId: inserted.row.id,
                    columnId: point.columnId
                  }, value);
                  stageGridDraft(updated);
                  requestGridSelection({
                    kind: 'cell',
                    anchor: { rowId: inserted.row.id, columnId: point.columnId },
                    focus: { rowId: inserted.row.id, columnId: point.columnId }
                  });
                } catch (caught) {
                  setFeedback(caught instanceof Error ? caught.message : 'The new row could not enter draft state');
                }
                return;
              }
              const relationColumn = columns.find((column) => column.id === point.columnId);
              const relationOption = relationColumn?.kind === 'relation'
                ? relationColumn.options?.find((option) => option.value === String(value))
                : undefined;
              if (relationOption?.patch) {
                try {
                  if (currentDraft?.kind === 'insert') {
                    const updated = updateInsertRelationDraft(
                      currentDraft,
                      columns,
                      relationOption.patch
                    );
                    if (pendingInsertDraft) {
                      setPendingInsertDrafts((current) => current.filter((draft) => (
                        draft.id !== pendingInsertDraft.id
                      )));
                    }
                    void saveCorrectedGridDraft(updated);
                    return;
                  }
                  if (currentDraft && currentDraft.kind !== 'cells') {
                    setFeedback('Finish the retained value in this row first');
                    return;
                  }
                  const related = stageRelationChoice(
                    rows,
                    columns,
                    point.rowId,
                    relationOption.patch,
                    currentDraft?.id || nextCommandId('relation')
                  );
                  if (currentDraft) void saveCorrectedGridDraft(related);
                  else stageGridDraft(related);
                } catch (caught) {
                  setFeedback(caught instanceof Error ? caught.message : 'The relation choice is unavailable');
                }
                return;
              }
              if (currentDraft) {
                if (currentDraft.kind === 'insert') {
                  try {
                    const corrected = updateInsertDraft(currentDraft, columns, point, value);
                    if (pendingInsertDraft) {
                      if (insertDraftIsEmpty(corrected, columns)) {
                        setPendingInsertDrafts((current) => current.map((draft) => (
                          draft.id === corrected.id ? corrected : draft
                        )));
                        setFeedback('Blank row is ready; type a value to begin validation');
                        return;
                      }
                      setPendingInsertDrafts((current) => current.filter((draft) => (
                        draft.id !== pendingInsertDraft.id
                      )));
                      void saveCorrectedGridDraft(corrected);
                      return;
                    }
                    if (insertDraftIsEmpty(corrected, columns)) {
                      void cancelGridDraft(
                        'Cleared the empty row and removed its retained errors',
                        corrected
                      );
                      return;
                    }
                    void saveCorrectedGridDraft(corrected);
                  } catch (caught) {
                    setFeedback(caught instanceof Error ? caught.message : 'The new row could not be updated');
                  }
                  return;
                }
                const correctable = currentDraft.kind === 'cells'
                  && currentDraft.changes.length === 1
                  && currentDraft.changes[0]!.point.rowId === point.rowId
                  && currentDraft.changes[0]!.point.columnId === point.columnId;
                if (!correctable) {
                  setFeedback('Correct the retained value in this cell first');
                  return;
                }
                const corrected = stageCellEdit(baseRows, columns, point, value, currentDraft.id);
                void saveCorrectedGridDraft(corrected);
                return;
              }
              if (savingDraft) {
                setFeedback('This row is finishing its save; edit it again when the saved value appears');
                return;
              }
              try {
                stageGridDraft(stageCellEdit(rows, columns, point, value, nextCommandId('edit')));
              } catch (caught) {
                setFeedback(caught instanceof Error ? caught.message : 'The cell could not enter draft state');
              }
            }}
            onGesture={handleGridGesture}
            onColumnActivate={(columnId) => openColumnSettings(
              columnId,
              document.activeElement instanceof HTMLElement ? document.activeElement : undefined
            )}
            onColumnMove={moveColumns}
            onHeaderName={(columnId, name) => {
              void createNamedColumn(columnId, name);
            }}
          />
          </>
        )}
      </main>
      <footer className="status-bar">
        <div><span className="status-dot" data-status={gridMode === 'unavailable' ? 'unavailable' : realtimeState} />{gridMode === 'loading' ? 'Loading PostgreSQL' : gridMode === 'unavailable' ? 'Live sync unavailable' : gridMode === 'draft' ? 'Draft workspace' : realtimeState === 'live' ? 'Live PostgreSQL sync' : realtimeState === 'access-lost' ? 'Live access ended' : 'Live sync reconnecting'}</div>
        <output aria-live="polite" aria-atomic="true">{feedback}</output>
        <div className="status-meta"><span>{baseRows.length} records · 1,000 rows · {allGridColumns.current.length} columns</span><span>{gridMode === 'live' ? 'PostgreSQL live' : 'Draft workspace'} · Tabulator 6.5</span><span>v{props.version}</span></div>
      </footer>
      {contextMenu && (
        <CommandContextMenu
          menu={contextMenu}
          context={commandContext}
          onCommand={handleCommand}
          onClose={() => {
            const trigger = contextMenu.trigger;
            setContextMenu(undefined);
            if (restoreContextFocus.current) requestAnimationFrame(() => trigger?.focus());
            restoreContextFocus.current = true;
          }}
        />
      )}
      {settingsOpen && (
        <TableSettingsPanel
          open
          file={file}
          folder={folder}
          folders={props.snapshot.folders}
          derivePhysicalFromDisplay
          initialPhysicalNameOverridden={physicalNameOverridden}
          triggerRef={settingsTrigger}
          error={settingsError}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsError(undefined);
            requestAnimationFrame(() => settingsTrigger.current?.focus());
          }}
          onApply={applySettings}
        />
      )}
      {columnSettingsOpen && (
        <ColumnSettingsPanel
          open
          file={file}
          columns={columns}
          columnId={columnSettingsId}
          folders={props.snapshot.folders}
          csrfToken={props.csrfToken}
          triggerRef={columnSettingsTrigger}
          onClose={() => {
            setColumnSettingsOpen(false);
            requestAnimationFrame(() => columnSettingsTrigger.current?.focus());
          }}
          onConfirmed={(message) => setFeedback(message)}
        />
      )}
      {createDialogOpen && (
        <FileCreateDialog
          busy={createBusy}
          error={createError}
          triggerRef={createFileTrigger}
          onClose={() => {
            if (createBusy) return;
            setCreateDialogOpen(false);
            setCreateError(undefined);
            requestAnimationFrame(() => createFileTrigger.current?.focus());
          }}
          onCreate={(displayName) => void createBlankFile(displayName)}
        />
      )}
      {deleteCandidate && (
        <div className="confirmation-layer">
          <section ref={deleteDialog} className="destructive-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="delete-row-title">
            <span className="panel-kicker">DESTRUCTIVE ACTION</span>
            <h2 id="delete-row-title">Delete this PostgreSQL row?</h2>
            <p>The complete restorable row is captured server-side for current-session undo. Related constraints may still reject the delete.</p>
            <div>
              <button type="button" onClick={() => {
                setDeleteCandidate(undefined);
                requestAnimationFrame(() => deleteTrigger.current?.focus());
              }}>Cancel</button>
              <button className="danger-action" type="button" onClick={confirmDeleteRow}>Delete row</button>
            </div>
          </section>
        </div>
      )}
      {savedViewDialog && (
        <SavedViewsDialog
          mode={savedViewDialog}
          views={savedViews}
          capabilities={savedViewCapabilities}
          folderSlug={folder.slug}
          fileSlug={file.slug}
          busy={savedViewBusy}
          error={savedViewError}
          onModeChange={setSavedViewDialog}
          onCreate={(input) => void createSavedView(input)}
          onUpdate={(view) => void updateSavedView(view)}
          onDuplicate={(view) => void duplicateSavedView(view)}
          onDelete={(view) => void deleteSavedView(view)}
          onClose={() => {
            setSavedViewDialog(undefined);
            setSavedViewError(undefined);
            requestAnimationFrame(() => savedViewTrigger.current?.focus());
          }}
        />
      )}
    </div>
  );
}

/**
 * Return the selected column from result.
 */
function selectedColumnFrom(selection: LogicalGridSelection | null) {
  if (!selection) return undefined;
  if (selection.kind === 'header' || selection.kind === 'column') {
    return selection.columnId;
  }
  if (selection.kind === 'row' || selection.kind === 'header-row') return undefined;
  return selection.focus.columnId;
}

/**
 * Return the selected row from result.
 */
function selectedRowFrom(selection: LogicalGridSelection | null) {
  if (!selection) return undefined;
  if (selection.kind === 'row') return selection.rowId;
  if (selection.kind === 'cell' || selection.kind === 'range') return selection.focus.rowId;
  return undefined;
}

/**
 * Return the project saved view columns result.
 */
function projectSavedViewColumns(columns: GridColumn[], definition: SavedViewDefinition) {
  const hidden = new Set(definition.hiddenColumnIds);
  const byId = new Map(columns.map((column) => [column.id, column]));
  return [
    ...definition.columnOrder.flatMap((id) => {
      const column = byId.get(id);
      return column && !hidden.has(id) ? [column] : [];
    }),
    ...columns.filter((column) => (
      !hidden.has(column.id) && !definition.columnOrder.includes(column.id)
    ))
  ];
}

/**
 * Return the intersect presentation result.
 */
function intersectPresentation(
  presentation: Record<string, GridCellPresentation>,
  rows: GridRow[],
  columns: GridColumn[]
) {
  const rowIds = new Set(rows.map((row) => row.id));
  const columnIds = new Set(columns.map((column) => column.id));
  return Object.fromEntries(Object.entries(presentation).filter(([key]) => {
    try {
      const [rowId, columnId] = JSON.parse(key) as [string, string];
      return (rowId === GRID_HEADER_ROW_ID || rowIds.has(rowId))
        && columnIds.has(columnId);
    } catch {
      return false;
    }
  }));
}

/**
 * Return the reorder rows result.
 */
function reorderRows(
  rows: GridRow[],
  move: { rowId: string, beforeRowId?: string, afterRowId?: string, }
) {
  const moving = rows.find((row) => row.id === move.rowId);
  if (!moving) return rows;
  const remaining = rows.filter((row) => row.id !== move.rowId);
  const before = move.beforeRowId
    ? remaining.findIndex((row) => row.id === move.beforeRowId)
    : -1;
  const after = move.afterRowId
    ? remaining.findIndex((row) => row.id === move.afterRowId)
    : -1;
  const index = before >= 0 ? before + 1 : after;
  if (index < 0) return rows;
  const next = [...remaining];
  next.splice(index, 0, moving);
  return next;
}

/**
 * Return the row move by direction result.
 */
function rowMoveByDirection(
  order: string[],
  rowId: string,
  direction: 'up' | 'down'
) {
  const from = order.indexOf(rowId);
  const to = from + (direction === 'up' ? -1 : 1);
  if (from < 0 || to < 0 || to >= order.length) return undefined;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, rowId);
  const index = next.indexOf(rowId);
  return {
    rowId,
    ...(next[index - 1] ? { beforeRowId: next[index - 1] } : {}),
    ...(next[index + 1] ? { afterRowId: next[index + 1] } : {})
  };
}

/**
 * Return the selected row label result.
 */
function selectedRowLabel(selection: LogicalGridSelection | null, rows: readonly GridRow[]) {
  if (!selection || selection.kind === 'column') return undefined;
  if (selection.kind === 'header' || selection.kind === 'header-row') return undefined;
  const rowId = selection.kind === 'row' ? selection.rowId : selection.focus.rowId;
  const index = rows.findIndex((row) => row.id === rowId);
  return index < 0 ? undefined : String(spreadsheetRowNumber(index));
}

/**
 * Return the command feedback label result.
 */
function commandFeedbackLabel(id: CommandId) {
  const labels: Partial<Record<CommandId, string>> = {
    'format.bold': 'Bold',
    'format.italic': 'Italic',
    'format.underline': 'Underline',
    'format.font.arial': 'Arial',
    'format.font.georgia': 'Georgia',
    'format.font.mono': 'Courier New',
    'format.text.black': 'Charcoal text',
    'format.text.blue': 'Blue text',
    'format.text.red': 'Red text',
    'format.fill.reset': 'No fill',
    'format.fill.gray': 'Gray fill',
    'format.fill.blue': 'Blue fill',
    'format.fill.yellow': 'Yellow fill',
    'format.clear': 'Clear formatting'
  };
  if (labels[id]) return labels[id]!;
  if (id.startsWith('format.size.')) return `${id.split('.').at(-1)} point text`;
  return id.split('.').at(-1)!.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

/**
 * Return the initial workbench file result.
 */
function initialWorkbenchFile(props: WorkbenchPageProps, folderId: string): ExplorerFile {
  const folder = props.snapshot.folders.find((item) => item.id === folderId)!;
  const current = folder.files.find((item) => item.slug === props.route.table);
  if (current && !props.route.newFile) return current;
  if (!props.route.newFile) {
    throw new Error('The requested PostgreSQL file is unavailable');
  }
  const displayName = 'Untitled File';
  return {
    id: `draft_${props.route.table}`,
    folderId,
    slug: props.route.table,
    displayName,
    physicalName: normalizePhysicalName(displayName),
    kind: 'table',
    readOnly: false,
    columnCount: 0,
    recordCount: 0
  };
}

/**
 * Creates a compact account mark from the verified server-side display name.
 */
function identityInitials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toLocaleUpperCase()).join('') || '?';
}

/**
 * Return the versions for rows result.
 */
function versionsForRows(versions: Record<string, string>, rows: GridRow[]) {
  const ids = new Set(rows.map((row) => row.id));
  return Object.fromEntries(Object.entries(versions).filter(([rowId]) => ids.has(rowId)));
}

/**
 * Return the selection after row removal result.
 */
function selectionAfterRowRemoval(
  selection: LogicalGridSelection | null,
  rows: GridRow[],
  columns: GridColumn[],
  removedIndex: number
): LogicalGridSelection | null {
  if (!rows.length || !columns.length) return null;
  const columnId = selection && (selection.kind === 'cell' || selection.kind === 'range')
    ? selection.focus.columnId
    : columns[0]!.id;
  const point = {
    rowId: rows[Math.min(Math.max(removedIndex, 0), rows.length - 1)]!.id,
    columnId: columns.some((column) => column.id === columnId) ? columnId : columns[0]!.id
  };
  return { kind: 'cell', anchor: point, focus: point };
}

/**
 * Return the selection for rows result.
 */
function selectionForRows(
  selection: LogicalGridSelection | null,
  rows: GridRow[],
  columns: GridColumn[]
) {
  if (!selection) return selectionAfterRowRemoval(null, rows, columns, 0);
  const rowIds = new Set(rows.map((row) => row.id));
  const columnIds = new Set(columns.map((column) => column.id));
  if (selection.kind === 'row') return rowIds.has(selection.rowId)
    ? selection
    : selectionAfterRowRemoval(selection, rows, columns, 0);
  if (selection.kind === 'header-row') return columnIds.size
    ? selection
    : selectionAfterRowRemoval(selection, rows, columns, 0);
  if (selection.kind === 'header') return columnIds.has(selection.columnId)
    ? selection
    : selectionAfterRowRemoval(selection, rows, columns, 0);
  if (selection.kind === 'column') return columnIds.has(selection.columnId)
    ? selection
    : selectionAfterRowRemoval(selection, rows, columns, 0);
  return rowIds.has(selection.focus.rowId) && rowIds.has(selection.anchor.rowId)
    && columnIds.has(selection.focus.columnId) && columnIds.has(selection.anchor.columnId)
    ? selection
    : selectionAfterRowRemoval(selection, rows, columns, 0);
}

/**
 * Return the action issue message result.
 */
function actionIssueMessage(error: { issues?: unknown[], }, columns: readonly GridColumn[]) {
  const issue = error.issues?.find((candidate) =>
    candidate && typeof candidate === 'object' && typeof (candidate as { message?: unknown, }).message === 'string'
  ) as { columnId?: string, code?: string, message?: string, } | undefined;
  if (!issue) return undefined;
  if (issue.code === 'schema_changed') {
    return 'The table structure changed while this row was being edited. Retry Commit to revalidate the retained values';
  }
  if (issue.code === 'empty_row') return 'Enter a value in at least one column before saving the row';
  const column = issue.columnId
    ? columns.find((candidate) => candidate.id === issue.columnId)
    : undefined;
  return `${column?.label ? `${column.label}: ` : ''}${issue.message}`;
}

/**
 * Return the enrich grid columns result.
 */
function enrichGridColumns(
  columns: GridColumn[],
  description: FileDescription,
  folders: TablePageProps['snapshot']['folders']
) {
  const primaryOrUnique = description.constraints.filter((constraint) =>
    constraint.kind === 'p' || constraint.kind === 'u'
  );
  return columns.map((column) => {
    const metadata = description.columns.find((candidate) => candidate.id === column.id);
    if (!metadata) return column;
    const relation = description.constraints.find((constraint) =>
      constraint.kind === 'f' && constraint.columnIds.includes(column.id)
    );
    const target = relation?.targetFileId
      ? folders.flatMap((folder) => folder.files).find((file) => file.id === relation.targetFileId)
      : undefined;
    return {
      ...column,
      label: metadata.displayName,
      kind: gridKindForField(metadata.field, metadata.storageType),
      field: metadata.field,
      format: metadata.format,
      physicalName: metadata.physicalName,
      required: !metadata.nullable,
      unique: primaryOrUnique.some((constraint) =>
        constraint.columnIds.length === 1 && constraint.columnIds[0] === column.id
      ),
      generated: Boolean(metadata.generatedExpression || metadata.identity),
      editable: column.editable !== false && !metadata.readOnly,
      serverDefault: metadata.defaultExpression !== null,
      options: optionsFromConfig(metadata.fieldConfig),
      ...(relation && target ? {
        relation: {
          sourceColumnIds: relation.columnIds,
          targetFileId: target.id,
          targetLabel: target.displayName,
          targetColumnIds: relation.targetColumnIds || [],
          pickerTemplate: String(metadata.fieldConfig.pickerTemplate || '{{label}} — {{key}}'),
          outputTemplate: String(metadata.formatConfig.outputTemplate || '{{label}}')
        },
        options: relation.columnIds[0] === column.id ? [] : undefined,
        editable: relation.columnIds[0] === column.id
          ? column.editable !== false && !metadata.readOnly
          : false
      } : {})
    } satisfies GridColumn;
  });
}

/**
 * Hydrate the relation options.
 */
async function hydrateRelationOptions(fileId: string, columns: GridColumn[], rows: GridRow[]) {
  const next = columns.map((column) => ({ ...column }));
  for (const column of next) {
    if (column.kind !== 'relation' || column.relation?.sourceColumnIds[0] !== column.id) continue;
    const lookup = await loadRelationOptions(fileId, column.id);
    if (!lookup.ok) continue;
    column.options = lookup.data.options;
    const unresolved = new Map<string, GridCellValue[]>();
    for (const row of rows) {
      if (column.options.some((option) => relationOptionMatchesRow(option, row))) continue;
      const tuple = column.relation.sourceColumnIds.map((columnId) => row[columnId] ?? null);
      if (tuple.some((value) => value === null)) continue;
      unresolved.set(JSON.stringify(tuple), tuple);
    }
    const tuples = [...unresolved.values()];
    for (let index = 0; index < tuples.length; index += 50) {
      const resolved = await loadRelationOptions(
        fileId,
        column.id,
        '',
        tuples.slice(index, index + 50)
      );
      if (resolved.ok) column.options = mergeRelationOptions(column.options, resolved.data.options);
    }
    column.optionLookup = async (query) => {
      const searched = await loadRelationOptions(fileId, column.id, query);
      if (!searched.ok) return [];
      column.options = mergeRelationOptions(column.options || [], searched.data.options);
      return searched.data.options;
    };
  }
  return next;
}

/**
 * Return the relation option matches row result.
 */
function relationOptionMatchesRow(
  option: NonNullable<GridColumn['options']>[number],
  row: GridRow
) {
  return Boolean(option.patch) && Object.entries(option.patch!).every(([columnId, value]) => (
    row[columnId] === value
  ));
}

/**
 * Merge the relation options.
 */
function mergeRelationOptions(
  current: NonNullable<GridColumn['options']>,
  incoming: NonNullable<GridColumn['options']>
) {
  return [...new Map([...current, ...incoming].map((option) => [option.value, option])).values()];
}

/**
 * Return the grid kind for field result.
 */
function gridKindForField(field: string, storageType: string): GridColumn['kind'] {
  if (field === 'relation') return 'relation';
  if (['select', 'radio', 'suggest'].includes(field)) return 'select';
  if (field === 'switch') return 'switch';
  if (field === 'email') return 'email';
  if (field === 'url') return 'url';
  if (field === 'phone') return 'phone';
  if (field === 'price') return 'price';
  if (field === 'date-time' || storageType === 'timestamptz' || storageType.startsWith('timestamp')) return 'datetime';
  if (field === 'checkbox' || storageType === 'boolean') return 'boolean';
  if (field === 'date' || storageType === 'date') return 'date';
  if (field === 'number' || /^(?:smallint|integer|bigint|numeric)/.test(storageType)) return 'number';
  if (storageType === 'jsonb' || storageType === 'json') return 'json';
  return 'text';
}

/**
 * Return the options from config result.
 */
function optionsFromConfig(config: Record<string, unknown>) {
  if (!Array.isArray(config.options)) return undefined;
  return config.options.flatMap((option) => {
    if (typeof option === 'string') return [{ value: option, label: option }];
    if (!option || typeof option !== 'object') return [];
    const record = option as Record<string, unknown>;
    if (typeof record.value !== 'string') return [];
    return [{
      value: record.value,
      label: typeof record.label === 'string' ? record.label : record.value,
      ...(typeof record.restricted === 'string' ? { restricted: record.restricted } : {})
    }];
  });
}

/**
 * Return the spreadsheet columns result.
 */
function spreadsheetColumns(columns: GridColumn[]) {
  const padded = columns.length >= BLANK_COLUMNS.length
    ? columns
    : [...columns, ...BLANK_COLUMNS.slice(columns.length)];
  return padded.map((column, index) => ({
    ...column,
    coordinate: spreadsheetCoordinate(index)
  }));
}

/**
 * Return the reorder columns result.
 */
function reorderColumns(columns: GridColumn[], columnIds: readonly string[]) {
  const byId = new Map(columns.map((column) => [column.id, column]));
  return [
    ...columnIds.flatMap((columnId) => {
      const column = byId.get(columnId);
      return column ? [column] : [];
    }),
    ...columns.filter((column) => !columnIds.includes(column.id))
  ];
}

/**
 * Return the remap presentation history result.
 */
function remapPresentationHistory(
  history: WorkbenchHistoryFrame[],
  fromRowId: string,
  toRowId?: string
) {
  return history.map((entry) => entry.kind === 'presentation'
    ? {
      ...entry,
      before: remapPresentationRow(entry.before, fromRowId, toRowId),
      after: remapPresentationRow(entry.after, fromRowId, toRowId)
    }
    : entry);
}

/**
 * Restore the column order.
 */
function restoreColumnOrder(columns: GridColumn[], fileId: string) {
  if (typeof sessionStorage === 'undefined') return columns;
  try {
    const decoded = JSON.parse(sessionStorage.getItem(`tabular.column-order.${fileId}`) || '[]');
    return Array.isArray(decoded) && decoded.every((columnId) => typeof columnId === 'string')
      ? reorderColumns(columns, decoded)
      : columns;
  } catch {
    return columns;
  }
}

/**
 * Return the spreadsheet coordinate result.
 */
function spreadsheetCoordinate(index: number) {
  let coordinate = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    coordinate = String.fromCharCode(65 + ((value - 1) % 26)) + coordinate;
  }
  return coordinate;
}

/**
 * Return the logical row number result.
 */
function logicalRowNumber(rowId: string, rows: GridRow[]) {
  const placeholder = /^placeholder_row_(\d+)$/.exec(rowId);
  if (placeholder) return Number(placeholder[1]);
  const index = rows.findIndex((row) => row.id === rowId);
  if (index < 0) throw new Error('The spreadsheet row is unavailable');
  return index + 1;
}

/**
 * Report whether the placeholder row condition holds.
 */
function isPlaceholderRow(rowId: string) {
  return rowId.startsWith('placeholder_row_');
}

/**
 * Reports whether a draft owns the displayed row being edited or discarded.
 */
function draftContainsRow(draft: GridEditDraft, rowId: string) {
  if (draft.kind === 'insert' || draft.kind === 'delete') return draft.row.id === rowId;
  return draft.changes.some((change) => change.point.rowId === rowId);
}

/**
 * Selects the most actionable aggregate state without merging draft identity.
 */
function strongestDraftState(states: RetainedGridDraft['state'][]): DraftState {
  const precedence: RetainedGridDraft['state'][] = [
    'failed',
    'stale',
    'invalid',
    'pending'
  ];
  return precedence.find((state) => states.includes(state)) || 'none';
}
