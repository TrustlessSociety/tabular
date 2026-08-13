//client
import type {
  GridPoint,
  GridSelectionCoverage,
  LogicalGridSelection
} from './contracts.js';

//The selection listener contract exported for module callers
export type SelectionListener = (selection: LogicalGridSelection | null) => void;

/**
 * Converts a zero-based visible row index into its spreadsheet row number.
 */
export function spreadsheetRowNumber(index: number) {
  return index + 1;
}

/**
 * Report the same point condition.
 */
function samePoint(left: GridPoint, right: GridPoint) {
  return left.rowId === right.rowId && left.columnId === right.columnId;
}

/**
 * Return the between result.
 */
function between(value: number, left: number, right: number) {
  return value >= Math.min(left, right) && value <= Math.max(left, right);
}

/**
 * Return the selection label result.
 */
export function selectionLabel(selection: LogicalGridSelection | null) {
  if (!selection) return 'No selection';
  if (selection.kind === 'row') return `Row ${selection.rowId}`;
  if (selection.kind === 'header-row') return 'Header row';
  if (selection.kind === 'header') return `Header ${selection.columnId}`;
  if (selection.kind === 'column') return `Column ${selection.columnId}`;
  const start = `${selection.anchor.columnId}:${selection.anchor.rowId}`;
  const end = `${selection.focus.columnId}:${selection.focus.rowId}`;
  return selection.kind === 'cell' || samePoint(selection.anchor, selection.focus)
    ? start
    : `${start} to ${end}`;
}

/**
 * Return the coverage for result.
 */
export function coverageFor(
  selection: LogicalGridSelection | null,
  point: GridPoint,
  rowOrder: readonly string[],
  columnOrder: readonly string[]
): GridSelectionCoverage {
  return coverageForIndexMaps(
    selection,
    point,
    new Map(rowOrder.map((id, index) => [id, index])),
    new Map(columnOrder.map((id, index) => [id, index]))
  );
}

/**
 * Return the coverage for index maps result.
 */
export function coverageForIndexMaps(
  selection: LogicalGridSelection | null,
  point: GridPoint,
  rowIndexes: ReadonlyMap<string, number>,
  columnIndexes: ReadonlyMap<string, number>
): GridSelectionCoverage {
  const empty: GridSelectionCoverage = {
    activeCell: false,
    activeRow: false,
    activeColumn: false,
    inRange: false
  };
  if (!selection) return empty;
  if (selection.kind === 'row') {
    return { ...empty, activeRow: point.rowId === selection.rowId };
  }
  if (selection.kind === 'header' || selection.kind === 'header-row') return empty;
  if (selection.kind === 'column') {
    return { ...empty, activeColumn: point.columnId === selection.columnId };
  }
  const activeCell = samePoint(point, selection.focus);
  if (selection.kind === 'cell') {
    return {
      activeCell,
      activeRow: point.rowId === selection.focus.rowId,
      activeColumn: point.columnId === selection.focus.columnId,
      inRange: activeCell
    };
  }
  const row = rowIndexes.get(point.rowId) ?? -1;
  const column = columnIndexes.get(point.columnId) ?? -1;
  const anchorRow = rowIndexes.get(selection.anchor.rowId) ?? -1;
  const focusRow = rowIndexes.get(selection.focus.rowId) ?? -1;
  const anchorColumn = columnIndexes.get(selection.anchor.columnId) ?? -1;
  const focusColumn = columnIndexes.get(selection.focus.columnId) ?? -1;
  const inRange = [row, column, anchorRow, focusRow, anchorColumn, focusColumn]
    .every((index) => index >= 0)
    && between(row, anchorRow, focusRow)
    && between(column, anchorColumn, focusColumn);
  return {
    activeCell,
    activeRow: point.rowId === selection.focus.rowId,
    activeColumn: point.columnId === selection.focus.columnId,
    inRange
  };
}

/**
 * Provide the logical selection store behavior used by this module.
 */
export class LogicalSelectionStore {
  //The selection state retained by this class instance
  #selection: LogicalGridSelection | null = null;
  //The listeners state retained by this class instance
  readonly #listeners = new Set<SelectionListener>();

  /**
   * Create a LogicalSelectionStore instance.
   */
  public constructor(initial?: LogicalGridSelection) {
    if (initial) this.#selection = structuredClone(initial);
  }

  /**
   * Return a defensive copy of the current logical selection.
   */
  public get() {
    return this.#selection ? structuredClone(this.#selection) : null;
  }

  /**
   * Set the current value.
   */
  public set(selection: LogicalGridSelection) {
    this.#selection = structuredClone(selection);
    this.#emit();
    return this.get();
  }

  /**
   * Select the cell.
   */
  public selectCell(point: GridPoint, extend = false) {
    if (
      extend
      && this.#selection
      && (this.#selection.kind === 'cell' || this.#selection.kind === 'range')
    ) {
      const anchor = this.#selection.anchor;
      return this.set(samePoint(anchor, point)
        ? { kind: 'cell', anchor, focus: point }
        : { kind: 'range', anchor, focus: point });
    }
    return this.set({ kind: 'cell', anchor: point, focus: point });
  }

  /**
   * Select the row.
   */
  public selectRow(rowId: string) {
    return this.set({ kind: 'row', rowId });
  }

  /**
   * Select the column.
   */
  public selectColumn(columnId: string) {
    return this.set({ kind: 'column', columnId });
  }

  /**
   * Select the header.
   */
  public selectHeader(columnId: string) {
    return this.set({ kind: 'header', columnId });
  }

  /**
   * Select the header row.
   */
  public selectHeaderRow() {
    return this.set({ kind: 'header-row' });
  }

  /**
   * Clear the current value.
   */
  public clear() {
    if (!this.#selection) return;
    this.#selection = null;
    this.#emit();
  }

  /**
   * Reconcile the current value.
   */
  public reconcile(rowIds: ReadonlySet<string>, columnIds: ReadonlySet<string>) {
    const selection = this.#selection;
    if (!selection) return null;
    /**
     * Report the valid point condition.
     */
    const validPoint = (point: GridPoint) => (
      rowIds.has(point.rowId) && columnIds.has(point.columnId)
    );
    const valid = selection.kind === 'row'
      ? rowIds.has(selection.rowId)
      : selection.kind === 'header-row'
        ? columnIds.size > 0
        : selection.kind === 'column' || selection.kind === 'header'
        ? columnIds.has(selection.columnId)
        : validPoint(selection.anchor) && validPoint(selection.focus);
    if (!valid) this.clear();
    return this.get();
  }

  /**
   * Handle the subscribe operation.
   */
  public subscribe(listener: SelectionListener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Handle the internal emit operation.
   */
  #emit() {
    const snapshot = this.get();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
