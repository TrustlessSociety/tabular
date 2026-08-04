import type {
  ColumnInference,
  InferredStorageType,
  ParsedImportCell,
  ParsedImportRow
} from './contracts.js';

const INTEGER = /^-?(?:0|[1-9]\d*)$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;
const TIMESTAMP = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export function inferColumns(rows: readonly ParsedImportRow[]): ColumnInference[] {
  const width = rows.reduce((maximum, row) => Math.max(maximum, row.cells.length), 0);
  return Array.from({ length: width }, (_, index) => inferColumn(
    index + 1,
    rows.flatMap((row) => row.cells[index] ? [row.cells[index]!] : [])
  ));
}

export function inferColumn(
  columnNumber: number,
  cells: readonly ParsedImportCell[]
): ColumnInference {
  const tokens = cells.flatMap((cell) => cell.type === 'empty' || cell.value === ''
    ? []
    : [cellToken(cell)]);
  if (!tokens.length) {
    return {
      columnNumber,
      suggestedType: 'text',
      nonEmptyCount: 0,
      confidence: 'empty',
      reason: 'No non-empty values were available for inference.'
    };
  }
  const candidates: Array<[InferredStorageType, (value: string) => boolean]> = [
    ['boolean', isBoolean],
    ['bigint', isInteger],
    ['numeric', (value) => DECIMAL.test(value)],
    ['date', isDate],
    ['time', (value) => TIME.test(value)],
    ['timestamptz', isTimestamp],
    ['jsonb', isJson]
  ];
  const exact = candidates.find(([, predicate]) => tokens.every(predicate));
  if (exact) {
    return {
      columnNumber,
      suggestedType: exact[0],
      nonEmptyCount: tokens.length,
      confidence: 'certain',
      reason: `Every non-empty value matches ${exact[0]}.`
    };
  }
  return {
    columnNumber,
    suggestedType: 'text',
    nonEmptyCount: tokens.length,
    confidence: 'mixed',
    reason: 'Values have mixed or ambiguous representations; source tokens remain text.'
  };
}

function cellToken(cell: Exclude<ParsedImportCell, { type: 'empty' }>) {
  return cell.type === 'boolean' ? cell.sourceToken : cell.sourceToken;
}

function isBoolean(value: string) {
  return value === 'true' || value === 'false';
}

function isInteger(value: string) {
  if (!INTEGER.test(value)) return false;
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  return unsigned === '0' || !unsigned.startsWith('0');
}

function isDate(value: string) {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: string) {
  return TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function isJson(value: string) {
  if (!/^[\[{]/.test(value)) return false;
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object';
  } catch {
    return false;
  }
}
