import { createHash } from 'node:crypto';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import { quoteIdentifier } from '../../database/helpers/identifiers.js';

export type CapabilityImportColumn = {
  sourceColumn: number;
  physicalName: string;
  storageType: 'text' | 'bigint' | 'numeric' | 'boolean' | 'date' | 'time' | 'timestamptz' | 'jsonb';
};

export type CapabilityImportCommit = {
  importId: string;
  schemaName: string;
  tableName: string;
  rowCount: number;
  columns: CapabilityImportColumn[];
  failpoint?: 'after-table-create' | 'after-row-insert';
};

export async function commitImportedTable(
  database: DatabaseExecutor,
  input: CapabilityImportCommit
) {
  if (!/^imp_[A-Za-z0-9_-]{32,64}$/.test(input.importId)
    || !Number.isSafeInteger(input.rowCount) || input.rowCount < 0 || input.rowCount > 50_000
    || !Array.isArray(input.columns) || input.columns.length < 1 || input.columns.length > 200) {
    throw new Error('Worker import capability plan is invalid');
  }
  const schema = quoteIdentifier(input.schemaName, 'PostgreSQL import schema');
  const table = quoteIdentifier(input.tableName, 'PostgreSQL import table');
  const target = `${schema}.${table}`;
  const hidden = '__tabular_row_id_v1';
  const primary = `tabular_pk_${createHash('sha256').update(input.importId).digest('hex').slice(0, 20)}`;
  const definitions = input.columns.map((entry, index) => {
    if (!Number.isSafeInteger(entry.sourceColumn) || entry.sourceColumn < 1 || entry.sourceColumn > 200
      || input.columns.findIndex((candidate) => candidate.physicalName === entry.physicalName) !== index) {
      throw new Error('Worker import field mapping is invalid');
    }
    return `${quoteIdentifier(entry.physicalName, 'PostgreSQL import column')} ${storageSql(entry.storageType)}`;
  });
  await database.execute(`
    CREATE TABLE ${target} (
      ${quoteIdentifier(hidden)} text NOT NULL,
      ${definitions.join(',\n      ')},
      CONSTRAINT ${quoteIdentifier(primary)} PRIMARY KEY (${quoteIdentifier(hidden)})
    )
  `);
  if (input.failpoint === 'after-table-create') throw new Error('Import failpoint after table creation');
  const projections = input.columns.map((entry) => sourceExpression(entry));
  const inserted = await database.execute(`
    INSERT INTO ${target} (
      ${quoteIdentifier(hidden)},
      ${input.columns.map((entry) => quoteIdentifier(entry.physicalName)).join(', ')}
    )
    SELECT 'row_' || encode(sha256(convert_to(? || ':' || row_number::text, 'UTF8')), 'hex'),
           ${projections.join(', ')}
      FROM pg_temp.tabular_import_stage
     ORDER BY row_number
  `, [input.importId]);
  if (inserted.affectedRows !== input.rowCount) {
    throw new Error('Worker import row count changed during commit');
  }
  if (input.failpoint === 'after-row-insert') throw new Error('Import failpoint after row insertion');
  const relation = await database.execute<{ relation_oid: string | number }>(`
    SELECT c.oid AS relation_oid
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ? AND c.relname = ? AND c.relkind = 'r'
  `, [input.schemaName, input.tableName]);
  if (!relation.rows[0]) throw new Error('Imported PostgreSQL table identity was unavailable');
  return {
    relationOid: String(relation.rows[0].relation_oid),
    rowCount: inserted.affectedRows,
    columnCount: input.columns.length,
    hiddenColumn: hidden,
    primaryConstraint: primary
  };
}

function sourceExpression(column: CapabilityImportColumn) {
  const index = column.sourceColumn - 1;
  const token = `(source_values ->> ${index})`;
  if (column.storageType === 'text') return token;
  return `${token}::${storageSql(column.storageType)}`;
}

function storageSql(type: CapabilityImportColumn['storageType']) {
  const allowed: Record<CapabilityImportColumn['storageType'], string> = {
    text: 'text',
    bigint: 'bigint',
    numeric: 'numeric',
    boolean: 'boolean',
    date: 'date',
    time: 'time without time zone',
    timestamptz: 'timestamp with time zone',
    jsonb: 'jsonb'
  };
  return allowed[type];
}
