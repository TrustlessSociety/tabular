//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type {
  FileDdlAction,
  NativeFileDdlEffect,
  StoredFileDdlRequest
} from './contracts.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import {
  column,
  constraintName,
  defaultSql,
  generatedSql,
  promotionValueSql,
  qualified,
  quoteLiteral,
  storageSql
} from './compiler.js';
import { readExpectedFingerprint, readRelationFingerprint } from './fingerprint.js';

//The managed row id physical name value exported for module callers
export const MANAGED_ROW_ID_PHYSICAL_NAME = '__tabular_row_id';

//The native ddl failpoint contract exported for module callers
export type NativeDdlFailpoint =
  | 'after-add-column'
  | 'after-backfill'
  | 'after-json-removal';

/**
 * Execute the native file ddl.
 */
export async function executeNativeFileDdl(
  database: DatabaseExecutor,
  request: StoredFileDdlRequest,
  options: { failpoint?: NativeDdlFailpoint, } = {}
): Promise<NativeFileDdlEffect> {
  const action = request.action_payload;
  const expected = request.expected_context;
  await database.execute(`
    SELECT pg_advisory_xact_lock(hashtextextended('tabular-file-ddl:' || ?, 0))
  `, [expected.fileId || `${expected.schemaId}:${'physicalName' in action ? action.physicalName : ''}`]);
  await lockRelations(database, request);
  await assertExpectedStructure(database, request);

  const beforeFingerprint = expected.ddlFingerprint;
  const effect = await applyAction(database, action, request, options);
  return { ...effect, actionType: action.type, beforeFingerprint };
}

/**
 * Return the lock relations result.
 */
async function lockRelations(database: DatabaseExecutor, request: StoredFileDdlRequest) {
  const expected = request.expected_context;
  const targets = [
    expected.relationOid && expected.schemaName && expected.relationName
      ? { oid: expected.relationOid, schema: expected.schemaName, name: expected.relationName }
      : undefined,
    expected.targetRelationOid && expected.targetSchemaName && expected.targetRelationName
      ? {
        oid: expected.targetRelationOid,
        schema: expected.targetSchemaName,
        name: expected.targetRelationName
      }
      : undefined
  ].filter((value): value is { oid: string, schema: string, name: string, } => Boolean(value))
    .filter((value, index, values) => values.findIndex((item) => item.oid === value.oid) === index)
    .sort((left, right) => Number(left.oid) - Number(right.oid));
  for (const target of targets) {
    await database.execute(`
      SELECT pg_advisory_xact_lock(hashtextextended('tabular-file-relation-lock:' || ?, 0))
    `, [target.oid]);
    const resolved = await database.execute<{ schema_name: string, relation_name: string, }>(`
      SELECT n.nspname AS schema_name, c.relname AS relation_name
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.oid = ?::oid AND c.relkind IN ('r', 'p')
    `, [target.oid]);
    const current = resolved.rows[0];
    if (!current || current.schema_name !== target.schema || current.relation_name !== target.name) stale();
    if (target.oid === expected.relationOid) {
      await database.execute(`LOCK TABLE ${qualified(current.schema_name, current.relation_name)} IN ACCESS EXCLUSIVE MODE`);
    }
  }
}

/**
 * Assert the expected structure.
 */
async function assertExpectedStructure(
  database: DatabaseExecutor,
  request: StoredFileDdlRequest
) {
  const expected = request.expected_context;
  const current = await database.execute<{
    current_oid: string | number,
    current_name: string,
    owner_oid: string | number,
    owner_name: string,
  }>(`
    SELECT current_user::regrole::oid AS current_oid,
           current_user::text AS current_name,
           r.oid AS owner_oid, r.rolname::text AS owner_name
      FROM pg_roles r
     WHERE r.oid = ?::oid
  `, [expected.ownerRoleOid!]);
  const authority = current.rows[0];
  if (!authority
    || String(authority.current_oid) !== expected.ownerRoleOid
    || authority.current_name !== expected.ownerRoleName
    || String(authority.owner_oid) !== expected.ownerRoleOid
    || authority.owner_name !== expected.ownerRoleName) stale();
  if (await readExpectedFingerprint(database, expected) !== expected.ddlFingerprint) stale();
  if (expected.targetRelationOid
    && await readRelationFingerprint(database, expected.targetRelationOid)
      !== expected.targetDdlFingerprint) stale();
}

/**
 * Apply the action.
 */
async function applyAction(
  database: DatabaseExecutor,
  action: FileDdlAction,
  request: StoredFileDdlRequest,
  options: { failpoint?: NativeDdlFailpoint, }
): Promise<Omit<NativeFileDdlEffect, 'actionType' | 'beforeFingerprint'>> {
  const expected = request.expected_context;
  if (action.type === 'file.create') {
    const relation = qualified(expected.schemaName!, action.physicalName!);
    const occupied = await database.execute<{ found: boolean, }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_class WHERE relnamespace = ?::oid AND relname = ?
      ) AS found
    `, [expected.namespaceOid!, action.physicalName!]);
    if (occupied.rows[0]?.found) conflict('The confirmed PostgreSQL file name is occupied');
    await database.execute(`
      CREATE TABLE ${relation} (
        ${column(MANAGED_ROW_ID_PHYSICAL_NAME)} uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
      )
    `);
    const created = await database.execute<{ oid: string | number, }>(`
      SELECT c.oid FROM pg_class c
       WHERE c.relnamespace = ?::oid AND c.relname = ? AND c.relkind = 'r'
    `, [expected.namespaceOid!, action.physicalName!]);
    if (!created.rows[0]) throw new Error('Created PostgreSQL file identity was unavailable');
    return { relationOid: String(created.rows[0].oid), physicalName: action.physicalName };
  }

  const relation = qualified(expected.schemaName!, expected.relationName!);
  if (action.type === 'file.rename') {
    if (action.physicalName && action.physicalName !== expected.relationName) {
      await database.execute(`ALTER TABLE ${relation} RENAME TO ${column(action.physicalName)}`);
    }
    return {
      relationOid: expected.relationOid,
      physicalName: action.physicalName || expected.relationName
    };
  }
  if (action.type === 'file.drop') {
    await database.execute(`DROP TABLE ${relation} RESTRICT`);
    return { relationOid: expected.relationOid, physicalName: expected.relationName };
  }

  const physicalNames = await currentPhysicalColumns(database, request);
  if (action.type === 'column.create') {
    let definition = `${column(action.physicalName!)} ${storageSql(action.storageType)}`;
    if (action.generated) {
      definition += ` GENERATED ALWAYS AS (${generatedSql(action.generated, physicalNames)}) VIRTUAL`;
    } else if (action.default) {
      definition += ` DEFAULT ${defaultSql(action.default)}`;
    }
    if (action.required) definition += ' NOT NULL';
    const createdConstraintName = action.unique ? constraintName(action, 'uniq') : undefined;
    if (createdConstraintName) {
      definition += ` CONSTRAINT ${column(createdConstraintName)} UNIQUE`;
    }
    await database.execute(`ALTER TABLE ${relation} ADD COLUMN ${definition}`);
    return {
      relationOid: expected.relationOid,
      targetColumnPhysicalName: action.physicalName,
      createdConstraintName
    };
  }
  if (action.type === 'column.configure') {
    let physical = requiredPhysical(physicalNames, action.columnId);
    if (action.physicalName && action.physicalName !== physical) {
      await database.execute(
        `ALTER TABLE ${relation} RENAME COLUMN ${column(physical)} TO ${column(action.physicalName)}`
      );
      physical = action.physicalName;
    }
    if (action.storageType) {
      await database.execute(
        `ALTER TABLE ${relation} ALTER COLUMN ${column(physical)} TYPE ${storageSql(action.storageType)} USING ${column(physical)}::${storageSql(action.storageType)}`
      );
    }
    if (action.default) {
      await database.execute(action.default.mode === 'drop'
        ? `ALTER TABLE ${relation} ALTER COLUMN ${column(physical)} DROP DEFAULT`
        : `ALTER TABLE ${relation} ALTER COLUMN ${column(physical)} SET DEFAULT ${defaultSql(action.default)}`);
    }
    if (typeof action.required === 'boolean') {
      await database.execute(
        `ALTER TABLE ${relation} ALTER COLUMN ${column(physical)} ${action.required ? 'SET' : 'DROP'} NOT NULL`
      );
    }
    if (action.unique) {
      const name = constraintName(action, 'uniq');
      await database.execute(
        `ALTER TABLE ${relation} ADD CONSTRAINT ${column(name)} UNIQUE (${column(physical)})`
      );
      return {
        relationOid: expected.relationOid,
        targetColumnPhysicalName: physical,
        createdConstraintName: name
      };
    }
    if (action.unique === false) {
      for (const constraint of expected.managedConstraints || []) {
        const live = await database.execute<{ found: boolean, }>(`
          SELECT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE oid = ?::oid AND conrelid = ?::oid AND conname = ? AND contype = 'u'
          ) AS found
        `, [constraint.oid, expected.relationOid!, constraint.name]);
        if (!live.rows[0]?.found) stale();
        await database.execute(
          `ALTER TABLE ${relation} DROP CONSTRAINT ${column(constraint.name)} RESTRICT`
        );
      }
    }
    return { relationOid: expected.relationOid, targetColumnPhysicalName: physical };
  }
  if (action.type === 'column.drop') {
    const physical = requiredPhysical(physicalNames, action.columnId);
    await database.execute(`ALTER TABLE ${relation} DROP COLUMN ${column(physical)} RESTRICT`);
    return { relationOid: expected.relationOid };
  }
  if (action.type === 'key.create') {
    const columns = action.columnIds.map((id) => column(requiredPhysical(physicalNames, id)));
    const purpose = action.key === 'primary' ? 'pk' : 'uniq';
    const name = constraintName(action, purpose);
    await database.execute(
      `ALTER TABLE ${relation} ADD CONSTRAINT ${column(name)} ${action.key === 'primary' ? 'PRIMARY KEY' : 'UNIQUE'} (${columns.join(', ')})`
    );
    return { relationOid: expected.relationOid, createdConstraintName: name };
  }
  if (action.type === 'relation.create') {
    const source = action.columnIds.map((id) => column(requiredPhysical(physicalNames, id)));
    const targetNames = await physicalColumns(
      database,
      expected.targetRelationOid!,
      action.targetColumnIds,
      expected.targetColumnAttributeNumbers!
    );
    const target = action.targetColumnIds.map((id) => column(requiredPhysical(targetNames, id)));
    const name = constraintName(action, 'fk');
    await database.execute(`
      ALTER TABLE ${relation}
      ADD CONSTRAINT ${column(name)} FOREIGN KEY (${source.join(', ')})
      REFERENCES ${qualified(expected.targetSchemaName!, expected.targetRelationName!)} (${target.join(', ')})
      MATCH SIMPLE ON UPDATE ${action.onUpdate || 'NO ACTION'}
      ON DELETE ${action.onDelete || 'NO ACTION'} NOT DEFERRABLE INITIALLY IMMEDIATE
    `);
    const created = await database.execute<{
      target_oid: string | number,
      source_numbers: string,
      target_numbers: string,
    }>(`
      SELECT confrelid AS target_oid, conkey::text AS source_numbers,
             confkey::text AS target_numbers
        FROM pg_constraint
       WHERE conrelid = ?::oid AND conname = ? AND contype = 'f'
    `, [expected.relationOid!, name]);
    const native = created.rows[0];
    if (!native
      || String(native.target_oid) !== expected.targetRelationOid
      || !sameNumbers(native.source_numbers, expected.columnAttributeNumbers || [])
      || !sameNumbers(native.target_numbers, expected.targetColumnAttributeNumbers || [])
      || (expected.targetRelationOid !== expected.relationOid
        && await readRelationFingerprint(database, expected.targetRelationOid!)
          !== expected.targetDdlFingerprint)) stale();
    return { relationOid: expected.relationOid, createdConstraintName: name };
  }
  if (action.type === 'hidden.install') {
    const definition = action.purpose === 'row-id'
      ? 'uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()'
      : action.purpose === 'unstructured-json'
        ? `jsonb NOT NULL DEFAULT '{}'::jsonb`
        : `text COLLATE "C"`;
    await database.execute(
      `ALTER TABLE ${relation} ADD COLUMN ${column(action.physicalName!)} ${definition}`
    );
    return {
      relationOid: expected.relationOid,
      targetColumnPhysicalName: action.physicalName,
      hiddenPurpose: action.purpose
    };
  }
  if (action.type === 'json.promote') {
    const hidden = requiredPhysical(physicalNames, action.hiddenColumnId);
    await database.execute(`SELECT set_config('row_security', 'off', true)`);
    await database.execute(
      `ALTER TABLE ${relation} ADD COLUMN ${column(action.physicalName!)} ${storageSql(action.storageType)}`
    );
    fail(options, 'after-add-column');
    await database.execute(
      `UPDATE ${relation} SET ${column(action.physicalName!)} = ${promotionValueSql(hidden, action.jsonKey, action.storageType)}`
    );
    fail(options, 'after-backfill');
    if (action.required) {
      await database.execute(
        `ALTER TABLE ${relation} ALTER COLUMN ${column(action.physicalName!)} SET NOT NULL`
      );
    }
    let createdConstraintName: string | undefined;
    if (action.unique) {
      createdConstraintName = constraintName(action, 'uniq');
      await database.execute(
        `ALTER TABLE ${relation} ADD CONSTRAINT ${column(createdConstraintName)} UNIQUE (${column(action.physicalName!)})`
      );
    }
    await database.execute(
      `UPDATE ${relation} SET ${column(hidden)} = ${column(hidden)} - ${quoteLiteral(action.jsonKey)} WHERE jsonb_exists(${column(hidden)}, ${quoteLiteral(action.jsonKey)})`
    );
    fail(options, 'after-json-removal');
    return {
      relationOid: expected.relationOid,
      targetColumnPhysicalName: action.physicalName,
      createdConstraintName
    };
  }
  return exhaustive(action);
}

/**
 * Return the current physical columns result.
 */
async function currentPhysicalColumns(
  database: DatabaseExecutor,
  request: StoredFileDdlRequest
) {
  const expected = request.expected_context;
  return physicalColumns(
    database,
    expected.relationOid!,
    expected.columnIds || [],
    expected.columnAttributeNumbers || []
  );
}

/**
 * Return the physical columns result.
 */
async function physicalColumns(
  database: DatabaseExecutor,
  relationOid: string,
  columnIds: string[],
  attributeNumbers: number[]
) {
  if (columnIds.length !== attributeNumbers.length) stale();
  if (!attributeNumbers.length) return new Map<string, string>();
  const rows = await database.execute<{ attribute_number: number, physical_name: string, }>(`
    SELECT attnum AS attribute_number, attname AS physical_name
      FROM pg_attribute
     WHERE attrelid = ?::oid
       AND attnum IN (${attributeNumbers.map(() => '?::smallint').join(', ')})
       AND attnum > 0 AND NOT attisdropped
  `, [relationOid, ...attributeNumbers]);
  const byNumber = new Map(rows.rows.map((row) => [Number(row.attribute_number), row.physical_name]));
  const output = new Map<string, string>();
  columnIds.forEach((id, index) => {
    const name = byNumber.get(attributeNumbers[index]!);
    if (!name) stale();
    output.set(id, name);
  });
  return output;
}

/**
 * Report the required physical condition.
 */
function requiredPhysical(names: Map<string, string>, id: string) {
  const value = names.get(id);
  if (!value) stale();
  return value;
}

/**
 * Report the same numbers condition.
 */
function sameNumbers(value: string, expected: number[]) {
  const actual = value.replace(/[{}]/g, '').split(/[ ,]+/).filter(Boolean).map(Number);
  return actual.length === expected.length
    && actual.every((number, index) => number === expected[index]);
}

/**
 * Return the fail result.
 */
function fail(options: { failpoint?: NativeDdlFailpoint, }, point: NativeDdlFailpoint) {
  if (options.failpoint === point) throw new Error(`Injected file DDL failure: ${point}`);
}

/**
 * Return the stale result.
 */
function stale(): never {
  throw new ApplicationError('file_ddl_stale', 409, 'The confirmed PostgreSQL structure changed');
}
/**
 * Return the conflict result.
 */
function conflict(message: string): never {
  throw new ApplicationError('file_ddl_conflict', 409, message);
}
/**
 * Return the exhaustive result.
 */
function exhaustive(value: never): never {
  throw new Error(`Unsupported file action: ${JSON.stringify(value)}`);
}
