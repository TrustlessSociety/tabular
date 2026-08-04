import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAction } from '../helpers/validation.js';

const fileId = `obj_${'f'.repeat(43)}`;
const rowId = `row_${'r'.repeat(24)}`;
const columnId = `col_${'c'.repeat(43)}`;
const version = `ver_${'v'.repeat(24)}`;

test('insert and delete are closed typed capability actions', () => {
  assert.equal(validateAction({
    type: 'record.insert',
    commandId: 'cmd_insert_contract',
    fileId,
    patch: [{ columnId, value: { type: 'text', value: 'created' } }]
  }).type, 'record.insert');
  assert.equal(validateAction({
    type: 'record.delete',
    commandId: 'cmd_delete_contract',
    fileId,
    rowId,
    expectedVersion: version
  }).type, 'record.delete');
  assert.throws(() => validateAction({
    type: 'record.delete',
    commandId: 'cmd_delete_contract',
    fileId,
    rowId,
    expectedVersion: version,
    preconditions: []
  } as never), /unknown field/);
});
