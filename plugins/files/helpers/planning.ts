//client
import type {
  StableCatalogSnapshot,
  StableColumn,
  StableObject
} from '../../catalog/helpers/contracts.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { ExpectedDdlContext, FileDdlAction, FileStorageType } from './contracts.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import {
  deriveSafeOwner,
  readExpectedFingerprint,
  readRelationFingerprint
} from './fingerprint.js';
import {
  normalizedPhysicalName,
  physicalIdentifier,
  validateColumnDefaultForStorage
} from './validation.js';

/**
 * Prepare the file ddl plan.
 */
export async function prepareFileDdlPlan(
  database: DatabaseExecutor,
  stable: StableCatalogSnapshot,
  input: FileDdlAction
) {
  const expected: ExpectedDdlContext = { databaseOid: stable.databaseOid } as ExpectedDdlContext;
  if (input.type === 'file.create') {
    const schema = [...stable.schemas.values()].find((item) => item.stableId === input.schemaId);
    if (!schema) unavailable('The destination schema is unavailable');
    const physicalName = await relationName(
      database,
      schema.namespaceOid,
      input.physicalName,
      normalizedPhysicalName(input.displayName)
    );
    const action: FileDdlAction = { ...input, physicalName };
    Object.assign(expected, {
      schemaId: schema.stableId,
      namespaceOid: schema.namespaceOid,
      schemaName: schema.name,
      physicalNameOverridden: Boolean(input.physicalName)
    });
    return { action, expected, summary: planSummary(action, expected) };
  }

  let action = structuredClone(input);

  const object = stableObject(stable, action.fileId);
  if (!object) unavailable('The file is unavailable');
  if (!['table', 'partitioned-table'].includes(object.kind)) {
    unavailable('The file is read-only for schema changes');
  }
  const schema = [...stable.schemas.values()].find((item) => item.stableId === object.schemaId);
  if (!schema) unavailable('The file schema is unavailable');
  const aliases = await columnAliases(database, object.stableId);
  Object.assign(expected, {
    schemaId: schema.stableId,
    namespaceOid: schema.namespaceOid,
    schemaName: schema.name,
    fileId: object.stableId,
    relationOid: object.relationOid,
    relationName: object.name
  });
  expected.fileMetadataVersion = await metadataVersion(
    database,
    'file_metadata',
    'object_id',
    object.stableId
  );

  if (action.type === 'file.rename' && action.physicalName && action.physicalName !== object.name) {
    await assertRelationNameFree(database, schema.namespaceOid, action.physicalName);
  }
  if (action.type === 'column.create' || action.type === 'json.promote') {
    const physicalName = await columnName(
      database,
      object.relationOid,
      action.physicalName,
      normalizedPhysicalName(action.displayName)
    );
    action = { ...action, physicalName };
  } else if (action.type === 'column.configure') {
    const current = requireColumn(stable, object, action.columnId, aliases);
    expected.columnMetadataVersions = {
      [action.columnId]: await metadataVersion(
        database,
        'column_metadata',
        'column_id',
        action.columnId,
        object.stableId
      )
    };
    if (action.default) {
      const storageType = action.storageType || await liveStorageType(
        database,
        object.relationOid,
        current.attributeNumber
      );
      validateColumnDefaultForStorage(storageType, action.default);
    }
    if (action.physicalName) {
      if (action.physicalName !== current.name) {
        await assertColumnNameFree(database, object.relationOid, action.physicalName);
      }
    }
    if (action.unique === false) {
      const managed = await database.execute<{
        oid: string | number,
        name: string,
      }>(`
        SELECT constraint_oid AS oid, physical_name::text AS name
          FROM tabular.file_managed_constraints
         WHERE object_id = ? AND constraint_kind = 'unique'
           AND source_column_ids = jsonb_build_array(?::text)
         FOR SHARE
      `, [object.stableId, action.columnId]);
      if (!managed.rows.length) {
        const live = await database.execute<{ found: boolean, }>(`
          SELECT EXISTS (
            SELECT 1
              FROM pg_constraint
             WHERE conrelid = ?::oid AND contype = 'u'
               AND conkey = ARRAY[?::smallint]::smallint[]
          ) AS found
        `, [object.relationOid, current.attributeNumber]);
        if (live.rows[0]?.found) {
          unavailable('Only a Tabular-managed unique constraint can be removed');
        }
      }
      expected.managedConstraints = managed.rows.map((row) => ({
        oid: String(row.oid), name: row.name, kind: 'unique' as const
      }));
    }
  } else if (action.type === 'column.drop') {
    requireColumn(stable, object, action.columnId, aliases);
    expected.columnMetadataVersions = {
      [action.columnId]: await metadataVersion(
        database,
        'column_metadata',
        'column_id',
        action.columnId,
        object.stableId
      )
    };
  } else if (action.type === 'key.create') {
    const columns = action.columnIds.map((columnId) => requireColumn(stable, object, columnId, aliases));
    expected.columnIds = [...action.columnIds];
    expected.columnAttributeNumbers = columns.map((column) => column.attributeNumber);
  } else if (action.type === 'relation.create') {
    const columns = action.columnIds.map((columnId) => requireColumn(stable, object, columnId, aliases));
    const target = stableObject(stable, action.targetFileId);
    if (!target || !['table', 'partitioned-table'].includes(target.kind)) {
      unavailable('The relation target is unavailable or read-only');
    }
    const targetSchema = [...stable.schemas.values()].find((item) => item.stableId === target.schemaId);
    if (!targetSchema) unavailable('The relation target schema is unavailable');
    const targetAliases = await columnAliases(database, target.stableId);
    const targetColumns = action.targetColumnIds.map((columnId) =>
      requireColumn(stable, target, columnId, targetAliases)
    );
    Object.assign(expected, {
      columnIds: [...action.columnIds],
      targetFileId: target.stableId,
      targetRelationOid: target.relationOid,
      targetSchemaName: targetSchema.name,
      targetRelationName: target.name,
      targetColumnIds: [...action.targetColumnIds],
      columnAttributeNumbers: columns.map((column) => column.attributeNumber),
      targetColumnAttributeNumbers: targetColumns.map((column) => column.attributeNumber)
    });
    const pairs = columns.map(() => '(?::smallint, ?::smallint)').join(', ');
    const compatible = await database.execute<{ compatible: boolean, }>(`
      SELECT bool_and(source.atttypid = target.atttypid
                  AND source.atttypmod = target.atttypmod
                  AND source.attcollation = target.attcollation) AS compatible
        FROM (VALUES ${pairs}) AS mapping(source_number, target_number)
        JOIN pg_attribute source
          ON source.attrelid = ?::oid AND source.attnum = mapping.source_number
        JOIN pg_attribute target
          ON target.attrelid = ?::oid AND target.attnum = mapping.target_number
    `, [
      ...columns.flatMap((column, index) => [column.attributeNumber, targetColumns[index]!.attributeNumber]),
      object.relationOid,
      target.relationOid
    ]);
    if (!compatible.rows[0]?.compatible) {
      unavailable('Every explicitly mapped relation source must match its target key type and collation');
    }
  } else if (action.type === 'hidden.install') {
    const owned = await database.execute<{ found: boolean, }>(`
      SELECT EXISTS (
        SELECT 1 FROM tabular.column_metadata
         WHERE object_id = ? AND hidden_purpose = ?
      ) AS found
    `, [object.stableId, action.purpose]);
    if (owned.rows[0]?.found) conflict('The hidden field is already installed');
    const hint = action.purpose === 'row-id'
      ? '__tabular_row_id'
      : action.purpose === 'unstructured-json'
        ? '__tabular_json'
        : '__tabular_row';
    const physicalName = await versionedHiddenName(database, object.relationOid, hint);
    action = { ...action, physicalName };
  }

  if (action.type === 'column.create' && action.generated) {
    const columns = action.generated.columnIds.map((columnId) =>
      requireColumn(stable, object, columnId, aliases)
    );
    for (const column of columns) {
      const compatible = await database.execute<{ compatible: boolean, }>(`
        SELECT a.atttypid IN ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype)
          AS compatible
          FROM pg_attribute a
         WHERE a.attrelid = ?::oid AND a.attnum = ?::smallint
           AND a.attnum > 0 AND NOT a.attisdropped
      `, [object.relationOid, column.attributeNumber]);
      if (!compatible.rows[0]?.compatible) {
        unavailable('Generated text concatenation requires text-compatible source columns');
      }
    }
    expected.columnIds = [...action.generated.columnIds];
    expected.columnAttributeNumbers = columns.map((column) => column.attributeNumber);
  }
  if (action.type === 'json.promote') {
    const hidden = requireColumn(stable, object, action.hiddenColumnId, aliases);
    const owned = await database.execute<{ found: boolean, }>(`
      SELECT EXISTS (
        SELECT 1 FROM tabular.column_metadata
         WHERE object_id = ? AND column_id = ?
           AND hidden AND hidden_purpose = 'unstructured-json'
      ) AS found
    `, [object.stableId, hidden.stableId]);
    if (!owned.rows[0]?.found) unavailable('The source JSON field is not Tabular-owned');
    const logical = await database.execute<{ found: boolean, }>(`
      SELECT EXISTS (
        SELECT 1 FROM tabular.column_metadata
         WHERE object_id = ? AND column_id = ?
           AND storage_kind = 'unstructured-json' AND NOT hidden
      ) AS found
    `, [object.stableId, action.jsonKey]);
    if (!logical.rows[0]?.found) unavailable('The unstructured field is unavailable');
    expected.columnMetadataVersions = {
      [action.jsonKey]: await metadataVersion(
        database,
        'column_metadata',
        'column_id',
        action.jsonKey,
        object.stableId
      )
    };
    expected.columnIds = [hidden.stableId];
    expected.columnAttributeNumbers = [hidden.attributeNumber];
  }
  if ('columnId' in action && typeof action.columnId === 'string') {
    const column = requireColumn(stable, object, action.columnId, aliases);
    expected.columnIds = [action.columnId];
    expected.columnAttributeNumbers = [column.attributeNumber];
  }
  return { action, expected, summary: planSummary(action, expected) };
}

/**
 * Return the authorize file ddl plan result.
 */
export async function authorizeFileDdlPlan(
  database: DatabaseExecutor,
  action: FileDdlAction,
  expected: ExpectedDdlContext
) {
  const role = await database.execute<{ oid: string, name: string, }>(`
    SELECT current_user::regrole::oid::text AS oid, current_user::text AS name
  `);
  const current = role.rows[0];
  if (!current) denied();
  const owner = await deriveSafeOwner(database, expected);
  if (!owner) denied();
  if (expected.ownerRoleOid && (
    expected.ownerRoleOid !== owner.oid || expected.ownerRoleName !== owner.name
  )) drift();
  expected.ownerRoleOid = owner.oid;
  expected.ownerRoleName = owner.name;
  const fingerprint = await readExpectedFingerprint(database, expected);
  if (expected.ddlFingerprint && expected.ddlFingerprint !== fingerprint) drift();
  expected.ddlFingerprint = fingerprint;
  if (action.type === 'relation.create') {
    const targetSchema = await database.execute<{ allowed: boolean, }>(`
      SELECT has_schema_privilege(?::oid, c.relnamespace, 'USAGE') AS allowed
        FROM pg_class c
       WHERE c.oid = ?::oid
    `, [owner.oid, expected.targetRelationOid!]);
    if (!targetSchema.rows[0]?.allowed) denied();
    const targetAttributes = expected.targetColumnAttributeNumbers || [];
    for (const attribute of targetAttributes) {
      const references = await database.execute<{ allowed: boolean, }>(`
        SELECT has_column_privilege(?::oid, ?::oid, ?::smallint, 'REFERENCES') AS allowed
      `, [owner.oid, expected.targetRelationOid!, attribute]);
      if (!references.rows[0]?.allowed) denied();
    }
    const eligible = await database.execute<{ key_numbers: string, }>(`
      SELECT i.indkey::text AS key_numbers
        FROM pg_index i
        LEFT JOIN pg_constraint c
          ON c.conindid = i.indexrelid AND c.conrelid = i.indrelid
       WHERE i.indrelid = ?::oid
         AND (c.oid IS NULL OR (c.contype IN ('p', 'u')
           AND c.convalidated AND NOT c.condeferrable))
         AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
         AND i.indpred IS NULL AND i.indexprs IS NULL
         AND i.indnkeyatts = ?
    `, [
      expected.targetRelationOid!,
      targetAttributes.length
    ]);
    if (!eligible.rows.some((row) =>
      row.key_numbers.trim().split(/\s+/).slice(0, targetAttributes.length)
        .map(Number).every((number, index) => number === targetAttributes[index])
    )) unavailable('The relation target key is not eligible');
    const targetFingerprint = await readRelationFingerprint(
      database,
      expected.targetRelationOid!
    );
    if (expected.targetDdlFingerprint
      && expected.targetDdlFingerprint !== targetFingerprint) drift();
    expected.targetDdlFingerprint = targetFingerprint;
  }
  return { roleOid: current.oid, roleName: current.name };
}

/**
 * Return the relation name result.
 */
async function relationName(
  database: DatabaseExecutor,
  namespaceOid: string,
  explicit: string | undefined,
  derived: string
) {
  if (explicit) {
    physicalIdentifier(explicit);
    await assertRelationNameFree(database, namespaceOid, explicit);
    return explicit;
  }
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const candidate = suffix === 1 ? derived : suffixed(derived, suffix);
    if (!await relationExists(database, namespaceOid, candidate)) return candidate;
  }
  conflict('No collision-safe PostgreSQL file name is available');
}

/**
 * Return the column name result.
 */
async function columnName(
  database: DatabaseExecutor,
  relationOid: string,
  explicit: string | undefined,
  derived: string
) {
  if (explicit) {
    physicalIdentifier(explicit);
    await assertColumnNameFree(database, relationOid, explicit);
    return explicit;
  }
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const candidate = suffix === 1 ? derived : suffixed(derived, suffix);
    if (!await columnExists(database, relationOid, candidate)) return candidate;
  }
  conflict('No collision-safe PostgreSQL column name is available');
}

/**
 * Return the versioned hidden name result.
 */
async function versionedHiddenName(database: DatabaseExecutor, relationOid: string, hint: string) {
  for (let version = 1; version <= 32; version += 1) {
    const candidate = `${hint}_v${version}`;
    if (!await columnExists(database, relationOid, candidate)) return candidate;
  }
  conflict('No collision-safe hidden-field name is available');
}

/**
 * Assert the relation name free.
 */
async function assertRelationNameFree(database: DatabaseExecutor, namespaceOid: string, name: string) {
  if (await relationExists(database, namespaceOid, name)) conflict('The PostgreSQL file name is occupied');
}
/**
 * Return the relation exists result.
 */
async function relationExists(database: DatabaseExecutor, namespaceOid: string, name: string) {
  const result = await database.execute<{ found: boolean, }>(`
    SELECT EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = ?::oid AND relname = ?) AS found
  `, [namespaceOid, name]);
  return Boolean(result.rows[0]?.found);
}
/**
 * Assert the column name free.
 */
async function assertColumnNameFree(database: DatabaseExecutor, relationOid: string, name: string) {
  if (await columnExists(database, relationOid, name)) conflict('The PostgreSQL column name is occupied');
}
/**
 * Return the column exists result.
 */
async function columnExists(database: DatabaseExecutor, relationOid: string, name: string) {
  const result = await database.execute<{ found: boolean, }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = ?::oid AND attname = ? AND attnum > 0 AND NOT attisdropped
    ) AS found
  `, [relationOid, name]);
  return Boolean(result.rows[0]?.found);
}
/**
 * Return the stable object result.
 */
function stableObject(stable: StableCatalogSnapshot, fileId: string) {
  return [...stable.objects.values()].find((item) => item.stableId === fileId);
}
/**
 * Return the require column result.
 */
function requireColumn(
  stable: StableCatalogSnapshot,
  object: StableObject,
  columnId: string,
  aliases: Map<string, string>
) {
  const catalogColumnId = aliases.get(columnId) || columnId;
  const column = [...stable.columns.values()].find((item) =>
    item.objectId === object.stableId && item.stableId === catalogColumnId
  );
  if (!column) unavailable('The column is unavailable');
  if (column.state !== 'current') unavailable('The column has unresolved PostgreSQL drift');
  return column as StableColumn;
}
/**
 * Return the column aliases result.
 */
async function columnAliases(database: DatabaseExecutor, objectId: string) {
  const result = await database.execute<{
    column_id: string,
    catalog_column_id: string,
  }>(`
    SELECT column_id, catalog_column_id
      FROM tabular.column_metadata
     WHERE object_id = ? AND catalog_column_id IS NOT NULL
  `, [objectId]);
  return new Map(result.rows.map((row) => [row.column_id, row.catalog_column_id]));
}
/**
 * Return the metadata version result.
 */
async function metadataVersion(
  database: DatabaseExecutor,
  table: 'file_metadata' | 'column_metadata',
  key: 'object_id' | 'column_id',
  value: string,
  objectId?: string
) {
  const result = await database.execute<{ metadata_version: string | number, }>(`
    SELECT metadata_version FROM tabular.${table}
     WHERE ${key} = ?${objectId ? ' AND object_id = ?' : ''}
  `, objectId ? [value, objectId] : [value]);
  return result.rows[0] ? Number(result.rows[0].metadata_version) : null;
}
/**
 * Return the live storage type result.
 */
async function liveStorageType(
  database: DatabaseExecutor,
  relationOid: string,
  attributeNumber: number
) {
  const result = await database.execute<{ storage_type: FileStorageType | null, }>(`
    SELECT CASE a.atttypid
      WHEN 'text'::regtype THEN 'text'
      WHEN 'int8'::regtype THEN 'bigint'
      WHEN 'numeric'::regtype THEN 'numeric'
      WHEN 'bool'::regtype THEN 'boolean'
      WHEN 'date'::regtype THEN 'date'
      WHEN 'time'::regtype THEN 'time'
      WHEN 'timestamptz'::regtype THEN 'timestamptz'
      WHEN 'jsonb'::regtype THEN 'jsonb'
      WHEN 'uuid'::regtype THEN 'uuid'
      ELSE NULL
    END AS storage_type
      FROM pg_attribute a
     WHERE a.attrelid = ?::oid AND a.attnum = ?::smallint
       AND a.attnum > 0 AND NOT a.attisdropped
  `, [relationOid, attributeNumber]);
  const storageType = result.rows[0]?.storage_type;
  if (!storageType) unavailable('The current PostgreSQL type does not support structured defaults');
  return storageType;
}
/**
 * Return the suffixed result.
 */
function suffixed(value: string, suffix: number) {
  const tail = `_${suffix}`;
  return `${value.slice(0, 63 - tail.length)}${tail}`;
}
/**
 * Return the plan summary result.
 */
function planSummary(action: FileDdlAction, expected: ExpectedDdlContext) {
  return {
    actionType: action.type,
    ...(expected.fileId ? { fileId: expected.fileId } : {}),
    ...(expected.schemaId ? { schemaId: expected.schemaId } : {}),
    ...('displayName' in action ? { displayName: action.displayName } : {}),
    ...('physicalName' in action && action.physicalName ? { physicalName: action.physicalName } : {})
  };
}
/**
 * Return the denied result.
 */
function denied(): never {
  throw new ApplicationError('file_ddl_denied', 403, 'The schema change requires owning-role authority');
}
/**
 * Return the unavailable result.
 */
function unavailable(message: string): never {
  throw new ApplicationError('file_ddl_unavailable', 409, message);
}
/**
 * Return the conflict result.
 */
function conflict(message: string): never {
  throw new ApplicationError('file_ddl_conflict', 409, message);
}
/**
 * Return the drift result.
 */
function drift(): never {
  throw new ApplicationError(
    'file_ddl_stale',
    409,
    'The PostgreSQL structure changed after this schema-change plan was created'
  );
}
