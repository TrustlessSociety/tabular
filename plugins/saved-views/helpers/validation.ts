//client
import type {
  CreateSavedViewInput,
  MoveRowInput,
  SavedViewAccess,
  SavedViewAction,
  SavedViewDefinition,
  UpdateSavedViewInput
} from './contracts.js';

const COLUMN_ID = /^col_[A-Za-z0-9_-]{32,64}$/;
const ROW_ID = /^row_[A-Za-z0-9_-]{1,256}$/;
const VIEW_ID = /^view_[A-Za-z0-9_-]{32,64}$/;
const COMMAND_ID = /^cmd_[A-Za-z0-9_-]{8,96}$/;
const COLORS = /^(?:transparent|#[0-9a-fA-F]{6})$/;

/**
 * Validate the saved view action.
 */
export function validateSavedViewAction(input: unknown): SavedViewAction {
  const action = object(input, 'Saved-view action');
  const type = text(action.type, 'action type', 80);
  const commandId = pattern(action.commandId, COMMAND_ID, 'command ID');
  if (type === 'saved-view.create') {
    exact(action, ['type', 'commandId', 'fileId', 'name', 'access', 'definition']);
    return { type, commandId, ...validateCreate(action) };
  }
  if (type === 'saved-view.update') {
    exact(action, [
      'type', 'commandId', 'viewId', 'expectedVersion', 'name', 'access', 'definition'
    ]);
    return { type, commandId, ...validateUpdate(action) };
  }
  if (type === 'saved-view.duplicate') {
    exact(action, ['type', 'commandId', 'viewId', 'name', 'access']);
    return { type, commandId, ...validateDuplicate(action) };
  }
  if (type === 'saved-view.delete') {
    exact(action, ['type', 'commandId', 'viewId', 'expectedVersion']);
    return { type, commandId, ...validateDelete(action) };
  }
  if (type === 'row-order.move') {
    exact(action, [
      'type', 'commandId', 'fileId', 'rowId', 'beforeRowId', 'afterRowId',
      'expectedVersion'
    ], ['beforeRowId', 'afterRowId']);
    return { type, commandId, ...validateMove(action) };
  }
  throw new Error('Saved-view action type is unsupported');
}

/**
 * Validate the create.
 */
export function validateCreate(input: Record<string, unknown>): CreateSavedViewInput {
  return {
    fileId: fileId(input.fileId),
    name: name(input.name),
    access: access(input.access),
    definition: validateDefinition(input.definition)
  };
}

/**
 * Validate the update.
 */
export function validateUpdate(input: Record<string, unknown>): UpdateSavedViewInput {
  return {
    viewId: pattern(input.viewId, VIEW_ID, 'view ID'),
    expectedVersion: positive(input.expectedVersion, 'view version'),
    name: name(input.name),
    access: access(input.access),
    definition: validateDefinition(input.definition)
  };
}

/**
 * Validate the duplicate.
 */
export function validateDuplicate(input: Record<string, unknown>) {
  return {
    viewId: pattern(input.viewId, VIEW_ID, 'view ID'),
    name: name(input.name),
    access: access(input.access)
  };
}

/**
 * Validate the delete.
 */
export function validateDelete(input: Record<string, unknown>) {
  return {
    viewId: pattern(input.viewId, VIEW_ID, 'view ID'),
    expectedVersion: positive(input.expectedVersion, 'view version')
  };
}

/**
 * Validate the move.
 */
export function validateMove(input: Record<string, unknown>): MoveRowInput {
  const beforeRowId = optionalPattern(input.beforeRowId, ROW_ID, 'before row ID');
  const afterRowId = optionalPattern(input.afterRowId, ROW_ID, 'after row ID');
  if (!beforeRowId && !afterRowId) throw new Error('A row move requires one stable neighbour');
  const rowId = pattern(input.rowId, ROW_ID, 'row ID');
  if (rowId === beforeRowId || rowId === afterRowId || beforeRowId === afterRowId) {
    throw new Error('A row move requires distinct stable rows');
  }
  return {
    fileId: fileId(input.fileId),
    rowId,
    ...(beforeRowId ? { beforeRowId } : {}),
    ...(afterRowId ? { afterRowId } : {}),
    expectedVersion: positive(input.expectedVersion, 'row-order version')
  };
}

/**
 * Validate the definition.
 */
export function validateDefinition(input: unknown): SavedViewDefinition {
  const value = object(input, 'Saved-view definition');
  exact(value, [
    'schemaVersion', 'columnOrder', 'hiddenColumnIds', 'sorts', 'filters',
    'presentation', 'includes'
  ]);
  if (value.schemaVersion !== 1) throw new Error('Saved-view schema version is unsupported');
  const columnOrder = columnIds(value.columnOrder, 'column order');
  const hiddenColumnIds = columnIds(value.hiddenColumnIds, 'hidden columns');
  const sorts = array(value.sorts, 'sorts', 16).map((entry) => {
    const sort = object(entry, 'sort');
    exact(sort, ['columnId', 'direction']);
    if (sort.direction !== 'asc' && sort.direction !== 'desc') {
      throw new Error('Saved-view sort direction is invalid');
    }
    return {
      columnId: pattern(sort.columnId, COLUMN_ID, 'sort column ID'),
      direction: sort.direction as 'asc' | 'desc'
    };
  });
  const filters = array(value.filters, 'filters', 32).map((entry) => {
    const filter = object(entry, 'filter');
    exact(filter, ['columnId', 'operation', 'value']);
    if (!['=', '!=', 'like', '<', '<=', '>', '>='].includes(String(filter.operation))) {
      throw new Error('Saved-view filter operation is invalid');
    }
    if (!['string', 'number', 'boolean'].includes(typeof filter.value) && filter.value !== null) {
      throw new Error('Saved-view filter value is invalid');
    }
    if (typeof filter.value === 'number' && !Number.isFinite(filter.value)) {
      throw new Error('Saved-view filter value is invalid');
    }
    if (typeof filter.value === 'string' && (
      filter.value.length > 2_000 || /[\u0000-\u001f\u007f]/.test(filter.value)
    )) throw new Error('Saved-view filter text is invalid');
    return {
      columnId: pattern(filter.columnId, COLUMN_ID, 'filter column ID'),
      operation: filter.operation as '=' | '!=' | 'like' | '<' | '<=' | '>' | '>=',
      value: filter.value as string | number | boolean | null
    };
  });
  const presentationInput = object(value.presentation, 'cell presentation');
  if (Object.keys(presentationInput).length > 10_000) {
    throw new Error('Saved-view cell presentation is too large');
  }
  const presentation = Object.fromEntries(Object.entries(presentationInput).map(([key, entry]) => {
    if (key.length > 700) throw new Error('Saved-view cell presentation key is invalid');
    const parsed = JSON.parse(key) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2
      || typeof parsed[0] !== 'string' || !ROW_ID.test(parsed[0])
      || typeof parsed[1] !== 'string' || !COLUMN_ID.test(parsed[1])) {
      throw new Error('Saved-view cell presentation key is invalid');
    }
    const style = object(entry, 'cell presentation entry');
    const allowed = [
      'fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'textColor',
      'fillColor', 'horizontal', 'vertical', 'wrap', 'border', 'borderColor',
      'borderStyle', 'numberFormat'
    ];
    exact(style, allowed, allowed);
    if (style.textColor !== undefined && !COLORS.test(String(style.textColor))) {
      throw new Error('Saved-view text color is invalid');
    }
    if (style.fillColor !== undefined && !COLORS.test(String(style.fillColor))) {
      throw new Error('Saved-view fill color is invalid');
    }
    if (style.borderColor !== undefined && !COLORS.test(String(style.borderColor))) {
      throw new Error('Saved-view border color is invalid');
    }
    enumValue(style.fontFamily, ['Arial', 'Georgia', 'Courier New'], 'font family');
    enumValue(style.fontSize, [10, 12, 14, 16, 18], 'font size');
    booleanValue(style.bold, 'bold');
    booleanValue(style.italic, 'italic');
    booleanValue(style.underline, 'underline');
    enumValue(style.horizontal, ['auto', 'left', 'center', 'right'], 'horizontal alignment');
    enumValue(style.vertical, ['top', 'middle', 'bottom'], 'vertical alignment');
    enumValue(style.wrap, ['wrap', 'clip', 'overflow'], 'wrapping');
    enumValue(style.border, [
      'none', 'all', 'inner', 'horizontal', 'vertical', 'outer',
      'left', 'top', 'right', 'bottom'
    ], 'border');
    enumValue(style.borderStyle, [
      'solid', 'medium', 'thick', 'dashed', 'dotted', 'double'
    ], 'border style');
    enumValue(style.numberFormat, [
      'automatic', 'number', 'currency', 'percent'
    ], 'number format');
    return [key, structuredClone(style)] as const;
  }));
  const includes = object(value.includes, 'saved-view includes');
  exact(includes, ['filtersAndSorting', 'columnLayout', 'cellPresentation']);
  if (Object.values(includes).some((entry) => typeof entry !== 'boolean')) {
    throw new Error('Saved-view include choices are invalid');
  }
  const known = new Set(columnOrder);
  if (hiddenColumnIds.some((id) => !known.has(id))
    || sorts.some((sort) => !known.has(sort.columnId))
    || filters.some((filter) => !known.has(filter.columnId))
    || Object.keys(presentation).some((key) => !known.has(JSON.parse(key)[1]))) {
    throw new Error('Saved-view state references a column outside its column order');
  }
  return {
    schemaVersion: 1,
    columnOrder,
    hiddenColumnIds,
    sorts,
    filters,
    presentation,
    includes: {
      filtersAndSorting: includes.filtersAndSorting as boolean,
      columnLayout: includes.columnLayout as boolean,
      cellPresentation: includes.cellPresentation as boolean
    }
  };
}

/**
 * Return the saved view slug result.
 */
export function savedViewSlug(nameValue: string, id: string) {
  const base = nameValue.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 64).replace(/-+$/g, '') || 'view';
  const suffix = id.slice(-8).toLocaleLowerCase().replaceAll('_', '0');
  return `${base}-${suffix}`;
}

/**
 * Return the file id result.
 */
function fileId(value: unknown) {
  return pattern(value, /^obj_[A-Za-z0-9_-]{32,64}$/, 'file ID');
}

/**
 * Return the name result.
 */
function name(value: unknown) {
  return text(value, 'view name', 120);
}

/**
 * Return the access result.
 */
function access(value: unknown): SavedViewAccess {
  if (value !== 'private' && value !== 'shared') throw new Error('Saved-view access is invalid');
  return value;
}

/**
 * Return the column ids result.
 */
function columnIds(value: unknown, label: string) {
  const entries = array(value, label, 256).map((entry) => pattern(entry, COLUMN_ID, `${label} ID`));
  if (new Set(entries).size !== entries.length) throw new Error(`Saved-view ${label} contains duplicates`);
  return entries;
}

/**
 * Return the object result.
 */
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Return the array result.
 */
function array(value: unknown, label: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Saved-view ${label} is invalid`);
  return value;
}

/**
 * Return the text result.
 */
function text(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || value !== value.trim() || !value.length
    || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Saved-view ${label} is invalid`);
  }
  return value;
}

/**
 * Return the pattern result.
 */
function pattern(value: unknown, expression: RegExp, label: string) {
  const output = text(value, label, 300);
  if (!expression.test(output)) throw new Error(`Saved-view ${label} is invalid`);
  return output;
}

/**
 * Return the optional pattern result.
 */
function optionalPattern(value: unknown, expression: RegExp, label: string) {
  return value === undefined ? undefined : pattern(value, expression, label);
}

/**
 * Return the positive result.
 */
function positive(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`Saved-view ${label} is invalid`);
  return Number(value);
}

/**
 * Return the enum value result.
 */
function enumValue(value: unknown, allowed: readonly unknown[], label: string) {
  if (value !== undefined && !allowed.includes(value)) {
    throw new Error(`Saved-view ${label} is invalid`);
  }
}

/**
 * Return the boolean value result.
 */
function booleanValue(value: unknown, label: string) {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`Saved-view ${label} is invalid`);
  }
}

/**
 * Return the exact result.
 */
function exact(
  value: Record<string, unknown>,
  allowed: string[],
  optional: string[] = []
) {
  if (Object.keys(value).some((key) => !allowed.includes(key))
    || allowed.some((key) => !optional.includes(key) && !(key in value))) {
    throw new Error('Saved-view input contains unsupported fields');
  }
}
