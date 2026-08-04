import { TextDecoder } from 'node:util';
import {
  IMPORT_PARSER_VERSION,
  ImportParserError,
  type CsvDelimiter,
  type CsvEncoding,
  type CsvParserOptions,
  type ImportByteInput,
  type ImportParserIssue,
  type ImportParserLimits,
  type ParsedImportCell,
  type ParsedImportResult,
  type ParsedImportRow
} from './contracts.js';
import { importFingerprint, SourceFingerprint } from './fingerprint.js';
import { requireWithinLimit, validateCsvOptions } from './validation.js';

const DELIMITER_PRIORITY: CsvDelimiter[] = [',', '\t', ';', '|'];

export async function parseCsv(
  input: ImportByteInput,
  options: CsvParserOptions = {}
): Promise<ParsedImportResult> {
  const validated = validateCsvOptions(options);
  const fingerprint = new SourceFingerprint();
  let prefix = Buffer.alloc(0);
  let decoder: TextDecoder | undefined;
  let encoding: CsvEncoding | undefined;
  let parser: CsvMachine | undefined;
  let detector: DelimiterDetector | undefined;
  let probe = '';

  const acceptText = (text: string) => {
    if (!text) return;
    if (parser) {
      parser.write(text);
      return;
    }
    probe += text;
    requireWithinLimit(
      probe.length,
      validated.limits.delimiterProbeCharacters,
      'delimiter_probe_limit_exceeded',
      'CSV first record exceeds the delimiter probe limit'
    );
    detector ||= new DelimiterDetector();
    const boundary = detector.write(text);
    if (!boundary) return;
    parser = new CsvMachine(detectDelimiter(probe), validated.limits);
    parser.write(probe);
    probe = '';
    detector = undefined;
  };

  try {
    for await (const raw of byteChunks(input)) {
      fingerprint.update(raw);
      requireWithinLimit(
        fingerprint.byteLength,
        validated.limits.sourceBytes,
        'source_too_large',
        'CSV source exceeds the byte limit'
      );
      if (!decoder) {
        prefix = Buffer.concat([prefix, raw]);
        if (prefix.length < 3) continue;
        const detected = detectEncoding(prefix);
        encoding = detected.encoding;
        decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true });
        parser = validated.delimiter === 'auto'
          ? undefined
          : new CsvMachine(validated.delimiter, validated.limits);
        acceptText(decoder.decode(prefix.subarray(detected.offset), { stream: true }));
        prefix = Buffer.alloc(0);
        continue;
      }
      acceptText(decoder.decode(raw, { stream: true }));
    }
    if (!decoder) {
      const detected = detectEncoding(prefix);
      encoding = detected.encoding;
      decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true });
      parser = validated.delimiter === 'auto'
        ? undefined
        : new CsvMachine(validated.delimiter, validated.limits);
      acceptText(decoder.decode(prefix.subarray(detected.offset), { stream: true }));
    }
    acceptText(decoder.decode());
  } catch (error) {
    if (error instanceof ImportParserError) throw error;
    throw new ImportParserError('invalid_encoding', 'CSV bytes are not valid UTF-8 or UTF-16LE');
  }

  if (!encoding) throw new Error('CSV encoding was not resolved');
  if (!parser) {
    const delimiter = validated.delimiter === 'auto' ? detectDelimiter(probe) : validated.delimiter;
    parser = new CsvMachine(delimiter, validated.limits);
    parser.write(probe);
  }
  const parsed = parser.finish();
  const sourceFingerprint = fingerprint.digest();
  const sheet = {
    index: 1,
    name: 'CSV',
    rows: parsed.rows,
    rowCount: parsed.rows.length,
    columnCount: parsed.columnCount
  };
  return {
    source: 'csv',
    parserVersion: IMPORT_PARSER_VERSION,
    sourceByteLength: fingerprint.byteLength,
    sourceFingerprint,
    importFingerprint: importFingerprint({
      source: 'csv',
      sourceFingerprint,
      options: { delimiter: parser.delimiter, encoding }
    }),
    status: parsed.issues.length ? 'invalid' : 'ready',
    sheets: [sheet],
    issues: parsed.issues,
    notices: [],
    totals: {
      sheets: 1,
      rows: sheet.rowCount,
      columns: sheet.columnCount,
      cells: parsed.cellCount
    },
    csv: { encoding, delimiter: parser.delimiter }
  };
}

class CsvMachine {
  readonly rows: ParsedImportRow[] = [];
  readonly issues: ImportParserIssue[] = [];
  readonly #limits: ImportParserLimits;
  #row: ParsedImportCell[] = [];
  #field = '';
  #fieldStarted = false;
  #rowStarted = false;
  #inQuotes = false;
  #afterQuote = false;
  #skipLf = false;
  #expectedWidth?: number;
  #cellCount = 0;
  #columnCount = 0;

  constructor(readonly delimiter: CsvDelimiter, limits: ImportParserLimits) {
    this.#limits = limits;
  }

  write(text: string) {
    for (const character of text) this.#writeCharacter(character);
  }

  finish() {
    if (this.#inQuotes) {
      this.#issue({
        code: 'csv_unclosed_quote',
        message: 'Quoted CSV field is not closed',
        rowNumber: this.rows.length + 1,
        columnNumber: this.#row.length + 1
      });
      this.#inQuotes = false;
    }
    if (this.#fieldStarted || this.#rowStarted || this.#row.length || this.#field.length) {
      this.#finishRow();
    }
    if (!this.rows.length) {
      this.#issue({ code: 'csv_empty_source', message: 'CSV source contains no rows' });
    }
    return {
      rows: this.rows,
      issues: this.issues,
      cellCount: this.#cellCount,
      columnCount: this.#columnCount
    };
  }

  #writeCharacter(character: string) {
    if (this.#skipLf) {
      this.#skipLf = false;
      if (character === '\n') return;
    }
    if (this.#inQuotes) {
      if (character === '"') {
        this.#inQuotes = false;
        this.#afterQuote = true;
      } else {
        this.#append(character);
      }
      return;
    }
    if (this.#afterQuote) {
      if (character === '"') {
        this.#append('"');
        this.#inQuotes = true;
        this.#afterQuote = false;
      } else if (character === this.delimiter) {
        this.#finishField();
      } else if (character === '\n' || character === '\r') {
        this.#finishRow();
        this.#skipLf = character === '\r';
      } else {
        this.#issue({
          code: 'csv_character_after_quote',
          message: 'A quoted CSV field is followed by an unexpected character',
          rowNumber: this.rows.length + 1,
          columnNumber: this.#row.length + 1
        });
        this.#afterQuote = false;
        this.#append(character);
      }
      return;
    }
    if (character === '"') {
      if (!this.#fieldStarted && !this.#field.length) {
        this.#fieldStarted = true;
        this.#rowStarted = true;
        this.#inQuotes = true;
      } else {
        this.#issue({
          code: 'csv_unexpected_quote',
          message: 'An unquoted CSV field contains a quote',
          rowNumber: this.rows.length + 1,
          columnNumber: this.#row.length + 1
        });
        this.#append(character);
      }
    } else if (character === this.delimiter) {
      this.#rowStarted = true;
      this.#finishField();
    } else if (character === '\n' || character === '\r') {
      this.#finishRow();
      this.#skipLf = character === '\r';
    } else {
      this.#append(character);
    }
  }

  #append(character: string) {
    this.#field += character;
    this.#fieldStarted = true;
    this.#rowStarted = true;
    requireWithinLimit(
      this.#field.length,
      this.#limits.cellCharacters,
      'cell_too_large',
      'CSV cell exceeds the character limit'
    );
  }

  #finishField() {
    this.#row.push({ type: 'text', value: this.#field, sourceToken: this.#field });
    requireWithinLimit(
      this.#row.length,
      this.#limits.columns,
      'column_limit_exceeded',
      'CSV row exceeds the column limit'
    );
    this.#field = '';
    this.#fieldStarted = false;
    this.#afterQuote = false;
  }

  #finishRow() {
    this.#finishField();
    const rowNumber = this.rows.length + 1;
    this.#expectedWidth ??= this.#row.length;
    if (this.#row.length !== this.#expectedWidth) {
      this.#issue({
        code: 'row_width_mismatch',
        message: `CSV row has ${this.#row.length} fields; expected ${this.#expectedWidth}`,
        rowNumber
      });
    }
    this.#cellCount += this.#row.length;
    requireWithinLimit(
      rowNumber,
      this.#limits.rows,
      'row_limit_exceeded',
      'CSV source exceeds the row limit'
    );
    requireWithinLimit(
      this.#cellCount,
      this.#limits.cells,
      'cell_limit_exceeded',
      'CSV source exceeds the cell limit'
    );
    this.#columnCount = Math.max(this.#columnCount, this.#row.length);
    this.rows.push({ rowNumber, cells: this.#row });
    this.#row = [];
    this.#field = '';
    this.#fieldStarted = false;
    this.#rowStarted = false;
    this.#inQuotes = false;
    this.#afterQuote = false;
  }

  #issue(issue: ImportParserIssue) {
    this.issues.push(issue);
    requireWithinLimit(
      this.issues.length,
      this.#limits.issues,
      'issue_limit_exceeded',
      'CSV source exceeds the issue reporting limit'
    );
  }
}

class DelimiterDetector {
  #inQuotes = false;
  #afterQuote = false;

  write(text: string) {
    for (const character of text) {
      if (this.#inQuotes) {
        if (character === '"') {
          this.#inQuotes = false;
          this.#afterQuote = true;
        }
        continue;
      }
      if (this.#afterQuote) {
        if (character === '"') {
          this.#inQuotes = true;
          this.#afterQuote = false;
          continue;
        }
        this.#afterQuote = false;
      } else if (character === '"') {
        this.#inQuotes = true;
        continue;
      }
      if (character === '\n' || character === '\r') return true;
    }
    return false;
  }
}

function detectDelimiter(firstRecord: string): CsvDelimiter {
  const counts = new Map(DELIMITER_PRIORITY.map((delimiter) => [delimiter, 0]));
  let inQuotes = false;
  for (let index = 0; index < firstRecord.length; index += 1) {
    const character = firstRecord[index]!;
    if (character === '"') {
      if (inQuotes && firstRecord[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && counts.has(character as CsvDelimiter)) {
      const delimiter = character as CsvDelimiter;
      counts.set(delimiter, counts.get(delimiter)! + 1);
    }
    if (!inQuotes && (character === '\n' || character === '\r')) break;
  }
  return [...counts.entries()].sort((left, right) =>
    right[1] - left[1] || DELIMITER_PRIORITY.indexOf(left[0]) - DELIMITER_PRIORITY.indexOf(right[0])
  )[0]![0];
}

function detectEncoding(prefix: Buffer): { encoding: CsvEncoding; offset: number } {
  if (prefix[0] === 0xff && prefix[1] === 0xfe) return { encoding: 'utf-16le', offset: 2 };
  if (prefix[0] === 0xfe && prefix[1] === 0xff) {
    throw new ImportParserError('unsupported_encoding', 'UTF-16BE CSV is unsupported');
  }
  if (prefix[0] === 0xef && prefix[1] === 0xbb && prefix[2] === 0xbf) {
    return { encoding: 'utf-8', offset: 3 };
  }
  return { encoding: 'utf-8', offset: 0 };
}

async function* byteChunks(input: ImportByteInput): AsyncGenerator<Buffer> {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    yield Buffer.from(input);
    return;
  }
  for await (const chunk of input) {
    yield typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
  }
}
