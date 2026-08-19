//client
import type {
  ColumnPresentationUpdate,
  FileFieldKind,
  FileFormatKind,
  FileStorageType,
  ValidatorConfig,
  ValidatorRuleKind
} from './contracts.js';

//The canonical value families shared by Fields, Formats, and validators
export type CanonicalValueFamily =
  | 'text'
  | 'whole-number'
  | 'exact-decimal'
  | 'boolean'
  | 'date'
  | 'time'
  | 'instant'
  | 'identifier'
  | 'json-object'
  | 'json-string-array';

//The stable Field definition used by every compatibility caller
export type FieldDefinition = {
  family: CanonicalValueFamily,
  storage: readonly FileStorageType[],
  defaultStorage: FileStorageType,
  defaultFormat: FileFormatKind,
};

//The stable Format definition used by every compatibility caller
export type FormatDefinition = {
  storage: readonly FileStorageType[],
  refinedJsonShape?: 'object' | 'string-array',
};

//The immutable empty validator metadata written by new columns
export const EMPTY_VALIDATOR_CONFIG: ValidatorConfig = Object.freeze({
  version: 1,
  rules: []
});

//The storage registry is the closed first-slice PostgreSQL set
export const FILE_STORAGE_TYPES = [
  'text',
  'bigint',
  'numeric',
  'boolean',
  'date',
  'time',
  'timestamptz',
  'jsonb',
  'uuid'
] as const satisfies readonly FileStorageType[];

const textStorage = ['text'] as const;
const numberStorage = ['bigint', 'numeric'] as const;
const scalarOptionStorage = ['text', 'bigint', 'numeric', 'uuid'] as const;
const everyStorage = FILE_STORAGE_TYPES;

//The Field registry owns defaults instead of letting UI fallthrough choose axes
export const FIELD_REGISTRY: Record<FileFieldKind, FieldDefinition> = {
  text: field('text', textStorage, 'text', 'plain-text'),
  'long-text': field('text', textStorage, 'text', 'wrapped'),
  number: field('exact-decimal', numberStorage, 'numeric', 'number'),
  email: field('text', textStorage, 'text', 'email-link'),
  url: field('text', textStorage, 'text', 'link'),
  phone: field('text', textStorage, 'text', 'phone-link'),
  relation: field('identifier', scalarOptionStorage, 'uuid', 'related-record'),
  select: field('text', scalarOptionStorage, 'text', 'label'),
  radio: field('text', scalarOptionStorage, 'text', 'label'),
  suggest: field('text', textStorage, 'text', 'plain-text'),
  price: field('exact-decimal', ['numeric'], 'numeric', 'number'),
  switch: field('boolean', ['boolean'], 'boolean', 'yes-no'),
  checkbox: field('boolean', ['boolean'], 'boolean', 'yes-no'),
  date: field('date', ['date'], 'date', 'date'),
  'date-time': field('instant', ['timestamptz'], 'timestamptz', 'date-time'),
  time: field('time', ['time'], 'time', 'time'),
  computed: field('text', textStorage, 'text', 'plain-text'),
  slug: field('text', textStorage, 'text', 'plain-text'),
  'masked-text': field('text', textStorage, 'text', 'plain-text'),
  color: field('text', textStorage, 'text', 'color'),
  'country-code': field('text', textStorage, 'text', 'country-label'),
  'currency-code': field('text', textStorage, 'text', 'currency-label'),
  rating: field('exact-decimal', numberStorage, 'numeric', 'rating'),
  slider: field('exact-decimal', numberStorage, 'numeric', 'number'),
  metadata: field('json-object', ['jsonb'], 'jsonb', 'metadata'),
  tags: field('json-string-array', ['jsonb'], 'jsonb', 'tags'),
  'text-list': field('json-string-array', ['jsonb'], 'jsonb', 'list'),
  'multi-select': field('json-string-array', ['jsonb'], 'jsonb', 'tags'),
  'checkbox-list': field('json-string-array', ['jsonb'], 'jsonb', 'list'),
  'code-source': field('text', textStorage, 'text', 'code-highlighting'),
  'markdown-source': field('text', textStorage, 'text', 'plain-text')
};

//The Format registry is independent from Field defaults and never changes data
export const FORMAT_REGISTRY: Record<FileFormatKind, FormatDefinition> = {
  plain: format(everyStorage),
  'plain-text': format(everyStorage),
  'email-link': format(textStorage),
  'clipped-text': format(textStorage),
  clipped: format(textStorage),
  wrapped: format(textStorage),
  'text-transform': format(textStorage),
  number: format(numberStorage),
  link: format(textStorage),
  email: format(textStorage),
  'phone-link': format(textStorage),
  'related-record': format(scalarOptionStorage),
  badge: format(scalarOptionStorage),
  currency: format(numberStorage),
  'yes-no': format(['boolean']),
  date: format(['date', 'timestamptz']),
  'date-time': format(['timestamptz']),
  time: format(['time', 'timestamptz']),
  'relative-time': format(['date', 'timestamptz']),
  color: format(textStorage),
  'country-label': format(textStorage),
  'currency-label': format(textStorage),
  rating: format(numberStorage),
  tags: format(['jsonb'], 'string-array'),
  list: format(['jsonb'], 'string-array'),
  spread: format(['jsonb'], 'string-array'),
  metadata: format(['jsonb'], 'object'),
  markdown: format(textStorage),
  'code-highlighting': format(textStorage),
  label: format(scalarOptionStorage)
};

//The configured validator kinds are a closed versioned public registry
export const VALIDATOR_RULE_KINDS = [
  'not_empty', 'equals', 'not_equals', 'one_of', 'starts_with', 'ends_with',
  'pattern', 'min_length', 'max_length', 'exact_length', 'min_words',
  'max_words', 'exact_words', 'email_shape', 'url_shape', 'hex_shape',
  'min_value', 'max_value', 'integer_value', 'multiple_of', 'before', 'after',
  'past', 'future', 'today', 'min_items', 'max_items', 'exact_items',
  'unique_items', 'items', 'required_keys', 'allowed_keys', 'properties'
] as const satisfies readonly ValidatorRuleKind[];

const storageSet = new Set<FileStorageType>(FILE_STORAGE_TYPES);
const fieldSet = new Set<FileFieldKind>(
  Object.keys(FIELD_REGISTRY) as FileFieldKind[]
);
const formatSet = new Set<FileFormatKind>(
  Object.keys(FORMAT_REGISTRY) as FileFormatKind[]
);
const validatorSet = new Set<ValidatorRuleKind>(VALIDATOR_RULE_KINDS);

/**
 * Return the recommended axes for a selected Field without writing a value.
 */
export function recommendedColumnAxes(fieldKind: FileFieldKind) {
  const definition = FIELD_REGISTRY[fieldKind];
  if (!definition) throw new Error('Unsupported field');
  return {
    storageType: definition.defaultStorage,
    format: definition.defaultFormat
  };
}

/**
 * Report whether a complete storage, Field, and Format combination is valid.
 */
export function columnAxesAreCompatible(
  storageType: FileStorageType,
  fieldKind: FileFieldKind,
  formatKind: FileFormatKind
) {
  const fieldDefinition = FIELD_REGISTRY[fieldKind];
  const formatDefinition = FORMAT_REGISTRY[formatKind];
  return Boolean(
    storageSet.has(storageType)
    && fieldDefinition?.storage.includes(storageType)
    && formatDefinition?.storage.includes(storageType)
    && jsonShapeIsCompatible(fieldDefinition, formatDefinition)
  );
}

/**
 * Validate a complete compatibility combination and retain its stable shape.
 */
export function validateColumnAxes(
  storageType: FileStorageType,
  fieldKind: FileFieldKind,
  formatKind: FileFormatKind
) {
  if (!storageSet.has(storageType)) throw new Error('Unsupported storage type');
  if (!fieldSet.has(fieldKind)) throw new Error('Unsupported field');
  if (!formatSet.has(formatKind)) throw new Error('Unsupported format');
  if (!columnAxesAreCompatible(storageType, fieldKind, formatKind)) {
    throw new Error('The storage, Field, and Format combination is incompatible');
  }
  return { storageType, field: fieldKind, format: formatKind };
}

/**
 * Validate the versioned validator metadata envelope before persistence.
 */
export function validateValidatorConfig(input: ValidatorConfig): ValidatorConfig {
  plainObject(input, 'Validator configuration', 100_000);
  exactKeys(input, ['version', 'rules'], 'Validator configuration');
  if (input.version !== 1 || !Array.isArray(input.rules) || input.rules.length > 64) {
    throw new Error('Validator configuration must use version 1 with up to 64 rules');
  }

  const ids = new Set<string>();
  const definitions = new Set<string>();
  for (const rule of input.rules) {
    plainObject(rule, 'Validator rule', 20_000);
    exactKeys(rule, ['id', 'kind', 'args', 'message'], 'Validator rule');
    if (!/^vr_[A-Za-z0-9_-]{8,96}$/.test(rule.id) || ids.has(rule.id)) {
      throw new Error('Validator rule identities must be stable and unique');
    }
    if (!validatorSet.has(rule.kind)) throw new Error('Unsupported validator rule');
    plainObject(rule.args, 'Validator arguments', 20_000);
    if (typeof rule.message !== 'undefined') boundedMessage(rule.message);

    const definition = JSON.stringify([rule.kind, stableObject(rule.args)]);
    if (definitions.has(definition)) throw new Error('Duplicate validators are not allowed');
    ids.add(rule.id);
    definitions.add(definition);
  }
  return structuredClone(input);
}

/**
 * Validate one metadata-only column presentation update.
 */
export function validateColumnPresentationUpdate(
  input: ColumnPresentationUpdate
): ColumnPresentationUpdate {
  plainObject(input, 'Column presentation update', 150_000);
  exactKeys(input, [
    'fileId', 'columnId', 'expectedMetadataVersion', 'storageType', 'field',
    'format', 'fieldConfig', 'formatConfig', 'validatorConfig'
  ], 'Column presentation update');
  if (!/^obj_[A-Za-z0-9_-]{32,64}$/.test(input.fileId)) {
    throw new Error('Invalid file identity');
  }
  if (!/^col_[A-Za-z0-9_-]{32,64}$/.test(input.columnId)) {
    throw new Error('Invalid column identity');
  }
  if (!Number.isSafeInteger(input.expectedMetadataVersion)
    || input.expectedMetadataVersion < 1) {
    throw new Error('Invalid column metadata version');
  }
  validateColumnAxes(input.storageType, input.field, input.format);
  plainObject(input.fieldConfig, 'Field configuration', 20_000);
  plainObject(input.formatConfig, 'Format configuration', 20_000);
  validateValidatorConfig(input.validatorConfig);
  return structuredClone(input);
}

/**
 * Normalize a supported PostgreSQL catalog type into the stable storage ID.
 */
export function fileStorageTypeForPostgres(value: string): FileStorageType | undefined {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (['text', 'character varying', 'character'].some((type) => normalized.startsWith(type))) {
    return 'text';
  }
  if (normalized === 'bigint') return 'bigint';
  if (normalized.startsWith('numeric')) return 'numeric';
  if (normalized === 'boolean') return 'boolean';
  if (normalized === 'date') return 'date';
  if (normalized.startsWith('time without time zone')) return 'time';
  if (normalized.startsWith('timestamp with time zone')) return 'timestamptz';
  if (normalized === 'jsonb') return 'jsonb';
  if (normalized === 'uuid') return 'uuid';
  return undefined;
}

/**
 * Build one Field registry entry.
 */
function field(
  family: CanonicalValueFamily,
  storage: readonly FileStorageType[],
  defaultStorage: FileStorageType,
  defaultFormat: FileFormatKind
): FieldDefinition {
  return { family, storage, defaultStorage, defaultFormat };
}

/**
 * Build one Format registry entry.
 */
function format(
  storage: readonly FileStorageType[],
  refinedJsonShape?: 'object' | 'string-array'
): FormatDefinition {
  return { storage, ...(refinedJsonShape ? { refinedJsonShape } : {}) };
}

/**
 * Keep JSON object and string-array renderers on the matching refined Field.
 */
function jsonShapeIsCompatible(fieldDefinition: FieldDefinition, formatDefinition: FormatDefinition) {
  if (!formatDefinition.refinedJsonShape) return true;
  return fieldDefinition.family === `json-${formatDefinition.refinedJsonShape}`;
}

/**
 * Validate a plain metadata object and its serialized bound.
 */
function plainObject(value: object, label: string, maximumBytes: number): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maximumBytes) {
    throw new Error(`${label} is too large`);
  }
}

/**
 * Keep metadata envelopes closed against accidental executable fields.
 */
function exactKeys(value: object, allowed: string[], label: string) {
  const allowlist = new Set(allowed);
  if (Object.keys(value).some((key) => !allowlist.has(key))) {
    throw new Error(`${label} contains an unknown field`);
  }
}

/**
 * Validate optional user-authored failure messages as bounded plain text.
 */
function boundedMessage(value: string) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1
    || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Validator messages must be bounded plain text');
  }
}

/**
 * Sort object keys so duplicate rule definitions compare deterministically.
 */
function stableObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
}
