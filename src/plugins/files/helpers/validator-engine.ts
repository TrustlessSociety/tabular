//client
import type { CanonicalJsonValue } from '../../capability/helpers/value-contracts.js';
import type {
  FileFieldKind,
  FileStorageType,
  ValidatorConfig,
  ValidatorRuleConfig,
  ValidatorRuleKind
} from './contracts.js';
import {
  FIELD_REGISTRY,
  VALIDATOR_RULE_KINDS,
  validateValidatorConfig
} from './field-registry.js';

export type ValidatorSource = 'storage' | 'field' | 'configured';

export type ValidatorFailure = {
  ruleId: string,
  kind: string,
  source: ValidatorSource,
  code: string,
  message: string,
  path: string | null,
};

export type ValidatorResult = {
  valid: boolean,
  failures: ValidatorFailure[],
  overflow: number,
};

export type ValidatorColumnDefinition = {
  storageType: FileStorageType,
  field: FileFieldKind,
  fieldConfig: Record<string, unknown>,
  validatorConfig: ValidatorConfig,
};

export type ValidatorEvaluationContext = {
  now?: string | Date,
  timezone?: string,
};

type ImpliedRuleKind =
  | 'storage_text'
  | 'storage_bigint'
  | 'storage_numeric'
  | 'storage_boolean'
  | 'storage_date'
  | 'storage_time'
  | 'storage_timestamptz'
  | 'storage_jsonb'
  | 'storage_uuid'
  | 'json_object_shape'
  | 'json_string_array_shape'
  | 'json_scalar_properties'
  | 'non_empty_items'
  | 'slug_shape'
  | 'color_shape'
  | 'country_code_shape'
  | 'currency_code_shape'
  | 'option_membership';

export type CompiledValidatorRule = {
  id: string,
  kind: ValidatorRuleKind | ImpliedRuleKind,
  args: Record<string, unknown>,
  message?: string,
  source: ValidatorSource,
};

export type CompiledValidatorPlan = {
  storageType: FileStorageType,
  field: FileFieldKind,
  rules: readonly CompiledValidatorRule[],
};

const FAILURE_LIMIT = 8;
const MAX_TEXT_LENGTH = 100_000;
const MAX_JSON_BYTES = 100_000;
const MAX_JSON_DEPTH = 8;
const MAX_PATTERN_LENGTH = 128;
const MAX_PATTERN_INPUT = 10_000;
const MAX_RULE_ITEMS = 256;
const BIGINT_MIN = -9223372036854775808n;
const BIGINT_MAX = 9223372036854775807n;

const defaultMessages: Record<string, string> = {
  invalid_storage_value: 'The value is not valid for this PostgreSQL storage type',
  value_is_empty: 'The value must not be empty',
  value_must_equal: 'The value does not equal the configured value',
  value_must_differ: 'The value must differ from the configured value',
  value_not_allowed: 'The value is not in the allowed set',
  prefix_missing: 'The value does not start with the required text',
  suffix_missing: 'The value does not end with the required text',
  pattern_mismatch: 'The value does not match the configured pattern',
  length_below_minimum: 'The value is shorter than the configured minimum',
  length_above_maximum: 'The value is longer than the configured maximum',
  length_not_exact: 'The value does not have the configured length',
  words_below_minimum: 'The value has fewer words than the configured minimum',
  words_above_maximum: 'The value has more words than the configured maximum',
  words_not_exact: 'The value does not have the configured word count',
  invalid_email_shape: 'The value is not a valid email shape',
  invalid_url_shape: 'The value is not a valid URL shape',
  invalid_hex_shape: 'The value is not a valid hexadecimal shape',
  value_below_minimum: 'The value is below the configured minimum',
  value_above_maximum: 'The value is above the configured maximum',
  value_not_integer: 'The value must be an integer',
  value_not_multiple: 'The value is not a multiple of the configured step',
  value_not_before: 'The value is not before the configured value',
  value_not_after: 'The value is not after the configured value',
  value_not_past: 'The value must be in the past',
  value_not_future: 'The value must be in the future',
  value_not_today: 'The value must be today',
  items_below_minimum: 'The collection has too few items',
  items_above_maximum: 'The collection has too many items',
  items_not_exact: 'The collection does not have the configured item count',
  duplicate_items: 'The collection contains duplicate items',
  required_key_missing: 'The object is missing a required key',
  key_not_allowed: 'The object contains a key that is not allowed',
  invalid_json_shape: 'The JSON value does not match the selected Field shape',
  invalid_json_property: 'Metadata values must be JSON scalars',
  empty_collection_item: 'Collection items must not be empty',
  invalid_slug_shape: 'The value is not a valid slug',
  invalid_color_shape: 'The value is not a valid color',
  invalid_country_code: 'The value is not an ISO country-code shape',
  invalid_currency_code: 'The value is not an ISO currency-code shape'
};

/**
 * Validate metadata definitions, reject contradictions, and compose the locked
 * storage and Field rules before configured rules.
 */
export function compileValidatorPlan(
  definition: ValidatorColumnDefinition
): CompiledValidatorPlan {
  const fieldDefinition = FIELD_REGISTRY[definition.field];
  if (!fieldDefinition?.storage.includes(definition.storageType)) {
    throw new Error('The validator Field is incompatible with storage');
  }
  plainObject(definition.fieldConfig, 'Field configuration');
  const config = validateValidatorConfig(definition.validatorConfig);
  config.rules.forEach((rule) => validateRule(rule, definition.storageType, definition.field, 0));
  rejectContradictions(config.rules, definition.storageType, definition.field);

  const rules: CompiledValidatorRule[] = [storageRule(definition.storageType)];
  rules.push(...fieldRules(definition.storageType, definition.field, definition.fieldConfig));
  rules.push(...config.rules.map((rule) => ({ ...structuredClone(rule), source: 'configured' as const })));
  rejectContradictions(
    rules.filter((rule): rule is CompiledValidatorRule & { kind: ValidatorRuleKind } =>
      isConfiguredKind(rule.kind)),
    definition.storageType,
    definition.field
  );
  return Object.freeze({
    storageType: definition.storageType,
    field: definition.field,
    rules: Object.freeze(rules.map((rule) => Object.freeze(rule)))
  });
}

/** Validate one canonical cell value without coercion or mutation. */
export function validateCanonicalValue(
  plan: CompiledValidatorPlan,
  value: unknown,
  context: ValidatorEvaluationContext = {}
): ValidatorResult {
  if (value === null) return { valid: true, failures: [], overflow: 0 };
  const collector = new FailureCollector();
  const parsedJson = plan.storageType === 'jsonb' ? parseCanonicalJson(value) : undefined;
  for (const rule of plan.rules) {
    evaluateRule(rule, value, plan.storageType, null, context, collector, parsedJson);
  }
  return collector.result();
}

/** Compile and evaluate a column in one call for action/grid integration. */
export function validateColumnValue(
  definition: ValidatorColumnDefinition,
  value: unknown,
  context: ValidatorEvaluationContext = {}
) {
  return validateCanonicalValue(compileValidatorPlan(definition), value, context);
}

/** Return the closed configured-rule subset compatible with one column. */
export function compatibleValidatorRuleKinds(
  storageType: FileStorageType,
  field: FileFieldKind
) {
  return VALIDATOR_RULE_KINDS.filter((kind) => compatibleRule(kind, storageType, field));
}

function storageRule(storageType: FileStorageType): CompiledValidatorRule {
  return {
    id: `storage:${storageType}`,
    kind: `storage_${storageType}` as ImpliedRuleKind,
    args: {},
    source: 'storage'
  };
}

function fieldRules(
  storageType: FileStorageType,
  field: FileFieldKind,
  config: Record<string, unknown>
): CompiledValidatorRule[] {
  const rules: CompiledValidatorRule[] = [];
  const add = (kind: CompiledValidatorRule['kind'], args: Record<string, unknown> = {}) => {
    rules.push({ id: `field:${field}:${kind}`, kind, args, source: 'field' });
  };
  if (field === 'metadata') {
    add('json_object_shape');
    add('json_scalar_properties');
  }
  if (['tags', 'text-list', 'multi-select', 'checkbox-list'].includes(field)) {
    add('json_string_array_shape');
  }
  if (field === 'tags') {
    add('non_empty_items');
    add('unique_items');
  }
  if (field === 'email') add('email_shape');
  if (field === 'slug') add('slug_shape');
  if (field === 'color') add('color_shape', colorArgs(config));
  if (field === 'country-code') add('country_code_shape');
  if (field === 'currency-code') add('currency_code_shape');
  if (['country-code', 'currency-code'].includes(field)) {
    const codes = stringArray(config.codes);
    if (codes) add('option_membership', { values: codes });
  }

  const options = stringArray(config.options);
  const restricted = config.restricted === true || field === 'checkbox-list';
  if (restricted && options) add('option_membership', { values: options });

  if (['rating', 'slider'].includes(field)) {
    if (typeof config.min === 'string') add('min_value', { value: config.min, inclusive: true });
    if (typeof config.max === 'string') add('max_value', { value: config.max, inclusive: true });
    if (typeof config.step === 'string') add('multiple_of', { value: config.step });
  }
  rules.forEach((rule) => {
    if (isConfiguredKind(rule.kind)) {
      validateRule(rule as CompiledValidatorRule & { kind: ValidatorRuleKind }, storageType, field, 0);
    }
  });
  return rules;
}

function colorArgs(config: Record<string, unknown>) {
  return typeof config.mode === 'string' ? { mode: config.mode } : {};
}

function evaluateRule(
  rule: CompiledValidatorRule,
  value: unknown,
  storageType: FileStorageType,
  path: string | null,
  context: ValidatorEvaluationContext,
  collector: FailureCollector,
  suppliedJson?: ExactJson | JsonParseFailure
): void {
  if (value === null) return;
  const fail = (code: string, failurePath = path, ruleOverride = rule) => {
    collector.add({
      ruleId: ruleOverride.id,
      kind: ruleOverride.kind,
      source: ruleOverride.source,
      code,
      message: ruleOverride.message ?? defaultMessages[code] ?? 'The value is invalid',
      path: failurePath
    });
  };
  const json = suppliedJson ?? (storageType === 'jsonb' ? parseCanonicalJson(value) : undefined);

  switch (rule.kind) {
    case 'storage_text':
      if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) fail('invalid_storage_value');
      return;
    case 'storage_bigint': {
      const parsed = typeof value === 'string' ? parseInteger(value) : undefined;
      if (parsed === undefined || parsed < BIGINT_MIN || parsed > BIGINT_MAX) fail('invalid_storage_value');
      return;
    }
    case 'storage_numeric':
      if (typeof value !== 'string' || !parseDecimal(value)) fail('invalid_storage_value');
      return;
    case 'storage_boolean':
      if (typeof value !== 'boolean') fail('invalid_storage_value');
      return;
    case 'storage_date':
      if (typeof value !== 'string' || !dateKey(value)) fail('invalid_storage_value');
      return;
    case 'storage_time':
      if (typeof value !== 'string' || timeKey(value) === undefined) fail('invalid_storage_value');
      return;
    case 'storage_timestamptz':
      if (typeof value !== 'string' || instantKey(value) === undefined) fail('invalid_storage_value');
      return;
    case 'storage_uuid':
      if (typeof value !== 'string' || !uuid(value)) fail('invalid_storage_value');
      return;
    case 'storage_jsonb':
      if (!json || json.kind === 'failure') fail('invalid_storage_value');
      return;
    case 'json_object_shape':
      if (!json || json.kind !== 'object') fail('invalid_json_shape');
      return;
    case 'json_string_array_shape':
      if (!json || json.kind !== 'array' || json.items.some((item) => item.kind !== 'string')) {
        fail('invalid_json_shape');
      }
      return;
    case 'json_scalar_properties':
      if (json?.kind === 'object') {
        for (const [key, item] of json.entries) {
          if (item.kind === 'array' || item.kind === 'object') fail('invalid_json_property', pathForKey(key));
        }
      }
      return;
    case 'non_empty_items':
      if (json?.kind === 'array') {
        json.items.forEach((item, index) => {
          if (item.kind === 'string' && item.value.length === 0) fail('empty_collection_item', `$[${index}]`);
        });
      }
      return;
    case 'slug_shape':
      if (typeof value === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) fail('invalid_slug_shape');
      return;
    case 'color_shape':
      if (typeof value === 'string' && !color(value, rule.args.mode)) fail('invalid_color_shape');
      return;
    case 'country_code_shape':
      if (typeof value === 'string' && !/^[A-Z]{2}$/.test(value)) fail('invalid_country_code');
      return;
    case 'currency_code_shape':
      if (typeof value === 'string' && !/^[A-Z]{3}$/.test(value)) fail('invalid_currency_code');
      return;
    case 'option_membership':
      evaluateOptionMembership(rule, value, json, fail);
      return;
  }

  evaluateConfiguredRule(rule, value, storageType, path, context, collector, json, fail);
}

function evaluateConfiguredRule(
  rule: CompiledValidatorRule,
  value: unknown,
  storageType: FileStorageType,
  path: string | null,
  context: ValidatorEvaluationContext,
  collector: FailureCollector,
  json: ExactJson | JsonParseFailure | undefined,
  fail: (code: string, path?: string | null, rule?: CompiledValidatorRule) => void
) {
  const count = countArgument(rule);
  switch (rule.kind) {
    case 'not_empty':
      if (isEmpty(value, json)) fail('value_is_empty');
      return;
    case 'equals':
      if (!equalTyped(value, rule.args.value, storageType, json)) fail('value_must_equal');
      return;
    case 'not_equals':
      if (equalTyped(value, rule.args.value, storageType, json)) fail('value_must_differ');
      return;
    case 'one_of':
      if (!(rule.args.values as unknown[]).some((candidate) => equalTyped(value, candidate, storageType, json))) {
        fail('value_not_allowed');
      }
      return;
    case 'starts_with':
      if (typeof value === 'string' && !value.startsWith(rule.args.text as string)) fail('prefix_missing');
      return;
    case 'ends_with':
      if (typeof value === 'string' && !value.endsWith(rule.args.text as string)) fail('suffix_missing');
      return;
    case 'pattern':
      if (typeof value === 'string' && !wildcardMatch(rule.args.pattern as string, value)) fail('pattern_mismatch');
      return;
    case 'min_length':
      if (typeof value === 'string' && codePointLength(value) < count) fail('length_below_minimum');
      return;
    case 'max_length':
      if (typeof value === 'string' && codePointLength(value) > count) fail('length_above_maximum');
      return;
    case 'exact_length':
      if (typeof value === 'string' && codePointLength(value) !== count) fail('length_not_exact');
      return;
    case 'min_words':
      if (typeof value === 'string' && wordCount(value) < count) fail('words_below_minimum');
      return;
    case 'max_words':
      if (typeof value === 'string' && wordCount(value) > count) fail('words_above_maximum');
      return;
    case 'exact_words':
      if (typeof value === 'string' && wordCount(value) !== count) fail('words_not_exact');
      return;
    case 'email_shape':
      if (typeof value === 'string' && !email(value)) fail('invalid_email_shape');
      return;
    case 'url_shape':
      if (typeof value === 'string' && !safeUrl(value, rule.args.protocols as string[] | undefined)) {
        fail('invalid_url_shape');
      }
      return;
    case 'hex_shape':
      if (typeof value === 'string' && !hex(value, rule.args)) fail('invalid_hex_shape');
      return;
    case 'min_value':
    case 'max_value':
    case 'integer_value':
    case 'multiple_of':
      evaluateNumeric(rule, value, fail);
      return;
    case 'before':
    case 'after':
    case 'past':
    case 'future':
    case 'today':
      evaluateTemporal(rule, value, storageType, context, fail);
      return;
    case 'min_items':
      if (json?.kind === 'array' && json.items.length < count) fail('items_below_minimum');
      return;
    case 'max_items':
      if (json?.kind === 'array' && json.items.length > count) fail('items_above_maximum');
      return;
    case 'exact_items':
      if (json?.kind === 'array' && json.items.length !== count) fail('items_not_exact');
      return;
    case 'unique_items':
      if (json?.kind === 'array' && new Set(json.items.map(jsonKey)).size !== json.items.length) {
        fail('duplicate_items');
      }
      return;
    case 'items':
      if (json?.kind === 'array') evaluateItemRules(rule, json, context, collector);
      return;
    case 'required_keys':
      if (json?.kind === 'object') {
        const keys = new Set(json.entries.map(([key]) => key));
        for (const key of rule.args.keys as string[]) if (!keys.has(key)) fail('required_key_missing', pathForKey(key));
      }
      return;
    case 'allowed_keys':
      if (json?.kind === 'object') {
        const allowed = new Set(rule.args.keys as string[]);
        for (const [key] of json.entries) if (!allowed.has(key)) fail('key_not_allowed', pathForKey(key));
      }
      return;
    case 'properties':
      if (json?.kind === 'object') evaluatePropertyRules(rule, json, context, collector);
      return;
  }
}

function evaluateOptionMembership(
  rule: CompiledValidatorRule,
  value: unknown,
  json: ExactJson | JsonParseFailure | undefined,
  fail: (code: string, path?: string | null) => void
) {
  const allowed = new Set(rule.args.values as string[]);
  if (json?.kind === 'array') {
    json.items.forEach((item, index) => {
      if (item.kind === 'string' && !allowed.has(item.value)) fail('value_not_allowed', `$[${index}]`);
    });
  } else if (typeof value === 'string' && !allowed.has(value)) {
    fail('value_not_allowed');
  }
}

function evaluateNumeric(
  rule: CompiledValidatorRule,
  value: unknown,
  fail: (code: string) => void
) {
  if (typeof value !== 'string') return;
  const actual = parseDecimal(value);
  if (!actual) return;
  if (rule.kind === 'integer_value') {
    if (actual.scale !== 0 && actual.coefficient % 10n ** BigInt(actual.scale) !== 0n) fail('value_not_integer');
    return;
  }
  const expected = parseDecimal(rule.args.value as string);
  if (!expected) return;
  const comparison = compareDecimal(actual, expected);
  const inclusive = rule.args.inclusive !== false;
  if (rule.kind === 'min_value' && (comparison < 0 || (!inclusive && comparison === 0))) {
    fail('value_below_minimum');
  }
  if (rule.kind === 'max_value' && (comparison > 0 || (!inclusive && comparison === 0))) {
    fail('value_above_maximum');
  }
  if (rule.kind === 'multiple_of' && !decimalMultiple(actual, expected)) fail('value_not_multiple');
}

function evaluateTemporal(
  rule: CompiledValidatorRule,
  value: unknown,
  storageType: FileStorageType,
  context: ValidatorEvaluationContext,
  fail: (code: string) => void
) {
  if (typeof value !== 'string') return;
  const actual = temporalKey(storageType, value);
  if (actual === undefined) return;
  if (rule.kind === 'before' || rule.kind === 'after') {
    const expected = temporalKey(storageType, rule.args.value as string);
    if (expected === undefined) return;
    const inclusive = rule.args.inclusive === true;
    if (rule.kind === 'before' && (actual > expected || (!inclusive && actual === expected))) fail('value_not_before');
    if (rule.kind === 'after' && (actual < expected || (!inclusive && actual === expected))) fail('value_not_after');
    return;
  }
  const timezone = (rule.args.timezone as string | undefined) ?? context.timezone ?? 'UTC';
  const now = contextNow(context.now);
  if (rule.kind === 'today') {
    const actualDay = storageType === 'date' ? value : dateInTimezone(new Date(value), timezone);
    if (actualDay !== dateInTimezone(now, timezone)) fail('value_not_today');
    return;
  }
  const comparison = storageType === 'date'
    ? value.localeCompare(dateInTimezone(now, timezone))
    : (actual as bigint) < instantFromDate(now)
      ? -1
      : (actual as bigint) > instantFromDate(now) ? 1 : 0;
  if (rule.kind === 'past' && comparison >= 0) fail('value_not_past');
  if (rule.kind === 'future' && comparison <= 0) fail('value_not_future');
}

function evaluateItemRules(
  parent: CompiledValidatorRule,
  json: JsonArray,
  context: ValidatorEvaluationContext,
  collector: FailureCollector
) {
  const rules = parent.args.rules as ValidatorRuleConfig[];
  json.items.forEach((item, index) => {
    const value = exactJsonValue(item);
    const storage = storageForJsonScalar(item);
    if (!storage) return;
    for (const child of rules) {
      evaluateRule({ ...child, source: parent.source }, value, storage, `$[${index}]`, context, collector);
    }
  });
}

function evaluatePropertyRules(
  parent: CompiledValidatorRule,
  json: JsonObject,
  context: ValidatorEvaluationContext,
  collector: FailureCollector
) {
  const properties = parent.args.rules as Record<string, ValidatorRuleConfig[]>;
  const entries = new Map(json.entries);
  for (const [key, rules] of Object.entries(properties)) {
    const item = entries.get(key);
    if (!item || item.kind === 'null') continue;
    const storage = storageForJsonScalar(item);
    if (!storage) continue;
    const value = exactJsonValue(item);
    for (const child of rules) {
      evaluateRule({ ...child, source: parent.source }, value, storage, pathForKey(key), context, collector);
    }
  }
}

function validateRule(
  rule: Pick<ValidatorRuleConfig, 'id' | 'kind' | 'args'>,
  storageType: FileStorageType,
  field: FileFieldKind,
  depth: number
) {
  if (!compatibleRule(rule.kind, storageType, field)) {
    throw new Error(`Validator ${rule.kind} is incompatible with the canonical value family`);
  }
  plainObject(rule.args, 'Validator arguments');
  const none = () => exactKeys(rule.args, []);
  const count = () => {
    exactKeys(rule.args, ['value']);
    nonNegativeInteger(rule.args.value, 'Validator count');
  };
  switch (rule.kind) {
    case 'not_empty': case 'email_shape': case 'integer_value': case 'unique_items':
      none(); return;
    case 'equals': case 'not_equals':
      exactKeys(rule.args, ['value']);
      typedArgument(rule.args.value, storageType); return;
    case 'one_of':
      exactKeys(rule.args, ['values']);
      if (!Array.isArray(rule.args.values) || rule.args.values.length < 1
        || rule.args.values.length > MAX_RULE_ITEMS) throw new Error('Validator values are invalid');
      rule.args.values.forEach((value) => typedArgument(value, storageType));
      if (new Set(rule.args.values.map((value) => typedKey(value, storageType))).size !== rule.args.values.length) {
        throw new Error('Validator values must be unique');
      }
      return;
    case 'starts_with': case 'ends_with':
      exactKeys(rule.args, ['text']); boundedString(rule.args.text, 'Validator text', 0, 1_000); return;
    case 'pattern':
      exactKeys(rule.args, ['pattern', 'dialect']);
      boundedString(rule.args.pattern, 'Validator pattern', 1, MAX_PATTERN_LENGTH);
      if (rule.args.dialect !== 'tabular-wildcard-v1') throw new Error('Unsupported safe pattern dialect');
      parseWildcard(rule.args.pattern as string);
      return;
    case 'min_length': case 'max_length': case 'exact_length':
    case 'min_words': case 'max_words': case 'exact_words':
    case 'min_items': case 'max_items': case 'exact_items':
      count(); return;
    case 'url_shape':
      exactKeys(rule.args, ['protocols']);
      if (typeof rule.args.protocols !== 'undefined') protocolList(rule.args.protocols);
      return;
    case 'hex_shape':
      exactKeys(rule.args, ['prefix', 'case']);
      if (typeof rule.args.prefix !== 'undefined' && typeof rule.args.prefix !== 'boolean') throw new Error('Invalid hex prefix policy');
      if (typeof rule.args.case !== 'undefined' && !['any', 'lower', 'upper'].includes(rule.args.case as string)) {
        throw new Error('Invalid hex case policy');
      }
      return;
    case 'min_value': case 'max_value':
      exactKeys(rule.args, ['value', 'inclusive']);
      exactDecimalArgument(rule.args.value);
      if (typeof rule.args.inclusive !== 'undefined' && typeof rule.args.inclusive !== 'boolean') {
        throw new Error('Invalid bound inclusion policy');
      }
      return;
    case 'multiple_of':
      exactKeys(rule.args, ['value']);
      const multiple = exactDecimalArgument(rule.args.value);
      if (multiple.coefficient <= 0n) throw new Error('A multiple must be positive');
      return;
    case 'before': case 'after':
      exactKeys(rule.args, ['value', 'inclusive']);
      if (typeof rule.args.value !== 'string' || temporalKey(storageType, rule.args.value) === undefined) {
        throw new Error('Invalid temporal bound');
      }
      if (typeof rule.args.inclusive !== 'undefined' && typeof rule.args.inclusive !== 'boolean') {
        throw new Error('Invalid bound inclusion policy');
      }
      return;
    case 'past': case 'future': case 'today':
      exactKeys(rule.args, ['timezone']);
      if (typeof rule.args.timezone !== 'undefined') validTimezone(rule.args.timezone);
      return;
    case 'items':
      if (depth > 0) throw new Error('Recursive validator schemas are not supported');
      exactKeys(rule.args, ['rules']);
      validateChildRules(rule.args.rules, 'text', field, depth + 1);
      return;
    case 'required_keys': case 'allowed_keys':
      exactKeys(rule.args, ['keys']); keyList(rule.args.keys); return;
    case 'properties': {
      if (depth > 0) throw new Error('Recursive validator schemas are not supported');
      exactKeys(rule.args, ['rules']);
      plainObject(rule.args.rules, 'Property rules');
      const entries = Object.entries(rule.args.rules as Record<string, unknown>);
      if (entries.length > 64) throw new Error('Too many property rule entries');
      for (const [key, rules] of entries) {
        boundedString(key, 'Property key', 1, 100);
        if (pathForKey(key).length > 256) throw new Error('Validator JSON path is too long');
        validatePolymorphicChildRules(rules, field, depth + 1);
      }
      return;
    }
  }
}

function validateChildRules(value: unknown, storage: FileStorageType, field: FileFieldKind, depth: number) {
  if (!Array.isArray(value) || value.length > 16) throw new Error('Child validator rules are invalid');
  const ids = new Set<string>();
  value.forEach((rule) => {
    ruleObject(rule);
    if (ids.has(rule.id)) throw new Error('Child validator identities must be unique');
    ids.add(rule.id);
    validateRule(rule, storage, field, depth);
  });
  rejectDuplicateDefinitions(value as ValidatorRuleConfig[]);
  rejectContradictions(value as ValidatorRuleConfig[], storage, field);
}

function validatePolymorphicChildRules(value: unknown, field: FileFieldKind, depth: number) {
  if (!Array.isArray(value) || value.length > 16) throw new Error('Child validator rules are invalid');
  value.forEach(ruleObject);
  const ids = new Set((value as ValidatorRuleConfig[]).map((rule) => rule.id));
  if (ids.size !== value.length) throw new Error('Child validator identities must be unique');
  const rules = value as ValidatorRuleConfig[];
  const storage = propertyRuleStorage(rules);
  rules.forEach((rule) => validateRule(rule, storage, field, depth));
  rejectDuplicateDefinitions(rules);
  rejectContradictions(rules, storage, field);
}

function ruleObject(value: unknown): asserts value is ValidatorRuleConfig {
  plainObject(value, 'Child validator rule');
  exactKeys(value, ['id', 'kind', 'args', 'message']);
  const rule = value as ValidatorRuleConfig;
  if (!/^vr_[A-Za-z0-9_-]{8,96}$/.test(rule.id)) throw new Error('Invalid child validator identity');
  if (!isConfiguredKind(rule.kind)) throw new Error('Invalid child validator kind');
  if (typeof rule.message !== 'undefined') boundedString(rule.message, 'Validator message', 1, 500);
}

function propertyRuleStorage(rules: ValidatorRuleConfig[]): FileStorageType {
  const numeric = new Set<ValidatorRuleKind>(['min_value', 'max_value', 'integer_value', 'multiple_of']);
  const text = new Set<ValidatorRuleKind>([
    'not_empty', 'starts_with', 'ends_with', 'pattern', 'min_length', 'max_length',
    'exact_length', 'min_words', 'max_words', 'exact_words', 'email_shape',
    'url_shape', 'hex_shape'
  ]);
  if (rules.some((rule) => numeric.has(rule.kind))) {
    if (rules.some((rule) => text.has(rule.kind))) throw new Error('Property child rules use incompatible scalar families');
    return 'numeric';
  }
  const equalityValues = rules.filter((rule) => ['equals', 'not_equals'].includes(rule.kind))
    .map((rule) => rule.args.value);
  if (equalityValues.some((value) => typeof value === 'boolean')) {
    if (rules.some((rule) => text.has(rule.kind)) || equalityValues.some((value) => typeof value !== 'boolean')) {
      throw new Error('Property child rules use incompatible scalar families');
    }
    return 'boolean';
  }
  if (rules.some((rule) => !text.has(rule.kind) && !['equals', 'not_equals'].includes(rule.kind))) {
    throw new Error('Property child validator is incompatible with JSON scalars');
  }
  return 'text';
}

function compatibleRule(kind: ValidatorRuleKind, storage: FileStorageType, field: FileFieldKind) {
  if (field === 'relation') return false;
  if (['equals', 'not_equals'].includes(kind)) return true;
  if (kind === 'one_of') return ['text', 'bigint', 'numeric', 'date', 'time', 'timestamptz', 'uuid'].includes(storage);
  if (kind === 'not_empty') return storage === 'text' || storage === 'jsonb';
  if (['starts_with', 'ends_with', 'pattern', 'min_length', 'max_length', 'exact_length',
    'min_words', 'max_words', 'exact_words', 'email_shape', 'url_shape', 'hex_shape'].includes(kind)) {
    return storage === 'text';
  }
  if (['min_value', 'max_value', 'integer_value', 'multiple_of'].includes(kind)) {
    return storage === 'bigint' || storage === 'numeric';
  }
  if (['before', 'after'].includes(kind)) return ['date', 'time', 'timestamptz'].includes(storage);
  if (['past', 'future'].includes(kind)) return ['date', 'timestamptz'].includes(storage);
  if (kind === 'today') return ['date', 'timestamptz'].includes(storage);
  if (['min_items', 'max_items', 'exact_items', 'unique_items', 'items'].includes(kind)) {
    return storage === 'jsonb' && FIELD_REGISTRY[field].family === 'json-string-array';
  }
  if (['required_keys', 'allowed_keys', 'properties'].includes(kind)) {
    return storage === 'jsonb' && FIELD_REGISTRY[field].family === 'json-object';
  }
  return false;
}

function rejectContradictions(
  rules: ValidatorRuleConfig[],
  storage: FileStorageType,
  field: FileFieldKind
) {
  rejectDuplicateDefinitions(rules);
  const equals = rules.filter((rule) => rule.kind === 'equals').map((rule) => rule.args.value);
  if (new Set(equals.map((value) => typedKey(value, storage))).size > 1) contradiction();
  const notEquals = new Set(rules.filter((rule) => rule.kind === 'not_equals')
    .map((rule) => typedKey(rule.args.value, storage)));
  if (equals.some((value) => notEquals.has(typedKey(value, storage)))) contradiction();

  const oneOf = rules.filter((rule) => rule.kind === 'one_of')
    .map((rule) => new Set((rule.args.values as unknown[]).map((value) => typedKey(value, storage))));
  if (oneOf.length) {
    let intersection = new Set(oneOf[0]);
    for (const values of oneOf.slice(1)) intersection = new Set([...intersection].filter((value) => values.has(value)));
    if (intersection.size === 0) contradiction();
    if (equals.length && !intersection.has(typedKey(equals[0], storage))) contradiction();
  }

  if (storage === 'bigint' || storage === 'numeric') {
    rejectBoundContradictions(rules, storage, equals[0]);
  }
  rejectCountContradictions(rules, 'length');
  rejectCountContradictions(rules, 'words');
  rejectCountContradictions(rules, 'items');
  if (['date', 'time', 'timestamptz'].includes(storage)) rejectTemporalContradictions(rules, storage);
  if (FIELD_REGISTRY[field].family === 'json-object') {
    const required = new Set(rules.filter((rule) => rule.kind === 'required_keys')
      .flatMap((rule) => rule.args.keys as string[]));
    const allowedRules = rules.filter((rule) => rule.kind === 'allowed_keys');
    if (allowedRules.some((rule) => [...required].some((key) => !(rule.args.keys as string[]).includes(key)))) {
      contradiction();
    }
  }
}

function rejectDuplicateDefinitions(rules: Array<Pick<ValidatorRuleConfig, 'kind' | 'args'>>) {
  const definitions = rules.map((rule) => JSON.stringify([rule.kind, stableMetadata(rule.args)]));
  if (new Set(definitions).size !== definitions.length) {
    throw new Error('Duplicate validators are not allowed');
  }
}

function rejectBoundContradictions(rules: ValidatorRuleConfig[], storage: FileStorageType, equal: unknown) {
  const mins = rules.filter((rule) => rule.kind === 'min_value');
  const maxes = rules.filter((rule) => rule.kind === 'max_value');
  for (const min of mins) for (const max of maxes) {
    const comparison = compareDecimal(parseDecimal(min.args.value as string)!, parseDecimal(max.args.value as string)!);
    if (comparison > 0 || (comparison === 0 && (min.args.inclusive === false || max.args.inclusive === false))) contradiction();
  }
  if (typeof equal !== 'undefined' && typeof equal === 'string') {
    const parsed = parseDecimal(equal);
    if (!parsed) return;
    for (const rule of [...mins, ...maxes]) {
      const bound = parseDecimal(rule.args.value as string)!;
      const comparison = compareDecimal(parsed, bound);
      if (rule.kind === 'min_value' && (comparison < 0 || (comparison === 0 && rule.args.inclusive === false))) contradiction();
      if (rule.kind === 'max_value' && (comparison > 0 || (comparison === 0 && rule.args.inclusive === false))) contradiction();
    }
  }
  void storage;
}

function rejectCountContradictions(rules: ValidatorRuleConfig[], suffix: 'length' | 'words' | 'items') {
  const mins = rules.filter((rule) => rule.kind === `min_${suffix}`).map((rule) => rule.args.value as number);
  const maxes = rules.filter((rule) => rule.kind === `max_${suffix}`).map((rule) => rule.args.value as number);
  const exacts = rules.filter((rule) => rule.kind === `exact_${suffix}`).map((rule) => rule.args.value as number);
  const minimum = mins.length ? Math.max(...mins) : 0;
  const maximum = maxes.length ? Math.min(...maxes) : Number.MAX_SAFE_INTEGER;
  if (minimum > maximum || new Set(exacts).size > 1 || exacts.some((value) => value < minimum || value > maximum)) {
    contradiction();
  }
}

function rejectTemporalContradictions(rules: ValidatorRuleConfig[], storage: FileStorageType) {
  const before = rules.filter((rule) => rule.kind === 'before');
  const after = rules.filter((rule) => rule.kind === 'after');
  for (const lower of after) for (const upper of before) {
    const comparison = compareTemporal(
      temporalKey(storage, lower.args.value as string)!,
      temporalKey(storage, upper.args.value as string)!
    );
    if (comparison > 0 || (comparison === 0 && (lower.args.inclusive !== true || upper.args.inclusive !== true))) {
      contradiction();
    }
  }
  const equals = rules.filter((rule) => rule.kind === 'equals');
  for (const equal of equals) {
    const value = temporalKey(storage, equal.args.value as string);
    if (value === undefined) continue;
    for (const lower of after) {
      const comparison = compareTemporal(value, temporalKey(storage, lower.args.value as string)!);
      if (comparison < 0 || (comparison === 0 && lower.args.inclusive !== true)) contradiction();
    }
    for (const upper of before) {
      const comparison = compareTemporal(value, temporalKey(storage, upper.args.value as string)!);
      if (comparison > 0 || (comparison === 0 && upper.args.inclusive !== true)) contradiction();
    }
  }
  if (rules.some((rule) => rule.kind === 'past') && rules.some((rule) => rule.kind === 'future')) contradiction();
}

function contradiction(): never { throw new Error('Validator definitions are internally contradictory'); }

class FailureCollector {
  private readonly failures: ValidatorFailure[] = [];
  private overflow = 0;

  add(failure: ValidatorFailure) {
    if (this.failures.length < FAILURE_LIMIT) this.failures.push(failure);
    else this.overflow += 1;
  }

  result(): ValidatorResult {
    return {
      valid: this.failures.length === 0 && this.overflow === 0,
      failures: this.failures,
      overflow: this.overflow
    };
  }
}

type Decimal = { coefficient: bigint, scale: number };

function parseInteger(value: string) {
  if (!/^-?(?:0|[1-9]\d*)$/.test(value) || value === '-0') return undefined;
  try { return BigInt(value); } catch { return undefined; }
}

function parseDecimal(value: string): Decimal | undefined {
  if (typeof value !== 'string' || value.length > 10_000) return undefined;
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match || value === '-0') return undefined;
  const fraction = match[3] ?? '';
  const digits = `${match[2]}${fraction}`;
  let coefficient = BigInt(digits) * (match[1] ? -1n : 1n);
  if (coefficient === 0n && match[1]) return undefined;
  let scale = fraction.length;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

function compareDecimal(left: Decimal, right: Decimal) {
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightValue = right.coefficient * 10n ** BigInt(scale - right.scale);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function decimalMultiple(value: Decimal, step: Decimal) {
  const scale = Math.max(value.scale, step.scale);
  const actual = value.coefficient * 10n ** BigInt(scale - value.scale);
  const divisor = step.coefficient * 10n ** BigInt(scale - step.scale);
  return divisor > 0n && actual % divisor === 0n;
}

function exactDecimalArgument(value: unknown) {
  if (typeof value !== 'string') throw new Error('Exact numeric arguments must be decimal strings');
  const parsed = parseDecimal(value);
  if (!parsed) throw new Error('Invalid exact numeric argument');
  return parsed;
}

function dateKey(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  return value;
}

function timeKey(value: string): bigint | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,6}))?)?$/.exec(value);
  if (!match) return undefined;
  const micros = BigInt((match[4] ?? '').padEnd(6, '0'));
  return (BigInt(match[1]) * 3600n + BigInt(match[2]) * 60n + BigInt(match[3] ?? '0')) * 1_000_000n + micros;
}

function instantKey(value: string): bigint | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  if (!match || !dateKey(match[1])) return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  const fraction = (match[5] ?? '').padEnd(6, '0');
  return BigInt(milliseconds) * 1_000n + BigInt(fraction.slice(3));
}

function temporalKey(storage: FileStorageType, value: string): string | bigint | undefined {
  if (storage === 'date') return dateKey(value);
  if (storage === 'time') return timeKey(value);
  if (storage === 'timestamptz') return instantKey(value);
  return undefined;
}

function compareTemporal(left: string | bigint, right: string | bigint) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function contextNow(value: string | Date | undefined) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid validator evaluation clock');
  return date;
}

function instantFromDate(value: Date) { return BigInt(value.getTime()) * 1_000n; }

function dateInTimezone(value: Date, timezone: string) {
  validTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validTimezone(value: unknown) {
  if (typeof value !== 'string' || value.length > 100) throw new Error('Invalid validator timezone');
  try { new Intl.DateTimeFormat('en', { timeZone: value }); } catch { throw new Error('Invalid validator timezone'); }
}

function typedArgument(value: unknown, storage: FileStorageType) {
  if (storage === 'boolean') {
    if (typeof value !== 'boolean') throw new Error('Validator values must match canonical storage values');
    return;
  }
  if (storage === 'jsonb') {
    if (!isCanonicalJson(value) || parseCanonicalJson(value).kind === 'failure') {
      throw new Error('Validator values must use canonical JSON transport');
    }
    return;
  }
  if (typeof value !== 'string') throw new Error('Validator values must use canonical text transport');
  if ((storage === 'bigint' && parseInteger(value) === undefined)
    || (storage === 'numeric' && !parseDecimal(value))
    || (storage === 'date' && !dateKey(value))
    || (storage === 'time' && timeKey(value) === undefined)
    || (storage === 'timestamptz' && instantKey(value) === undefined)
    || (storage === 'uuid' && !uuid(value))) {
    throw new Error('Validator values must match canonical storage values');
  }
}

function equalTyped(
  actual: unknown,
  expected: unknown,
  storage: FileStorageType,
  parsedJson?: ExactJson | JsonParseFailure
) {
  if (storage === 'jsonb') {
    if (!isCanonicalJson(expected) || !parsedJson || parsedJson.kind === 'failure') return false;
    const expectedJson = parseCanonicalJson(expected);
    return expectedJson.kind !== 'failure' && jsonKey(parsedJson) === jsonKey(expectedJson);
  }
  if (storage === 'numeric' || storage === 'bigint') {
    if (typeof actual !== 'string' || typeof expected !== 'string') return false;
    const left = parseDecimal(actual);
    const right = parseDecimal(expected);
    return Boolean(left && right && compareDecimal(left, right) === 0);
  }
  if (storage === 'timestamptz') {
    return typeof actual === 'string' && typeof expected === 'string'
      && instantKey(actual) === instantKey(expected);
  }
  return actual === expected;
}

function typedKey(value: unknown, storage: FileStorageType) {
  if (storage === 'jsonb' && isCanonicalJson(value)) {
    const parsed = parseCanonicalJson(value);
    return parsed.kind === 'failure' ? 'invalid' : jsonKey(parsed);
  }
  if ((storage === 'numeric' || storage === 'bigint') && typeof value === 'string') {
    const parsed = parseDecimal(value);
    return parsed ? `number:${parsed.coefficient}:${parsed.scale}` : `invalid:${value}`;
  }
  if (storage === 'timestamptz' && typeof value === 'string') return `instant:${instantKey(value)}`;
  return `${typeof value}:${String(value)}`;
}

function isEmpty(value: unknown, json?: ExactJson | JsonParseFailure) {
  if (typeof value === 'string') return value.length === 0;
  return json?.kind === 'array' ? json.items.length === 0 : json?.kind === 'object' ? json.entries.length === 0 : false;
}

function codePointLength(value: string) { return [...value].length; }

function wordCount(value: string) {
  return value.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function email(value: string) {
  if (value.length < 3 || value.length > 320 || /\s/.test(value)) return false;
  const at = value.lastIndexOf('@');
  return at > 0 && at < value.length - 1 && value.slice(at + 1).includes('.');
}

function safeUrl(value: string, protocols = ['http', 'https']) {
  try {
    const url = new URL(value);
    return protocols.map((protocol) => `${protocol.toLowerCase()}:`).includes(url.protocol.toLowerCase());
  } catch { return false; }
}

function protocolList(value: unknown) {
  const allowed = new Set(['http', 'https', 'mailto', 'tel']);
  if (!Array.isArray(value) || value.length < 1 || value.length > 8
    || value.some((item) => typeof item !== 'string' || !allowed.has(item))) {
    throw new Error('Invalid URL protocol allow-list');
  }
}

function hex(value: string, args: Record<string, unknown>) {
  const prefix = args.prefix === true;
  const body = prefix ? value.startsWith('#') ? value.slice(1) : '' : value.replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(body)) return false;
  if (args.case === 'lower' && body !== body.toLowerCase()) return false;
  if (args.case === 'upper' && body !== body.toUpperCase()) return false;
  return true;
}

function color(value: string, mode: unknown) {
  if (mode === 'hex' || typeof mode === 'undefined') return /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value);
  if (mode === 'hex-short') return /^#[0-9a-fA-F]{3,4}$/.test(value);
  return false;
}

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type WildcardToken = { type: 'literal', value: string } | { type: 'one' } | { type: 'many' };

function parseWildcard(pattern: string): WildcardToken[] {
  const tokens: WildcardToken[] = [];
  const points = [...pattern];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point === '\\') {
      const next = points[index + 1];
      if (!next) throw new Error('A pattern escape must be followed by a character');
      tokens.push({ type: 'literal', value: next });
      index += 1;
    } else if (point === '?') tokens.push({ type: 'one' });
    else if (point === '*') {
      if (tokens.at(-1)?.type !== 'many') tokens.push({ type: 'many' });
    } else tokens.push({ type: 'literal', value: point });
  }
  return tokens;
}

function wildcardMatch(pattern: string, value: string) {
  if (value.length > MAX_PATTERN_INPUT) return false;
  const tokens = parseWildcard(pattern);
  const points = [...value];
  let token = 0;
  let point = 0;
  let star = -1;
  let retry = 0;
  while (point < points.length) {
    const current = tokens[token];
    if (current?.type === 'one' || (current?.type === 'literal' && current.value === points[point])) {
      token += 1; point += 1;
    } else if (current?.type === 'many') {
      star = token; retry = point; token += 1;
    } else if (star >= 0) {
      token = star + 1; retry += 1; point = retry;
    } else return false;
  }
  while (tokens[token]?.type === 'many') token += 1;
  return token === tokens.length;
}

type JsonString = { kind: 'string', value: string };
type JsonNumber = { kind: 'number', value: Decimal };
type JsonBoolean = { kind: 'boolean', value: boolean };
type JsonNull = { kind: 'null' };
type JsonArray = { kind: 'array', items: ExactJson[] };
type JsonObject = { kind: 'object', entries: Array<[string, ExactJson]> };
type ExactJson = JsonString | JsonNumber | JsonBoolean | JsonNull | JsonArray | JsonObject;
type JsonParseFailure = { kind: 'failure' };

function parseCanonicalJson(value: unknown): ExactJson | JsonParseFailure {
  if (!isCanonicalJson(value) || Buffer.byteLength(value.source, 'utf8') > MAX_JSON_BYTES) return { kind: 'failure' };
  try { return new ExactJsonParser(value.source).parse(); } catch { return { kind: 'failure' }; }
}

function isCanonicalJson(value: unknown): value is CanonicalJsonValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (value as CanonicalJsonValue).type === 'json'
    && typeof (value as CanonicalJsonValue).source === 'string'
    && ['object', 'string-array', 'other'].includes((value as CanonicalJsonValue).shape));
}

class ExactJsonParser {
  private index = 0;
  constructor(private readonly source: string) {}

  parse() {
    const value = this.value(0);
    this.space();
    if (this.index !== this.source.length) throw new Error('Trailing JSON');
    return value;
  }

  private value(depth: number): ExactJson {
    if (depth > MAX_JSON_DEPTH) throw new Error('JSON is too deep');
    this.space();
    const point = this.source[this.index];
    if (point === '"') return { kind: 'string', value: this.string() };
    if (point === '[') return this.array(depth);
    if (point === '{') return this.object(depth);
    if (this.source.startsWith('true', this.index)) { this.index += 4; return { kind: 'boolean', value: true }; }
    if (this.source.startsWith('false', this.index)) { this.index += 5; return { kind: 'boolean', value: false }; }
    if (this.source.startsWith('null', this.index)) { this.index += 4; return { kind: 'null' }; }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.index));
    if (!match) throw new Error('Invalid JSON value');
    this.index += match[0].length;
    return { kind: 'number', value: jsonNumber(match[0]) };
  }

  private array(depth: number): JsonArray {
    this.index += 1;
    const items: ExactJson[] = [];
    this.space();
    if (this.source[this.index] === ']') { this.index += 1; return { kind: 'array', items }; }
    while (items.length < MAX_RULE_ITEMS) {
      items.push(this.value(depth + 1));
      this.space();
      if (this.source[this.index] === ']') { this.index += 1; return { kind: 'array', items }; }
      if (this.source[this.index] !== ',') throw new Error('Invalid JSON array');
      this.index += 1;
    }
    throw new Error('JSON array is too large');
  }

  private object(depth: number): JsonObject {
    this.index += 1;
    const entries: Array<[string, ExactJson]> = [];
    const keys = new Set<string>();
    this.space();
    if (this.source[this.index] === '}') { this.index += 1; return { kind: 'object', entries }; }
    while (entries.length < MAX_RULE_ITEMS) {
      this.space();
      const key = this.string();
      if (keys.has(key)) throw new Error('Duplicate JSON key');
      keys.add(key);
      this.space();
      if (this.source[this.index] !== ':') throw new Error('Invalid JSON object');
      this.index += 1;
      entries.push([key, this.value(depth + 1)]);
      this.space();
      if (this.source[this.index] === '}') { this.index += 1; return { kind: 'object', entries }; }
      if (this.source[this.index] !== ',') throw new Error('Invalid JSON object');
      this.index += 1;
    }
    throw new Error('JSON object is too large');
  }

  private string() {
    if (this.source[this.index] !== '"') throw new Error('Invalid JSON string');
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const point = this.source[this.index];
      if (point === '"') {
        this.index += 1;
        return JSON.parse(this.source.slice(start, this.index)) as string;
      }
      if (point === '\\') this.index += 2;
      else this.index += 1;
    }
    throw new Error('Unterminated JSON string');
  }

  private space() { while (/[\x20\t\r\n]/.test(this.source[this.index] ?? '')) this.index += 1; }
}

function jsonNumber(source: string): Decimal {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source)!;
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? '0');
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10_000) throw new Error('JSON number exponent is too large');
  let coefficient = BigInt(`${match[2]}${fraction}`) * (match[1] ? -1n : 1n);
  let scale = fraction.length - exponent;
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale -= 1; }
  return { coefficient, scale };
}

function jsonKey(value: ExactJson): string {
  switch (value.kind) {
    case 'null': return 'null';
    case 'boolean': return `b:${value.value}`;
    case 'string': return `s:${JSON.stringify(value.value)}`;
    case 'number': return `n:${value.value.coefficient}:${value.value.scale}`;
    case 'array': return `a:[${value.items.map(jsonKey).join(',')}]`;
    case 'object': return `o:{${[...value.entries].sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${jsonKey(item)}`).join(',')}}`;
  }
}

function exactJsonValue(value: ExactJson): unknown {
  if (value.kind === 'string' || value.kind === 'boolean') return value.value;
  if (value.kind === 'number') return decimalText(value.value);
  if (value.kind === 'null') return null;
  return undefined;
}

function decimalText(value: Decimal) {
  const sign = value.coefficient < 0n ? '-' : '';
  const digits = (value.coefficient < 0n ? -value.coefficient : value.coefficient).toString();
  if (value.scale === 0) return `${sign}${digits}`;
  const padded = digits.padStart(value.scale + 1, '0');
  return `${sign}${padded.slice(0, -value.scale)}.${padded.slice(-value.scale)}`;
}

function storageForJsonScalar(value: ExactJson): FileStorageType | undefined {
  if (value.kind === 'string') return 'text';
  if (value.kind === 'number') return 'numeric';
  if (value.kind === 'boolean') return 'boolean';
  return undefined;
}

function pathForKey(key: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `$.${key}` : `$[${JSON.stringify(key)}]`;
}

function countArgument(rule: CompiledValidatorRule) {
  return typeof rule.args.value === 'number' ? rule.args.value : 0;
}

function nonNegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_TEXT_LENGTH) {
    throw new Error(`${label} must be a bounded non-negative integer`);
  }
}

function keyList(value: unknown) {
  if (!Array.isArray(value) || value.length > 64) throw new Error('Validator key list is invalid');
  value.forEach((key) => boundedString(key, 'Validator key', 1, 100));
  if (new Set(value).size !== value.length) throw new Error('Validator keys must be unique');
  if (value.some((key) => pathForKey(key).length > 256)) throw new Error('Validator JSON path is too long');
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return undefined;
  return value;
}

function boundedString(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum
    || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid`);
}

function plainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 20_000) throw new Error(`${label} is too large`);
}

function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  const set = new Set(allowed);
  if (Object.keys(value).some((key) => !set.has(key))) throw new Error('Validator arguments contain an unknown field');
}

function isConfiguredKind(kind: string): kind is ValidatorRuleKind {
  return !kind.startsWith('storage_') && ![
    'json_object_shape', 'json_string_array_shape', 'json_scalar_properties',
    'non_empty_items', 'slug_shape', 'color_shape', 'country_code_shape',
    'currency_code_shape', 'option_membership'
  ].includes(kind);
}

function stableMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableMetadata);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort()
      .map((key) => [key, stableMetadata((value as Record<string, unknown>)[key])]));
  }
  return value;
}
