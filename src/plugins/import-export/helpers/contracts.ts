//node
import type { Readable } from 'node:stream';

//The import parser version value exported for module callers
export const IMPORT_PARSER_VERSION = 'tabular-values-v1' as const;

//The import parser limits contract exported for module callers
export type ImportParserLimits = {
  sourceBytes: number,
  sheets: number,
  rows: number,
  columns: number,
  cells: number,
  cellCharacters: number,
  issues: number,
  delimiterProbeCharacters: number,
};

//The import hard limits value exported for module callers
export const IMPORT_HARD_LIMITS: Readonly<ImportParserLimits> = Object.freeze({
  sourceBytes: 32 * 1024 * 1024,
  sheets: 32,
  rows: 250_000,
  columns: 512,
  cells: 2_000_000,
  cellCharacters: 1_000_000,
  issues: 250_000,
  delimiterProbeCharacters: 1_000_000
});

//The import byte input contract exported for module callers
export type ImportByteInput =
  | Buffer
  | Uint8Array
  | Readable
  | AsyncIterable<Buffer | Uint8Array | string>;

//The xlsx byte input contract exported for module callers
export type XlsxByteInput = ImportByteInput | string;

//The csv encoding contract exported for module callers
export type CsvEncoding = 'utf-8' | 'utf-16le';
//The csv delimiter contract exported for module callers
export type CsvDelimiter = ',' | ';' | '\t' | '|';

//The csv parser options contract exported for module callers
export type CsvParserOptions = {
  delimiter?: CsvDelimiter | 'auto',
  limits?: Partial<ImportParserLimits>,
};

//The xlsx parser options contract exported for module callers
export type XlsxParserOptions = {
  sheetName?: string,
  limits?: Partial<ImportParserLimits>,
};

//The parsed import cell contract exported for module callers
export type ParsedImportCell =
  | { type: 'empty', value: null, sourceToken: '', }
  | { type: 'text', value: string, sourceToken: string, }
  | { type: 'number', value: string, sourceToken: string, }
  | { type: 'boolean', value: boolean, sourceToken: 'true' | 'false', }
  | { type: 'date', value: string, sourceToken: string, };

//The parsed import row contract exported for module callers
export type ParsedImportRow = {
  rowNumber: number,
  cells: ParsedImportCell[],
};

//The parsed import sheet contract exported for module callers
export type ParsedImportSheet = {
  index: number,
  name: string,
  rows: ParsedImportRow[],
  rowCount: number,
  columnCount: number,
};

//The import parser issue code contract exported for module callers
export type ImportParserIssueCode =
  | 'csv_empty_source'
  | 'csv_unclosed_quote'
  | 'csv_unexpected_quote'
  | 'csv_character_after_quote'
  | 'row_width_mismatch'
  | 'xlsx_formula_result_missing'
  | 'xlsx_cell_error'
  | 'xlsx_unsupported_cell'
  | 'xlsx_sheet_not_found';

//The import parser issue contract exported for module callers
export type ImportParserIssue = {
  code: ImportParserIssueCode,
  message: string,
  rowNumber?: number,
  columnNumber?: number,
  sheetName?: string,
};

//The import parser notice contract exported for module callers
export type ImportParserNotice = {
  code: 'xlsx_formula_cached_value' | 'xlsx_hyperlink_flattened' | 'xlsx_rich_text_flattened',
  message: string,
  rowNumber: number,
  columnNumber: number,
  sheetName: string,
};

//The parsed import result contract exported for module callers
export type ParsedImportResult = {
  source: 'csv' | 'xlsx',
  parserVersion: typeof IMPORT_PARSER_VERSION,
  sourceByteLength: number,
  sourceFingerprint: string,
  importFingerprint: string,
  status: 'ready' | 'invalid',
  sheets: ParsedImportSheet[],
  issues: ImportParserIssue[],
  notices: ImportParserNotice[],
  totals: {
    sheets: number,
    rows: number,
    columns: number,
    cells: number,
  },
  csv?: {
    encoding: CsvEncoding,
    delimiter: CsvDelimiter,
  },
};

//The inferred storage type contract exported for module callers
export type InferredStorageType =
  | 'text'
  | 'bigint'
  | 'numeric'
  | 'boolean'
  | 'date'
  | 'time'
  | 'timestamptz'
  | 'jsonb';

//The column inference contract exported for module callers
export type ColumnInference = {
  columnNumber: number,
  suggestedType: InferredStorageType,
  suggestedField: import('../../files/helpers/contracts.js').FileFieldKind,
  nonEmptyCount: number,
  confidence: 'certain' | 'mixed' | 'empty',
  reason: string,
};

/**
 * Represent an owned import parser failure.
 */
export class ImportParserError extends Error {
  /**
   * Create a ImportParserError instance.
   */
  public constructor(
    public readonly code:
      | 'invalid_parser_options'
      | 'source_too_large'
      | 'sheet_limit_exceeded'
      | 'row_limit_exceeded'
      | 'column_limit_exceeded'
      | 'cell_limit_exceeded'
      | 'cell_too_large'
      | 'issue_limit_exceeded'
      | 'delimiter_probe_limit_exceeded'
      | 'unsupported_encoding'
      | 'invalid_encoding'
      | 'xlsx_archive_unsafe'
      | 'xlsx_cache_limit_exceeded'
      | 'xlsx_compression_ratio_exceeded'
      | 'xlsx_encrypted'
      | 'xlsx_entry_limit_exceeded'
      | 'xlsx_uncompressed_limit_exceeded'
      | 'invalid_xlsx',
    message: string
  ) {
    super(message);
    this.name = 'ImportParserError';
  }
}
