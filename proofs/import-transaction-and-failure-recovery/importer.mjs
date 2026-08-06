import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { one, rows } from '../lib/database.mjs';

export const IMPORTER_VERSION = 'value-only-proof-1';
export const IR_VERSION = 'typed-cells-1';

export function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}

function columnName(index) {
  let current = index + 1;
  let output = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    current = Math.floor((current - 1) / 26);
  }
  return output;
}

function coordinate(row, column) {
  return `${columnName(column)}${row + 1}`;
}

function typedValue(value) {
  if (value instanceof Date) {
    return { kind: 'datetime', value: value.toISOString() };
  }
  if (typeof value === 'string') return { kind: 'string', value };
  if (typeof value === 'number') return { kind: 'number', value };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (value === null) return { kind: 'null', value: null };
  return null;
}

function googleEffectiveValue(value) {
  if ('stringValue' in value) return typedValue(value.stringValue);
  if ('numberValue' in value) return typedValue(value.numberValue);
  if ('boolValue' in value) return typedValue(value.boolValue);
  if ('errorValue' in value) return { error: value.errorValue };
  return null;
}

export function normalizeGoogle(spreadsheet) {
  const cells = [];
  const warnings = [];
  for (const sheet of spreadsheet.sheets ?? []) {
    for (const grid of sheet.data ?? []) {
      const startRow = grid.startRow ?? 0;
      const startColumn = grid.startColumn ?? 0;
      for (let rowOffset = 0; rowOffset < (grid.rowData ?? []).length; rowOffset += 1) {
        const row = grid.rowData[rowOffset];
        for (let columnOffset = 0; columnOffset < (row.values ?? []).length; columnOffset += 1) {
          const source = row.values[columnOffset];
          const rowIndex = startRow + rowOffset;
          const columnIndex = startColumn + columnOffset;
          const cellCoordinate = coordinate(rowIndex, columnIndex);
          const isFormula = Boolean(source.userEnteredValue?.formulaValue);
          if (!source.effectiveValue) {
            if (isFormula) {
              warnings.push({
                code: 'MISSING_CACHED_VALUE',
                blocking: true,
                sheet: sheet.properties.title,
                coordinate: cellCoordinate
              });
            }
            continue;
          }
          const normalized = googleEffectiveValue(source.effectiveValue);
          if (normalized?.error) {
            warnings.push({
              code: 'SOURCE_ERROR_VALUE',
              blocking: true,
              sheet: sheet.properties.title,
              coordinate: cellCoordinate,
              sourceError: normalized.error.type
            });
            continue;
          }
          if (!normalized) continue;
          cells.push({
            sheet: sheet.properties.title,
            row: rowIndex,
            column: columnIndex,
            coordinate: cellCoordinate,
            ...normalized,
            sourceKind: isFormula ? 'formula-cached-value' : 'literal'
          });
        }
      }
    }
  }
  return {
    source: 'google-sheets',
    sourceVersion: spreadsheet.version,
    cells,
    warnings
  };
}

export async function normalizeXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const cells = [];
  const warnings = [];
  for (const sheet of workbook.worksheets) {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const source = cell.value;
        const isFormula =
          source &&
          typeof source === 'object' &&
          typeof source.formula === 'string';
        const value = isFormula ? source.result : source;
        if (isFormula && typeof value === 'undefined') {
          warnings.push({
            code: 'MISSING_CACHED_VALUE',
            blocking: true,
            sheet: sheet.name,
            coordinate: cell.address
          });
          return;
        }
        const normalized = typedValue(value);
        if (!normalized) {
          warnings.push({
            code: 'UNREPRESENTABLE_VALUE',
            blocking: true,
            sheet: sheet.name,
            coordinate: cell.address
          });
          return;
        }
        cells.push({
          sheet: sheet.name,
          row: cell.row - 1,
          column: cell.col - 1,
          coordinate: cell.address,
          ...normalized,
          sourceKind: isFormula ? 'formula-cached-value' : 'literal'
        });
      });
    });
  }
  return { source: 'xlsx', cells, warnings };
}

function parseCsvRows(text, delimiter) {
  const output = [];
  let row = [];
  let token = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        token += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        token += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(token);
      token = '';
    } else if (char === '\n') {
      row.push(token.replace(/\r$/, ''));
      output.push(row);
      row = [];
      token = '';
    } else {
      token += char;
    }
  }
  if (token.length || row.length) {
    row.push(token.replace(/\r$/, ''));
    output.push(row);
  }
  return output;
}

function parseCsvValue(token, kind) {
  if (kind === 'number') {
    const value = Number(token);
    if (!Number.isFinite(value)) return null;
    return { kind, value };
  }
  if (kind === 'boolean') {
    if (token === 'true') return { kind, value: true };
    if (token === 'false') return { kind, value: false };
    return null;
  }
  return { kind: 'string', value: token };
}

export function normalizeCsv(buffer, options) {
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  const text = decoded.startsWith('\uFEFF') ? decoded.slice(1) : decoded;
  const parsed = parseCsvRows(text, options.delimiter);
  const headers = parsed.shift() ?? [];
  const cells = [];
  const warnings = [];
  parsed.forEach((row, rowIndex) => {
    row.forEach((token, columnIndex) => {
      const kind = options.types[headers[columnIndex]] ?? 'string';
      const normalized = parseCsvValue(token, kind);
      const cellCoordinate = coordinate(rowIndex + 1, columnIndex);
      if (!normalized) {
        warnings.push({
          code: 'UNREPRESENTABLE_VALUE',
          blocking: true,
          sheet: 'CSV',
          coordinate: cellCoordinate,
          rawToken: token
        });
        return;
      }
      cells.push({
        sheet: 'CSV',
        row: rowIndex + 1,
        column: columnIndex,
        coordinate: cellCoordinate,
        ...normalized,
        rawToken: token,
        sourceKind: 'literal'
      });
    });
  });
  return { source: 'csv', headers, cells, warnings };
}

export async function setupImportProof(db) {
  await db.exec(`
    CREATE SCHEMA tabular;
    CREATE SCHEMA workspace;
    CREATE TABLE tabular.import_jobs (
      id text PRIMARY KEY,
      source_identity text NOT NULL,
      source_fingerprint text NOT NULL,
      options_fingerprint text NOT NULL,
      importer_version text NOT NULL,
      ir_version text NOT NULL,
      state text NOT NULL,
      warnings jsonb NOT NULL DEFAULT '[]',
      UNIQUE (
        source_identity,
        source_fingerprint,
        options_fingerprint,
        importer_version,
        ir_version
      )
    );
    CREATE TABLE tabular.staged_cells (
      job_id text NOT NULL REFERENCES tabular.import_jobs(id) ON DELETE CASCADE,
      sheet text NOT NULL,
      coordinate text NOT NULL,
      row_index integer NOT NULL,
      column_index integer NOT NULL,
      kind text NOT NULL,
      value_json jsonb NOT NULL,
      raw_token text,
      provenance jsonb NOT NULL,
      PRIMARY KEY (job_id, sheet, coordinate)
    );
    CREATE TABLE workspace.imported_cells (
      job_id text NOT NULL,
      sheet text NOT NULL,
      coordinate text NOT NULL,
      kind text NOT NULL,
      value_json jsonb NOT NULL,
      provenance jsonb NOT NULL,
      PRIMARY KEY (job_id, sheet, coordinate)
    );
  `);
}

export class ImportService {
  constructor(db) {
    this.db = db;
  }

  async start({ sourceIdentity, sourceFingerprint, options }) {
    const optionsFingerprint = fingerprint(JSON.stringify(options));
    const existing = await one(
      this.db,
      `SELECT * FROM tabular.import_jobs
       WHERE source_identity = $1
         AND source_fingerprint = $2
         AND options_fingerprint = $3
         AND importer_version = $4
         AND ir_version = $5`,
      [
        sourceIdentity,
        sourceFingerprint,
        optionsFingerprint,
        IMPORTER_VERSION,
        IR_VERSION
      ]
    );
    if (existing) return existing;
    return one(
      this.db,
      `INSERT INTO tabular.import_jobs
        (id, source_identity, source_fingerprint, options_fingerprint,
         importer_version, ir_version, state)
       VALUES ($1, $2, $3, $4, $5, $6, 'created')
       RETURNING *`,
      [
        randomUUID(),
        sourceIdentity,
        sourceFingerprint,
        optionsFingerprint,
        IMPORTER_VERSION,
        IR_VERSION
      ]
    );
  }

  async stage(jobId, normalized, { failAfter = null } = {}) {
    return this.db.transaction(async (tx) => {
      let inserted = 0;
      for (const cell of normalized.cells) {
        await tx.query(
          `INSERT INTO tabular.staged_cells
            (job_id, sheet, coordinate, row_index, column_index, kind,
             value_json, raw_token, provenance)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
           ON CONFLICT (job_id, sheet, coordinate) DO UPDATE SET
             kind = EXCLUDED.kind,
             value_json = EXCLUDED.value_json,
             raw_token = EXCLUDED.raw_token,
             provenance = EXCLUDED.provenance`,
          [
            jobId,
            cell.sheet,
            cell.coordinate,
            cell.row,
            cell.column,
            cell.kind,
            JSON.stringify(cell.value),
            cell.rawToken ?? null,
            JSON.stringify({
              source: normalized.source,
              sourceKind: cell.sourceKind,
              coordinate: cell.coordinate
            })
          ]
        );
        inserted += 1;
        if (failAfter === inserted) {
          throw new Error('forced staging failure');
        }
      }
      await tx.query(
        `UPDATE tabular.import_jobs
         SET state = 'staged', warnings = $2::jsonb
         WHERE id = $1`,
        [jobId, JSON.stringify(normalized.warnings)]
      );
      return { status: 'staged', inserted };
    });
  }

  async commit(jobId, currentSourceFingerprint, { failAfter = null } = {}) {
    return this.db.transaction(async (tx) => {
      const job = await one(
        tx,
        'SELECT * FROM tabular.import_jobs WHERE id = $1 FOR UPDATE',
        [jobId]
      );
      if (job.state === 'committed') {
        return { status: 'already-committed', jobId };
      }
      if (job.source_fingerprint !== currentSourceFingerprint) {
        return { status: 'source-changed', jobId };
      }
      if (job.warnings.some((warning) => warning.blocking)) {
        return { status: 'blocked', warnings: job.warnings };
      }
      const staged = await rows(
        tx,
        `SELECT * FROM tabular.staged_cells
         WHERE job_id = $1 ORDER BY sheet, row_index, column_index`,
        [jobId]
      );
      let inserted = 0;
      for (const cell of staged) {
        await tx.query(
          `INSERT INTO workspace.imported_cells
            (job_id, sheet, coordinate, kind, value_json, provenance)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
           ON CONFLICT DO NOTHING`,
          [
            jobId,
            cell.sheet,
            cell.coordinate,
            cell.kind,
            JSON.stringify(cell.value_json),
            JSON.stringify(cell.provenance)
          ]
        );
        inserted += 1;
        if (failAfter === inserted) {
          throw new Error('forced commit failure');
        }
      }
      await tx.query(
        `UPDATE tabular.import_jobs SET state = 'committed' WHERE id = $1`,
        [jobId]
      );
      return { status: 'committed', jobId, inserted };
    });
  }

  async abandon(jobId) {
    return this.db.transaction(async (tx) => {
      const job = await one(
        tx,
        'SELECT state FROM tabular.import_jobs WHERE id = $1 FOR UPDATE',
        [jobId]
      );
      if (job.state === 'committed') {
        return { status: 'cannot-abandon-committed' };
      }
      await tx.query('DELETE FROM tabular.staged_cells WHERE job_id = $1', [
        jobId
      ]);
      await tx.query(
        `UPDATE tabular.import_jobs SET state = 'abandoned' WHERE id = $1`,
        [jobId]
      );
      return { status: 'abandoned' };
    });
  }
}
