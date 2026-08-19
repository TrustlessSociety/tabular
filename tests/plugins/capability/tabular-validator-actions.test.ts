//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { DatabaseExecutor } from '../../../src/plugins/database/helpers/executor.js';
import { validateMutationRows } from '../../../src/plugins/capability/helpers/service.js';

test('every capability mutation path can reject Tabular-invalid input before PostgreSQL', async () => {
  const columnId = `col_${'v'.repeat(43)}`;
  const database = {
    execute: async () => ({
      rows: [{
        column_id: columnId,
        field_kind: 'number',
        field_config: {},
        validator_config: {
          version: 1,
          rules: [{
            id: 'vr_minimum_0001',
            kind: 'min_value',
            args: { value: '10', inclusive: true },
            message: 'Use ten or more'
          }]
        }
      }],
      affectedRows: 1
    })
  } as unknown as DatabaseExecutor;
  const adapter = { validatePatch: async () => [] };
  const plan = {
    adapter,
    target: { fileId: `obj_${'f'.repeat(43)}`, schemaVersion: 'schema', state: {} }
  };
  const patch = [{ columnId, value: { type: 'decimal' as const, value: '9.999999999999999999' } }];

  const issues = await validateMutationRows(database, plan as never, [{ patch }]);
  assert.deepEqual(issues, [{
    columnId,
    code: 'value_below_minimum',
    message: 'Use ten or more'
  }]);
  assert.equal(patch[0]!.value.value, '9.999999999999999999');
});
