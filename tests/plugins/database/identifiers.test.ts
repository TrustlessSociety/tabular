//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import {
  qualifiedIdentifier,
  quoteIdentifier,
  quoteQualifiedIdentifier,
  validateIdentifier
} from '../../../src/plugins/database/helpers/identifiers.js';

test('PostgreSQL identifiers are validated and quoted one segment at a time', () => {
  assert.equal(quoteIdentifier('ordinary'), '"ordinary"');
  assert.equal(quoteIdentifier('A "quoted" name'), '"A ""quoted"" name"');
  assert.equal(quoteIdentifier('顧客'), '"顧客"');
  assert.equal(
    quoteQualifiedIdentifier(qualifiedIdentifier('Business.Data', 'Quarter.1')),
    '"Business.Data"."Quarter.1"'
  );
  assert.throws(() => validateIdentifier(''), /cannot be empty/);
  assert.throws(() => validateIdentifier('contains\0nul'), /NUL/);
  assert.equal(validateIdentifier('a'.repeat(63)), 'a'.repeat(63));
  assert.throws(() => validateIdentifier('a'.repeat(64)), /63-byte/);
  assert.throws(() => validateIdentifier('顧'.repeat(22)), /63-byte/);
});
