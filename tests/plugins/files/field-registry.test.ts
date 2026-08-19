//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import {
  columnAxesAreCompatible,
  fileStorageTypeForPostgres,
  recommendedColumnAxes,
  validateColumnPresentationUpdate,
  validateValidatorConfig
} from '../../../src/plugins/files/helpers/field-registry.js';

const suffix = 'A'.repeat(43);

test('Field defaults cover temporal and refined JSONB families without fallthrough', () => {
  assert.deepEqual(recommendedColumnAxes('time'), {
    storageType: 'time',
    format: 'time'
  });
  assert.deepEqual(recommendedColumnAxes('metadata'), {
    storageType: 'jsonb',
    format: 'metadata'
  });
  assert.deepEqual(recommendedColumnAxes('tags'), {
    storageType: 'jsonb',
    format: 'tags'
  });
  assert.deepEqual(recommendedColumnAxes('text-list'), {
    storageType: 'jsonb',
    format: 'list'
  });
  assert.deepEqual(recommendedColumnAxes('multi-select'), {
    storageType: 'jsonb',
    format: 'tags'
  });
  assert.deepEqual(recommendedColumnAxes('checkbox-list'), {
    storageType: 'jsonb',
    format: 'list'
  });
});

test('compatibility derives from canonical storage and refined JSON shape', () => {
  assert.equal(columnAxesAreCompatible('numeric', 'number', 'currency'), true);
  assert.equal(columnAxesAreCompatible('jsonb', 'metadata', 'metadata'), true);
  assert.equal(columnAxesAreCompatible('jsonb', 'tags', 'metadata'), false);
  assert.equal(columnAxesAreCompatible('text', 'number', 'plain-text'), false);
  assert.equal(columnAxesAreCompatible('text', 'markdown-source', 'markdown'), true);
  assert.equal(fileStorageTypeForPostgres('numeric(20, 6)'), 'numeric');
  assert.equal(fileStorageTypeForPostgres('time without time zone'), 'time');
});

test('versioned validator metadata is closed, bounded, and duplicate-free', () => {
  const config = validateValidatorConfig({
    version: 1,
    rules: [{
      id: 'vr_minimum_0001',
      kind: 'min_value',
      args: { value: '0', inclusive: true },
      message: 'Must be zero or more'
    }]
  });
  assert.equal(config.rules[0]?.args.value, '0');

  assert.throws(() => validateValidatorConfig({
    version: 1,
    rules: [
      { id: 'vr_minimum_0001', kind: 'min_value', args: { value: '0' } },
      { id: 'vr_minimum_0002', kind: 'min_value', args: { value: '0' } }
    ]
  }), /Duplicate validators/);
});

test('metadata-only presentation updates validate all independent axes', () => {
  const update = validateColumnPresentationUpdate({
    fileId: `obj_${suffix}`,
    columnId: `col_${suffix}`,
    expectedMetadataVersion: 3,
    storageType: 'jsonb',
    field: 'tags',
    format: 'tags',
    fieldConfig: {},
    formatConfig: {},
    validatorConfig: { version: 1, rules: [] }
  });
  assert.equal(update.expectedMetadataVersion, 3);
  assert.throws(() => validateColumnPresentationUpdate({
    ...update,
    format: 'metadata'
  }), /incompatible/);
});
