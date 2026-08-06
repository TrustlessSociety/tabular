//client
import type {
  ColumnDefault,
  DdlLiteral,
  FileDdlAction,
  FileFieldKind,
  FileFormatKind,
  FileStorageType
} from './contracts.js';

const storageTypes = new Set<FileStorageType>([
  'text', 'bigint', 'numeric', 'boolean', 'date', 'time', 'timestamptz', 'jsonb', 'uuid'
]);
const fieldKinds = new Set<FileFieldKind>([
  'text', 'long-text', 'number', 'email', 'url', 'phone', 'relation', 'select',
  'radio', 'suggest', 'price', 'switch', 'checkbox', 'date', 'date-time', 'time',
  'computed', 'slug', 'masked-text', 'color', 'country-code', 'currency-code',
  'rating', 'slider', 'tags', 'text-list', 'code-source', 'markdown-source'
]);
const formatKinds = new Set<FileFormatKind>([
  'plain', 'plain-text', 'email-link', 'clipped-text', 'clipped', 'wrapped',
  'text-transform', 'number', 'link', 'email', 'phone-link', 'related-record', 'badge',
  'currency', 'yes-no', 'date', 'date-time', 'time', 'relative-time', 'color',
  'country-label', 'currency-label', 'rating', 'tags', 'list', 'code-highlighting',
  'label'
]);

/**
 * Validate the file ddl action.
 */
export function validateFileDdlAction(input: FileDdlAction): FileDdlAction {
  if (!input || typeof input !== 'object') invalid('A structured file action is required');
  commandId(input.commandId);
  switch (input.type) {
    case 'file.create':
      exactKeys(input, ['type', 'commandId', 'schemaId', 'displayName', 'physicalName']);
      stableSchemaId(input.schemaId);
      displayName(input.displayName);
      if (input.physicalName) physicalIdentifier(input.physicalName);
      break;
    case 'file.rename':
      exactKeys(input, ['type', 'commandId', 'fileId', 'displayName', 'physicalName']);
      stableFileId(input.fileId);
      if (!input.displayName && !input.physicalName) invalid('A file rename needs a changed name');
      if (input.displayName) displayName(input.displayName);
      if (input.physicalName) physicalIdentifier(input.physicalName);
      break;
    case 'file.drop':
      exactKeys(input, ['type', 'commandId', 'fileId']);
      stableFileId(input.fileId);
      break;
    case 'column.create':
      exactKeys(input, [
        'type', 'commandId', 'fileId', 'displayName', 'physicalName',
        'storageType', 'field', 'format', 'fieldConfig', 'formatConfig', 'required', 'unique',
        'default', 'generated'
      ]);
      stableFileId(input.fileId);
      displayName(input.displayName);
      if (input.physicalName) physicalIdentifier(input.physicalName);
      columnAxes(input.storageType, input.field, input.format, input.fieldConfig);
      if (input.formatConfig) plainObject(input.formatConfig, 'Format configuration');
      optionalBoolean(input.required, 'Required');
      optionalBoolean(input.unique, 'Unique');
      if (input.default) validateDefault(input.storageType, input.default);
      if (input.generated) {
        exactKeys(input.generated, ['kind', 'columnIds', 'separator']);
        if (input.default) invalid('A generated column cannot also have a default');
        if (input.generated.kind !== 'concat-text' || input.storageType !== 'text') {
          invalid('Only generated text concatenation is supported');
        }
        stableColumnIds(input.generated.columnIds, 1, 32);
        generatedSeparator(input.generated.separator);
      }
      break;
    case 'column.configure':
      exactKeys(input, [
        'type', 'commandId', 'fileId', 'columnId', 'displayName', 'physicalName',
        'storageType', 'field', 'format', 'fieldConfig', 'formatConfig', 'required', 'unique', 'default'
      ]);
      stableFileId(input.fileId);
      stableColumnId(input.columnId);
      if (input.displayName) displayName(input.displayName);
      if (input.physicalName) physicalIdentifier(input.physicalName);
      if (input.storageType && !storageTypes.has(input.storageType)) invalid('Unsupported storage type');
      if (input.field && !fieldKinds.has(input.field)) invalid('Unsupported field');
      if (input.format && !formatKinds.has(input.format)) invalid('Unsupported format');
      if (input.fieldConfig) plainObject(input.fieldConfig, 'Field configuration');
      if (input.formatConfig) plainObject(input.formatConfig, 'Format configuration');
      optionalBoolean(input.required, 'Required');
      optionalBoolean(input.unique, 'Unique');
      if (input.default) validateDefault(input.storageType, input.default);
      if (!Object.keys(input).some((key) => !['type', 'commandId', 'fileId', 'columnId'].includes(key))) {
        invalid('A column configuration action needs a changed setting');
      }
      break;
    case 'column.drop':
      exactKeys(input, ['type', 'commandId', 'fileId', 'columnId']);
      stableFileId(input.fileId);
      stableColumnId(input.columnId);
      break;
    case 'key.create':
      exactKeys(input, ['type', 'commandId', 'fileId', 'columnIds', 'key']);
      stableFileId(input.fileId);
      stableColumnIds(input.columnIds, 1, 16);
      if (!['primary', 'unique'].includes(input.key)) invalid('Unsupported key kind');
      break;
    case 'relation.create':
      exactKeys(input, [
        'type', 'commandId', 'fileId', 'columnIds', 'targetFileId',
        'targetColumnIds', 'fieldConfig', 'formatConfig', 'onUpdate', 'onDelete'
      ]);
      stableFileId(input.fileId);
      stableFileId(input.targetFileId);
      stableColumnIds(input.columnIds, 1, 16);
      stableColumnIds(input.targetColumnIds, 1, 16);
      if (input.columnIds.length !== input.targetColumnIds.length) {
        invalid('Relation source and target arity must match');
      }
      if (input.fieldConfig) plainObject(input.fieldConfig, 'Field configuration');
      if (input.formatConfig) plainObject(input.formatConfig, 'Format configuration');
      if (input.onUpdate && !['NO ACTION', 'RESTRICT', 'CASCADE'].includes(input.onUpdate)) {
        invalid('Unsupported update action');
      }
      if (input.onDelete && !['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL'].includes(input.onDelete)) {
        invalid('Unsupported delete action');
      }
      break;
    case 'hidden.install':
      exactKeys(input, ['type', 'commandId', 'fileId', 'purpose']);
      stableFileId(input.fileId);
      if (!['row-id', 'unstructured-json', 'shared-rank'].includes(input.purpose)) {
        invalid('Unsupported hidden-field purpose');
      }
      break;
    case 'json.promote':
      exactKeys(input, [
        'type', 'commandId', 'fileId', 'hiddenColumnId', 'jsonKey', 'displayName',
        'physicalName', 'storageType', 'field', 'format', 'fieldConfig', 'formatConfig',
        'required', 'unique'
      ]);
      stableFileId(input.fileId);
      stableColumnId(input.hiddenColumnId);
      stableColumnId(input.jsonKey);
      displayName(input.displayName);
      if (input.physicalName) physicalIdentifier(input.physicalName);
      columnAxes(input.storageType, input.field, input.format, input.fieldConfig);
      if (input.formatConfig) plainObject(input.formatConfig, 'Format configuration');
      optionalBoolean(input.required, 'Required');
      optionalBoolean(input.unique, 'Unique');
      break;
    default:
      invalid('Unsupported file action');
  }
  return structuredClone(input);
}

/**
 * Validate the unstructured column.
 */
export function validateUnstructuredColumn(input: {
  fileId: string,
  displayName: string,
  field: FileFieldKind,
  format: FileFormatKind,
  fieldConfig?: Record<string, unknown>,
  formatConfig?: Record<string, unknown>,
}) {
  exactKeys(input, ['fileId', 'displayName', 'field', 'format', 'fieldConfig', 'formatConfig']);
  stableFileId(input.fileId);
  boundedText(input.displayName, 'Display name', 0, 200);
  if (!fieldKinds.has(input.field)) invalid('Unsupported field');
  if (!formatKinds.has(input.format)) invalid('Unsupported format');
  if (input.fieldConfig) plainObject(input.fieldConfig, 'Field configuration');
  if (input.formatConfig) plainObject(input.formatConfig, 'Format configuration');
  return structuredClone(input);
}

/**
 * Validate the column default for storage.
 */
export function validateColumnDefaultForStorage(
  storageType: FileStorageType,
  value: ColumnDefault
) {
  validateDefault(storageType, value);
}

/**
 * Return the physical identifier result.
 */
export function physicalIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value) || value === 'tabular' || value.startsWith('pg_')) {
    invalid('PostgreSQL names must be safe lower_case identifiers');
  }
  return value;
}

/**
 * Return the normalized physical name result.
 */
export function normalizedPhysicalName(value: string) {
  const normalized = value.normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 63);
  const prefixed = /^[a-z]/.test(normalized) ? normalized : `file_${normalized || 'untitled'}`;
  return physicalIdentifier(prefixed.slice(0, 63));
}

/**
 * Validate the default.
 */
function validateDefault(storageType: FileStorageType | undefined, value: { mode: string, value?: DdlLiteral, }) {
  exactKeys(value, ['mode', 'value']);
  if (!['drop', 'literal', 'current-timestamp', 'random-uuid'].includes(value.mode)) {
    invalid('Unsupported column default');
  }
  if (value.mode === 'literal') {
    if (!value.value) invalid('A literal default needs a typed value');
    if (storageType && value.value.type !== 'null' && value.value.type !== storageType) {
      invalid('The literal default must match the storage type');
    }
    validateLiteral(value.value);
  }
  if (value.mode === 'current-timestamp' && storageType && storageType !== 'timestamptz') {
    invalid('Current timestamp is only valid for timestamptz');
  }
  if (value.mode === 'random-uuid' && storageType && storageType !== 'uuid') {
    invalid('Random UUID is only valid for uuid');
  }
}

/**
 * Validate the literal.
 */
function validateLiteral(value: DdlLiteral) {
  exactKeys(value, ['type', 'value']);
  if (value.type === 'null') return;
  if (value.type === 'boolean') {
    if (typeof value.value !== 'boolean') invalid('Boolean defaults must be boolean');
    return;
  }
  boundedText(value.value, 'Default value', 0, 10_000);
  if (value.type === 'bigint' && !/^-?[0-9]+$/.test(value.value)) invalid('Invalid bigint default');
  if (value.type === 'numeric' && !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value.value)) {
    invalid('Invalid numeric default');
  }
  if (value.type === 'date' && !canonicalDate(value.value)) invalid('Invalid date default');
  if (value.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value.value)) {
    invalid('Invalid time default');
  }
  if (value.type === 'timestamptz' && !Number.isFinite(new Date(value.value).getTime())) {
    invalid('Invalid timestamp default');
  }
  if (value.type === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.value)) {
    invalid('Invalid UUID default');
  }
  if (value.type === 'jsonb') {
    try { JSON.parse(value.value); } catch { invalid('Invalid JSON default'); }
  }
}

/**
 * Return the canonical date result.
 */
function canonicalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Return the column axes result.
 */
function columnAxes(
  storage: FileStorageType,
  field: FileFieldKind,
  format: FileFormatKind,
  config?: Record<string, unknown>
) {
  if (!storageTypes.has(storage)) invalid('Unsupported storage type');
  if (!fieldKinds.has(field)) invalid('Unsupported field');
  if (!formatKinds.has(format)) invalid('Unsupported format');
  if (config) plainObject(config, 'Field configuration');
}

/**
 * Return the display name result.
 */
function displayName(value: string) { boundedText(value, 'Display name', 1, 200); }
/**
 * Return the optional boolean result.
 */
function optionalBoolean(value: boolean | undefined, label: string) {
  if (typeof value !== 'undefined' && typeof value !== 'boolean') invalid(`${label} must be boolean`);
}
/**
 * Return the command id result.
 */
function commandId(value: string) {
  if (!/^cmd_[A-Za-z0-9_-]{8,96}$/.test(value)) invalid('Invalid command identity');
}
/**
 * Return the stable schema id result.
 */
function stableSchemaId(value: string) {
  if (!/^schema_[A-Za-z0-9_-]{32,64}$/.test(value)) invalid('Invalid schema identity');
}
/**
 * Return the stable file id result.
 */
function stableFileId(value: string) {
  if (!/^obj_[A-Za-z0-9_-]{32,64}$/.test(value)) invalid('Invalid file identity');
}
/**
 * Return the stable column id result.
 */
function stableColumnId(value: string) {
  if (!/^col_[A-Za-z0-9_-]{32,64}$/.test(value)) invalid('Invalid column identity');
}
/**
 * Return the stable column ids result.
 */
function stableColumnIds(values: string[], minimum: number, maximum: number) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    invalid('Invalid column identity list');
  }
  values.forEach(stableColumnId);
  if (new Set(values).size !== values.length) invalid('Column identities must be unique');
}
/**
 * Return the plain object result.
 */
function plainObject(value: Record<string, unknown>, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    invalid(`${label} must be a plain object`);
  }
  if (JSON.stringify(value).length > 20_000) invalid(`${label} is too large`);
}
/**
 * Return the exact keys result.
 */
function exactKeys(value: object, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    invalid('Structured file actions must use plain objects');
  }
  const allowlist = new Set(allowed);
  if (Object.keys(value).some((key) => !allowlist.has(key))) {
    invalid('Structured file actions cannot contain unknown fields');
  }
}
/**
 * Return the bounded text result.
 */
function boundedText(value: string, label: string, minimum: number, maximum: number) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < minimum
    || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    invalid(`${label} is invalid`);
  }
}
/**
 * Return the generated separator result.
 */
function generatedSeparator(value: string) {
  if (typeof value !== 'string' || value.length > 32 || /[\u0000-\u001f\u007f]/.test(value)) {
    invalid('Generated separator is invalid');
  }
}
/**
 * Return the invalid result.
 */
function invalid(message: string): never { throw new Error(message); }
