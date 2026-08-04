import {
  MCP_TOOL_DEFINITIONS,
  type McpToolCall,
  type McpToolName
} from './contracts.js';
import type { GridFilter, GridSort } from '../../grid/helpers/contracts.js';

const MAX_MCP_ARGUMENT_BYTES = 1_048_576;
const fileIdPattern = /^obj_[A-Za-z0-9_-]{32,64}$/;
const resourcePattern = /^tabular:\/\/frontend-contract\/v1\/(obj_[A-Za-z0-9_-]{32,64})$/;
const forbiddenArgumentKeys = new Set([
  'type',
  'authority',
  'role',
  'roleName',
  'identityId',
  'actorIdentityId',
  'sessionId',
  'historyScopeId',
  'connectionId',
  'sql',
  'queryText',
  'ddl',
  'schemaName',
  'tableName',
  'physicalName',
  'internalMetadata',
  'diagnostics',
  'cookie',
  'csrfToken',
  'leaseToken',
  'migrator'
]);

export function validateToolCall(input: unknown): McpToolCall {
  const record = strictRecord(input, ['name', 'arguments']);
  if (typeof record.name !== 'string' || !toolNames.has(record.name)) invalid();
  const argumentsRecord = strictRecord(record.arguments);
  if (Object.keys(argumentsRecord).some((key) => forbiddenArgumentKeys.has(key))) invalid();
  if (Buffer.byteLength(JSON.stringify(argumentsRecord), 'utf8') > MAX_MCP_ARGUMENT_BYTES) {
    invalid();
  }
  if (record.name === 'get_frontend_contract') {
    strictRecord(argumentsRecord, ['contractVersion', 'fileId']);
    if (argumentsRecord.contractVersion !== 1
      || !fileIdPattern.test(String(argumentsRecord.fileId || ''))) invalid();
  }
  if (record.name === 'tabular_record_read') {
    const columns = argumentsRecord.columnIds;
    if (!Array.isArray(columns) || columns.length < 1 || columns.length > 200) invalid();
  }
  return {
    name: record.name as McpToolName,
    arguments: argumentsRecord
  };
}

export function validateResourceRequest(input: unknown) {
  const record = strictRecord(input, ['uri']);
  if (typeof record.uri !== 'string') invalid();
  const match = resourcePattern.exec(record.uri);
  if (!match) invalid();
  return { uri: record.uri, fileId: match[1] as string };
}

export function validateListFilesArguments(input: Record<string, unknown>) {
  closedRecord(input, ['cursor', 'limit'], ['limit']);
  if (!Number.isSafeInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100) {
    invalid();
  }
  if (
    typeof input.cursor !== 'undefined'
    && (typeof input.cursor !== 'string'
      || !/^[A-Za-z0-9_-]{1,512}$/.test(input.cursor))
  ) invalid();
  return {
    ...(input.cursor ? { cursor: input.cursor as string } : {}),
    limit: input.limit as number
  };
}

export function validateQueryRowsArguments(input: Record<string, unknown>) {
  closedRecord(input, ['fileId', 'columnIds', 'filters', 'sorts', 'limit'], [
    'fileId', 'columnIds', 'filters', 'sorts', 'limit'
  ]);
  if (!fileIdPattern.test(String(input.fileId || ''))
    || !Array.isArray(input.columnIds) || input.columnIds.length < 1
    || input.columnIds.length > 200
    || new Set(input.columnIds).size !== input.columnIds.length
    || input.columnIds.some((value) => typeof value !== 'string'
      || !/^col_[A-Za-z0-9_-]{32,64}$/.test(value))
    || !Array.isArray(input.filters) || input.filters.length > 32
    || !Array.isArray(input.sorts) || input.sorts.length > 16
    || !Number.isSafeInteger(input.limit) || Number(input.limit) < 1
    || Number(input.limit) > 100
    || input.columnIds.length * Number(input.limit) > 10_000) invalid();

  const filters = input.filters.map((value) => {
    const filter = closedRecord(value, ['columnId', 'operation', 'value'], [
      'columnId', 'operation', 'value'
    ]);
    if (typeof filter.columnId !== 'string'
      || !/^col_[A-Za-z0-9_-]{32,64}$/.test(filter.columnId)
      || !['=', '!=', 'like', '<', '<=', '>', '>='].includes(String(filter.operation))
      || !gridValue(filter.value)) invalid();
    return filter as unknown as GridFilter;
  });
  const sorts = input.sorts.map((value) => {
    const sort = closedRecord(value, ['columnId', 'direction'], ['columnId', 'direction']);
    if (typeof sort.columnId !== 'string'
      || !/^col_[A-Za-z0-9_-]{32,64}$/.test(sort.columnId)
      || !['asc', 'desc'].includes(String(sort.direction))) invalid();
    return sort as unknown as GridSort;
  });
  if (new Set(sorts.map((sort) => sort.columnId)).size !== sorts.length) invalid();
  return {
    fileId: input.fileId as string,
    columnIds: input.columnIds as string[],
    filters,
    sorts,
    limit: input.limit as number
  };
}

const toolNames = new Set<string>(MCP_TOOL_DEFINITIONS.map((definition) => definition.name));

function strictRecord(input: unknown, keys?: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const record = input as Record<string, unknown>;
  if (keys) {
    const allowed = new Set(keys);
    if (
      Object.keys(record).length !== keys.length
      || Object.keys(record).some((key) => !allowed.has(key))
    ) invalid();
  }
  return record;
}

function closedRecord(input: unknown, allowedKeys: string[], requiredKeys: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const record = input as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  if (
    Object.keys(record).some((key) => !allowed.has(key))
    || requiredKeys.some((key) => !(key in record))
  ) invalid();
  return record;
}

function gridValue(value: unknown) {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function invalid(): never {
  throw new Error('The MCP request is invalid');
}
