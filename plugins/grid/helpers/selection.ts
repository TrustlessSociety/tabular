import type {
  GridPoint,
  GridSelectionCoverage,
  LogicalGridSelection
} from './contracts.js';

export type SelectionListener = (selection: LogicalGridSelection | null) => void;

function samePoint(left: GridPoint, right: GridPoint) {
  return left.rowId === right.rowId && left.columnId === right.columnId;
}

function between(value: number, left: number, right: number) {
  return value >= Math.min(left, right) && value <= Math.max(left, right);
}

export function selectionLabel(selection: LogicalGridSelection | null) {
  if (!selection) return 'No selection';
  if (selection.kind === 'row') return `Row ${selection.rowId}`;
  if (selection.kind === 'header') return `Header ${selection.columnId}`;
  if (selection.kind === 'column') return `Column ${selection.columnId}`;
  const start = `${selection.anchor.columnId}:${selection.anchor.rowId}`;
  const end = `${selection.focus.columnId}:${selection.focus.rowId}`;
  return selection.kind === 'cell' || samePoint(selection.anchor, selection.focus)
    ? start
    : `${start} to ${end}`;
}

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
  if (selection.kind === 'header') return empty;
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

export class LogicalSelectionStore {
  #selection: LogicalGridSelection | null = null;
  readonly #listeners = new Set<SelectionListener>();

  constructor(initial?: LogicalGridSelection) {
    if (initial) this.#selection = structuredClone(initial);
  }

  get() {
    return this.#selection ? structuredClone(this.#selection) : null;
  }

  set(selection: LogicalGridSelection) {
    this.#selection = structuredClone(selection);
    this.#emit();
    return this.get();
  }

  selectCell(point: GridPoint, extend = false) {
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

  selectRow(rowId: string) {
    return this.set({ kind: 'row', rowId });
  }

  selectColumn(columnId: string) {
    return this.set({ kind: 'column', columnId });
  }

  selectHeader(columnId: string) {
    return this.set({ kind: 'header', columnId });
  }

  clear() {
    if (!this.#selection) return;
    this.#selection = null;
    this.#emit();
  }

  reconcile(rowIds: ReadonlySet<string>, columnIds: ReadonlySet<string>) {
    const selection = this.#selection;
    if (!selection) return null;
    const validPoint = (point: GridPoint) => (
      rowIds.has(point.rowId) && columnIds.has(point.columnId)
    );
    const valid = selection.kind === 'row'
      ? rowIds.has(selection.rowId)
      : selection.kind === 'column' || selection.kind === 'header'
        ? columnIds.has(selection.columnId)
        : validPoint(selection.anchor) && validPoint(selection.focus);
    if (!valid) this.clear();
    return this.get();
  }

  subscribe(listener: SelectionListener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit() {
    const snapshot = this.get();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
