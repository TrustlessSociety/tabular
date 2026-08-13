//node
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import ExcelJS from 'exceljs';

//client
import { ImportParserError } from '../../../src/plugins/import-export/helpers/contracts.js';
import { parseCsv } from '../../../src/plugins/import-export/helpers/csv.js';
import { deterministicFingerprint } from '../../../src/plugins/import-export/helpers/fingerprint.js';
import { inferColumns } from '../../../src/plugins/import-export/helpers/inference.js';
import { parseXlsx } from '../../../src/plugins/import-export/helpers/xlsx.js';

test('CSV preserves exact tokens, quoted delimiters and embedded newlines across chunks', async () => {
  const source = '\uFEFFid,name,note\r\n001,"Doe, Jane","line 1\r\nline 2"\r\n002," spaced ","a ""quote"""';
  const bytes = Buffer.from(source, 'utf8');
  const result = await parseCsv(Readable.from([
    bytes.subarray(0, 2),
    bytes.subarray(2, 17),
    bytes.subarray(17, 31),
    bytes.subarray(31)
  ]));

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.csv, { encoding: 'utf-8', delimiter: ',' });
  assert.equal(result.sheets[0]!.rows[1]!.cells[0]!.sourceToken, '001');
  assert.equal(result.sheets[0]!.rows[1]!.cells[1]!.sourceToken, 'Doe, Jane');
  assert.equal(result.sheets[0]!.rows[1]!.cells[2]!.sourceToken, 'line 1\r\nline 2');
  assert.equal(result.sheets[0]!.rows[2]!.cells[1]!.sourceToken, ' spaced ');
  assert.equal(result.sheets[0]!.rows[2]!.cells[2]!.sourceToken, 'a "quote"');
  assert.equal(result.sourceByteLength, bytes.byteLength);
});

test('CSV detects UTF-16LE BOM and deterministic semicolon delimiter', async () => {
  const body = Buffer.from('code;label\r\n0007;Mañana', 'utf16le');
  const source = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
  const first = await parseCsv(source);
  const second = await parseCsv(Readable.from([source.subarray(0, 9), source.subarray(9)]));

  assert.deepEqual(first.csv, { encoding: 'utf-16le', delimiter: ';' });
  assert.equal(first.sheets[0]!.rows[1]!.cells[0]!.sourceToken, '0007');
  assert.equal(first.sheets[0]!.rows[1]!.cells[1]!.sourceToken, 'Mañana');
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.equal(first.importFingerprint, second.importFingerprint);
});

test('CSV reports every row-width problem and never presents partial validity', async () => {
  const result = await parseCsv(Buffer.from('a,b\n1\n2,3,4\n'));

  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.issues.map((issue) => [issue.code, issue.rowNumber]), [
    ['row_width_mismatch', 2],
    ['row_width_mismatch', 3]
  ]);
  assert.equal(result.sheets[0]!.rows.length, 3, 'all review rows remain attributable');
});

test('CSV rejects unsupported encodings, invalid UTF-8 and hard-limit overrides', async () => {
  await assert.rejects(
    () => parseCsv(Buffer.from([0xfe, 0xff, 0, 97])),
    (error: unknown) => error instanceof ImportParserError && error.code === 'unsupported_encoding'
  );
  await assert.rejects(
    () => parseCsv(Buffer.from([0xc3, 0x28, 0x0a])),
    (error: unknown) => error instanceof ImportParserError && error.code === 'invalid_encoding'
  );
  await assert.rejects(
    () => parseCsv(Buffer.from('a\n1\n2'), { limits: { rows: 2 } }),
    (error: unknown) => error instanceof ImportParserError && error.code === 'row_limit_exceeded'
  );
  await assert.rejects(
    () => parseCsv(Buffer.from('a'), { limits: { sourceBytes: 33 * 1024 * 1024 } }),
    (error: unknown) => error instanceof ImportParserError && error.code === 'invalid_parser_options'
  );
});

test('inference is deterministic and never rewrites source tokens', async () => {
  const parsed = await parseCsv(Buffer.from([
    'id,amount,enabled,date,mixed',
    '001,12.50,true,2026-08-02,4',
    '002,-3.25,false,2026-08-03,text'
  ].join('\n')));
  const inference = inferColumns(parsed.sheets[0]!.rows.slice(1));

  assert.deepEqual(inference.map((entry) => entry.suggestedType), [
    'text', 'numeric', 'boolean', 'date', 'text'
  ]);
  assert.equal(parsed.sheets[0]!.rows[1]!.cells[0]!.sourceToken, '001');
  assert.equal(
    deterministicFingerprint({ b: 2, a: { y: true, x: 'value' } }),
    deterministicFingerprint({ a: { x: 'value', y: true }, b: 2 })
  );
});

test('XLSX WorkbookReader imports cached formula results and never formula text', async () => {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet('Orders');
  first.addRow(['id', 'formula', 'flag', 'date']);
  first.addRow([
    '001',
    { formula: 'DO_NOT_EXPOSE_FORMULA(A2)', result: 'cached result' },
    true,
    new Date('2026-08-02T03:04:05.000Z')
  ]);
  const second = workbook.addWorksheet('Other');
  second.addRow(['value']);
  second.addRow([42]);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

  const result = await parseXlsx(Readable.from([
    bytes.subarray(0, Math.floor(bytes.length / 2)),
    bytes.subarray(Math.floor(bytes.length / 2))
  ]));

  assert.equal(result.status, 'ready');
  assert.equal(result.sheets.length, 2);
  assert.equal(result.sheets[0]!.rows[1]!.cells[0]!.sourceToken, '001');
  assert.deepEqual(result.sheets[0]!.rows[1]!.cells[1], {
    type: 'text', value: 'cached result', sourceToken: 'cached result'
  });
  assert.equal(result.notices[0]!.code, 'xlsx_formula_cached_value');
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPOSE_FORMULA/);
  assert.equal(result.sheets[1]!.rows[1]!.cells[0]!.sourceToken, '42');
});

test('XLSX sheet selection and missing cached formulas are all-or-nothing', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Ignored').addRow(['ignore']);
  const selected = workbook.addWorksheet('Selected');
  selected.addRow(['a', 'b']);
  selected.addRow([{ formula: 'A1+1' }, { formula: 'A1+2' }]);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

  const result = await parseXlsx(bytes, { sheetName: 'Selected' });
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.sheets.map((sheet) => sheet.name), ['Selected']);
  assert.deepEqual(result.issues.map((issue) => [issue.code, issue.rowNumber, issue.columnNumber]), [
    ['xlsx_formula_result_missing', 2, 1],
    ['xlsx_formula_result_missing', 2, 2]
  ]);
  assert.equal(result.sheets[0]!.rows[1]!.cells.every((cell) => cell.type === 'empty'), true);
});

test('XLSX enforces source and workbook structure limits', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Limits');
  sheet.addRow(['one']);
  sheet.addRow(['two']);
  workbook.addWorksheet('Second').addRow(['three']);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

  await assert.rejects(
    () => parseXlsx(bytes, { limits: { sourceBytes: bytes.byteLength - 1 } }),
    (error: unknown) => error instanceof ImportParserError && error.code === 'source_too_large'
  );
  await assert.rejects(
    () => parseXlsx(bytes, { limits: { rows: 1 } }),
    (error: unknown) => error instanceof ImportParserError && error.code === 'row_limit_exceeded'
  );
  await assert.rejects(
    () => parseXlsx(bytes, { limits: { sheets: 1 } }),
    (error: unknown) => error instanceof ImportParserError && error.code === 'sheet_limit_exceeded'
  );
});

test('XLSX preflights ZIP headers, entry count, encryption and compression ratio', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Archive').addRow(['value']);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const end = zipEndOffset(bytes);
  const central = bytes.readUInt32LE(end + 16);

  const excessiveEntries = Buffer.from(bytes);
  excessiveEntries.writeUInt16LE(2_049, end + 8);
  excessiveEntries.writeUInt16LE(2_049, end + 10);
  await assert.rejects(
    () => parseXlsx(excessiveEntries),
    archiveError('xlsx_entry_limit_exceeded')
  );

  const encrypted = Buffer.from(bytes);
  encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 0x0001, central + 8);
  await assert.rejects(
    () => parseXlsx(encrypted),
    archiveError('xlsx_encrypted')
  );

  const compressedBomb = Buffer.from(bytes);
  compressedBomb.writeUInt32LE(1, central + 20);
  compressedBomb.writeUInt32LE(1_000_000, central + 24);
  await assert.rejects(
    () => parseXlsx(compressedBomb),
    archiveError('xlsx_compression_ratio_exceeded')
  );

  const mismatchedLocalHeader = Buffer.from(bytes);
  const local = mismatchedLocalHeader.readUInt32LE(central + 42);
  mismatchedLocalHeader.writeUInt16LE(
    mismatchedLocalHeader.readUInt16LE(local + 8) === 8 ? 0 : 8,
    local + 8
  );
  await assert.rejects(
    () => parseXlsx(mismatchedLocalHeader),
    archiveError('xlsx_archive_unsafe')
  );
});

test('XLSX rejects sparse physical row coordinates outside the staging bound', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sparse');
  sheet.getRow(1).getCell(1).value = 'header';
  sheet.getRow(60_000).getCell(1).value = 'value';
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

  await assert.rejects(
    () => parseXlsx(bytes, { sheetName: 'Sparse', limits: { rows: 50_001 } }),
    (error: unknown) => error instanceof ImportParserError && error.code === 'row_limit_exceeded'
  );
});

test('XLSX bounds combined issue and notice reporting memory', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Findings');
  sheet.addRow(['first', 'second']);
  sheet.addRow([
    { formula: '1+1', result: 2 },
    { formula: '2+2', result: 4 }
  ]);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

  await assert.rejects(
    () => parseXlsx(bytes, { limits: { issues: 1 } }),
    (error: unknown) => error instanceof ImportParserError && error.code === 'issue_limit_exceeded'
  );
});

/**
 * Locates the standard ZIP end record in an ExcelJS-generated fixture.
 */
function zipEndOffset(bytes: Buffer) {
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const offset = bytes.lastIndexOf(signature);
  assert.ok(offset >= 0, 'fixture must contain a ZIP end record');
  return offset;
}

/**
 * Builds a narrow parser-error predicate for central-directory probes.
 */
function archiveError(code: ImportParserError['code']) {
  return (error: unknown) => error instanceof ImportParserError && error.code === code;
}
