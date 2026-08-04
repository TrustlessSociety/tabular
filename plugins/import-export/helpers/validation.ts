import {
  IMPORT_HARD_LIMITS,
  ImportParserError,
  type CsvDelimiter,
  type CsvParserOptions,
  type ImportParserLimits,
  type XlsxParserOptions
} from './contracts.js';

const LIMIT_KEYS = Object.keys(IMPORT_HARD_LIMITS) as Array<keyof ImportParserLimits>;
const DELIMITERS = new Set<CsvDelimiter>([',', ';', '\t', '|']);

export function resolveParserLimits(
  requested: Partial<ImportParserLimits> | undefined
): ImportParserLimits {
  const limits = { ...IMPORT_HARD_LIMITS };
  for (const key of LIMIT_KEYS) {
    const value = requested?.[key];
    if (typeof value === 'undefined') continue;
    if (!Number.isSafeInteger(value) || value < 1 || value > IMPORT_HARD_LIMITS[key]) {
      throw new ImportParserError(
        'invalid_parser_options',
        `${key} must be a positive integer no greater than ${IMPORT_HARD_LIMITS[key]}`
      );
    }
    limits[key] = value;
  }
  if (requested && Object.keys(requested).some((key) => !LIMIT_KEYS.includes(key as keyof ImportParserLimits))) {
    throw new ImportParserError('invalid_parser_options', 'Parser limits contain an unsupported key');
  }
  return limits;
}

export function validateCsvOptions(options: CsvParserOptions = {}) {
  exactKeys(options, ['delimiter', 'limits'], 'CSV parser options');
  const delimiter = options.delimiter || 'auto';
  if (delimiter !== 'auto' && !DELIMITERS.has(delimiter)) {
    throw new ImportParserError('invalid_parser_options', 'CSV delimiter is unsupported');
  }
  return { delimiter, limits: resolveParserLimits(options.limits) };
}

export function validateXlsxOptions(options: XlsxParserOptions = {}) {
  exactKeys(options, ['sheetName', 'limits'], 'XLSX parser options');
  if (typeof options.sheetName !== 'undefined') {
    if (typeof options.sheetName !== 'string'
      || options.sheetName !== options.sheetName.trim()
      || options.sheetName.length < 1
      || options.sheetName.length > 31
      || /[\u0000-\u001f\u007f]/.test(options.sheetName)) {
      throw new ImportParserError('invalid_parser_options', 'XLSX sheet name is invalid');
    }
  }
  return { sheetName: options.sheetName, limits: resolveParserLimits(options.limits) };
}

export function requireWithinLimit(
  value: number,
  maximum: number,
  code: ImportParserError['code'],
  message: string
) {
  if (value > maximum) throw new ImportParserError(code, message);
}

function exactKeys(value: object, allowed: string[], label: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new ImportParserError('invalid_parser_options', `${label} contain an unsupported key`);
  }
}
