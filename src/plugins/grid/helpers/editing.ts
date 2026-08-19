//client
import type {
  CapabilityAction,
  SafeDraft,
  TypedCellValue,
  ValidationIssue
} from '../../capability/helpers/action-contracts.js';
import type {
  GridCellValue,
  GridColumn,
  GridPoint,
  GridRow,
  LogicalGridSelection
} from './contracts.js';
import { canonicalJsonValue } from '../../capability/helpers/value-contracts.js';
import { valueAfterFieldExit } from './defaults.js';
import { validateColumnValue } from '../../files/helpers/validator-engine.js';
import {
  FieldCodecError,
  decodeExpandedFieldValue,
  type ExpandedFieldKind
} from './field-codecs.js';

//The grid draft change contract exported for module callers
export type GridDraftChange = {
  point: GridPoint,
  before: GridCellValue,
  after: GridCellValue,
  raw: string,
  issue?: ValidationIssue,
  userEdited?: boolean,
};

//The grid edit draft contract exported for module callers
export type GridEditDraft =
  | {
    id: string,
    kind: 'cells',
    source: 'edit' | 'paste' | 'fill' | 'clear',
    changes: GridDraftChange[],
  }
  | {
    id: string,
    kind: 'insert',
    row: GridRow,
    index: number,
    rowRank?: string,
    changes: GridDraftChange[],
  }
  | {
    id: string,
    kind: 'delete',
    row: GridRow,
    index: number,
    changes: GridDraftChange[],
  };

//The grid history frame contract exported for module callers
export type GridHistoryFrame = {
  beforeRows: GridRow[],
  afterRows: GridRow[],
  beforeVersions: Record<string, string>,
  afterVersions: Record<string, string>,
  selection: LogicalGridSelection | null,
  label: string,
};

/**
 * Return the stage cell edit result.
 */
export function stageCellEdit(
  rows: GridRow[],
  columns: GridColumn[],
  point: GridPoint,
  attempted: GridCellValue,
  id: string
): GridEditDraft {
  const row = rows.find((candidate) => candidate.id === point.rowId);
  const column = columns.find((candidate) => candidate.id === point.columnId);
  if (!row || !column) throw new Error('The edited cell is unavailable');
  const value = valueAfterFieldExit(column, attempted);
  return {
    id,
    kind: 'cells',
    source: 'edit',
    changes: [draftChange(point, row[point.columnId] ?? null, value, column)]
  };
}

/**
 * Return the stage relation choice result.
 */
export function stageRelationChoice(
  rows: GridRow[],
  columns: GridColumn[],
  rowId: string,
  patch: Record<string, GridCellValue>,
  id: string
): GridEditDraft {
  const row = rows.find((candidate) => candidate.id === rowId);
  if (!row) throw new Error('The related row is unavailable');
  const changes = Object.entries(patch).map(([columnId, value]) => {
    const selected = columns.find((column) => column.id === columnId);
    if (!selected) throw new Error('The relation source column is unavailable');
    return {
      point: { rowId, columnId },
      before: row[columnId] ?? null,
      after: value,
      raw: rawGridValue(value)
    };
  });
  if (!changes.length) throw new Error('The relation choice is incomplete');
  return { id, kind: 'cells', source: 'edit', changes };
}

/**
 * Update the insert relation draft.
 */
export function updateInsertRelationDraft(
  draft: Extract<GridEditDraft, { kind: 'insert', }>,
  columns: GridColumn[],
  patch: Record<string, GridCellValue>
) {
  let updated = draft;
  for (const [columnId, value] of Object.entries(patch)) {
    updated = updateInsertDraft(updated, columns, {
      rowId: draft.row.id,
      columnId
    }, value);
  }
  const sourceColumnIds = new Set(Object.keys(patch));
  return {
    ...updated,
    changes: updated.changes.map((change) => {
      if (!sourceColumnIds.has(change.point.columnId)) return change;
      const { issue: _issue, ...accepted } = change;
      return accepted;
    })
  };
}

/**
 * Return the stage scalar range result.
 */
export function stageScalarRange(
  rows: GridRow[],
  columns: GridColumn[],
  selection: LogicalGridSelection | null,
  attempted: GridCellValue,
  source: 'paste' | 'fill' | 'clear',
  id: string
): GridEditDraft {
  const points = pointsForSelection(selection, rows, columns);
  if (!points.length) throw new Error('Select a cell or rectangular range first');
  const changes = points.map((point) => {
    const row = rows.find((candidate) => candidate.id === point.rowId)!;
    const column = columns.find((candidate) => candidate.id === point.columnId)!;
    return draftChange(point, row[point.columnId] ?? null, attempted, column);
  }).filter((change) => change.before !== change.after || change.issue);
  if (!changes.length) throw new Error('The selected cells already contain that value');
  return { id, kind: 'cells', source, changes };
}

/**
 * Return the stage insert row result.
 */
export function stageInsertRow(
  rows: GridRow[],
  columns: GridColumn[],
  index: number,
  id: string,
  rowRank?: string
): GridEditDraft {
  const rowId = `draft_row_${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const row: GridRow = { id: rowId };
  const changes: GridDraftChange[] = [];
  for (const column of columns) {
    if (column.generated) {
      row[column.id] = null;
      continue;
    }
    const value = column.key
      ? `NEW-${String(rows.length + 1).padStart(5, '0')}-${column.coordinate}`
      : null;
    row[column.id] = value;
    changes.push(draftChange(
      { rowId, columnId: column.id },
      null,
      value,
      {
        ...column,
        editable: true,
        generated: false,
        required: column.serverDefault && typeof column.defaultValue === 'undefined'
          ? false
          : column.required
      }
    ));
  }
  return {
    id,
    kind: 'insert',
    row,
    index: Math.max(0, Math.min(index, rows.length)),
    changes,
    ...(rowRank ? { rowRank } : {})
  };
}

/**
 * Update the insert draft.
 */
export function updateInsertDraft(
  draft: Extract<GridEditDraft, { kind: 'insert', }>,
  columns: GridColumn[],
  point: GridPoint,
  attempted: GridCellValue,
  applyDefault = true
): Extract<GridEditDraft, { kind: 'insert', }> {
  if (point.rowId !== draft.row.id) throw new Error('Finish the new row before editing another row');
  const current = draft.changes.find((change) => change.point.columnId === point.columnId);
  const selected = columns.find((column) => column.id === point.columnId);
  if (!current || !selected || selected.generated) throw new Error('This new-row cell is read-only');
  const value = applyDefault
    ? valueAfterFieldExit(selected, attempted)
    : attempted;
  const next = draftChange(
    point,
    current.before,
    value,
    { ...selected, editable: true, generated: false }
  );
  return {
    ...draft,
    row: {
      ...draft.row,
      [point.columnId]: next.issue ? next.raw : next.after
    },
    changes: draft.changes.map((change) =>
      change.point.columnId === point.columnId
        ? { ...next, userEdited: true }
        : change
    )
  };
}

/**
 * Clears only selected fields that belong to one retained insert draft.
 */
export function clearInsertDraftSelection(
  draft: Extract<GridEditDraft, { kind: 'insert', }>,
  columns: GridColumn[],
  points: GridPoint[]
) {
  const draftColumnIds = new Set(draft.changes.map((change) => (
    change.point.columnId
  )));
  return points.reduce((current, point) => (
    point.rowId === current.row.id && draftColumnIds.has(point.columnId)
      ? updateInsertDraft(current, columns, point, null, false)
      : current
  ), draft);
}

/**
 * Reports whether a failed new-row draft contains no user-entered value.
 */
export function insertDraftIsEmpty(
  draft: Extract<GridEditDraft, { kind: 'insert', }>,
  columns: GridColumn[]
) {
  //Recovered drafts predate the in-tab edit marker, while a correction can
  // mark only the latest cell. Inspect every field so clearing one cell never
  // discards another recovered value from the same row.
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  return draft.changes.every((change) => {
    if (blankValue(change.raw)) return true;
    if (change.userEdited) return false;
    const column = columnsById.get(change.point.columnId);
    return Boolean(column?.key && /^NEW-\d+-[A-Z]+$/.test(change.raw));
  });
}

/**
 * Return the stage delete row result.
 */
export function stageDeleteRow(
  rows: GridRow[],
  columns: GridColumn[],
  rowId: string,
  id: string
): GridEditDraft {
  const index = rows.findIndex((row) => row.id === rowId);
  if (index < 0) throw new Error('Select an existing row first');
  const row = { ...rows[index]! };
  return {
    id,
    kind: 'delete',
    row,
    index,
    changes: columns.map((column) => ({
      point: { rowId, columnId: column.id },
      before: row[column.id] ?? null,
      after: null,
      raw: ''
    }))
  };
}

/**
 * Apply the grid draft.
 */
export function applyGridDraft(rows: GridRow[], draft: GridEditDraft): GridRow[] {
  if (draft.kind === 'insert') {
    const next = [...rows];
    next.splice(draft.index, 0, { ...draft.row });
    return next;
  }
  if (draft.kind === 'delete') {
    return rows.filter((row) => row.id !== draft.row.id);
  }
  const updates = new Map<string, GridRow>();
  for (const change of draft.changes) {
    const current = updates.get(change.point.rowId)
      || { ...rows.find((row) => row.id === change.point.rowId)! };
    current[change.point.columnId] = change.issue ? change.raw : change.after;
    updates.set(change.point.rowId, current);
  }
  return rows.map((row) => updates.get(row.id) || row);
}

/**
 * Return the draft issues result.
 */
export function draftIssues(draft: GridEditDraft): ValidationIssue[] {
  return draft.changes.flatMap((change) => change.issue ? [change.issue] : []);
}

/**
 * Return the capability action for draft result.
 */
export function capabilityActionForDraft(
  draft: GridEditDraft,
  input: {
    commandId: string,
    fileId: string,
    versions: Record<string, string>,
    columns: GridColumn[],
  }
): CapabilityAction {
  if (draft.kind === 'insert') {
    return {
      type: 'record.insert',
      commandId: input.commandId,
      fileId: input.fileId,
      patch: draft.changes
        .filter((change) => {
          if (change.issue) return false;
          if (change.after !== null) return true;
          return typeof column(input.columns, change.point.columnId).defaultValue
            !== 'undefined';
        })
        .map((change) => ({
          columnId: change.point.columnId,
          value: typedValue(column(input.columns, change.point.columnId), change.after)
        }))
    };
  }
  if (draft.kind === 'delete') {
    return {
      type: 'record.delete',
      commandId: input.commandId,
      fileId: input.fileId,
      rowId: draft.row.id,
      expectedVersion: requiredVersion(input.versions, draft.row.id)
    };
  }
  const grouped = new Map<string, GridDraftChange[]>();
  for (const change of draft.changes) {
    const current = grouped.get(change.point.rowId) || [];
    current.push(change);
    grouped.set(change.point.rowId, current);
  }
  if (draft.changes.length === 1) {
    const change = draft.changes[0]!;
    return {
      type: 'record.patch',
      commandId: input.commandId,
      fileId: input.fileId,
      rowId: change.point.rowId,
      expectedVersion: requiredVersion(input.versions, change.point.rowId),
      patch: [{
        columnId: change.point.columnId,
        value: typedValue(column(input.columns, change.point.columnId), change.after)
      }]
    };
  }
  return {
    type: 'range.patch',
    commandId: input.commandId,
    fileId: input.fileId,
    cellCount: draft.changes.length,
    rows: [...grouped.entries()].map(([rowId, changes]) => ({
      rowId,
      expectedVersion: requiredVersion(input.versions, rowId),
      patch: changes.map((change) => ({
        columnId: change.point.columnId,
        value: typedValue(column(input.columns, change.point.columnId), change.after)
      }))
    }))
  };
}

/**
 * Apply the mutation versions.
 */
export function applyMutationVersions(
  versions: Record<string, string>,
  data: unknown,
  draft?: GridEditDraft
) {
  const next = { ...versions };
  if (draft?.kind === 'delete') delete next[draft.row.id];
  if (!data || typeof data !== 'object' || !Array.isArray((data as { rows?: unknown, }).rows)) {
    return next;
  }
  for (const row of (data as { rows: unknown[], }).rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as { rowId?: unknown, version?: unknown, };
    if (typeof record.rowId === 'string' && typeof record.version === 'string') {
      next[record.rowId] = record.version;
    }
  }
  return next;
}

/**
 * Return the inserted row identity result.
 */
export function insertedRowIdentity(data: unknown) {
  if (!data || typeof data !== 'object') return undefined;
  const rows = (data as { rows?: unknown, }).rows;
  if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== 'object') return undefined;
  const id = (rows[0] as { rowId?: unknown, }).rowId;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Return the persistent draft patch result.
 */
export function persistentDraftPatch(
  draft: GridEditDraft,
  columns: GridColumn[]
): {
  rowId?: string,
  rowRank?: string,
  patch: Array<{ columnId: string, value: TypedCellValue, }>,
} | undefined {
  if (draft.kind === 'delete') return undefined;
  const rowIds = new Set(draft.changes.map((change) => change.point.rowId));
  if (rowIds.size !== 1) return undefined;
  const rowId = draft.kind === 'insert' ? undefined : draft.changes[0]?.point.rowId;
  return {
    ...(rowId ? { rowId } : {}),
    ...(draft.kind === 'insert' && draft.rowRank ? { rowRank: draft.rowRank } : {}),
    patch: draft.changes
      .filter((change) => draft.kind !== 'insert' || (
        !(change.issue?.code === 'required' && blankValue(change.raw))
        && (change.userEdited || change.after !== null)
      ))
      .map((change) => ({
      columnId: change.point.columnId,
      value: change.issue
        ? { type: 'text' as const, value: change.raw }
        : typedValue(column(columns, change.point.columnId), change.after)
      }))
  };
}

/**
 * Return the grid draft from persistent result.
 */
export function gridDraftFromPersistent(
  draft: SafeDraft,
  rows: GridRow[],
  columns: GridColumn[]
): GridEditDraft | undefined {
  const rowId = draft.rowId || `draft_row_${draft.id.slice('draft_'.length)}`;
  const current = draft.rowId ? rows.find((row) => row.id === draft.rowId) : undefined;
  if (draft.rowId && !current) return undefined;
  const validationByColumn = new Map(
    draft.validation.filter((issue) => issue.columnId).map((issue) => [issue.columnId!, issue])
  );
  const fallbackIssue = draft.validation.find((issue) => !issue.columnId);

  //Rebuild every insert field so required-column errors remain exact after
  // reload even though blank required values are not persisted as data.
  if (!draft.rowId) {
    const patchByColumn = new Map(draft.patch.map((entry) => [entry.columnId, entry]));
    const row: GridRow = { id: rowId };
    let changes = columns.flatMap((selected) => {
      if (selected.generated) {
        row[selected.id] = null;
        return [];
      }
      const entry = patchByColumn.get(selected.id);
      const attempted = entry ? gridValueFromTyped(entry.value) : null;
      let change = draftChange(
        { rowId, columnId: selected.id },
        null,
        attempted,
        {
          ...selected,
          editable: true,
          generated: false,
          required: selected.serverDefault && typeof selected.defaultValue === 'undefined'
            ? false
            : selected.required
        }
      );
      const serverIssue = validationByColumn.get(selected.id);
      if (serverIssue) {
        change = { ...change, issue: serverIssue };
      }
      row[selected.id] = change.issue ? change.raw : change.after;
      return [change];
    });
    if (fallbackIssue && !changes.some((change) => change.issue)) {
      const fallbackColumnId = draft.patch[0]?.columnId;
      changes = changes.map((change) => (
        change.point.columnId === fallbackColumnId
          ? { ...change, issue: fallbackIssue }
          : change
      ));
    }
    if (!changes.length) return undefined;
    return {
      id: draft.id,
      kind: 'insert',
      row,
      index: rows.length,
      changes,
      ...(draft.rowRank ? { rowRank: draft.rowRank } : {})
    };
  }

  const row: GridRow = { id: rowId };
  for (const column of columns) row[column.id] = current?.[column.id] ?? null;
  let changes = draft.patch.flatMap((entry) => {
    const selected = columns.find((column) => column.id === entry.columnId);
    if (!selected) return [];
    const attempted = gridValueFromTyped(entry.value);
    row[entry.columnId] = attempted;
    const issue = validationByColumn.get(entry.columnId);
    return [{
      point: { rowId, columnId: entry.columnId },
      before: current?.[entry.columnId] ?? null,
      after: attempted,
      raw: rawGridValue(attempted),
      ...(issue ? { issue } : {})
    }];
  });
  if (fallbackIssue && !changes.some((change) => change.issue)) {
    changes = changes.map((change, index) => (
      index === 0 ? { ...change, issue: fallbackIssue } : change
    ));
  }
  if (!changes.length) return undefined;
  return { id: draft.id, kind: 'cells', source: 'edit', changes };
}

/**
 * Return the hidden row rank result.
 */
export function hiddenRowRank(logicalRow: number) {
  if (!Number.isSafeInteger(logicalRow) || logicalRow < 1 || logicalRow > 1_000_000) {
    throw new Error('The spreadsheet row is outside the supported range');
  }
  return (BigInt(logicalRow) * 1_000_000n).toString().padStart(24, '0');
}

/**
 * Return the logical row for rank result.
 */
export function logicalRowForRank(rank: string) {
  if (!/^[0-9]{24}$/.test(rank)) return undefined;
  const value = BigInt(rank);
  if (value % 1_000_000n !== 0n) return undefined;
  const row = Number(value / 1_000_000n);
  return Number.isSafeInteger(row) && row >= 1 ? row : undefined;
}

/**
 * Return the points for selection result.
 */
export function pointsForSelection(
  selection: LogicalGridSelection | null,
  rows: GridRow[],
  columns: GridColumn[]
) {
  if (
    !selection
    || selection.kind === 'row'
    || selection.kind === 'header-row'
    || selection.kind === 'header'
    || selection.kind === 'column'
  ) return [];
  const rowIndexes = new Map(rows.map((row, index) => [row.id, index]));
  const columnIndexes = new Map(columns.map((column, index) => [column.id, index]));
  const startRow = rowIndexes.get(selection.anchor.rowId);
  const endRow = rowIndexes.get(selection.focus.rowId);
  const startColumn = columnIndexes.get(selection.anchor.columnId);
  const endColumn = columnIndexes.get(selection.focus.columnId);
  if ([startRow, endRow, startColumn, endColumn].some((value) => value === undefined)) return [];
  const points: GridPoint[] = [];
  for (let row = Math.min(startRow!, endRow!); row <= Math.max(startRow!, endRow!); row += 1) {
    for (
      let column = Math.min(startColumn!, endColumn!);
      column <= Math.max(startColumn!, endColumn!);
      column += 1
    ) {
      if (columns[column]!.editable !== false) {
        points.push({ rowId: rows[row]!.id, columnId: columns[column]!.id });
      }
    }
  }
  return points;
}

/**
 * Return the draft change result.
 */
function draftChange(
  point: GridPoint,
  before: GridCellValue,
  attempted: GridCellValue,
  column: GridColumn
): GridDraftChange {
  const raw = rawGridValue(attempted);
  if (column.editable === false || column.generated) {
    return {
      point,
      before,
      after: before,
      raw,
      issue: {
        columnId: point.columnId,
        code: 'read_only',
        message: column.generated
          ? 'This PostgreSQL generated column is read-only.'
          : 'This stable key or protected column is read-only.'
      }
    };
  }
  if (column.required && (attempted === null || raw.trim() === '')) {
    return {
      point,
      before,
      after: attempted,
      raw,
      issue: {
        columnId: point.columnId,
        code: 'required',
        message: `${column.label} is required.`
      }
    };
  }
  if (column.storageType === 'jsonb' && expandedField(column.field)) {
    try {
      attempted = raw.trim() === ''
        ? null
        : decodeExpandedFieldValue(column.field, raw, {
          allowedValues: column.options?.filter((option) => !option.restricted)
            .map((option) => option.value)
        });
    } catch (caught) {
      const message = caught instanceof FieldCodecError
        ? `${caught.message}${caught.path ? ` at ${caught.path}` : ''}`
        : 'Enter a valid JSON Field value.';
      return invalid(point, before, attempted, raw, message);
    }
  }
  if (column.kind === 'number' || column.kind === 'price') {
    if (attempted === null || raw === '') return { point, before, after: null, raw };
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw) || raw === '-0') {
      return invalid(point, before, attempted, raw, 'Enter a valid exact number.');
    }
    attempted = raw;
  }
  if (column.kind === 'date' && attempted !== null && raw !== '') {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      && new Date(`${raw}T00:00:00.000Z`).toISOString().slice(0, 10) === raw;
    if (!valid) return invalid(point, before, attempted, raw, 'Use YYYY-MM-DD for dates.');
  }
  if (column.kind === 'datetime' && attempted !== null && raw !== '') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
      || !Number.isFinite(new Date(raw).getTime())) {
      return invalid(point, before, attempted, raw, 'Use a valid date and time with an explicit UTC offset.');
    }
  }
  if (column.kind === 'email' && raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return invalid(point, before, attempted, raw, 'Enter a valid email address.');
  }
  if ((column.kind === 'select' || column.kind === 'relation') && raw) {
    const option = column.options?.find((candidate) => candidate.value === raw);
    if (!option) return invalid(point, before, attempted, raw, 'Choose an available option.');
    if (option.restricted) return invalid(point, before, attempted, raw, option.restricted);
  }
  if (column.storageType && column.field && column.validatorConfig) {
    try {
      const validation = validateColumnValue({
        storageType: column.storageType,
        field: column.field,
        fieldConfig: column.fieldConfig || {},
        validatorConfig: column.validatorConfig
      }, attempted);
      if (!validation.valid) {
        const message = validation.failures.map((failure) => (
          `${failure.message}${failure.path ? ` at ${failure.path}` : ''}`
        )).join(' ');
        return invalid(
          point,
          before,
          attempted,
          raw,
          `${message}${validation.overflow ? ` (+${validation.overflow} more)` : ''}`
        );
      }
    } catch {
      return invalid(point, before, attempted, raw, 'The column validator metadata must be corrected before saving.');
    }
  }
  return { point, before, after: attempted, raw };
}

function expandedField(field: GridColumn['field']): field is ExpandedFieldKind {
  return Boolean(field && ['metadata', 'tags', 'text-list', 'multi-select', 'checkbox-list'].includes(field));
}

/**
 * Treats null-like editor output as an empty spreadsheet value.
 */
function blankValue(value: string) {
  return value.trim() === '';
}

/**
 * Return the invalid result.
 */
function invalid(
  point: GridPoint,
  before: GridCellValue,
  after: GridCellValue,
  raw: string,
  message: string
): GridDraftChange {
  return {
    point,
    before,
    after,
    raw,
    issue: { columnId: point.columnId, code: 'invalid_value', message }
  };
}

/**
 * Return the typed value result.
 */
function typedValue(column: GridColumn, value: GridCellValue): TypedCellValue {
  if (value === null || value === '') return { type: 'null' };
  const codec = column.storageCodec
    || (column.kind === 'number' || column.kind === 'price'
      ? 'decimal'
      : column.kind === 'boolean' || column.kind === 'switch'
        ? 'boolean'
        : column.kind === 'date'
          ? 'date'
          : column.kind === 'datetime'
            ? 'timestamp'
            : 'text');
  if (codec === 'integer') return { type: 'integer', value: String(value) };
  if (codec === 'decimal') return { type: 'decimal', value: String(value) };
  if (codec === 'boolean') return { type: 'boolean', value: Boolean(value) };
  if (codec === 'date') return { type: 'date', value: String(value) };
  if (codec === 'time') return { type: 'time', value: String(value) };
  if (codec === 'timestamp') return { type: 'timestamp', value: String(value) };
  if (codec === 'json') {
    if (typeof value === 'object' && value.type === 'json') return value;
    return canonicalJsonValue(String(value));
  }
  return { type: 'text', value: String(value) };
}

/**
 * Return the grid value from typed result.
 */
function gridValueFromTyped(value: TypedCellValue): GridCellValue {
  if (value.type === 'null') return null;
  if (value.type === 'json') return value;
  return value.value;
}

/**
 * Return the editor-facing raw representation without losing canonical JSON.
 */
function rawGridValue(value: GridCellValue) {
  if (value === null) return '';
  if (typeof value === 'object' && value.type === 'json') return value.source;
  return String(value);
}

/**
 * Report the required version condition.
 */
function requiredVersion(versions: Record<string, string>, rowId: string) {
  const version = versions[rowId];
  if (!version) throw new Error('Reload this row before saving changes.');
  return version;
}

/**
 * Return the column result.
 */
function column(columns: GridColumn[], columnId: string) {
  const found = columns.find((candidate) => candidate.id === columnId);
  if (!found) throw new Error('The edited column is unavailable');
  return found;
}
