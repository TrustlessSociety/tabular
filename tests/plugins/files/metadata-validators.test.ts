//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { runMigrations } from '../../../src/plugins/database/helpers/migrator.js';
import { loadMigrations } from '../../../src/plugins/database/migrations/index.js';
import { updateColumnPresentationMetadata } from '../../../src/plugins/files/helpers/metadata.js';
import { createPGliteTestDatabase } from '../database/helpers/pglite.js';

const suffix = 'A'.repeat(43);
const schemaId = `schema_${suffix}`;
const fileId = `obj_${suffix}`;
const columnId = `col_${suffix}`;
const fingerprint = 'a'.repeat(64);

test('validator metadata round trips without target-table DDL or row mutation', async () => {
  const local = await createPGliteTestDatabase();
  try {
    await runMigrations(local.transaction, await loadMigrations(), { advisoryLock: false });
    await local.database.execute('CREATE TABLE public.validator_metadata_probe (value text)');
    await local.database.execute(
      "INSERT INTO public.validator_metadata_probe (value) VALUES ('legacy raw value')"
    );
    const identity = await local.database.execute<{
      database_oid: string | number,
      namespace_oid: string | number,
      relation_oid: string | number,
    }>(`
      SELECT d.oid AS database_oid, n.oid AS namespace_oid, c.oid AS relation_oid
        FROM pg_database d, pg_namespace n, pg_class c
       WHERE d.datname = current_database()
         AND n.nspname = 'public'
         AND c.relnamespace = n.oid
         AND c.relname = 'validator_metadata_probe'
    `);
    const ids = identity.rows[0]!;
    await local.database.execute(`
      INSERT INTO tabular.catalog_schemas (
        id, connection_id, database_oid, namespace_oid, accepted_name, observed_name
      ) VALUES (?, 'default', ?::oid, ?::oid, 'public', 'public')
    `, [schemaId, String(ids.database_oid), String(ids.namespace_oid)]);
    await local.database.execute(`
      INSERT INTO tabular.catalog_objects (
        id, schema_id, connection_id, database_oid, relation_oid, object_kind,
        accepted_schema, accepted_name, observed_schema, observed_name,
        accepted_fingerprint, observed_fingerprint
      ) VALUES (?, ?, 'default', ?::oid, ?::oid, 'table', 'public',
        'validator_metadata_probe', 'public', 'validator_metadata_probe', ?, ?)
    `, [
      fileId,
      schemaId,
      String(ids.database_oid),
      String(ids.relation_oid),
      fingerprint,
      fingerprint
    ]);
    await local.database.execute(`
      INSERT INTO tabular.catalog_columns (
        id, object_id, attribute_number, accepted_name, observed_name,
        accepted_fingerprint, observed_fingerprint
      ) VALUES (?, ?, 1, 'value', 'value', ?, ?)
    `, [columnId, fileId, fingerprint, fingerprint]);
    await local.database.execute(`
      INSERT INTO tabular.column_metadata (
        column_id, object_id, catalog_column_id, display_name, field_kind, format_kind
      ) VALUES (?, ?, ?, 'Value', 'text', 'plain-text')
    `, [columnId, fileId, columnId]);

    const beforeShape = await local.database.execute<{
      columns: string | number,
      rows: string | number,
      value: string,
    }>(`
      SELECT (SELECT count(*) FROM pg_attribute
               WHERE attrelid = 'public.validator_metadata_probe'::regclass
                 AND attnum > 0 AND NOT attisdropped) AS columns,
             (SELECT count(*) FROM public.validator_metadata_probe) AS rows,
             (SELECT value FROM public.validator_metadata_probe LIMIT 1) AS value
    `);
    const result = await updateColumnPresentationMetadata(local.database, {
      fileId,
      columnId,
      expectedMetadataVersion: 1,
      storageType: 'text',
      field: 'text',
      format: 'wrapped',
      fieldConfig: {},
      formatConfig: { wrap: true },
      validatorConfig: {
        version: 1,
        rules: [{
          id: 'vr_not_empty_0001',
          kind: 'not_empty',
          args: {},
          message: 'Enter a value'
        }]
      }
    });
    assert.deepEqual(result, { metadataVersion: 2 });

    const stored = await local.database.execute<{
      validator_config: { version: number, rules: Array<{ id: string, }>, },
      format_kind: string,
    }>(`
      SELECT validator_config, format_kind
        FROM tabular.column_metadata WHERE column_id = ?
    `, [columnId]);
    assert.equal(stored.rows[0]?.validator_config.version, 1);
    assert.equal(stored.rows[0]?.validator_config.rules[0]?.id, 'vr_not_empty_0001');
    assert.equal(stored.rows[0]?.format_kind, 'wrapped');

    const afterShape = await local.database.execute<{
      columns: string | number,
      rows: string | number,
      value: string,
    }>(`
      SELECT (SELECT count(*) FROM pg_attribute
               WHERE attrelid = 'public.validator_metadata_probe'::regclass
                 AND attnum > 0 AND NOT attisdropped) AS columns,
             (SELECT count(*) FROM public.validator_metadata_probe) AS rows,
             (SELECT value FROM public.validator_metadata_probe LIMIT 1) AS value
    `);
    assert.deepEqual(afterShape.rows[0], beforeShape.rows[0]);
  } finally {
    await local.close();
  }
});
