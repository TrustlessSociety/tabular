//modules
import { useEffect, useId, useRef, useState } from 'react';

//client
import type {
  GridColumn,
  GridCellPresentation,
  GridCellIssue,
  GridRow,
  LogicalGridSelection
} from '../helpers/contracts.js';
import { selectionLabel, spreadsheetRowNumber } from '../helpers/selection.js';
import { TabulatorGridAdapter } from '../helpers/tabulator-adapter.js';

//The grid command contract exported for module callers
export type GridCommand = {
  id: number,
  action: 'select' | 'edit-active',
  selection?: LogicalGridSelection,
};

//The grid canvas props contract exported for module callers
export type GridCanvasProps = {
  rows: GridRow[],
  columns: GridColumn[],
  command?: GridCommand,
  onSelectionChange?: (selection: LogicalGridSelection | null) => void,
  onFeedback?: (message: string) => void,
  onEdit?: (
    point: { rowId: string, columnId: string, },
    value: GridRow[string],
    previous: GridRow[string]
  ) => void,
  onGesture?: (gesture: GridGesture) => void,
  onColumnActivate?: (columnId: string) => void,
  onColumnMove?: (columnIds: string[]) => void,
  onHeaderName?: (columnId: string, name: string) => void,
  issues?: GridCellIssue[],
  draftState?: 'none' | 'pending' | 'invalid' | 'failed' | 'stale',
  presentation?: Record<string, GridCellPresentation>,
  canMoveRows?: boolean,
  canMoveColumns?: boolean,
};

//The grid gesture contract exported for module callers
export type GridGesture =
  | { type: 'clear', }
  | { type: 'copy', }
  | { type: 'paste-request', }
  | { type: 'paste', value: string, }
  | { type: 'fill', value: GridRow[string], }
  | { type: 'undo', }
  | { type: 'redo', }
  | { type: 'cancel-draft', }
  | { type: 'row-move', rowId: string, beforeRowId?: string, afterRowId?: string, }
  | {
    type: 'context-menu',
    target: 'cell' | 'row' | 'header-row' | 'column',
    x: number,
    y: number,
    trigger: HTMLElement,
    rowId?: string,
    columnId?: string,
  };

/**
 * Formats logical selections with the coordinates shown to spreadsheet users.
 */
export function displaySelection(
  selection: LogicalGridSelection | null,
  columns: GridColumn[],
  rows: GridRow[]
) {
  if (!selection) return 'No selection';
  /**
   * Return the row coordinate result.
   */
  const rowCoordinate = (rowId: string) => {
    const index = rows.findIndex((candidate) => candidate.id === rowId);
    return index < 0 ? rowId : String(spreadsheetRowNumber(index));
  };
  if (selection.kind === 'row') return `Row ${rowCoordinate(selection.rowId)}`;
  if (selection.kind === 'header-row') return 'Headers';
  if (selection.kind === 'header') {
    const column = columns.find((candidate) => candidate.id === selection.columnId);
    return `Header ${column?.coordinate || selection.columnId}`;
  }
  if (selection.kind === 'column') {
    const column = columns.find((candidate) => candidate.id === selection.columnId);
    return `${column?.coordinate || selection.columnId}:${column?.coordinate || selection.columnId}`;
  }
  /**
   * Return the coordinate result.
   */
  const coordinate = (columnId: string) => (
    columns.find((candidate) => candidate.id === columnId)?.coordinate || columnId
  );
  const start = `${coordinate(selection.anchor.columnId)}${rowCoordinate(selection.anchor.rowId)}`;
  const end = `${coordinate(selection.focus.columnId)}${rowCoordinate(selection.focus.rowId)}`;
  return selection.kind === 'cell' || start === end ? start : `${start}:${end}`;
}

/**
 * Report the valid selection condition.
 */
function validSelection(
  selection: LogicalGridSelection | null,
  columns: GridColumn[],
  rows: GridRow[]
) {
  if (!selection) return false;
  const rowIds = new Set(rows.map((row) => row.id));
  const columnIds = new Set(columns.map((column) => column.id));
  if (selection.kind === 'row') return rowIds.has(selection.rowId);
  if (selection.kind === 'header-row') return columnIds.size > 0;
  if (selection.kind === 'header') return columnIds.has(selection.columnId);
  if (selection.kind === 'column') return columnIds.has(selection.columnId);
  return rowIds.has(selection.anchor.rowId)
    && rowIds.has(selection.focus.rowId)
    && columnIds.has(selection.anchor.columnId)
    && columnIds.has(selection.focus.columnId);
}

/**
 * Render the grid canvas component.
 */
export function GridCanvas({
  rows,
  columns,
  command,
  onSelectionChange,
  onFeedback,
  onEdit,
  onGesture,
  onColumnActivate,
  onColumnMove,
  onHeaderName,
  issues = [],
  draftState = 'none',
  presentation = {},
  canMoveRows = false,
  canMoveColumns = false
}: GridCanvasProps) {
  const instructionsId = useId();
  const host = useRef<HTMLDivElement>(null);
  const adapter = useRef<TabulatorGridAdapter | undefined>(undefined);
  const instanceReady = useRef(false);
  const latestRows = useRef(rows);
  const mountedRows = useRef(rows);
  const latestColumns = useRef(columns);
  const latestPresentation = useRef(presentation);
  const canMoveRowsRef = useRef(canMoveRows);
  const canMoveColumnsRef = useRef(canMoveColumns);
  const retainedSelection = useRef<LogicalGridSelection | null>(null);
  const mountedColumns = useRef(columns);
  const selectionCallback = useRef(onSelectionChange);
  const feedbackCallback = useRef(onFeedback);
  const editCallback = useRef(onEdit);
  const gestureCallback = useRef(onGesture);
  const columnCallback = useRef(onColumnActivate);
  const columnMoveCallback = useRef(onColumnMove);
  const headerNameCallback = useRef(onHeaderName);
  const [selection, setSelection] = useState<LogicalGridSelection | null>(null);
  const [ready, setReady] = useState(false);
  const [viewportRows, setViewportRows] = useState(0);

  latestRows.current = rows;
  latestColumns.current = columns;
  latestPresentation.current = presentation;
  canMoveRowsRef.current = canMoveRows;
  canMoveColumnsRef.current = canMoveColumns;
  selectionCallback.current = onSelectionChange;
  feedbackCallback.current = onFeedback;
  editCallback.current = onEdit;
  gestureCallback.current = onGesture;
  columnCallback.current = onColumnActivate;
  columnMoveCallback.current = onColumnMove;
  headerNameCallback.current = onHeaderName;

  useEffect(() => {
    if (!host.current) return;
    instanceReady.current = false;
    setReady(false);
    const instance = new TabulatorGridAdapter();
    adapter.current = instance;
    const disposers = [
      instance.on('ready', () => {
        if (adapter.current !== instance) return;
        instanceReady.current = true;
        instance.setIssues(issues);
        setReady(true);
      }),
      instance.on('selection', ({ selection: next }) => {
        setSelection(next);
        selectionCallback.current?.(next);
      }),
      instance.on('viewport', ({ renderedRows }) => setViewportRows(renderedRows)),
      instance.on('edit', ({ point, value, previous }) => editCallback.current?.(point, value, previous)),
      instance.on('columnActivate', ({ columnId }) => columnCallback.current?.(columnId)),
      instance.on('columnMove', ({ columnIds }) => {
        if (canMoveColumnsRef.current) {
          columnMoveCallback.current?.(columnIds);
          return;
        }
        instance.replaceColumns(latestColumns.current);
        feedbackCallback.current?.('Column order is unavailable in this file');
      }),
      instance.on('headerName', ({ columnId, name }) => headerNameCallback.current?.(columnId, name)),
      instance.on('rowMove', (move) => {
        if (canMoveRowsRef.current) {
          gestureCallback.current?.({ type: 'row-move', ...move });
          return;
        }
        void instance.replaceRows(latestRows.current);
        feedbackCallback.current?.('Shared row order is unavailable in the current view');
      }),
      instance.on('error', ({ error }) => feedbackCallback.current?.(`Grid error: ${error.message}`))
    ];
    const currentRows = latestRows.current;
    const currentColumns = latestColumns.current;
    mountedRows.current = currentRows;
    mountedColumns.current = currentColumns;
    const initialRowId = currentRows.some((row) => row.id === '4')
      ? '4'
      : currentRows[0]?.id;
    const initialColumnId = currentColumns.some((column) => column.id === 'status')
      ? 'status'
      : currentColumns[0]?.id;
    const defaultSelection: LogicalGridSelection = {
      kind: 'cell',
      anchor: { rowId: initialRowId || '', columnId: initialColumnId || '' },
      focus: { rowId: initialRowId || '', columnId: initialColumnId || '' }
    };
    const initialSelection = validSelection(retainedSelection.current, currentColumns, currentRows)
      ? retainedSelection.current!
      : defaultSelection;
    void instance.mount(host.current, {
      rows: currentRows,
      columns: currentColumns,
      height: '100%',
      initialSelection: initialRowId && initialColumnId ? initialSelection : undefined,
      presentation: latestPresentation.current,
      canMoveRows,
      canMoveColumns
    }).catch((error) => {
      feedbackCallback.current?.(`Grid error: ${error instanceof Error ? error.message : String(error)}`);
    });
    /**
     * Handle the key down event.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, [contenteditable="true"]')) {
        if (event.key === 'Enter' || event.key === 'Escape') {
          requestAnimationFrame(() => {
            if (!target.isConnected) instance.focusActive();
          });
        }
        return;
      }
      const current = instance.selection();
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (!canMoveRowsRef.current || !current) return;
        const rowId = current.kind === 'row'
          ? current.rowId
          : current.kind === 'cell' || current.kind === 'range'
            ? current.focus.rowId
            : undefined;
        if (!rowId) return;
        const order = latestRows.current.map((row) => row.id);
        const from = order.indexOf(rowId);
        const to = from + (event.key === 'ArrowUp' ? -1 : 1);
        if (from < 0 || to < 0 || to >= order.length) return;
        event.preventDefault();
        order.splice(from, 1);
        order.splice(to, 0, rowId);
        const index = order.indexOf(rowId);
        gestureCallback.current?.({
          type: 'row-move',
          rowId,
          ...(order[index - 1] ? { beforeRowId: order[index - 1] } : {}),
          ...(order[index + 1] ? { afterRowId: order[index + 1] } : {})
        });
        return;
      }
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        if (!instance.editActive()) feedbackCallback.current?.('This cell is read-only');
        return;
      }
      if (
        event.key.length === 1
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && event.key !== ' '
      ) {
        event.preventDefault();
        if (!instance.editActive(event.key)) feedbackCallback.current?.('This cell is read-only');
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        gestureCallback.current?.({ type: 'clear' });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        gestureCallback.current?.({ type: 'copy' });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        gestureCallback.current?.({ type: 'paste-request' });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        if (
          !current
          || current.kind === 'row'
          || current.kind === 'header-row'
          || current.kind === 'header'
          || current.kind === 'column'
        ) return;
        const value = latestRows.current.find((row) => row.id === current.anchor.rowId)?.[
          current.anchor.columnId
        ] ?? null;
        gestureCallback.current?.({ type: 'fill', value });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        gestureCallback.current?.({ type: event.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        gestureCallback.current?.({ type: 'redo' });
        return;
      }
      if (event.key === 'Escape') {
        gestureCallback.current?.({ type: 'cancel-draft' });
        return;
      }
      if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
        if (!current) return;
        event.preventDefault();
        const trigger = target;
        const rectangle = trigger.getBoundingClientRect();
        gestureCallback.current?.({
          type: 'context-menu',
          target: current.kind === 'row'
            ? 'row'
            : current.kind === 'header-row'
              ? 'header-row'
            : current.kind === 'header' || current.kind === 'column'
              ? 'column'
              : 'cell',
          x: rectangle.left + Math.min(24, rectangle.width / 2),
          y: rectangle.top + Math.min(24, rectangle.height / 2),
          trigger,
          rowId: current.kind === 'row' ? current.rowId : current.kind === 'cell' || current.kind === 'range' ? current.focus.rowId : undefined,
          columnId: current.kind === 'header' || current.kind === 'column'
            ? current.columnId
            : current.kind === 'cell' || current.kind === 'range'
              ? current.focus.columnId
              : undefined
        });
        return;
      }
      if (event.key === ' ' && event.shiftKey && current && (current.kind === 'cell' || current.kind === 'range')) {
        event.preventDefault();
        instance.select({ kind: 'row', rowId: current.focus.rowId });
        return;
      }
      if (event.key === ' ' && (event.ctrlKey || event.metaKey) && current && (current.kind === 'cell' || current.kind === 'range')) {
        event.preventDefault();
        instance.select({ kind: 'column', columnId: current.focus.columnId });
        return;
      }
      const directions = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        Tab: event.shiftKey ? 'previous' : 'next'
      } as const;
      const direction = directions[event.key as keyof typeof directions];
      if (!direction) return;
      const extend = event.key.startsWith('Arrow') && event.shiftKey;
      if (instance.navigate(direction, extend)) event.preventDefault();
    };
    /**
     * Handle the click event.
     */
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const rowHeader = (event.target as HTMLElement).closest<HTMLElement>(
        '.tabulator-header .tabulator-row-header'
      );
      if (!rowHeader) return;
      instance.select({ kind: 'header-row' });
      rowHeader.focus({ preventScroll: true });
    };
    /**
     * Handle the context menu event.
     */
    const onContextMenu = (event: MouseEvent) => {
      const element = event.target as HTMLElement;
      const rowHeader = element.closest<HTMLElement>(
        '.tabulator-header .tabulator-row-header'
      );
      const header = element.closest<HTMLElement>('.tabulator-col[tabulator-field]');
      const cell = element.closest<HTMLElement>('.tabulator-cell');
      if (rowHeader) {
        event.preventDefault();
        instance.select({ kind: 'header-row' });
        gestureCallback.current?.({
          type: 'context-menu',
          target: 'header-row',
          x: event.clientX,
          y: event.clientY,
          trigger: rowHeader
        });
        return;
      }
      if (header) {
        const columnId = header.getAttribute('tabulator-field');
        if (!columnId) return;
        event.preventDefault();
        instance.select({ kind: 'column', columnId });
        gestureCallback.current?.({ type: 'context-menu', target: 'column', x: event.clientX, y: event.clientY, trigger: header, columnId });
        return;
      }
      if (!cell) return;
      const rowId = cell.closest<HTMLElement>('.tabulator-row')?.dataset.tabularRowId;
      if (!rowId) return;
      event.preventDefault();
      if (cell.classList.contains('tabulator-row-header')) {
        instance.select({ kind: 'row', rowId });
        gestureCallback.current?.({ type: 'context-menu', target: 'row', x: event.clientX, y: event.clientY, trigger: cell, rowId });
        return;
      }
      const columnId = cell.getAttribute('tabulator-field');
      if (!columnId) return;
      instance.select({ kind: 'cell', anchor: { rowId, columnId }, focus: { rowId, columnId } });
      gestureCallback.current?.({ type: 'context-menu', target: 'cell', x: event.clientX, y: event.clientY, trigger: cell, rowId, columnId });
    };
    host.current.addEventListener('keydown', onKeyDown, true);
    host.current.addEventListener('click', onClick);
    host.current.addEventListener('contextmenu', onContextMenu);
    return () => {
      instanceReady.current = false;
      retainedSelection.current = instance.selection();
      host.current?.removeEventListener('keydown', onKeyDown, true);
      host.current?.removeEventListener('click', onClick);
      host.current?.removeEventListener('contextmenu', onContextMenu);
      disposers.forEach((dispose) => dispose());
      instance.destroy();
      adapter.current = undefined;
    };
  }, [canMoveRows, canMoveColumns]);

  useEffect(() => {
    if (!ready || !instanceReady.current) return;
    requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (!activeElement || activeElement === document.body) adapter.current?.focusActive();
    });
  }, [ready]);

  useEffect(() => {
    const instance = adapter.current;
    if (!instance || !instanceReady.current || !ready || mountedRows.current === rows) return;
    mountedRows.current = rows;
    void instance.replaceRows(rows).catch((error) => {
      feedbackCallback.current?.(`Grid error: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [rows, ready]);

  useEffect(() => {
    const instance = adapter.current;
    if (!instance || !instanceReady.current || !ready || mountedColumns.current === columns) return;
    mountedColumns.current = columns;
    instance.replaceColumns(columns);
  }, [columns, ready]);

  useEffect(() => {
    if (ready && instanceReady.current) adapter.current?.setIssues(issues);
  }, [issues, ready]);

  useEffect(() => {
    if (ready && instanceReady.current) adapter.current?.setPresentation(presentation);
  }, [presentation, ready]);

  useEffect(() => {
    const instance = adapter.current;
    if (!instance || !instanceReady.current || !command || !ready) return;
    if (command.action === 'select' && command.selection) {
      instance.select(command.selection);
    } else if (command.action === 'edit-active') {
      if (!instance.editActive()) feedbackCallback.current?.('This cell is read-only');
    }
  }, [command, ready]);

  const label = displaySelection(selection, columns, rows);
  return (
    <section
      className="grid-stage"
      aria-label="Orders spreadsheet"
      aria-describedby={instructionsId}
      data-grid-ready={ready ? 'true' : 'false'}
      data-selection={selectionLabel(selection)}
      data-draft-state={draftState}
      data-can-move-rows={canMoveRows ? 'true' : 'false'}
      data-can-move-columns={canMoveColumns ? 'true' : 'false'}
    >
      <p id={instructionsId} className="sr-only">
        Use arrow keys to move the active cell, Shift plus arrow keys or Shift plus click to select a range,
        Shift plus Space to select a row, Control or Command plus Space to select a column, or activate a
        row number, the blank header corner, or a column heading. Press Enter, F2, or a printable key to edit.
        Backspace or Delete clears the selected cells. Drag a column heading to reorder columns. Double-click
        a cell to edit.
      </p>
      <div className="formula-strip" aria-label="Selection and formula bar">
        <output className="name-box" aria-label="Current selection">{label}</output>
        <span className="formula-function" aria-hidden="true">fx</span>
        <output className="formula-value" aria-label="Cell value">
          {selection?.kind === 'header-row'
            ? 'All headers'
            : selection?.kind === 'header'
            ? columns.find((column) => column.id === selection.columnId)?.label || ''
            : selection && selection.kind !== 'row' && selection.kind !== 'column'
              ? String(rows.find((row) => row.id === selection.focus.rowId)?.[selection.focus.columnId] ?? '')
              : 'Select a cell'}
        </output>
        <span className="virtualization-note" aria-label={`${viewportRows} rows rendered in the virtual viewport`}>
          {viewportRows || '—'} rendered
        </span>
      </div>
      <div className="grid-viewport" data-testid="grid-viewport">
        <div ref={host} className="tabular-grid-host" />
      </div>
    </section>
  );
}
