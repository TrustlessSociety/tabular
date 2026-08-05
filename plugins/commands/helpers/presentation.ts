import type {
  GridCellPresentation,
  GridColumn,
  GridPoint,
  GridRow,
  LogicalGridSelection
} from '../../grid/helpers/contracts.js';
import { GRID_HEADER_ROW_ID } from '../../grid/helpers/contracts.js';
import type { PresentationPatch } from './contracts.js';

export const DEFAULT_PRESENTATION: Required<Pick<GridCellPresentation,
  'fontFamily' | 'fontSize' | 'bold' | 'italic' | 'underline' | 'textColor'
  | 'fillColor' | 'horizontal' | 'vertical' | 'wrap' | 'border' | 'borderColor'
  | 'borderStyle' | 'numberFormat'>> = {
  fontFamily: 'Arial',
  fontSize: 12,
  bold: false,
  italic: false,
  underline: false,
  textColor: '#20242a',
  fillColor: 'transparent',
  horizontal: 'auto',
  vertical: 'middle',
  wrap: 'clip',
  border: 'none',
  borderColor: '#4b5563',
  borderStyle: 'solid',
  numberFormat: 'automatic'
};

export function presentationKey(point: GridPoint) {
  return JSON.stringify([point.rowId, point.columnId]);
}

export function presentationPoints(
  selection: LogicalGridSelection | null,
  rows: readonly GridRow[],
  columns: readonly GridColumn[]
) {
  if (!selection) return [];
  if (selection.kind === 'row') return columns.map((column) => ({ rowId: selection.rowId, columnId: column.id }));
  if (selection.kind === 'header-row') return columns.map((column) => ({
    rowId: GRID_HEADER_ROW_ID,
    columnId: column.id
  }));
  if (selection.kind === 'header') return [{
    rowId: GRID_HEADER_ROW_ID,
    columnId: selection.columnId
  }];
  if (selection.kind === 'column') return [
    { rowId: GRID_HEADER_ROW_ID, columnId: selection.columnId },
    ...rows.map((row) => ({ rowId: row.id, columnId: selection.columnId }))
  ];
  const rowIndexes = new Map(rows.map((row, index) => [row.id, index]));
  const columnIndexes = new Map(columns.map((column, index) => [column.id, index]));
  const bounds = [
    rowIndexes.get(selection.anchor.rowId), rowIndexes.get(selection.focus.rowId),
    columnIndexes.get(selection.anchor.columnId), columnIndexes.get(selection.focus.columnId)
  ];
  if (bounds.some((value) => typeof value !== 'number')) return [];
  const [rowA, rowB, columnA, columnB] = bounds as number[];
  const points: GridPoint[] = [];
  for (let row = Math.min(rowA, rowB); row <= Math.max(rowA, rowB); row += 1) {
    for (let column = Math.min(columnA, columnB); column <= Math.max(columnA, columnB); column += 1) {
      points.push({ rowId: rows[row]!.id, columnId: columns[column]!.id });
    }
  }
  return points;
}

export function applyPresentationPatch(
  current: Record<string, GridCellPresentation>,
  points: readonly GridPoint[],
  patch: PresentationPatch
) {
  const next = structuredClone(current);
  for (const point of points) {
    const key = presentationKey(point);
    const style: GridCellPresentation = { ...(next[key] || {}) };
    for (const [property, value] of Object.entries(patch)) {
      if (value === null || typeof value === 'undefined') delete (style as Record<string, unknown>)[property];
      else (style as Record<string, unknown>)[property] = value;
    }
    if (Object.keys(style).length) next[key] = style;
    else delete next[key];
  }
  return next;
}

export function clearPresentation(
  current: Record<string, GridCellPresentation>,
  points: readonly GridPoint[]
) {
  const next = { ...current };
  for (const point of points) delete next[presentationKey(point)];
  return next;
}

/** Carries draft-row formatting to the stable row identity returned by PostgreSQL. */
export function remapPresentationRow(
  current: Record<string, GridCellPresentation>,
  fromRowId: string,
  toRowId?: string
) {
  const next: Record<string, GridCellPresentation> = {};
  for (const [key, style] of Object.entries(current)) {
    try {
      const [rowId, columnId] = JSON.parse(key) as [string, string];
      if (rowId !== fromRowId) {
        next[key] = style;
      } else if (toRowId) {
        next[presentationKey({ rowId: toRowId, columnId })] = style;
      }
    } catch {
      next[key] = style;
    }
  }
  return next;
}

export function presentationValue<Property extends keyof GridCellPresentation>(
  current: Record<string, GridCellPresentation>,
  points: readonly GridPoint[],
  property: Property
): GridCellPresentation[Property] | 'mixed' {
  const fallback = DEFAULT_PRESENTATION[property as keyof typeof DEFAULT_PRESENTATION] as GridCellPresentation[Property];
  const values = points.map((point) => current[presentationKey(point)]?.[property] ?? fallback);
  if (!values.length) return fallback;
  return values.every((value) => value === values[0]) ? values[0] : 'mixed';
}

export function encodePresentation(current: Record<string, GridCellPresentation>) {
  return JSON.stringify({ version: 1, cells: current });
}

export function decodePresentation(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as { version?: unknown; cells?: unknown };
    if (parsed.version !== 1 || !parsed.cells || typeof parsed.cells !== 'object' || Array.isArray(parsed.cells)) return {};
    return Object.fromEntries(Object.entries(parsed.cells as Record<string, unknown>).flatMap(([key, style]) => (
      key.length <= 700 && style && typeof style === 'object' && !Array.isArray(style)
        ? [[key, style as GridCellPresentation]]
        : []
    )));
  } catch {
    return {};
  }
}
