//client
import type { TypedCellValue } from '../../capability/helpers/contracts.js';
import type { PostgreSqlBrowseResult } from '../../capability/helpers/postgresql-target.js';
import type { GridCellPresentation } from '../../grid/helpers/contracts.js';
import { ApplicationError } from '../../../bootstrap/errors.js';

//The csv export column contract exported for module callers
export type CsvExportColumn = {
  id: string,
  label: string,
  field?: string,
  format?: string,
  formatConfig?: Record<string, unknown>,
};

/**
 * Serialize the authorized CSV.
 */
export function serializeAuthorizedCsv(input: {
  resource: PostgreSqlBrowseResult,
  columns: CsvExportColumn[],
  presentation?: Record<string, GridCellPresentation>,
}) {
  if (input.resource.truncated) {
    throw new ApplicationError(
      'csv_export_too_large',
      413,
      'CSV export exceeds 50,000 rows. Narrow the authorized grid filters before exporting.'
    );
  }
  const byColumn = new Map(input.resource.columns.map((column) => [column.columnId, column]));
  const columns = input.columns.map((column) => {
    const authorized = byColumn.get(column.id);
    if (!authorized) throw new Error('CSV export column is unavailable');
    return { ...column, codec: authorized.codec };
  });
  let sanitizedCells = 0;
  const header = columns.map((column) => {
    const safe = safeSpreadsheetText(column.label);
    if (safe.sanitized) sanitizedCells += 1;
    return quoted(safe.value);
  }).join(',');
  const rows = input.resource.rows.map((row) => {
    const cells = new Map(row.cells.map((cell) => [cell.columnId, cell.value]));
    return columns.map((column) => {
      const value = cells.get(column.id);
      if (!value) throw new Error('CSV export cell is unavailable');
      const formatted = formattedValue(
        value,
        input.presentation?.[JSON.stringify([row.rowId, column.id])],
        column
      );
      if (value.type === 'null') return '';
      if (isTextual(value)) {
        const safe = safeSpreadsheetText(formatted);
        if (safe.sanitized) sanitizedCells += 1;
        return quoted(safe.value);
      }
      return canonicalScalar(value, formatted);
    }).join(',');
  });
  return {
    bytes: `\uFEFF${[header, ...rows].join('\r\n')}\r\n`,
    rowCount: input.resource.rows.length,
    columnCount: columns.length,
    sanitizedCells,
    encoding: 'utf-8-bom' as const,
    lineEndings: 'crlf' as const
  };
}

/**
 * Report the safe CSV filename condition.
 */
export function safeCsvFilename(value: string) {
  const normalized = value.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[. -]+|[. -]+$/g, '')
    .slice(0, 120) || 'tabular-export';
  return `${normalized.toLowerCase()}.csv`;
}

/**
 * Return the CSV content disposition result.
 */
export function csvContentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Return the formatted value result.
 */
function formattedValue(
  value: TypedCellValue,
  presentation: GridCellPresentation | undefined,
  column: CsvExportColumn
) {
  if (value.type === 'null') return '';
  const source = value.type === 'boolean'
    ? (value.value ? 'true' : 'false')
    : value.type === 'json' ? value.source : value.value;
  const format = presentation?.numberFormat && presentation.numberFormat !== 'automatic'
    ? presentation.numberFormat
    : configuredFormat(column);
  if (['integer', 'decimal'].includes(value.type)) {
    const precision = configuredPrecision(column.formatConfig);
    if (format === 'number') return groupedDecimal(decimalPrecision(source, precision));
    if (format === 'currency') return `₱${groupedDecimal(decimalPrecision(source, precision))}`;
    if (format === 'percent') {
      return `${groupedDecimal(decimalPrecision(shiftDecimal(source, 2), precision))}%`;
    }
  }
  if (format === 'yes-no' && value.type === 'boolean') return value.value ? 'Yes' : 'No';
  if (format === 'date' && value.type === 'date') return displayDate(source);
  if (format === 'time' && value.type === 'time') return displayTime(source);
  if (format === 'date-time' && value.type === 'timestamp') return displayDateTime(source);
  return source;
}

/**
 * Return the configured format result.
 */
function configuredFormat(column: CsvExportColumn) {
  if (column.format) {
    if (['number', 'currency', 'percent', 'yes-no', 'date', 'time', 'date-time'].includes(column.format)) {
      return column.format;
    }
    return 'automatic';
  }
  if (column.field === 'price') return 'currency';
  if (column.field === 'number') return 'number';
  if (column.field === 'checkbox' || column.field === 'switch') return 'yes-no';
  if (column.field === 'date') return 'date';
  if (column.field === 'time') return 'time';
  if (column.field === 'date-time') return 'date-time';
  return 'automatic' as const;
}

/**
 * Return the configured precision result.
 */
function configuredPrecision(value: Record<string, unknown> | undefined) {
  const precision = value?.precision;
  return Number.isSafeInteger(precision) && Number(precision) >= 0 && Number(precision) <= 20
    ? Number(precision)
    : undefined;
}

/**
 * Return the canonical scalar result.
 */
function canonicalScalar(value: TypedCellValue, formatted: string) {
  if (value.type === 'boolean') {
    const source = value.value ? 'true' : 'false';
    return formatted === source ? source : quoted(formatted);
  }
  if (value.type === 'integer' || value.type === 'decimal') {
    return formatted === value.value ? value.value : quoted(formatted);
  }
  return quoted(formatted);
}

/**
 * Report whether the textual condition holds.
 */
function isTextual(value: TypedCellValue) {
  return value.type === 'text' || value.type === 'json';
}

/**
 * Report the safe spreadsheet text condition.
 */
function safeSpreadsheetText(value: string) {
  const dangerous = /^[\t\r\n]/.test(value) || /^\s*[=+\-@]/.test(value);
  return { value: dangerous ? `'${value}` : value, sanitized: dangerous };
}

/**
 * Return the quoted result.
 */
function quoted(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Return the grouped decimal result.
 */
function groupedDecimal(value: string) {
  const match = value.match(/^(-?)(\d+)(\.\d+)?$/);
  if (!match) return value;
  return `${match[1]}${match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${match[3] || ''}`;
}

/**
 * Return the decimal precision result.
 */
function decimalPrecision(value: string, precision: number | undefined) {
  if (typeof precision === 'undefined') return value;
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const sign = match[1]!;
  const whole = match[2]!;
  const fraction = match[3] || '';
  const keptFraction = fraction.slice(0, precision).padEnd(precision, '0');
  const kept = BigInt(`${whole}${keptFraction}` || '0')
    + (Number(fraction[precision] || '0') >= 5 ? 1n : 0n);
  const padded = kept.toString().padStart(precision + 1, '0');
  const integer = precision ? padded.slice(0, -precision) : padded;
  const decimals = precision ? padded.slice(-precision) : '';
  const negative = sign && kept !== 0n ? '-' : '';
  return `${negative}${integer}${precision ? `.${decimals}` : ''}`;
}

/**
 * Return the shift decimal result.
 */
function shiftDecimal(value: string, places: number) {
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const sign = match[1]!;
  const whole = match[2]!;
  const fraction = match[3] || '';
  const digits = `${whole}${fraction}`;
  const scale = fraction.length - places;
  const shifted = scale <= 0
    ? `${digits}${'0'.repeat(-scale)}`
    : digits.length <= scale
      ? `0.${'0'.repeat(scale - digits.length)}${digits}`
      : `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  const [integer, decimals] = shifted.split('.');
  const normalizedInteger = integer!.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimals = decimals?.replace(/0+$/, '');
  return `${sign}${normalizedInteger}${normalizedDecimals ? `.${normalizedDecimals}` : ''}`;
}

/**
 * Return the display date result.
 */
function displayDate(value: string) {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return value;
  return `${monthName(Number(parts[2]))} ${Number(parts[3])}, ${parts[1]}`;
}

/**
 * Return the display time result.
 */
function displayTime(value: string) {
  const parts = value.match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?$/);
  if (!parts) return value;
  const hour = Number(parts[1]);
  const minute = Number(parts[2]);
  const second = Number(parts[3] || '0');
  if (hour > 23 || minute > 59 || second > 59) return value;
  return clockTime(hour, minute);
}

/**
 * Return the display date time result.
 */
function displayDateTime(value: string) {
  const normalized = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value)
    ? value
    : /[+-]\d{2}$/.test(value)
      ? `${value}:00`
      : `${value}Z`;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return value;
  return `${monthName(date.getUTCMonth() + 1)} ${date.getUTCDate()}, ${clockTime(
    date.getUTCHours(),
    date.getUTCMinutes()
  )}`;
}

/**
 * Return the month name result.
 */
function monthName(month: number) {
  return [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ][month - 1] || '';
}

/**
 * Return the clock time result.
 */
function clockTime(hour: number, minute: number) {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}
