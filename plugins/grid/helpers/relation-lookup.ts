import { createHash } from 'node:crypto';
import type { Value } from '@stackpress/inquire/types';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import { quoteIdentifier } from '../../database/helpers/identifiers.js';
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import type { StableColumn, StableObject, StableSchema } from '../../catalog/helpers/contracts.js';
import type {
  GridCellValue,
  GridRelationLookupInput,
  GridRelationLookupResult
} from './contracts.js';

type PreparedRelation = {
  sourceColumnIds: string[];
  targetFileId: string;
  targetColumnIds: string[];
  targetRelationOid: string;
  targetReference: string;
  targetColumns: StableColumn[];
  keyColumns: StableColumn[];
  pickerTemplate: string;
  outputTemplate: string;
};

type LookupColumn = {
  attribute_number: number;
  name: string;
  type_name: string;
  can_select: boolean;
};

export async function prepareRelationLookup(
  database: DatabaseExecutor,
  connectionId: string,
  input: GridRelationLookupInput
): Promise<PreparedRelation | undefined> {
  const stable = await reconcileCatalog(database, connectionId);
  const source = object(stable.objects, input.fileId);
  const sourceColumn = column(stable.columns, input.fileId, input.columnId);
  if (!source || !sourceColumn) return undefined;
  const native = await database.execute<{
    target_relation_oid: string;
    source_numbers: string;
    target_numbers: string;
  }>(`
    SELECT confrelid::text AS target_relation_oid,
           conkey::text AS source_numbers, confkey::text AS target_numbers
      FROM pg_constraint
     WHERE conrelid = ?::oid AND contype = 'f'
       AND ?::smallint = ANY(conkey)
       AND convalidated AND NOT condeferrable
     ORDER BY oid
     LIMIT 1
  `, [source.relationOid, sourceColumn.attributeNumber]);
  const relation = native.rows[0];
  if (!relation) return undefined;
  const target = [...stable.objects.values()].find((candidate) =>
    candidate.relationOid === relation.target_relation_oid
    && ['table', 'partitioned-table'].includes(candidate.kind)
  );
  if (!target) return undefined;
  const targetSchema = [...stable.schemas.values()].find((candidate) =>
    candidate.stableId === target.schemaId
  );
  if (!targetSchema) return undefined;
  const sourceNumbers = numbers(relation.source_numbers);
  const targetNumbers = numbers(relation.target_numbers);
  if (!sourceNumbers.length || sourceNumbers.length !== targetNumbers.length) return undefined;
  const sourceColumns = sourceNumbers.map((attribute) =>
    [...stable.columns.values()].find((candidate) =>
      candidate.objectId === source.stableId && candidate.attributeNumber === attribute
    )
  );
  const keyColumns = targetNumbers.map((attribute) =>
    [...stable.columns.values()].find((candidate) =>
      candidate.objectId === target.stableId && candidate.attributeNumber === attribute
    )
  );
  if (sourceColumns.some((candidate) => !candidate) || keyColumns.some((candidate) => !candidate)) {
    return undefined;
  }
  const metadata = await database.execute<{
    field_config: Record<string, unknown>;
    format_config: Record<string, unknown>;
  }>(`
    SELECT field_config, format_config
      FROM tabular.column_metadata
     WHERE object_id = ? AND column_id = ?
  `, [source.stableId, sourceColumns[0]!.stableId]);
  return {
    sourceColumnIds: sourceColumns.map((candidate) => candidate!.stableId),
    targetFileId: target.stableId,
    targetColumnIds: keyColumns.map((candidate) => candidate!.stableId),
    targetRelationOid: target.relationOid,
    targetReference: `${quoteIdentifier(targetSchema.name)}.${quoteIdentifier(target.name)}`,
    targetColumns: [...stable.columns.values()].filter((candidate) => candidate.objectId === target.stableId),
    keyColumns: keyColumns as StableColumn[],
    pickerTemplate: stringConfig(metadata.rows[0]?.field_config, 'pickerTemplate', '{{label}} — {{key}}'),
    outputTemplate: stringConfig(metadata.rows[0]?.format_config, 'outputTemplate', '{{label}}')
  };
}

export async function executeRelationLookup(
  database: DatabaseExecutor,
  prepared: PreparedRelation,
  input: GridRelationLookupInput
): Promise<GridRelationLookupResult> {
  const live = await database.execute<LookupColumn>(`
    SELECT a.attnum AS attribute_number, a.attname AS name, t.typname AS type_name,
           has_column_privilege(current_user, a.attrelid, a.attnum, 'SELECT') AS can_select
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
     WHERE a.attrelid = ?::oid AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum
  `, [prepared.targetRelationOid]);
  const byNumber = new Map(live.rows.map((item) => [Number(item.attribute_number), item]));
  const keyLive = prepared.keyColumns.map((item) => byNumber.get(item.attributeNumber));
  if (keyLive.some((item) => !item?.can_select)) return { ...emptyResult(prepared), options: [] };
  const display = prepared.targetColumns
    .map((item) => ({ stable: item, live: byNumber.get(item.attributeNumber) }))
    .filter((item) => item.live?.can_select)
    .filter((item) => ['text', 'varchar', 'bpchar', 'name', 'uuid'].includes(item.live!.type_name))
    .slice(0, 6);
  const selected = unique([
    ...prepared.keyColumns.map((item) => ({ stable: item, live: byNumber.get(item.attributeNumber)! })),
    ...display.map((item) => ({ stable: item.stable, live: item.live! }))
  ]);
  const aliases = selected.map((_, index) => `tabular_lookup_${index}`);
  const searchable = selected.map((item) => `${quoteIdentifier(item.live.name)}::text`);
  const values: Value[] = [];
  const selectedKeys = (input.selectedKeys || []).filter((tuple) => (
    tuple.length === keyLive.length && tuple.every((value) => value !== null)
  ));
  const where = selectedKeys.length
    ? `WHERE ${selectedKeys.map(() => `(${keyLive.map((item) =>
      `${quoteIdentifier(item!.name)}::text = ?`
    ).join(' AND ')})`).join(' OR ')}`
    : input.query
      ? `WHERE concat_ws(' ', ${searchable.join(', ')}) ILIKE ?`
      : '';
  if (selectedKeys.length) {
    for (const tuple of selectedKeys) values.push(...tuple.map((value) => String(value)));
  } else if (input.query) {
    values.push(`%${input.query}%`);
  }
  const rows = await database.execute<Record<string, unknown>>(`
    SELECT ${selected.map((item, index) =>
      `${quoteIdentifier(item.live.name)}::text AS ${quoteIdentifier(aliases[index]!)}`
    ).join(', ')}
      FROM ${prepared.targetReference}
      ${where}
     ORDER BY ${keyLive.map((item) => quoteIdentifier(item!.name)).join(', ')}
     LIMIT ${input.limit}
  `, values);
  return {
    ...emptyResult(prepared),
    options: rows.rows.map((row) => {
      const record = Object.fromEntries(selected.map((item, index) => [
        item.live.name,
        gridValue(item.live.type_name, row[aliases[index]!])
      ]));
      const keyValues = prepared.keyColumns.map((item) => record[byNumber.get(item.attributeNumber)!.name] ?? null);
      const preferredDisplay = display.find((item) =>
        /^(?:display_?name|label|name|title)$/i.test(item.live!.name)
      ) ?? display.find((item) => !prepared.keyColumns.some((key) =>
        key.attributeNumber === item.stable.attributeNumber
      )) ?? display[0];
      const labelValue = preferredDisplay
        ? record[preferredDisplay.live!.name]
        : keyValues.join(' / ');
      const templateRecord = {
        ...record,
        key: keyValues.join(' / '),
        label: String(labelValue)
      };
      return {
        value: `relation_${createHash('sha256').update(JSON.stringify([
          prepared.targetFileId,
          keyValues
        ])).digest('base64url')}`,
        label: renderTemplate(prepared.pickerTemplate, templateRecord),
        outputLabel: renderTemplate(prepared.outputTemplate, templateRecord),
        patch: Object.fromEntries(prepared.sourceColumnIds.map((id, index) => [id, keyValues[index] ?? null]))
      };
    })
  };
}

function emptyResult(prepared: PreparedRelation) {
  return {
    sourceColumnIds: prepared.sourceColumnIds,
    targetFileId: prepared.targetFileId,
    targetColumnIds: prepared.targetColumnIds
  };
}

function object(objects: Map<string, StableObject>, id: string) {
  return [...objects.values()].find((candidate) => candidate.stableId === id);
}

function column(columns: Map<string, StableColumn>, fileId: string, id: string) {
  return [...columns.values()].find((candidate) => candidate.objectId === fileId && candidate.stableId === id);
}

function numbers(value: string) {
  return value.replace(/[{}]/g, '').split(/[ ,]+/).filter(Boolean).map(Number);
}

function stringConfig(config: Record<string, unknown> | undefined, key: string, fallback: string) {
  return typeof config?.[key] === 'string' ? String(config[key]) : fallback;
}

function unique(items: Array<{ stable: StableColumn; live: LookupColumn }>) {
  return [...new Map(items.map((item) => [item.stable.stableId, item])).values()];
}

function gridValue(type: string, value: unknown): GridCellValue {
  if (value === null || typeof value === 'undefined') return null;
  if (type === 'bool') return value === true || value === 'true';
  return String(value);
}

function renderTemplate(template: string, values: Record<string, GridCellValue>) {
  return template.replace(/\{\{?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}?\}/g, (_match, name: string) =>
    String(values[name] ?? '')
  ).trim();
}
