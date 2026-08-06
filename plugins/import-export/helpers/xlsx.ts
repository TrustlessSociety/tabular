//node
import type { FileHandle } from 'node:fs/promises';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

//modules
import ExcelJS from 'exceljs';

//client
import type {
  ImportParserIssue,
  ImportParserLimits,
  ImportParserNotice,
  ParsedImportCell,
  ParsedImportResult,
  ParsedImportRow,
  XlsxByteInput,
  XlsxParserOptions
} from './contracts.js';
import { IMPORT_PARSER_VERSION, ImportParserError } from './contracts.js';
import { importFingerprint, SourceFingerprint } from './fingerprint.js';
import { requireWithinLimit, validateXlsxOptions } from './validation.js';

const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_END_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 65_535;
const XLSX_MAX_ARCHIVE_ENTRIES = 2_048;
const XLSX_MAX_CENTRAL_DIRECTORY_BYTES = 8 * 1024 * 1024;
const XLSX_MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const XLSX_MAX_COMPRESSION_RATIO = 100;
const XLSX_MAX_SHARED_STRINGS_BYTES = 16 * 1024 * 1024;
const XLSX_MAX_STYLES_BYTES = 4 * 1024 * 1024;

/**
 * Parse the XLSX.
 */
export async function parseXlsx(
  input: XlsxByteInput,
  options: XlsxParserOptions = {}
): Promise<ParsedImportResult> {
  const validated = validateXlsxOptions(options);
  const fingerprint = new SourceFingerprint();
  const source = await limitedInput(input, validated.limits, fingerprint);
  const sheets: ParsedImportResult['sheets'] = [];
  const issues: ImportParserIssue[] = [];
  const notices: ImportParserNotice[] = [];
  let scannedSheets = 0;
  let scannedRows = 0;
  let scannedCells = 0;
  let selectedFound = false;

  /**
   * Return the issue result.
   */
  const issue = (entry: ImportParserIssue) => {
    issues.push(entry);
    requireWithinLimit(
      issues.length + notices.length,
      validated.limits.issues,
      'issue_limit_exceeded',
      'XLSX source exceeds the finding reporting limit'
    );
  };

  /**
   * Return the notice result.
   */
  const notice = (entry: ImportParserNotice) => {
    notices.push(entry);
    requireWithinLimit(
      issues.length + notices.length,
      validated.limits.issues,
      'issue_limit_exceeded',
      'XLSX source exceeds the finding reporting limit'
    );
  };

  try {
    await preflightXlsxArchive(source.path, validated.limits);
    const workbook = new ExcelJS.stream.xlsx.WorkbookReader(source.path, {
      worksheets: 'ignore',
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      styles: 'cache',
      entries: 'ignore'
    });
    //ExcelJS-generated and third-party ZIPs may place worksheets before
    // workbook metadata. WorkbookReader 4.4.0 otherwise defers those entries
    // through temporary streams and can stop after the first early sheet.
    // The metadata-only streaming pass drains early worksheets immediately,
    // caches bounded shared strings/styles, then the second streaming pass
    // reads rows with the resolved workbook model. No workbook rows are kept
    // during the first pass.
    Object.assign(workbook as unknown as Record<string, unknown>, {
      sharedStrings: [],
      workbookRels: [],
      model: { sheets: [] }
    });
    await drain(workbook.parse());
    const workbookEvents = (workbook.parse as unknown as (
      input?: unknown,
      options?: Record<string, string>
    ) => AsyncIterator<unknown>)(undefined, {
      worksheets: 'emit',
      sharedStrings: 'ignore',
      hyperlinks: 'ignore',
      styles: 'ignore',
      entries: 'ignore'
    });
    while (true) {
      const next = await workbookEvents.next();
      if (next.done) break;
      const event = next.value as {
        eventType?: string,
        value?: unknown,
      };
      if (event.eventType !== 'worksheet') continue;
      const worksheet = event.value as ExcelJS.stream.xlsx.WorksheetReader & { name: string, };
      const sheetName = (worksheet as typeof worksheet & { name: string, }).name;
      scannedSheets += 1;
      requireWithinLimit(
        scannedSheets,
        validated.limits.sheets,
        'sheet_limit_exceeded',
        'XLSX workbook exceeds the sheet limit'
      );
      const selected = !validated.sheetName || sheetName === validated.sheetName;
      if (selected) selectedFound = true;
      const rows: ParsedImportRow[] = [];
      let columnCount = 0;
      for await (const row of worksheet) {
        scannedRows += 1;
        requireWithinLimit(
          scannedRows,
          validated.limits.rows,
          'row_limit_exceeded',
          'XLSX workbook exceeds the row limit'
        );
        requireWithinLimit(
          row.number,
          validated.limits.rows,
          'row_limit_exceeded',
          'XLSX row coordinate exceeds the staging limit'
        );
        const width = row.cellCount;
        requireWithinLimit(
          width,
          validated.limits.columns,
          'column_limit_exceeded',
          'XLSX row exceeds the column limit'
        );
        scannedCells += width;
        requireWithinLimit(
          scannedCells,
          validated.limits.cells,
          'cell_limit_exceeded',
          'XLSX workbook exceeds the cell limit'
        );
        if (!selected) continue;
        const cells: ParsedImportCell[] = [];
        for (let columnNumber = 1; columnNumber <= width; columnNumber += 1) {
          const cell = row.getCell(columnNumber);
          cells.push(xlsxCell({
            value: cell.value,
            rowNumber: row.number,
            columnNumber,
            sheetName,
            limits: validated.limits,
            issue,
            notice
          }));
        }
        columnCount = Math.max(columnCount, cells.length);
        rows.push({ rowNumber: row.number, cells });
      }
      if (selected) {
        sheets.push({
          index: scannedSheets,
          name: sheetName,
          rows,
          rowCount: rows.length,
          columnCount
        });
      }
    }
  } catch (error) {
    if (error instanceof ImportParserError) throw error;
    throw new ImportParserError('invalid_xlsx', 'XLSX source could not be read safely');
  } finally {
    await source.cleanup();
  }

  if (validated.sheetName && !selectedFound) {
    issue({
      code: 'xlsx_sheet_not_found',
      message: 'The selected worksheet is unavailable',
      sheetName: validated.sheetName
    });
  }
  const sourceFingerprint = fingerprint.digest();
  const rowCount = sheets.reduce((total, sheet) => total + sheet.rowCount, 0);
  const cellCount = sheets.reduce((total, sheet) =>
    total + sheet.rows.reduce((rows, row) => rows + row.cells.length, 0), 0);
  return {
    source: 'xlsx',
    parserVersion: IMPORT_PARSER_VERSION,
    sourceByteLength: fingerprint.byteLength,
    sourceFingerprint,
    importFingerprint: importFingerprint({
      source: 'xlsx',
      sourceFingerprint,
      options: { sheetName: validated.sheetName || null }
    }),
    status: issues.length ? 'invalid' : 'ready',
    sheets,
    issues,
    notices,
    totals: {
      sheets: sheets.length,
      rows: rowCount,
      columns: sheets.reduce((maximum, sheet) => Math.max(maximum, sheet.columnCount), 0),
      cells: cellCount
    }
  };
}

type XlsxArchiveEntry = {
  name: string,
  flags: number,
  compression: number,
  compressedBytes: number,
  uncompressedBytes: number,
  localOffset: number,
};

/**
 * Return the preflight XLSX archive result.
 */
async function preflightXlsxArchive(filePath: string, limits: ImportParserLimits) {
  const handle = await fsPromises.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const end = await readZipEnd(handle, stat.size);
    if (end.entries > XLSX_MAX_ARCHIVE_ENTRIES) {
      throw new ImportParserError(
        'xlsx_entry_limit_exceeded',
        `XLSX archive exceeds ${XLSX_MAX_ARCHIVE_ENTRIES} entries`
      );
    }
    if (end.centralBytes > XLSX_MAX_CENTRAL_DIRECTORY_BYTES
      || end.centralOffset + end.centralBytes !== end.offset) {
      unsafeArchive();
    }
    const central = Buffer.alloc(end.centralBytes);
    const read = await handle.read(central, 0, central.length, end.centralOffset);
    if (read.bytesRead !== central.length) unsafeArchive();
    const entries = readCentralEntries(central, end.entries, end.centralOffset);
    validateArchiveEntries(entries, limits);
    await validateLocalEntries(handle, entries, end.centralOffset);
  } finally {
    await handle.close();
  }
}

/**
 * Read the zip end.
 */
async function readZipEnd(handle: FileHandle, size: number) {
  if (!Number.isSafeInteger(size) || size < ZIP_END_BYTES) unsafeArchive();
  const length = Math.min(size, ZIP_END_BYTES + ZIP_MAX_COMMENT_BYTES);
  const tail = Buffer.alloc(length);
  const start = size - length;
  const read = await handle.read(tail, 0, length, start);
  if (read.bytesRead !== length) unsafeArchive();
  for (let offset = length - ZIP_END_BYTES; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== ZIP_END_OF_CENTRAL_DIRECTORY) continue;
    const commentBytes = tail.readUInt16LE(offset + 20);
    if (offset + ZIP_END_BYTES + commentBytes !== length) continue;
    const disk = tail.readUInt16LE(offset + 4);
    const centralDisk = tail.readUInt16LE(offset + 6);
    const diskEntries = tail.readUInt16LE(offset + 8);
    const entries = tail.readUInt16LE(offset + 10);
    const centralBytes = tail.readUInt32LE(offset + 12);
    const centralOffset = tail.readUInt32LE(offset + 16);
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries
      || entries === 0xffff || centralBytes === 0xffffffff || centralOffset === 0xffffffff) {
      unsafeArchive();
    }
    return { entries, centralBytes, centralOffset, offset: start + offset };
  }
  unsafeArchive();
}

/**
 * Read the central entries.
 */
function readCentralEntries(
  central: Buffer,
  expectedEntries: number,
  centralOffset: number
): XlsxArchiveEntry[] {
  const entries: XlsxArchiveEntry[] = [];
  const names = new Set<string>();
  let offset = 0;
  while (entries.length < expectedEntries) {
    if (offset + 46 > central.length || central.readUInt32LE(offset) !== ZIP_CENTRAL_HEADER) {
      unsafeArchive();
    }
    const flags = central.readUInt16LE(offset + 8);
    const compression = central.readUInt16LE(offset + 10);
    const compressedBytes = central.readUInt32LE(offset + 20);
    const uncompressedBytes = central.readUInt32LE(offset + 24);
    const nameBytes = central.readUInt16LE(offset + 28);
    const extraBytes = central.readUInt16LE(offset + 30);
    const commentBytes = central.readUInt16LE(offset + 32);
    const localOffset = central.readUInt32LE(offset + 42);
    const next = offset + 46 + nameBytes + extraBytes + commentBytes;
    if (next > central.length || compressedBytes === 0xffffffff
      || uncompressedBytes === 0xffffffff || localOffset === 0xffffffff
      || localOffset >= centralOffset) unsafeArchive();
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      throw new ImportParserError('xlsx_encrypted', 'Encrypted XLSX archive entries are unsupported');
    }
    if (compression !== 0 && compression !== 8) unsafeArchive();
    const name = central.subarray(offset + 46, offset + 46 + nameBytes).toString('utf8');
    if (!safeArchiveName(name) || names.has(name)) unsafeArchive();
    names.add(name);
    entries.push({
      name,
      flags,
      compression,
      compressedBytes,
      uncompressedBytes,
      localOffset
    });
    offset = next;
  }
  if (offset !== central.length) unsafeArchive();
  return entries;
}

/**
 * Validate the local entries.
 */
async function validateLocalEntries(
  handle: FileHandle,
  entries: XlsxArchiveEntry[],
  centralOffset: number
) {
  const offsets = new Set<number>();
  const ordered = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    if (!entry || offsets.has(entry.localOffset)) unsafeArchive();
    offsets.add(entry.localOffset);
    const header = Buffer.alloc(30);
    const read = await handle.read(header, 0, header.length, entry.localOffset);
    if (read.bytesRead !== header.length || header.readUInt32LE(0) !== ZIP_LOCAL_HEADER) {
      unsafeArchive();
    }
    const flags = header.readUInt16LE(6);
    const compression = header.readUInt16LE(8);
    const compressedBytes = header.readUInt32LE(18);
    const uncompressedBytes = header.readUInt32LE(22);
    const nameBytes = header.readUInt16LE(26);
    const extraBytes = header.readUInt16LE(28);
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      throw new ImportParserError('xlsx_encrypted', 'Encrypted XLSX archive entries are unsupported');
    }
    if (flags !== entry.flags || compression !== entry.compression) unsafeArchive();
    if ((flags & 0x0008) === 0
      && (compressedBytes !== entry.compressedBytes || uncompressedBytes !== entry.uncompressedBytes)) {
      unsafeArchive();
    }
    const localName = Buffer.alloc(nameBytes);
    const nameRead = await handle.read(localName, 0, nameBytes, entry.localOffset + header.length);
    if (nameRead.bytesRead !== nameBytes || localName.toString('utf8') !== entry.name) unsafeArchive();
    const payloadEnd = entry.localOffset + header.length + nameBytes + extraBytes
      + entry.compressedBytes;
    const nextOffset = ordered[index + 1]?.localOffset ?? centralOffset;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > nextOffset) unsafeArchive();
  }
}

/**
 * Validate the archive entries.
 */
function validateArchiveEntries(entries: XlsxArchiveEntry[], limits: ImportParserLimits) {
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let worksheetCount = 0;
  for (const entry of entries) {
    compressedBytes += entry.compressedBytes;
    uncompressedBytes += entry.uncompressedBytes;
    if (entry.uncompressedBytes > 0
      && entry.uncompressedBytes / Math.max(1, entry.compressedBytes) > XLSX_MAX_COMPRESSION_RATIO) {
      compressionRatioExceeded();
    }
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(entry.name)) worksheetCount += 1;
    if (entry.name === 'xl/sharedStrings.xml'
      && entry.uncompressedBytes > XLSX_MAX_SHARED_STRINGS_BYTES) cacheLimitExceeded();
    if (entry.name === 'xl/styles.xml'
      && entry.uncompressedBytes > XLSX_MAX_STYLES_BYTES) cacheLimitExceeded();
  }
  if (uncompressedBytes > XLSX_MAX_UNCOMPRESSED_BYTES) {
    throw new ImportParserError(
      'xlsx_uncompressed_limit_exceeded',
      `XLSX archive exceeds ${XLSX_MAX_UNCOMPRESSED_BYTES} uncompressed bytes`
    );
  }
  if (uncompressedBytes > 0
    && uncompressedBytes / Math.max(1, compressedBytes) > XLSX_MAX_COMPRESSION_RATIO) {
    compressionRatioExceeded();
  }
  requireWithinLimit(
    worksheetCount,
    limits.sheets,
    'sheet_limit_exceeded',
    'XLSX workbook exceeds the sheet limit'
  );
}

/**
 * Report the safe archive name condition.
 */
function safeArchiveName(value: string) {
  return value.length > 0 && value.length <= 512 && !value.includes('\u0000')
    && !value.startsWith('/') && !value.includes('\\')
    && !value.split('/').includes('..');
}

/**
 * Return the compression ratio exceeded result.
 */
function compressionRatioExceeded(): never {
  throw new ImportParserError(
    'xlsx_compression_ratio_exceeded',
    `XLSX archive compression ratio exceeds ${XLSX_MAX_COMPRESSION_RATIO}:1`
  );
}

/**
 * Return the cache limit exceeded result.
 */
function cacheLimitExceeded(): never {
  throw new ImportParserError(
    'xlsx_cache_limit_exceeded',
    'XLSX shared-string or style metadata exceeds the parser cache limit'
  );
}

/**
 * Return the unsafe archive result.
 */
function unsafeArchive(): never {
  throw new ImportParserError('xlsx_archive_unsafe', 'XLSX central directory is unsafe or malformed');
}

/**
 * Return the XLSX cell result.
 */
function xlsxCell(input: {
  value: ExcelJS.CellValue,
  rowNumber: number,
  columnNumber: number,
  sheetName: string,
  limits: ImportParserLimits,
  issue: (issue: ImportParserIssue) => void,
  notice: (notice: ImportParserNotice) => void,
}): ParsedImportCell {
  let value = input.value;
  if (isFormula(value)) {
    input.notice({
      code: 'xlsx_formula_cached_value',
      message: 'Formula was flattened to its cached value; formula text was not imported.',
      rowNumber: input.rowNumber,
      columnNumber: input.columnNumber,
      sheetName: input.sheetName
    });
    if (typeof value.result === 'undefined') {
      input.issue({
        code: 'xlsx_formula_result_missing',
        message: 'Formula cell has no cached value',
        rowNumber: input.rowNumber,
        columnNumber: input.columnNumber,
        sheetName: input.sheetName
      });
      return emptyCell();
    }
    value = value.result;
  }
  if (isCellError(value)) {
    input.issue({
      code: 'xlsx_cell_error',
      message: `XLSX cell contains ${value.error}`,
      rowNumber: input.rowNumber,
      columnNumber: input.columnNumber,
      sheetName: input.sheetName
    });
    return emptyCell();
  }
  if (isRichText(value)) {
    input.notice({
      code: 'xlsx_rich_text_flattened',
      message: 'Rich text was flattened to ordinary text.',
      rowNumber: input.rowNumber,
      columnNumber: input.columnNumber,
      sheetName: input.sheetName
    });
    return textCell(value.richText.map((entry) => entry.text).join(''), input.limits);
  }
  if (isHyperlink(value)) {
    input.notice({
      code: 'xlsx_hyperlink_flattened',
      message: 'Hyperlink behavior was removed and its label was imported as text.',
      rowNumber: input.rowNumber,
      columnNumber: input.columnNumber,
      sheetName: input.sheetName
    });
    return textCell(value.text, input.limits);
  }
  if (value === null || typeof value === 'undefined') return emptyCell();
  if (typeof value === 'string') return textCell(value, input.limits);
  if (typeof value === 'boolean') {
    return { type: 'boolean', value, sourceToken: value ? 'true' : 'false' };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const token = String(value);
    return { type: 'number', value: token, sourceToken: token };
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const token = value.toISOString();
    return { type: 'date', value: token, sourceToken: token };
  }
  input.issue({
    code: 'xlsx_unsupported_cell',
    message: 'XLSX cell contains an unsupported cached value',
    rowNumber: input.rowNumber,
    columnNumber: input.columnNumber,
    sheetName: input.sheetName
  });
  return emptyCell();
}

/**
 * Report the empty cell condition.
 */
function emptyCell(): ParsedImportCell {
  return { type: 'empty', value: null, sourceToken: '' };
}

/**
 * Return the text cell result.
 */
function textCell(value: string, limits: ImportParserLimits): ParsedImportCell {
  requireWithinLimit(
    value.length,
    limits.cellCharacters,
    'cell_too_large',
    'XLSX cell exceeds the character limit'
  );
  return { type: 'text', value, sourceToken: value };
}

/**
 * Report whether the formula condition holds.
 */
function isFormula(value: ExcelJS.CellValue): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
  return Boolean(value && typeof value === 'object'
    && ('formula' in value || 'sharedFormula' in value));
}

/**
 * Report whether the cell error condition holds.
 */
function isCellError(value: ExcelJS.CellValue): value is ExcelJS.CellErrorValue {
  return Boolean(value && typeof value === 'object' && 'error' in value);
}

/**
 * Report whether the rich text condition holds.
 */
function isRichText(value: ExcelJS.CellValue): value is ExcelJS.CellRichTextValue {
  return Boolean(value && typeof value === 'object' && 'richText' in value);
}

/**
 * Report whether the hyperlink condition holds.
 */
function isHyperlink(value: ExcelJS.CellValue): value is ExcelJS.CellHyperlinkValue {
  return Boolean(value && typeof value === 'object' && 'hyperlink' in value && 'text' in value);
}

/**
 * Return the limited input result.
 */
async function limitedInput(
  input: XlsxByteInput,
  limits: ImportParserLimits,
  fingerprint: SourceFingerprint
) {
  if (typeof input === 'string') {
    const stat = await fsPromises.stat(input);
    requireWithinLimit(
      stat.size,
      limits.sourceBytes,
      'source_too_large',
      'XLSX source exceeds the byte limit'
    );
    for await (const chunk of fs.createReadStream(input)) {
      fingerprint.update(chunk as Buffer);
    }
    return { path: input, cleanup: async () => undefined };
  }
  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'tabular-xlsx-'));
  const sourcePath = path.join(directory, 'source.xlsx');
  let file: FileHandle | undefined;
  try {
    file = await fsPromises.open(sourcePath, 'wx', 0o600);
    for await (const chunk of xlsxByteChunks(input)) {
      const bytes = Buffer.from(chunk);
      fingerprint.update(bytes);
      if (fingerprint.byteLength > limits.sourceBytes) {
        throw new ImportParserError('source_too_large', 'XLSX source exceeds the byte limit');
      }
      await file.write(bytes);
    }
    await file.close();
    file = undefined;
    return {
      path: sourcePath,
      cleanup: async () => {
        await fsPromises.unlink(sourcePath).catch(() => undefined);
        await fsPromises.rmdir(directory).catch(() => undefined);
      }
    };
  } catch (error) {
    await file?.close().catch(() => undefined);
    await fsPromises.unlink(sourcePath).catch(() => undefined);
    await fsPromises.rmdir(directory).catch(() => undefined);
    throw error;
  }
}

/**
 * Return the XLSX byte chunks result.
 */
async function* xlsxByteChunks(
  input: Exclude<XlsxByteInput, string>
): AsyncGenerator<Buffer> {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    yield Buffer.from(input);
    return;
  }
  for await (const chunk of input) {
    yield typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
  }
}

/**
 * Return the drain result.
 */
async function drain(iterator: AsyncIterator<unknown>) {
  while (!(await iterator.next()).done) {
    //Metadata and shared-string caches are maintained by WorkbookReader.
  }
}
