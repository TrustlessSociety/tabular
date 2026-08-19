//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { canonicalJsonValue } from '../../../src/plugins/capability/helpers/value-contracts.js';
import type {
  FileFieldKind,
  FileStorageType,
  ValidatorRuleConfig
} from '../../../src/plugins/files/helpers/contracts.js';
import {
  compileValidatorPlan,
  validateCanonicalValue,
  validateColumnValue
} from '../../../src/plugins/files/helpers/validator-engine.js';

function configured(
  storageType: FileStorageType,
  field: FileFieldKind,
  rules: ValidatorRuleConfig[] = [],
  fieldConfig: Record<string, unknown> = {}
) {
  return compileValidatorPlan({
    storageType,
    field,
    fieldConfig,
    validatorConfig: { version: 1, rules }
  });
}

function rule(id: string, kind: ValidatorRuleConfig['kind'], args: Record<string, unknown>): ValidatorRuleConfig {
  return { id: `vr_${id.padEnd(8, '0')}`, kind, args };
}

test('composition is storage, Field, then configured order with stable failures', () => {
  const plan = configured('text', 'email', [
    rule('empty', 'not_empty', {}),
    { ...rule('length', 'min_length', { value: 5 }), message: 'Use at least five characters' }
  ]);
  assert.deepEqual(plan.rules.map(({ source }) => source), [
    'storage', 'field', 'configured', 'configured'
  ]);

  const result = validateCanonicalValue(plan, 'x');
  assert.deepEqual(result, {
    valid: false,
    failures: [
      {
        ruleId: 'field:email:email_shape',
        kind: 'email_shape',
        source: 'field',
        code: 'invalid_email_shape',
        message: 'The value is not a valid email shape',
        path: null
      },
      {
        ruleId: 'vr_length00',
        kind: 'min_length',
        source: 'configured',
        code: 'length_below_minimum',
        message: 'Use at least five characters',
        path: null
      }
    ],
    overflow: 0
  });
});

test('SQL NULL skips Tabular rules while empty, zero, and false stay distinct', () => {
  const textPlan = configured('text', 'text', [rule('empty', 'not_empty', {})]);
  assert.deepEqual(validateCanonicalValue(textPlan, null), { valid: true, failures: [], overflow: 0 });
  assert.equal(validateCanonicalValue(textPlan, '').failures[0]?.code, 'value_is_empty');

  const numberPlan = configured('numeric', 'number', [rule('minimum', 'min_value', { value: '0' })]);
  assert.equal(validateCanonicalValue(numberPlan, '0').valid, true);

  const booleanPlan = configured('boolean', 'checkbox', [rule('equal', 'equals', { value: false })]);
  assert.equal(validateCanonicalValue(booleanPlan, false).valid, true);
  assert.equal(validateCanonicalValue(booleanPlan, true).failures[0]?.code, 'value_must_equal');
});

test('exact numeric validation never narrows through JavaScript number', () => {
  const plan = configured('numeric', 'number', [
    rule('minimum', 'min_value', { value: '9007199254740993.000000000000000001' }),
    rule('maximum', 'max_value', { value: '9007199254740993.000000000000000003' }),
    rule('multiple', 'multiple_of', { value: '0.000000000000000001' })
  ]);
  assert.equal(validateCanonicalValue(plan, '9007199254740993.000000000000000002').valid, true);
  assert.equal(validateCanonicalValue(plan, '9007199254740993.000000000000000004').failures[0]?.code,
    'value_above_maximum');
  assert.equal(validateCanonicalValue(plan, 9007199254740994).failures[0]?.source, 'storage');
});

test('bigint range, canonical transport, and integer rules are non-coercive', () => {
  const bigintPlan = configured('bigint', 'number', [rule('integer', 'integer_value', {})]);
  assert.equal(validateCanonicalValue(bigintPlan, '9223372036854775807').valid, true);
  assert.equal(validateCanonicalValue(bigintPlan, '9223372036854775808').failures[0]?.code,
    'invalid_storage_value');
  assert.equal(validateCanonicalValue(bigintPlan, '01').failures[0]?.code, 'invalid_storage_value');

  const numericPlan = configured('numeric', 'number', [rule('integer', 'integer_value', {})]);
  assert.equal(validateCanonicalValue(numericPlan, '2.000').valid, true);
  assert.equal(validateCanonicalValue(numericPlan, '2.001').failures[0]?.code, 'value_not_integer');
});

test('fixed temporal rules compare instants and microseconds exactly', () => {
  const plan = configured('timestamptz', 'date-time', [
    rule('after', 'after', { value: '2026-08-13T00:00:00.000001Z' }),
    rule('before', 'before', { value: '2026-08-13T00:00:00.000003Z' })
  ]);
  assert.equal(validateCanonicalValue(plan, '2026-08-13T08:00:00.000002+08:00').valid, true);
  assert.equal(validateCanonicalValue(plan, '2026-08-13T00:00:00.000001Z').failures[0]?.code,
    'value_not_after');
});

test('dynamic temporal rules use an explicit deterministic clock and timezone', () => {
  const today = configured('timestamptz', 'date-time', [
    rule('today', 'today', { timezone: 'Asia/Manila' })
  ]);
  const context = { now: '2026-08-13T00:30:00Z' };
  assert.equal(validateCanonicalValue(today, '2026-08-12T16:30:00Z', context).valid, true);
  assert.equal(validateCanonicalValue(today, '2026-08-12T15:59:59Z', context).failures[0]?.code,
    'value_not_today');
});

test('the versioned wildcard dialect is bounded and does not execute regex metadata', () => {
  const plan = configured('text', 'text', [
    rule('pattern', 'pattern', { pattern: 'invoice-????-*', dialect: 'tabular-wildcard-v1' })
  ]);
  assert.equal(validateCanonicalValue(plan, 'invoice-2026-final').valid, true);
  assert.equal(validateCanonicalValue(plan, 'invoice-26-final').failures[0]?.code, 'pattern_mismatch');

  assert.throws(() => configured('text', 'text', [
    rule('pattern', 'pattern', { pattern: '(a+)+$', dialect: 'javascript-regexp' })
  ]), /Unsupported safe pattern dialect/);
  assert.throws(() => configured('text', 'text', [
    rule('pattern', 'pattern', { pattern: 'abc\\', dialect: 'tabular-wildcard-v1' })
  ]), /escape/);
});

test('metadata validation preserves exact JSON numbers and rejects duplicates or nesting', () => {
  const expected = canonicalJsonValue('{"amount":9007199254740993.000000000000000001}');
  const plan = configured('jsonb', 'metadata', [rule('equals', 'equals', { value: expected })]);
  assert.equal(validateCanonicalValue(plan,
    canonicalJsonValue('{"amount":9007199254740993.0000000000000000010}')).valid, true);
  assert.equal(validateCanonicalValue(plan,
    canonicalJsonValue('{"amount":9007199254740993.000000000000000002}')).failures[0]?.code,
    'value_must_equal');

  const duplicate = canonicalJsonValue('{"name":"first","name":"second"}');
  assert.equal(validateCanonicalValue(plan, duplicate).failures[0]?.source, 'storage');
  const nested = canonicalJsonValue('{"nested":{"active":true}}');
  assert.ok(validateCanonicalValue(plan, nested).failures.some(({ code, path }) =>
    code === 'invalid_json_property' && path === '$.nested'));
});

test('JSON string-list implied rules keep order and distinguish empty items', () => {
  const plan = configured('jsonb', 'tags');
  const result = validateCanonicalValue(plan, canonicalJsonValue('["alpha","","alpha"]'));
  assert.deepEqual(result.failures.map(({ source, code, path }) => ({ source, code, path })), [
    { source: 'field', code: 'empty_collection_item', path: '$[1]' },
    { source: 'field', code: 'duplicate_items', path: null }
  ]);
  assert.equal(validateCanonicalValue(plan, canonicalJsonValue('[]')).valid, true);
  assert.equal(validateCanonicalValue(plan, canonicalJsonValue('["alpha",false]')).failures[0]?.code,
    'invalid_json_shape');
});

test('child item and property failures retain child IDs and bounded JSON paths', () => {
  const items = configured('jsonb', 'text-list', [
    rule('items', 'items', { rules: [rule('childmail', 'email_shape', {})] })
  ]);
  const itemResult = validateCanonicalValue(items, canonicalJsonValue('["ok@example.com","bad"]'));
  assert.equal(itemResult.failures[0]?.ruleId, 'vr_childmail');
  assert.equal(itemResult.failures[0]?.path, '$[1]');

  const properties = configured('jsonb', 'metadata', [
    rule('props', 'properties', {
      rules: { amount: [rule('childmin', 'min_value', { value: '10' })] }
    })
  ]);
  const propertyResult = validateCanonicalValue(properties, canonicalJsonValue('{"amount":9.999999999999999999}'));
  assert.equal(propertyResult.failures[0]?.ruleId, 'vr_childmin');
  assert.equal(propertyResult.failures[0]?.path, '$.amount');
});

test('required and allowed keys report stable actionable paths', () => {
  const plan = configured('jsonb', 'metadata', [
    rule('required', 'required_keys', { keys: ['display name'] }),
    rule('allowed', 'allowed_keys', { keys: ['display name'] })
  ]);
  const result = validateCanonicalValue(plan, canonicalJsonValue('{"unexpected":true}'));
  assert.deepEqual(result.failures.map(({ code, path }) => ({ code, path })), [
    { code: 'required_key_missing', path: '$["display name"]' },
    { code: 'key_not_allowed', path: '$.unexpected' }
  ]);
});

test('failure aggregation returns eight failures and an exact overflow count', () => {
  const rules = Array.from({ length: 12 }, (_, index) =>
    rule(`cap${String(index).padStart(5, '0')}`, 'min_length', { value: index + 1 }));
  const result = validateCanonicalValue(configured('text', 'text', rules), '');
  assert.equal(result.valid, false);
  assert.equal(result.failures.length, 8);
  assert.equal(result.overflow, 4);
  assert.deepEqual(result.failures.map(({ ruleId }) => ruleId), rules.slice(0, 8).map(({ id }) => id));
});

test('duplicate and contradictory definitions are rejected before evaluation', () => {
  assert.throws(() => configured('numeric', 'number', [
    rule('minimum', 'min_value', { value: '10' }),
    rule('maximum', 'max_value', { value: '9' })
  ]), /internally contradictory/);
  assert.throws(() => configured('text', 'text', [
    rule('equal', 'equals', { value: 'a' }),
    rule('different', 'not_equals', { value: 'a' })
  ]), /internally contradictory/);
  assert.throws(() => configured('text', 'text', [
    rule('choice1', 'one_of', { values: ['a', 'b'] }),
    rule('choice2', 'one_of', { values: ['c'] })
  ]), /internally contradictory/);
  assert.throws(() => configured('text', 'text', [
    rule('length1', 'min_length', { value: 5 }),
    rule('length2', 'max_length', { value: 4 })
  ]), /internally contradictory/);
});

test('configuration is closed against executable fields and incompatible coercion', () => {
  assert.throws(() => configured('text', 'text', [{
    ...rule('pattern', 'pattern', { pattern: '*', dialect: 'tabular-wildcard-v1', flags: 'g' })
  }]), /unknown field/);
  assert.throws(() => configured('text', 'text', [rule('minimum', 'min_value', { value: '1' })]),
    /incompatible/);
  assert.throws(() => configured('numeric', 'number', [rule('minimum', 'min_value', { value: 1 })]),
    /decimal strings/);
});

test('Field-implied range and option rules are locked without mutating input', () => {
  const definition = {
    storageType: 'numeric' as const,
    field: 'rating' as const,
    fieldConfig: { min: '1', max: '5', step: '0.5' },
    validatorConfig: { version: 1 as const, rules: [] }
  };
  const snapshot = structuredClone(definition);
  const result = validateColumnValue(definition, '5.5');
  assert.equal(result.failures[0]?.source, 'field');
  assert.equal(result.failures[0]?.code, 'value_above_maximum');
  assert.deepEqual(definition, snapshot);

  const restricted = configured('jsonb', 'checkbox-list', [], { options: ['a', 'b'] });
  const optionResult = validateCanonicalValue(restricted, canonicalJsonValue('["a","c"]'));
  assert.equal(optionResult.failures[0]?.path, '$[1]');
  assert.equal(optionResult.failures[0]?.code, 'value_not_allowed');
});
