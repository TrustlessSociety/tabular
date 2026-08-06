//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { ApplicationError } from '../../../bootstrap/errors.js';
import { serializeAuthorizedCsv, safeCsvFilename } from '../helpers/csv-export.js';

const columns = [
  { columnId: 'col_text', codec: 'text' as const, physicalName: 'label', editable: true, key: false, generated: false },
  { columnId: 'col_amount', codec: 'decimal' as const, physicalName: 'amount', editable: true, key: false, generated: false },
  { columnId: 'col_empty', codec: 'text' as const, physicalName: 'empty', editable: true, key: false, generated: false }
];

test('CSV is deterministic UTF-8 BOM + CRLF and distinguishes null from empty text', () => {
  const input = {
    resource: {
      fileId: 'obj_export',
      schemaVersion: 'v1',
      columns,
      rows: [{
        rowId: 'row_1',
        version: 'v1',
        cells: [
          { columnId: 'col_text', value: { type: 'text' as const, value: '' } },
          { columnId: 'col_amount', value: { type: 'decimal' as const, value: '0.125' } },
          { columnId: 'col_empty', value: { type: 'null' as const, value: null } }
        ]
      }]
    },
    columns: [
      { id: 'col_text', label: 'Label' },
      { id: 'col_amount', label: 'Amount' },
      { id: 'col_empty', label: 'Empty' }
    ],
    presentation: {
      '["row_1","col_amount"]': { numberFormat: 'percent' as const }
    }
  };
  const first = serializeAuthorizedCsv(input);
  const second = serializeAuthorizedCsv(structuredClone(input));

  assert.equal(first.bytes, second.bytes);
  assert.equal(first.bytes, '\uFEFF"Label","Amount","Empty"\r\n"","12.5%",\r\n');
  assert.equal(first.encoding, 'utf-8-bom');
  assert.equal(first.lineEndings, 'crlf');
});

test('CSV neutralizes spreadsheet formulas in text and headers without rewriting typed numbers', () => {
  const result = serializeAuthorizedCsv({
    resource: {
      fileId: 'obj_export',
      schemaVersion: 'v1',
      columns,
      rows: [{
        rowId: 'row_1',
        version: 'v1',
        cells: [
          { columnId: 'col_text', value: { type: 'text', value: '  =HYPERLINK("bad")' } },
          { columnId: 'col_amount', value: { type: 'decimal', value: '-12.50' } },
          { columnId: 'col_empty', value: { type: 'text', value: '\t@danger' } }
        ]
      }]
    },
    columns: [
      { id: 'col_text', label: '+Label' },
      { id: 'col_amount', label: 'Amount' },
      { id: 'col_empty', label: 'Text' }
    ]
  });

  assert.match(result.bytes, /^\uFEFF"'\+Label","Amount","Text"\r\n/);
  assert.match(result.bytes, /"'  =HYPERLINK\(""bad""\)",-12\.50,"'\t@danger"/);
  assert.equal(result.sanitizedCells, 3);
  assert.equal(safeCsvFilename('../../Q3: Orders'), 'q3-orders.csv');
});

test('CSV honors configured column formats and saved per-cell overrides', () => {
  const result = serializeAuthorizedCsv({
    resource: {
      fileId: 'obj_export',
      schemaVersion: 'v1',
      columns: [columns[1]!],
      rows: [
        {
          rowId: 'row_currency',
          version: 'v1',
          cells: [{ columnId: 'col_amount', value: { type: 'decimal', value: '1234.567' } }]
        },
        {
          rowId: 'row_percent',
          version: 'v1',
          cells: [{ columnId: 'col_amount', value: { type: 'decimal', value: '1234.567' } }]
        }
      ]
    },
    columns: [{
      id: 'col_amount',
      label: 'Amount',
      field: 'price',
      format: 'currency',
      formatConfig: { precision: 2 }
    }],
    presentation: {
      '["row_percent","col_amount"]': { numberFormat: 'percent' }
    }
  });

  assert.equal(
    result.bytes,
    '\uFEFF"Amount"\r\n"₱1,234.57"\r\n"123,456.70%"\r\n'
  );
});

test('CSV gives configured formats priority and renders accepted scalar formats', () => {
  const formattedColumns = [
    { columnId: 'col_plain', codec: 'decimal' as const, physicalName: 'plain', editable: true, key: false, generated: false },
    { columnId: 'col_percent', codec: 'decimal' as const, physicalName: 'percent', editable: true, key: false, generated: false },
    { columnId: 'col_paid', codec: 'boolean' as const, physicalName: 'paid', editable: true, key: false, generated: false },
    { columnId: 'col_date', codec: 'date' as const, physicalName: 'date', editable: true, key: false, generated: false },
    { columnId: 'col_time', codec: 'time' as const, physicalName: 'time', editable: true, key: false, generated: false },
    { columnId: 'col_timestamp', codec: 'timestamp' as const, physicalName: 'timestamp', editable: true, key: false, generated: false }
  ];
  const result = serializeAuthorizedCsv({
    resource: {
      fileId: 'obj_export',
      schemaVersion: 'v1',
      columns: formattedColumns,
      rows: [{
        rowId: 'row_formats',
        version: 'v1',
        cells: [
          { columnId: 'col_plain', value: { type: 'decimal', value: '1234.5' } },
          { columnId: 'col_percent', value: { type: 'decimal', value: '0.125' } },
          { columnId: 'col_paid', value: { type: 'boolean', value: true } },
          { columnId: 'col_date', value: { type: 'date', value: '2026-07-24' } },
          { columnId: 'col_time', value: { type: 'time', value: '10:32:45.123' } },
          { columnId: 'col_timestamp', value: { type: 'timestamp', value: '2026-07-24T10:32:00+08' } }
        ]
      }]
    },
    columns: [
      { id: 'col_plain', label: 'Plain', field: 'price', format: 'plain-text' },
      { id: 'col_percent', label: 'Percent', field: 'number', format: 'percent' },
      { id: 'col_paid', label: 'Paid', field: 'checkbox', format: 'yes-no' },
      { id: 'col_date', label: 'Date', field: 'date', format: 'date' },
      { id: 'col_time', label: 'Time', field: 'time', format: 'time' },
      { id: 'col_timestamp', label: 'When', field: 'date-time', format: 'date-time' }
    ]
  });

  assert.equal(
    result.bytes,
    '\uFEFF"Plain","Percent","Paid","Date","Time","When"\r\n'
      + '1234.5,"12.5%","Yes","Jul 24, 2026","10:32 AM","Jul 24, 2:32 AM"\r\n'
  );
});

test('CSV rejects an authorized query window that exceeds the export limit', () => {
  assert.throws(
    () => serializeAuthorizedCsv({
      resource: {
        fileId: 'obj_export',
        schemaVersion: 'v1',
        truncated: true,
        columns,
        rows: []
      },
      columns: [{ id: 'col_text', label: 'Label' }]
    }),
    (error: unknown) => error instanceof ApplicationError
      && error.errorCode === 'csv_export_too_large'
  );
});
