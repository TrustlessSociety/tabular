import type { GridColumn } from '../../grid/helpers/contracts.js';

export type ColumnInsertionRequest = {
  anchorColumnId: string;
  knownColumnIds: string[];
  placement: 'left' | 'right';
};

export type AppliedColumnInsertion = {
  columns: GridColumn[];
  createdColumn: GridColumn;
};

export type BlankColumnInsertion = {
  id: string;
  anchorColumnId: string;
  placement: 'left' | 'right';
};

/** Projects tab-local blank spreadsheet columns beside their requested anchors. */
export function applyBlankColumnInsertions(
  columns: GridColumn[],
  insertions: BlankColumnInsertion[]
) {
  const next = columns.map((column) => ({ ...column }));
  for (const insertion of insertions) {
    if (next.some((column) => column.id === insertion.id)) continue;
    const anchorIndex = next.findIndex((column) => (
      column.id === insertion.anchorColumnId
    ));
    if (anchorIndex < 0) continue;
    next.splice(anchorIndex + (insertion.placement === 'right' ? 1 : 0), 0, {
      id: insertion.id,
      coordinate: '',
      label: '',
      width: 132,
      editable: true,
      kind: 'text',
      field: 'text',
      format: 'plain-text',
      storageCodec: 'text'
    });
  }
  return next;
}

/** Re-anchors tab-local blanks after the visible columns are dragged. */
export function reconcileBlankColumnInsertions(
  columnIds: readonly string[],
  insertions: BlankColumnInsertion[]
) {
  const byId = new Map(insertions.map((insertion) => [insertion.id, insertion]));
  const trackedIds = new Set(byId.keys());
  const visibleIds = columnIds.filter((columnId) => (
    trackedIds.has(columnId) || !columnId.startsWith('draft_')
  ));
  const next: BlankColumnInsertion[] = [];
  let previousVisibleId: string | undefined;

  for (const [index, columnId] of visibleIds.entries()) {
    const insertion = byId.get(columnId);
    if (!insertion) {
      previousVisibleId = columnId;
      continue;
    }
    if (previousVisibleId) {
      next.push({
        ...insertion,
        anchorColumnId: previousVisibleId,
        placement: 'right'
      });
      previousVisibleId = columnId;
      continue;
    }
    const nextStableId = visibleIds.slice(index + 1).find((candidate) => (
      !candidate.startsWith('draft_')
    ));
    next.push(nextStableId
      ? { ...insertion, anchorColumnId: nextStableId, placement: 'left' }
      : insertion);
    previousVisibleId = columnId;
  }
  return next;
}

/** Removes one tab-local blank while retaining the remaining visual order. */
export function removeBlankColumnInsertion(
  columnIds: readonly string[],
  insertions: BlankColumnInsertion[],
  columnId: string
) {
  return reconcileBlankColumnInsertions(
    columnIds.filter((candidate) => candidate !== columnId),
    insertions.filter((insertion) => insertion.id !== columnId)
  );
}

/** Places the one newly discovered stable column beside its requested anchor. */
export function applyColumnInsertion(
  columns: GridColumn[],
  request: ColumnInsertionRequest
): AppliedColumnInsertion | undefined {
  const known = new Set(request.knownColumnIds);
  const created = columns.filter((column) => !known.has(column.id));
  if (created.length !== 1) return undefined;
  const withoutCreated = columns.filter((column) => column.id !== created[0]!.id);
  const anchorIndex = withoutCreated.findIndex((column) => (
    column.id === request.anchorColumnId
  ));
  if (anchorIndex < 0) return undefined;
  const next = [...withoutCreated];
  next.splice(anchorIndex + (request.placement === 'right' ? 1 : 0), 0, created[0]!);
  return { columns: next, createdColumn: created[0]! };
}
