//node
import { createHash } from 'node:crypto';

//client
import type {
  ColumnDefault,
  DdlLiteral,
  FileDdlAction,
  FileStorageType,
  GeneratedColumn
} from './contracts.js';
import { quoteIdentifier } from '../../database/helpers/identifiers.js';

/**
 * Return the qualified result.
 */
export function qualified(schema: string, relation: string) {
  return `${quoteIdentifier(schema, 'PostgreSQL schema')}.${quoteIdentifier(relation, 'PostgreSQL relation')}`;
}

/**
 * Return the column result.
 */
export function column(identifier: string) {
  return quoteIdentifier(identifier, 'PostgreSQL column');
}

/**
 * Return the storage SQL result.
 */
export function storageSql(storage: FileStorageType) {
  const allowed: Record<FileStorageType, string> = {
    text: 'text',
    bigint: 'bigint',
    numeric: 'numeric',
    boolean: 'boolean',
    date: 'date',
    time: 'time without time zone',
    timestamptz: 'timestamp with time zone',
    jsonb: 'jsonb',
    uuid: 'uuid'
  };
  return allowed[storage];
}

/**
 * Return the default SQL result.
 */
export function defaultSql(value: ColumnDefault) {
  if (value.mode === 'drop') return undefined;
  if (value.mode === 'current-timestamp') return 'CURRENT_TIMESTAMP';
  if (value.mode === 'random-uuid') return 'gen_random_uuid()';
  return literalSql(value.value);
}

/**
 * Return the literal SQL result.
 */
export function literalSql(value: DdlLiteral) {
  if (value.type === 'null') return 'NULL';
  if (value.type === 'boolean') return value.value ? 'TRUE' : 'FALSE';
  const literal = quoteLiteral(value.value);
  if (value.type === 'text') return `${literal}::text`;
  return `${literal}::${storageSql(value.type)}`;
}

/**
 * Return the generated SQL result.
 */
export function generatedSql(
  generated: GeneratedColumn,
  physicalNames: Map<string, string>
) {
  const separator = quoteLiteral(generated.separator);
  const parts = generated.columnIds.map((id) => {
    const name = physicalNames.get(id);
    if (!name) throw new Error('A generated source column is unavailable');
    return `COALESCE(${column(name)}, ''::text)`;
  });
  return parts.join(` || ${separator}::text || `);
}

/**
 * Return the constraint name result.
 */
export function constraintName(
  action: FileDdlAction,
  purpose: 'pk' | 'uniq' | 'fk' | 'required'
) {
  const hash = createHash('sha256').update(`${action.commandId}:${purpose}`).digest('hex').slice(0, 20);
  return `tabular_${purpose}_${hash}`;
}

/**
 * Quote the literal.
 */
export function quoteLiteral(value: string) {
  if (value.includes('\u0000')) throw new Error('PostgreSQL literals cannot contain NUL');
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Return the promotion value SQL result.
 */
export function promotionValueSql(
  jsonColumnName: string,
  jsonKey: string,
  storage: FileStorageType
) {
  const source = column(jsonColumnName);
  const key = quoteLiteral(jsonKey);
  const present = `jsonb_exists(${source}, ${key})`;
  const notJsonNull = `${source} -> ${key} <> 'null'::jsonb`;
  const extracted = storage === 'jsonb'
    ? `${source} -> ${key}`
    : `(${source} ->> ${key})::${storageSql(storage)}`;
  return `CASE WHEN ${present} AND ${notJsonNull} THEN ${extracted} ELSE NULL END`;
}
