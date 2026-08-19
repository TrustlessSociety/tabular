//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type {
  CanonicalJsonValue
} from '../../../src/plugins/capability/helpers/value-contracts.js';
import { recommendedColumnAxes } from '../../../src/plugins/files/helpers/field-registry.js';
import {
  FieldCodecError,
  decodeExpandedFieldValue,
  decodeMetadataValue,
  expandedFieldSource,
  stringArrayItems
} from '../../../src/plugins/grid/helpers/field-codecs.js';

/**
 * Require the stable codec error code from one rejected public operation.
 */
function assertCodecError(operation: () => unknown, code: FieldCodecError['code']) {
  assert.throws(operation, (error: unknown) => (
    error instanceof FieldCodecError && error.code === code
  ));
}

test('Metadata retains exact source and exact numeric tokens', () => {
  //Keep unusual whitespace and an unsafe JavaScript integer in the source so
  //the test proves validation never becomes lossy serialization.
  const source = ' { "amount" : 9007199254740993123456789.0001, "open": true } ';
  const value = decodeMetadataValue(source);

  assert.deepEqual(value, { type: 'json', shape: 'object', source });
  assert.equal(expandedFieldSource(value), source);
});

test('Metadata rejects duplicate decoded keys before JSONB serialization', () => {
  //Escaped and literal spellings decode to the same PostgreSQL object key and
  //must not reach JSON.parse or JSONB's last-key-wins behavior.
  assertCodecError(
    () => decodeMetadataValue('{"name":"first","\\u006eame":"second"}'),
    'duplicate_key'
  );
  assertCodecError(
    () => decodeMetadataValue('{"same":1,"same":2}'),
    'duplicate_key'
  );
});

test('Metadata accepts only a top-level object with scalar JSON values', () => {
  assert.deepEqual(decodeMetadataValue('{}'), {
    type: 'json', shape: 'object', source: '{}'
  });
  assert.deepEqual(decodeMetadataValue('{"text":"x","nil":null,"off":false}'), {
    type: 'json',
    shape: 'object',
    source: '{"text":"x","nil":null,"off":false}'
  });

  assertCodecError(() => decodeMetadataValue('[]'), 'invalid_shape');
  assertCodecError(() => decodeMetadataValue('{"nested":[]}'), 'invalid_shape');
  assertCodecError(() => decodeMetadataValue('{"nested":{}}'), 'invalid_shape');
  assertCodecError(() => decodeMetadataValue('{"bad":01}'), 'invalid_json');
  assertCodecError(() => decodeMetadataValue('{"bad":true,}'), 'invalid_json');
});

test('string-array Fields preserve source order, duplicates, NULL, and empty collections', () => {
  const source = ' [ "second", "first", "second" ] ';
  const value = decodeExpandedFieldValue('text-list', source);

  assert.deepEqual(value, { type: 'json', shape: 'string-array', source });
  assert.deepEqual(stringArrayItems(value), ['second', 'first', 'second']);
  assert.equal(decodeExpandedFieldValue('text-list', null), null);
  assert.deepEqual(decodeExpandedFieldValue('text-list', '[]'), {
    type: 'json', shape: 'string-array', source: '[]'
  });
});

test('Tags require exact unique, non-blank string items without sorting', () => {
  const source = '["beta","alpha"]';
  assert.equal(decodeExpandedFieldValue('tags', source)?.source, source);
  assert.equal(decodeExpandedFieldValue('tags', '[]')?.source, '[]');

  assertCodecError(
    () => decodeExpandedFieldValue('tags', '["same","same"]'),
    'duplicate_item'
  );
  assertCodecError(
    () => decodeExpandedFieldValue('tags', '["valid","   "]'),
    'empty_item'
  );
});

test('all collection codecs reject heterogeneous or malformed JSON arrays', () => {
  assertCodecError(
    () => decodeExpandedFieldValue('text-list', '["one",2]'),
    'invalid_shape'
  );
  assertCodecError(
    () => decodeExpandedFieldValue('multi-select', '{"one":true}'),
    'invalid_shape'
  );
  assertCodecError(
    () => decodeExpandedFieldValue('checkbox-list', '["one",]'),
    'invalid_json'
  );
});

test('configured collection choices enforce exact option membership', () => {
  const options = { allowedValues: ['Open', 'Closed'] };
  assert.equal(
    decodeExpandedFieldValue('multi-select', '["Closed","Open"]', options)?.source,
    '["Closed","Open"]'
  );
  assert.equal(
    decodeExpandedFieldValue('checkbox-list', '[]', options)?.source,
    '[]'
  );
  assertCodecError(
    () => decodeExpandedFieldValue('multi-select', '["open"]', options),
    'unknown_item'
  );
});

test('codec bounds oversized UTF-8 drafts before canonical transport', () => {
  const oversized = `{"value":"${'x'.repeat(100_001)}"}`;
  assertCodecError(() => decodeMetadataValue(oversized), 'value_too_large');
});

test('source projection never confuses SQL NULL with a JSON value', () => {
  const empty = decodeExpandedFieldValue('text-list', '[]') as CanonicalJsonValue;
  assert.equal(expandedFieldSource(null), null);
  assert.equal(expandedFieldSource(empty), '[]');
});

test('expanded and corrected scalar Field defaults come from the shared registry', () => {
  assert.deepEqual(recommendedColumnAxes('time'), {
    storageType: 'time', format: 'time'
  });
  assert.deepEqual(recommendedColumnAxes('tags'), {
    storageType: 'jsonb', format: 'tags'
  });
  assert.deepEqual(recommendedColumnAxes('text-list'), {
    storageType: 'jsonb', format: 'list'
  });
});
