import { ApplicationError } from '../../../bootstrap/errors.js';
import type {
  ColumnInference,
  InferredStorageType,
  ParsedImportCell,
  ParsedImportRow
} from './contracts.js';
import { normalizedPhysicalName, physicalIdentifier } from '../../files/helpers/validation.js';
import { deterministicFingerprint } from './fingerprint.js';

export type ImportColumnMapping = {
  sourceColumn: number;
  sourceName: string;
  displayName: string;
  physicalName: string;
  storageType: InferredStorageType;
  include: boolean;
};

export type ImportConversionIssue = {
  rowNumber?: number;
  columnNumber?: number;
  code: string;
  message: string;
  sourceToken?: string;
};

const STORAGE_TYPES = new Set<InferredStorageType>([
  'text', 'bigint', 'numeric', 'boolean', 'date', 'time', 'timestamptz', 'jsonb'
]);

export function defaultMapping(
  header: ParsedImportRow,
  inference: ColumnInference[]
): ImportColumnMapping[] {
  const used = new Set<string>();
  return header.cells.map((cell, index) => {
    const sourceName = headerName(cell, index);
    const physicalName = uniquePhysical(sourceName, used);
    return {
      sourceColumn: index + 1,
      sourceName,
      displayName: sourceName,
      physicalName,
      storageType: inference[index]?.suggestedType || 'text',
      include: true
    };
  });
}

export function validateMapping(
  value: unknown,
  columnCount: number
): ImportColumnMapping[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > columnCount) {
    invalid('At least one mapped field is required');
  }
  const mapped = value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid('A field mapping is invalid');
    const row = entry as Record<string, unknown>;
    const exact = ['sourceColumn', 'sourceName', 'displayName', 'physicalName', 'storageType', 'include'];
    if (Object.keys(row).some((key) => !exact.includes(key))) invalid('A field mapping has an unsupported property');
    if (!Number.isSafeInteger(row.sourceColumn) || Number(row.sourceColumn) < 1
      || Number(row.sourceColumn) > columnCount) invalid('A source field is unavailable');
    const sourceName = label(row.sourceName, 'Source field name');
    const displayName = label(row.displayName, 'Field name');
    if (typeof row.physicalName !== 'string') invalid('PostgreSQL field name is invalid');
    const physicalName = physicalIdentifier(row.physicalName);
    if (!STORAGE_TYPES.has(row.storageType as InferredStorageType)) invalid('Field storage type is invalid');
    if (typeof row.include !== 'boolean') invalid('Field inclusion is invalid');
    return {
      sourceColumn: Number(row.sourceColumn),
      sourceName,
      displayName,
      physicalName,
      storageType: row.storageType as InferredStorageType,
      include: row.include
    };
  });
  const included = mapped.filter((entry) => entry.include);
  if (!included.length) invalid('At least one mapped field is required');
  if (new Set(mapped.map((entry) => entry.sourceColumn)).size !== mapped.length) {
    invalid('Each source field can be mapped once');
  }
  if (new Set(included.map((entry) => entry.physicalName)).size !== included.length) {
    invalid('PostgreSQL field names must be unique');
  }
  return mapped;
}

export function validateMappedRows(
  rows: ParsedImportRow[],
  mapping: ImportColumnMapping[],
  limit = 10_000
) {
  const issues: ImportConversionIssue[] = [];
  for (const row of rows) {
    for (const field of mapping) {
      if (!field.include) continue;
      const cell = row.cells[field.sourceColumn - 1];
      const token = !cell || cell.type === 'empty' ? null : cell.sourceToken;
      const message = conversionError(field.storageType, token);
      if (!message) continue;
      issues.push({
        rowNumber: row.rowNumber,
        columnNumber: field.sourceColumn,
        code: 'mapping_conversion_failed',
        message,
        ...(token !== null ? { sourceToken: token.slice(0, 500) } : {})
      });
      if (issues.length >= limit) return issues;
    }
  }
  return issues;
}

export function stagedRows(rows: ParsedImportRow[]) {
  return rows.map((row) => ({
    row_number: row.rowNumber,
    source_values: row.cells.map((cell) => cell.type === 'empty' ? null : cell.sourceToken),
    provenance: { sourceRow: row.rowNumber }
  }));
}

export function mappingFingerprint(input: {
  sourceFingerprint: string;
  schemaId: string;
  fileDisplayName: string;
  tableName: string;
  mapping: ImportColumnMapping[];
  selectedSheet?: string;
  sourceOptions: Record<string, unknown>;
}) {
  return deterministicFingerprint({
    contract: 'tabular-import-mapping-v1',
    ...input,
    mapping: input.mapping.filter((entry) => entry.include)
  });
}

export function sourceIdentity(sourceName: string) {
  const withoutExtension = sourceName.replace(/\.(?:csv|xlsx)$/i, '').trim() || 'Imported values';
  const fileDisplayName = withoutExtension.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    fileDisplayName: fileDisplayName.slice(0, 200),
    tableName: normalizedPhysicalName(withoutExtension)
  };
}

function headerName(cell: ParsedImportCell, index: number) {
  const value = cell.type === 'empty' ? '' : cell.sourceToken.trim();
  const safe = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (safe || `Column ${index + 1}`).slice(0, 200);
}

function uniquePhysical(value: string, used: Set<string>) {
  const base = normalizedPhysicalName(value);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const marker = `_${suffix}`;
    candidate = `${base.slice(0, 63 - marker.length)}${marker}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function conversionError(type: InferredStorageType, token: string | null) {
  if (token === null) return undefined;
  if (type === 'text') return token.includes('\u0000') ? 'Text values cannot contain NUL' : undefined;
  if (token === '') return `Empty text is not a valid ${type} value`;
  if (type === 'bigint') {
    if (!/^-?\d+$/.test(token)) return 'Value is not an integer';
    try {
      const value = BigInt(token);
      if (value < -9223372036854775808n || value > 9223372036854775807n) {
        return 'Integer is outside the PostgreSQL bigint range';
      }
    } catch { return 'Value is not an integer'; }
    return undefined;
  }
  if (type === 'numeric') {
    return /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)
      ? undefined : 'Value is not a decimal number';
  }
  if (type === 'boolean') {
    return token === 'true' || token === 'false' ? undefined : 'Value is not true or false';
  }
  if (type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(token)) return 'Value is not an ISO date';
    const date = new Date(`${token}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === token
      ? undefined : 'Value is not a valid ISO date';
  }
  if (type === 'time') {
    return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(token)
      ? undefined : 'Value is not an ISO time';
  }
  if (type === 'timestamptz') {
    return /^\d{4}-\d{2}-\d{2}T/.test(token) && Number.isFinite(Date.parse(token))
      ? undefined : 'Value is not an ISO timestamp with timezone';
  }
  try {
    JSON.parse(token);
    return undefined;
  } catch {
    return 'Value is not valid JSON';
  }
}

function label(value: unknown, name: string) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > 200
    || /[\u0000-\u001f\u007f]/.test(value)) invalid(`${name} is invalid`);
  return value;
}

function invalid(message: string): never {
  throw new ApplicationError('import_mapping_invalid', 400, message);
}
