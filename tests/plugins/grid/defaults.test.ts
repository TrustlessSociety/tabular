//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { literalGridDefault, valueAfterFieldExit } from '../../../src/plugins/grid/helpers/defaults.js';

test('owned PostgreSQL literal defaults project without lossy coercion', () => {
  assert.equal(literalGridDefault("'O''Brien'::text", 'text'), "O'Brien");
  assert.equal(literalGridDefault("'9007199254740993.0001'::numeric", 'numeric'), '9007199254740993.0001');
  assert.equal(literalGridDefault('false', 'boolean'), false);
  assert.equal(literalGridDefault('TRUE', 'boolean'), true);
  assert.equal(literalGridDefault('CURRENT_TIMESTAMP', 'timestamptz'), undefined);
});

test('a literal default applies only when its own field exits empty', () => {
  const column = {
    id: 'active',
    coordinate: 'A',
    label: 'Active',
    kind: 'switch' as const,
    defaultValue: false
  };

  assert.equal(valueAfterFieldExit(column, null), false);
  assert.equal(valueAfterFieldExit(column, ''), false);
  assert.equal(valueAfterFieldExit(column, true), true);
});
