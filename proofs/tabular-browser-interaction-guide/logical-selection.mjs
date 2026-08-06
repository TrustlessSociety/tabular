function requireIdentity(list, value, label) {
  if (!list.includes(value)) throw new Error(`unknown-${label}:${value}`);
}

export class LogicalSelectionModel {
  constructor(rowIds, columnIds) {
    this.setOrder(rowIds, columnIds);
    this.selection = null;
  }

  setOrder(rowIds, columnIds) {
    this.rowIds = [...rowIds];
    this.columnIds = [...columnIds];
    if (new Set(this.rowIds).size !== this.rowIds.length) throw new Error('duplicate-row-identity');
    if (new Set(this.columnIds).size !== this.columnIds.length) throw new Error('duplicate-column-identity');
    if (this.selection) this.#validate(this.selection.anchor, this.selection.focus);
  }

  selectCell(rowId, columnId) {
    return this.selectRange(rowId, columnId, rowId, columnId, 'cell');
  }

  selectRange(anchorRowId, anchorColumnId, focusRowId, focusColumnId, kind = 'range') {
    const anchor = { rowId: anchorRowId, columnId: anchorColumnId };
    const focus = { rowId: focusRowId, columnId: focusColumnId };
    this.#validate(anchor, focus);
    this.selection = { kind, anchor, focus };
    return this.snapshot();
  }

  selectRow(rowId) {
    requireIdentity(this.rowIds, rowId, 'row');
    return this.selectRange(
      rowId,
      this.columnIds[0],
      rowId,
      this.columnIds.at(-1),
      'row'
    );
  }

  selectColumn(columnId) {
    requireIdentity(this.columnIds, columnId, 'column');
    return this.selectRange(
      this.rowIds[0],
      columnId,
      this.rowIds.at(-1),
      columnId,
      'column'
    );
  }

  extendTo(rowId, columnId) {
    if (!this.selection) return this.selectCell(rowId, columnId);
    return this.selectRange(
      this.selection.anchor.rowId,
      this.selection.anchor.columnId,
      rowId,
      columnId,
      'range'
    );
  }

  bounds() {
    if (!this.selection) return null;
    const anchorRow = this.rowIds.indexOf(this.selection.anchor.rowId);
    const focusRow = this.rowIds.indexOf(this.selection.focus.rowId);
    const anchorColumn = this.columnIds.indexOf(this.selection.anchor.columnId);
    const focusColumn = this.columnIds.indexOf(this.selection.focus.columnId);
    return {
      top: Math.min(anchorRow, focusRow),
      bottom: Math.max(anchorRow, focusRow),
      left: Math.min(anchorColumn, focusColumn),
      right: Math.max(anchorColumn, focusColumn)
    };
  }

  includes(rowId, columnId) {
    const bounds = this.bounds();
    if (!bounds) return false;
    const row = this.rowIds.indexOf(rowId);
    const column = this.columnIds.indexOf(columnId);
    return row >= bounds.top && row <= bounds.bottom &&
      column >= bounds.left && column <= bounds.right;
  }

  project(mountedRowIds, mountedColumnIds = this.columnIds) {
    return mountedRowIds.flatMap((rowId) => mountedColumnIds
      .filter((columnId) => this.includes(rowId, columnId))
      .map((columnId) => ({ rowId, columnId })));
  }

  targetIds() {
    const bounds = this.bounds();
    if (!bounds) return { rowIds: [], columnIds: [], cellCount: 0 };
    const rowIds = this.rowIds.slice(bounds.top, bounds.bottom + 1);
    const columnIds = this.columnIds.slice(bounds.left, bounds.right + 1);
    return { rowIds, columnIds, cellCount: rowIds.length * columnIds.length };
  }

  presentationState(valueForCell) {
    const { rowIds, columnIds, cellCount } = this.targetIds();
    if (!cellCount) return { pressed: false, disabled: true };
    const values = new Set();
    for (const rowId of rowIds) {
      for (const columnId of columnIds) values.add(Boolean(valueForCell(rowId, columnId)));
    }
    return values.size > 1
      ? { pressed: 'mixed', disabled: false }
      : { pressed: values.has(true), disabled: false };
  }

  snapshot() {
    const bounds = this.bounds();
    const targets = this.targetIds();
    return {
      kind: this.selection?.kind ?? 'none',
      anchor: this.selection?.anchor ?? null,
      focus: this.selection?.focus ?? null,
      bounds,
      ...targets
    };
  }

  #validate(anchor, focus) {
    requireIdentity(this.rowIds, anchor.rowId, 'row');
    requireIdentity(this.rowIds, focus.rowId, 'row');
    requireIdentity(this.columnIds, anchor.columnId, 'column');
    requireIdentity(this.columnIds, focus.columnId, 'column');
  }
}
