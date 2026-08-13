//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import {
  constraintName,
  defaultSql,
  generatedSql,
  promotionValueSql,
  qualified
} from '../../../src/plugins/files/helpers/compiler.js';
import { normalizedPhysicalName, validateFileDdlAction } from '../../../src/plugins/files/helpers/validation.js';

const suffix = 'A'.repeat(43);
const fileId = `obj_${suffix}`;
const columnId = `col_${suffix}`;

test('physical names are deterministic, bounded, and never interpolate unsafe segments', () => {
  assert.equal(normalizedPhysicalName('Customer Orders'), 'customer_orders');
  assert.equal(normalizedPhysicalName('Q3 orders'), 'q3_orders');
  assert.equal(normalizedPhysicalName('你好'), 'file_untitled');
  assert.equal(normalizedPhysicalName('x'.repeat(100)).length, 63);
  assert.equal(qualified('workspace', 'orders'), '"workspace"."orders"');
  assert.throws(
    () => validateFileDdlAction({
      type: 'file.create',
      commandId: 'cmd_safe_name_001',
      schemaId: `schema_${suffix}`,
      displayName: 'Unsafe',
      physicalName: 'x";drop_schema'
    }),
    /safe lower_case/
  );
});

test('structured compilers quote literals and expose no raw SQL transport', () => {
  assert.equal(defaultSql({ mode: 'literal', value: { type: 'text', value: "O'Reilly" } }), "'O''Reilly'::text");
  const generated = generatedSql(
    { kind: 'concat-text', columnIds: [columnId], separator: "'" },
    new Map([[columnId, 'given_name']])
  );
  assert.equal(generated, `COALESCE("given_name", ''::text)`);
  assert.match(promotionValueSql('__tabular_json_v1', columnId, 'bigint'), /::bigint/);
  const action = {
    type: 'key.create' as const,
    commandId: 'cmd_constraint_001',
    fileId,
    columnIds: [columnId],
    key: 'unique' as const
  };
  assert.match(constraintName(action, 'uniq'), /^tabular_uniq_[a-f0-9]{20}$/);
  assert.throws(
    () => validateFileDdlAction({
      type: 'column.create',
      commandId: 'cmd_column_bad_001',
      fileId,
      displayName: 'Amount',
      storageType: 'numeric;drop table x' as never,
      field: 'number',
      format: 'plain-text'
    }),
    /Unsupported storage type/
  );
  assert.throws(
    () => validateFileDdlAction({
      type: 'file.drop', commandId: 'cmd_closed_contract_001', fileId,
      sql: 'DROP SCHEMA workspace CASCADE', ownerRole: 'postgres'
    } as never),
    /cannot contain unknown fields/
  );
});
