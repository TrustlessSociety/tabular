//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { canonicalJsonValue } from '../../../src/plugins/capability/helpers/value-contracts.js';
import { validateAction } from '../../../src/plugins/capability/helpers/validation.js';

const suffix = 'A'.repeat(43);

test('canonical JSON actions retain exact source and refined top-level shape', () => {
  const object = canonicalJsonValue('{"amount":9007199254740993123456789.0001}');
  assert.equal(object.shape, 'object');
  assert.equal(object.source, '{"amount":9007199254740993123456789.0001}');
  assert.doesNotThrow(() => validateAction({
    type: 'record.insert',
    commandId: 'cmd_json_contract_0001',
    fileId: `obj_${suffix}`,
    patch: [{ columnId: `col_${suffix}`, value: object }]
  }));

  const list = canonicalJsonValue('["one","two"]');
  assert.equal(list.shape, 'string-array');
  assert.throws(() => validateAction({
    type: 'record.insert',
    commandId: 'cmd_json_contract_0002',
    fileId: `obj_${suffix}`,
    patch: [{ columnId: `col_${suffix}`, value: { ...list, shape: 'object' } }]
  }), /object or homogeneous string array/);
});
