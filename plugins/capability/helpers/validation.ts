//client
import type { CapabilityAction, CellPatch, TypedCellValue, ValidationIssue } from './contracts.js';
import { ActionFault } from './contracts.js';

const MAX_PATCH_CELLS = 1_000;
//The max range cells value exported for module callers
export const MAX_RANGE_CELLS = 10_000;
const MAX_JSON_BYTES = 1_048_576;

/**
 * Validate the action.
 */
export function validateAction(action: CapabilityAction): CapabilityAction {
  if (!action || typeof action !== 'object') invalid('The action is invalid');
  switch (action.type) {
    case 'record.read':
      closed(action, ['type', 'fileId', 'rowId', 'columnIds']);
      fileId(action.fileId);
      rowId(action.rowId);
      columnList(action.columnIds);
      break;
    case 'record.patch':
      closed(action, ['type', 'commandId', 'fileId', 'rowId', 'expectedVersion', 'patch']);
      commandId(action.commandId);
      fileId(action.fileId);
      rowId(action.rowId);
      rowVersion(action.expectedVersion);
      patch(action.patch);
      break;
    case 'record.insert':
      closed(action, ['type', 'commandId', 'fileId', 'patch']);
      commandId(action.commandId);
      fileId(action.fileId);
      patch(action.patch);
      break;
    case 'record.delete':
      closed(action, [
        'type', 'commandId', 'fileId', 'rowId', 'expectedVersion'
      ]);
      commandId(action.commandId);
      fileId(action.fileId);
      rowId(action.rowId);
      rowVersion(action.expectedVersion);
      break;
    case 'range.patch': {
      closed(action, ['type', 'commandId', 'fileId', 'cellCount', 'rows']);
      commandId(action.commandId);
      fileId(action.fileId);
      if (!Number.isInteger(action.cellCount) || action.cellCount < 1 || action.cellCount > MAX_RANGE_CELLS) {
        invalid(`Range cell count must be between 1 and ${MAX_RANGE_CELLS}`);
      }
      if (!Array.isArray(action.rows) || action.rows.length < 1) invalid('Range rows are required');
      const rows = new Set<string>();
      let cells = 0;
      for (const row of action.rows) {
        closed(row, ['rowId', 'expectedVersion', 'patch']);
        rowId(row.rowId);
        if (rows.has(row.rowId)) invalid('Range row identities must be unique');
        rows.add(row.rowId);
        rowVersion(row.expectedVersion);
        patch(row.patch);
        cells += row.patch.length;
      }
      if (cells !== action.cellCount) invalid('Range cell count does not match the patch');
      break;
    }
    case 'draft.create':
      closed(action, [
        'type', 'commandId', 'fileId', 'rowId', 'rowRank', 'schemaVersion', 'patch', 'expiresAt'
      ]);
      commandId(action.commandId);
      fileId(action.fileId);
      if (typeof action.rowId !== 'undefined') rowId(action.rowId);
      if (typeof action.rowRank !== 'undefined') rowRank(action.rowRank);
      schemaVersion(action.schemaVersion);
      patch(action.patch, true);
      timestamp(action.expiresAt, 'draft expiry');
      break;
    case 'draft.read':
      closed(action, ['type', 'draftId']);
      draftId(action.draftId);
      break;
    case 'draft.list':
      closed(action, ['type', 'fileId']);
      fileId(action.fileId);
      break;
    case 'draft.update':
      closed(action, ['type', 'commandId', 'draftId', 'expectedDraftVersion', 'patch']);
      commandId(action.commandId);
      draftId(action.draftId);
      version(action.expectedDraftVersion, 'expected draft version');
      patch(action.patch, true);
      break;
    case 'draft.delete':
      closed(action, ['type', 'commandId', 'draftId', 'expectedDraftVersion']);
      commandId(action.commandId);
      draftId(action.draftId);
      version(action.expectedDraftVersion, 'expected draft version');
      break;
    case 'draft.promote':
      closed(action, [
        'type', 'commandId', 'draftId', 'expectedDraftVersion', 'expectedRowVersion'
      ]);
      commandId(action.commandId);
      draftId(action.draftId);
      version(action.expectedDraftVersion, 'expected draft version');
      if (typeof action.expectedRowVersion !== 'undefined') {
        rowVersion(action.expectedRowVersion);
      }
      break;
    case 'history.list':
      closed(action, ['type', 'fileId', 'limit']);
      fileId(action.fileId);
      if (!Number.isInteger(action.limit) || action.limit < 1 || action.limit > 100) {
        invalid('History limit must be between 1 and 100');
      }
      break;
    case 'history.undo':
    case 'history.redo':
      closed(action, ['type', 'commandId', 'fileId']);
      commandId(action.commandId);
      if (typeof action.fileId !== 'undefined') fileId(action.fileId);
      break;
    default:
      invalid('The action type is not supported');
  }
  return action;
}

/**
 * Validate the patch shape.
 */
export function validatePatchShape(input: CellPatch[], allowEmpty = false): ValidationIssue[] {
  try {
    patch(input, allowEmpty);
    return [];
  } catch (error) {
    if (error instanceof ActionFault) {
      return [{ code: error.safe.code, message: error.safe.message }];
    }
    throw error;
  }
}

/**
 * Return the patch result.
 */
function patch(input: CellPatch[], allowEmpty = false) {
  if (!Array.isArray(input) || (!allowEmpty && input.length < 1) || input.length > MAX_PATCH_CELLS) {
    invalid(`A patch must contain ${allowEmpty ? 'zero to' : 'one to'} ${MAX_PATCH_CELLS} cells`);
  }
  const columns = new Set<string>();
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') invalid('Every patch entry must be an object');
    closed(entry, ['columnId', 'value']);
    columnId(entry.columnId);
    if (columns.has(entry.columnId)) invalid('A patch cannot contain a column more than once');
    columns.add(entry.columnId);
    cellValue(entry.value);
  }
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_JSON_BYTES) {
    invalid(`The typed patch exceeds ${MAX_JSON_BYTES} bytes`);
  }
}

/**
 * Return the cell value result.
 */
function cellValue(input: TypedCellValue) {
  if (!input || typeof input !== 'object' || typeof input.type !== 'string') {
    invalid('A typed cell value is required');
  }
  if (input.type === 'null') {
    if (Object.keys(input).length !== 1) invalid('Null cell values cannot include a value');
    return;
  }
  closed(input, ['type', 'value']);
  if (input.type === 'text' && typeof input.value === 'string') return;
  if (
    input.type === 'integer'
    && typeof input.value === 'string'
    && /^-?(0|[1-9][0-9]*)$/.test(input.value)
    && input.value.length <= 1_000
  ) return;
  if (
    input.type === 'decimal'
    && typeof input.value === 'string'
    && /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(input.value)
    && input.value.length <= 1_000
  ) return;
  if (input.type === 'boolean' && typeof input.value === 'boolean') return;
  if (input.type === 'date' && typeof input.value === 'string') {
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(input.value)
      && new Date(`${input.value}T00:00:00.000Z`).toISOString().slice(0, 10) === input.value
    ) return;
    invalid('Date cell values must use the canonical YYYY-MM-DD format');
  }
  if (
    input.type === 'time'
    && typeof input.value === 'string'
    && /^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]{1,6})?)?$/.test(input.value)
  ) return;
  if (input.type === 'time') {
    invalid('Time cell values must use canonical 24-hour text');
  }
  if (
    input.type === 'timestamp'
    && typeof input.value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(input.value)
    && Number.isFinite(new Date(input.value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(input.value)
      ? input.value
      : `${input.value}Z`).getTime())
  ) return;
  if (input.type === 'timestamp') {
    invalid('Date-time cell values must use canonical ISO date-time text');
  }
  if (input.type === 'json') {
    if (typeof input.value !== 'string' || Buffer.byteLength(input.value, 'utf8') > MAX_JSON_BYTES) {
      invalid('JSON cell values must be bounded JSON text');
    }
    try {
      JSON.parse(input.value);
    } catch {
      invalid('JSON cell values must contain valid JSON text');
    }
    return;
  }
  invalid('The typed cell value is invalid');
}

/**
 * Return the column list result.
 */
function columnList(input: string[]) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_PATCH_CELLS) {
    invalid('One to 1000 column identities are required');
  }
  const unique = new Set(input);
  if (unique.size !== input.length) invalid('Column identities must be unique');
  input.forEach(columnId);
}

/**
 * Return the file id result.
 */
function fileId(value: string) {
  matches(value, /^obj_[A-Za-z0-9_-]{32,64}$/, 'file identity');
}

/**
 * Return the row id result.
 */
function rowId(value: string) {
  matches(value, /^row_[A-Za-z0-9_-]{1,256}$/, 'row identity');
}

/**
 * Return the column id result.
 */
function columnId(value: string) {
  matches(value, /^col_[A-Za-z0-9_-]{32,64}$/, 'column identity');
}

/**
 * Return the draft id result.
 */
function draftId(value: string) {
  matches(value, /^draft_[A-Za-z0-9_-]{32,64}$/, 'draft identity');
}

/**
 * Return the command id result.
 */
function commandId(value: string) {
  matches(value, /^cmd_[A-Za-z0-9_-]{8,96}$/, 'command identity');
}

/**
 * Return the schema version result.
 */
function schemaVersion(value: string) {
  matches(value, /^[a-f0-9]{64}$/, 'schema version');
}

/**
 * Return the version result.
 */
function version(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) invalid(`${label} must be a positive safe integer`);
}

/**
 * Return the row version result.
 */
function rowVersion(value: string) {
  matches(value, /^ver_[A-Za-z0-9_-]{16,128}$/, 'expected row version');
}

/**
 * Return the row rank result.
 */
function rowRank(value: string) {
  matches(value, /^[0-9]{24}$/, 'hidden row rank');
}

/**
 * Return the timestamp result.
 */
function timestamp(value: string, label: string) {
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) {
    invalid(`The ${label} must be an ISO timestamp`);
  }
}

/**
 * Return the matches result.
 */
function matches(value: string, expression: RegExp, label: string) {
  if (typeof value !== 'string' || !expression.test(value)) invalid(`The ${label} is invalid`);
}

/**
 * Return the closed result.
 */
function closed(value: object, allowed: string[]) {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    invalid('The action contains an unknown field');
  }
}

/**
 * Return the invalid result.
 */
function invalid(message: string): never {
  throw new ActionFault({ code: 'invalid_action', message, retryable: false });
}
