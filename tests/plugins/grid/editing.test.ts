//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { GridColumn, GridRow } from '../../../src/plugins/grid/helpers/contracts.js';
import {
  applyGridDraft,
  capabilityActionForDraft,
  clearInsertDraftSelection,
  draftIssues,
  gridDraftFromPersistent,
  hiddenRowRank,
  insertDraftIsEmpty,
  logicalRowForRank,
  persistentDraftPatch,
  pointsForSelection,
  stageCellEdit,
  stageDeleteRow,
  stageInsertRow,
  stageRelationChoice,
  stageScalarRange,
  updateInsertDraft,
  updateInsertRelationDraft
} from '../../../src/plugins/grid/helpers/editing.js';

const fileId = `obj_${'f'.repeat(43)}`;
const row1 = `row_${Buffer.from('[{"type":"text","value":"A"}]').toString('base64url')}`;
const row2 = `row_${Buffer.from('[{"type":"text","value":"B"}]').toString('base64url')}`;
const key = `col_${'k'.repeat(43)}`;
const amount = `col_${'a'.repeat(43)}`;
const status = `col_${'s'.repeat(43)}`;

const columns: GridColumn[] = [
  { id: key, coordinate: 'A', label: 'Key', key: true, editable: false, storageCodec: 'text' },
  { id: amount, coordinate: 'B', label: 'Amount', kind: 'number', storageCodec: 'decimal' },
  {
    id: status,
    coordinate: 'C',
    label: 'Status',
    kind: 'select',
    storageCodec: 'text',
    options: [{ value: 'Ready', label: 'Ready' }, { value: 'Held', label: 'Held' }]
  }
];

const rows: GridRow[] = [
  { id: row1, [key]: 'A', [amount]: '9007199254740993.123456789', [status]: 'Ready' },
  { id: row2, [key]: 'B', [amount]: '2.50', [status]: 'Held' }
];

const versions = {
  [row1]: `ver_${'1'.repeat(24)}`,
  [row2]: `ver_${'2'.repeat(24)}`
};

test('cell drafts retain exact numeric text and compile one typed expected-version action', () => {
  const draft = stageCellEdit(rows, columns, {
    rowId: row1,
    columnId: amount
  }, '999999999999999999999.000000001', 'draft_one');
  assert.deepEqual(draftIssues(draft), []);
  const overlay = applyGridDraft(rows, draft);
  assert.equal(overlay[0]![amount], '999999999999999999999.000000001');
  assert.deepEqual(capabilityActionForDraft(draft, {
    commandId: 'cmd_cell_exact_01', fileId, versions, columns
  }), {
    type: 'record.patch',
    commandId: 'cmd_cell_exact_01',
    fileId,
    rowId: row1,
    expectedVersion: versions[row1],
    patch: [{
      columnId: amount,
      value: { type: 'decimal', value: '999999999999999999999.000000001' }
    }]
  });
});

test('one contiguous range materializes one atomic scalar paste while excluding stable keys', () => {
  const selection = {
    kind: 'range' as const,
    anchor: { rowId: row1, columnId: key },
    focus: { rowId: row2, columnId: amount }
  };
  assert.deepEqual(pointsForSelection(selection, rows, columns), [
    { rowId: row1, columnId: amount },
    { rowId: row2, columnId: amount }
  ]);
  const draft = stageScalarRange(rows, columns, selection, '7', 'paste', 'draft_range');
  const action = capabilityActionForDraft(draft, {
    commandId: 'cmd_range_exact_01', fileId, versions, columns
  });
  assert.equal(action.type, 'range.patch');
  if (action.type !== 'range.patch') return;
  assert.equal(action.cellCount, 2);
  assert.equal(action.rows.length, 2);
  assert.deepEqual(action.rows.map((row) => row.expectedVersion), [versions[row1], versions[row2]]);
});

test('invalid editor values preserve raw input and compile a persistent mismatched draft', () => {
  const numeric = stageCellEdit(rows, columns, {
    rowId: row1,
    columnId: amount
  }, '12.not-a-number', 'draft_invalid_number');
  assert.equal(draftIssues(numeric)[0]?.code, 'invalid_value');
  assert.equal(applyGridDraft(rows, numeric)[0]![amount], '12.not-a-number');
  assert.deepEqual(persistentDraftPatch(numeric, columns), {
    rowId: row1,
    patch: [{ columnId: amount, value: { type: 'text', value: '12.not-a-number' } }]
  });

  const restricted = stageCellEdit(rows, columns, {
    rowId: row1,
    columnId: status
  }, 'Missing', 'draft_invalid_select');
  assert.equal(draftIssues(restricted)[0]?.message, 'Choose an available option.');
});

test('row insertion and closed deletion compile through journal-backed record actions', () => {
  const inserted = stageInsertRow(rows, columns, 1, 'insert_01');
  assert.equal(inserted.kind, 'insert');
  if (inserted.kind !== 'insert') return;
  const insertedRows = applyGridDraft(rows, inserted);
  assert.equal(insertedRows[1]?.id, inserted.row.id);
  const insertAction = capabilityActionForDraft(inserted, {
    commandId: 'cmd_insert_exact_01', fileId, versions, columns
  });
  assert.equal(insertAction.type, 'record.insert');
  if (insertAction.type === 'record.insert') {
    assert.ok(insertAction.patch.some((entry) => entry.columnId === key));
  }

  const deleted = stageDeleteRow(rows, columns, row1, 'delete_01');
  assert.equal(applyGridDraft(rows, deleted).some((row) => row.id === row1), false);
  assert.deepEqual(capabilityActionForDraft(deleted, {
    commandId: 'cmd_delete_exact_01', fileId, versions, columns
  }), {
    type: 'record.delete',
    commandId: 'cmd_delete_exact_01',
    fileId,
    rowId: row1,
    expectedVersion: versions[row1]
  });
});

test('new rows omit server defaults and generated values while retaining correctable required cells', () => {
  const required = `col_${'r'.repeat(43)}`;
  const owner = `col_${'o'.repeat(43)}`;
  const generated = `col_${'g'.repeat(43)}`;
  const insertColumns: GridColumn[] = [
    ...columns,
    { id: required, coordinate: 'D', label: 'Required', required: true, storageCodec: 'text' },
    {
      id: owner, coordinate: 'E', label: 'Owner', required: true,
      serverDefault: true, storageCodec: 'text'
    },
    {
      id: generated, coordinate: 'F', label: 'Generated', generated: true,
      editable: false, storageCodec: 'decimal'
    }
  ];
  const staged = stageInsertRow(rows, insertColumns, 1, 'insert_defaults');
  assert.equal(staged.kind, 'insert');
  if (staged.kind !== 'insert') return;
  assert.equal(draftIssues(staged).some((issue) => issue.columnId === required), true);
  assert.equal(draftIssues(staged).some((issue) => issue.columnId === owner), false);
  assert.equal(staged.changes.some((change) => change.point.columnId === generated), false);
  const corrected = updateInsertDraft(staged, insertColumns, {
    rowId: staged.row.id, columnId: required
  }, 'supplied');
  assert.equal(draftIssues(corrected).some((issue) => issue.columnId === required), false);
  const action = capabilityActionForDraft(corrected, {
    commandId: 'cmd_insert_defaults_01', fileId, versions, columns: insertColumns
  });
  assert.equal(action.type, 'record.insert');
  if (action.type !== 'record.insert') return;
  assert.equal(action.patch.some((entry) => entry.columnId === owner), false);
  assert.equal(action.patch.some((entry) => entry.columnId === generated), false);
  assert.equal(action.patch.some((entry) => entry.columnId === required), true);
});

test('literal defaults stay out of untouched cells and apply on field exit', () => {
  const active = `col_${'v'.repeat(43)}`;
  const note = `col_${'n'.repeat(43)}`;
  const defaultColumns: GridColumn[] = [
    columns[0]!,
    {
      id: active,
      coordinate: 'B',
      label: 'Active',
      kind: 'switch',
      storageCodec: 'boolean',
      defaultValue: false,
      serverDefault: true
    },
    { id: note, coordinate: 'C', label: 'Note', storageCodec: 'text' }
  ];
  const staged = stageInsertRow(rows, defaultColumns, rows.length, 'insert_literal_default');
  assert.equal(staged.kind, 'insert');
  if (staged.kind !== 'insert') return;

  assert.equal(staged.row[active], null);
  assert.equal(insertDraftIsEmpty(staged, defaultColumns), true);
  const initialAction = capabilityActionForDraft(staged, {
    commandId: 'cmd_insert_literal_default_01',
    fileId,
    versions,
    columns: defaultColumns
  });
  assert.equal(initialAction.type, 'record.insert');
  if (initialAction.type !== 'record.insert') return;
  assert.deepEqual(
    initialAction.patch.find((entry) => entry.columnId === active)?.value,
    { type: 'null' },
    'an untouched known default is explicitly null instead of invoking PostgreSQL'
  );

  const otherField = updateInsertDraft(staged, defaultColumns, {
    rowId: staged.row.id,
    columnId: note
  }, 'entered elsewhere');
  assert.equal(otherField.row[active], null);

  const exitedDefaultField = updateInsertDraft(staged, defaultColumns, {
    rowId: staged.row.id,
    columnId: active
  }, '');
  assert.equal(exitedDefaultField.row[active], false);
  assert.equal(insertDraftIsEmpty(exitedDefaultField, defaultColumns), false);

  const existing = stageCellEdit([{ id: row1, [active]: null }], defaultColumns, {
    rowId: row1,
    columnId: active
  }, '', 'edit_literal_default');
  assert.equal(existing.changes[0]?.after, false);

  const cleared = clearInsertDraftSelection(
    exitedDefaultField,
    defaultColumns,
    [{ rowId: staged.row.id, columnId: active }]
  );
  assert.equal(cleared.row[active], null, 'Delete clears without reapplying the default');
});

test('sparse insert drafts retain the hidden logical row rank across persistence recovery', () => {
  const rank = hiddenRowRank(20);
  const staged = stageInsertRow(rows, columns, rows.length, 'insert_sparse', rank);
  assert.equal(staged.kind, 'insert');
  if (staged.kind !== 'insert') return;
  assert.equal(staged.rowRank, '000000000000000020000000');
  assert.equal(logicalRowForRank(rank), 20);
  assert.equal(persistentDraftPatch(staged, columns)?.rowRank, rank);
  const recovered = gridDraftFromPersistent({
    id: `draft_${'d'.repeat(43)}`,
    fileId,
    rowRank: rank,
    schemaVersion: 'a'.repeat(64),
    patch: persistentDraftPatch(staged, columns)!.patch,
    validation: [],
    version: 1,
    state: 'active',
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  }, rows, columns);
  assert.equal(recovered?.kind, 'insert');
  if (recovered?.kind === 'insert') assert.equal(recovered.rowRank, rank);
});

test('literal defaults are validated only on field exit and stay correctable', () => {
  const id = `col_${'d'.repeat(43)}`;
  const validated: GridColumn = {
    id,
    coordinate: 'A',
    label: 'Code',
    storageCodec: 'text',
    storageType: 'text',
    field: 'text',
    format: 'plain-text',
    fieldConfig: {},
    validatorConfig: {
      version: 1,
      rules: [{ id: 'vr_prefix_rule_01', kind: 'starts_with', args: { text: 'OK-' } }]
    },
    defaultValue: 'INVALID',
    serverDefault: true
  };
  const staged = stageInsertRow([], [validated], 0, 'default_validation');
  assert.equal(staged.kind, 'insert');
  if (staged.kind !== 'insert') return;
  assert.equal(staged.row[id], null);
  assert.deepEqual(draftIssues(staged), []);

  const exited = updateInsertDraft(staged, [validated], {
    rowId: staged.row.id,
    columnId: id
  }, '');
  assert.equal(exited.row[id], 'INVALID');
  assert.match(draftIssues(exited)[0]?.message || '', /start with/);
  assert.equal(persistentDraftPatch(exited, [validated])?.patch[0]?.value.type, 'text');
});

test('mixed-invalid paste keeps per-cell correction state under each column validator', () => {
  const left = `col_${'l'.repeat(43)}`;
  const right = `col_${'r'.repeat(43)}`;
  const validator = (id: string, kind: 'starts_with' | 'ends_with', text: string): GridColumn => ({
    id,
    coordinate: id === left ? 'A' : 'B',
    label: id === left ? 'Left' : 'Right',
    storageCodec: 'text',
    storageType: 'text',
    field: 'text',
    format: 'plain-text',
    fieldConfig: {},
    validatorConfig: {
      version: 1,
      rules: [{ id: `vr_${id === left ? 'left_rule_01' : 'right_rule_1'}`, kind, args: { text } }]
    }
  });
  const pasteColumns = [validator(left, 'starts_with', 'A'), validator(right, 'ends_with', 'Z')];
  const pasteRows = [{ id: row1, [left]: null, [right]: null }];
  const draft = stageScalarRange(pasteRows, pasteColumns, {
    kind: 'range',
    anchor: { rowId: row1, columnId: left },
    focus: { rowId: row1, columnId: right }
  }, 'Apple', 'paste', 'mixed_validator_paste');
  assert.equal(draft.changes.length, 2);
  assert.equal(draft.changes[0]?.issue, undefined);
  assert.match(draft.changes[1]?.issue?.message || '', /end with/);
  assert.equal(draft.changes[1]?.raw, 'Apple');
});

test('recovered partial rows derive required errors without marking every cell', () => {
  const required = `col_${'r'.repeat(43)}`;
  const note = `col_${'n'.repeat(43)}`;
  const insertColumns: GridColumn[] = [
    ...columns,
    { id: required, coordinate: 'D', label: 'Required', required: true, storageCodec: 'text' },
    { id: note, coordinate: 'E', label: 'Note', storageCodec: 'text' }
  ];
  const staged = stageInsertRow(rows, insertColumns, rows.length, 'insert_partial');
  assert.equal(staged.kind, 'insert');
  if (staged.kind !== 'insert') return;
  const explicitlyBlank = updateInsertDraft(staged, insertColumns, {
    rowId: staged.row.id,
    columnId: required
  }, '');
  const entered = updateInsertDraft(explicitlyBlank, insertColumns, {
    rowId: staged.row.id,
    columnId: note
  }, 'keep this note');
  const patch = persistentDraftPatch(entered, insertColumns)!.patch;
  assert.equal(patch.some((entry) => entry.columnId === required), false);

  const recovered = gridDraftFromPersistent({
    id: `draft_${'p'.repeat(43)}`,
    fileId,
    rowRank: hiddenRowRank(20),
    schemaVersion: 'a'.repeat(64),
    patch,
    validation: [{ code: 'database_rejected', message: 'PostgreSQL rejected the row' }],
    version: 1,
    state: 'active',
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  }, rows, insertColumns);
  assert.equal(recovered?.kind, 'insert');
  if (recovered?.kind !== 'insert') return;
  assert.equal(recovered.row[note], 'keep this note');
  assert.deepEqual(
    draftIssues(recovered).map((issue) => issue.columnId).sort(),
    [required]
  );
});

test('clearing the last entered new-row value makes the failed row discardable', () => {
  const detail = `col_${'d'.repeat(43)}`;
  const insertColumns: GridColumn[] = [
    ...columns,
    { id: detail, coordinate: 'D', label: 'Detail', storageCodec: 'text' }
  ];
  const staged = stageInsertRow(rows, insertColumns, rows.length, 'insert_clear');
  assert.equal(staged.kind, 'insert');
  if (staged.kind !== 'insert') return;

  const entered = updateInsertDraft(staged, insertColumns, {
    rowId: staged.row.id,
    columnId: detail
  }, 'temporary value');
  assert.equal(insertDraftIsEmpty(entered, insertColumns), false);

  const cleared = updateInsertDraft(entered, insertColumns, {
    rowId: staged.row.id,
    columnId: detail
  }, '');
  assert.equal(insertDraftIsEmpty(cleared, insertColumns), true);

  const recovered = {
    ...cleared,
    changes: cleared.changes.map(({ userEdited: _userEdited, ...change }) => change)
  };
  assert.equal(insertDraftIsEmpty(recovered, insertColumns), true);

  const recoveredWithAnotherValue = {
    ...recovered,
    row: { ...recovered.row, [status]: 'Ready' },
    changes: recovered.changes.map((change) => (
      change.point.columnId === status
        ? { ...change, after: 'Ready' as const, raw: 'Ready' }
        : change
    ))
  };
  assert.equal(
    insertDraftIsEmpty(recoveredWithAnotherValue, insertColumns),
    false,
    'clearing one recovered cell must not discard another retained value'
  );

  const placeholder = `draft_${'p'.repeat(43)}`;
  const clearedRowSelection = clearInsertDraftSelection(
    entered,
    [
      ...insertColumns,
      { id: placeholder, coordinate: 'E', label: '', storageCodec: 'text' }
    ],
    [
      ...entered.changes.map((change) => change.point),
      { rowId: entered.row.id, columnId: placeholder }
    ]
  );
  assert.equal(
    insertDraftIsEmpty(clearedRowSelection, insertColumns),
    true,
    'whole-row clearing ignores future-column placeholders outside the draft'
  );
});

test('the ten accepted fields retain raw values and compile their storage codecs', () => {
  const matrix = [
    ['text', 'text', '002', { type: 'text', value: '002' }],
    ['number', 'decimal', '9007199254740993.0001', { type: 'decimal', value: '9007199254740993.0001' }],
    ['email', 'text', 'ap@northstar.co', { type: 'text', value: 'ap@northstar.co' }],
    ['url', 'text', 'northstar.co/path', { type: 'text', value: 'northstar.co/path' }],
    ['phone', 'text', '+63 (917) 555-0199 ext 4', { type: 'text', value: '+63 (917) 555-0199 ext 4' }],
    ['relation', 'text', 'relation_choice', { type: 'text', value: 'relation_choice' }],
    ['select', 'text', 'Ready', { type: 'text', value: 'Ready' }],
    ['price', 'decimal', '12345678901234567890.01', { type: 'decimal', value: '12345678901234567890.01' }],
    ['switch', 'boolean', true, { type: 'boolean', value: true }],
    ['datetime', 'timestamp', '2026-08-01T10:32:00+08:00', { type: 'timestamp', value: '2026-08-01T10:32:00+08:00' }]
  ] as const;
  for (const [kind, storageCodec, attempted, expected] of matrix) {
    const id = `col_${kind.padEnd(43, kind[0]).slice(0, 43)}`;
    const field: GridColumn = {
      id,
      coordinate: 'A',
      label: kind,
      kind,
      storageCodec,
      ...(kind === 'select' || kind === 'relation'
        ? { options: [{ value: String(attempted), label: String(attempted) }] }
        : {})
    };
    const draft = stageCellEdit([{ id: row1, [id]: null }], [field], {
      rowId: row1,
      columnId: id
    }, attempted, `draft_${kind}`);
    assert.deepEqual(draftIssues(draft), [], `${kind} should accept its representative value`);
    assert.deepEqual(persistentDraftPatch(draft, [field])?.patch[0]?.value, expected);
  }

  const looseUrl = stageCellEdit([{ id: row1, loose: null }], [{
    id: 'loose', coordinate: 'A', label: 'URL', kind: 'url', storageCodec: 'text'
  }], { rowId: row1, columnId: 'loose' }, 'internal host notes', 'draft_loose_url');
  assert.deepEqual(draftIssues(looseUrl), [], 'URL stays a permissive string field');
  const badPrice = stageCellEdit([{ id: row1, price: null }], [{
    id: 'price', coordinate: 'A', label: 'Price', kind: 'price', storageCodec: 'decimal'
  }], { rowId: row1, columnId: 'price' }, 'twelve pesos', 'draft_bad_price');
  assert.equal(draftIssues(badPrice)[0]?.message, 'Enter a valid exact number.');
});

test('a composite relation choice patches explicitly mapped non-adjacent source columns atomically', () => {
  const tenant = `col_${'t'.repeat(43)}`;
  const spacer = `col_${'x'.repeat(43)}`;
  const customer = `col_${'c'.repeat(43)}`;
  const relationColumns: GridColumn[] = [
    { id: tenant, coordinate: 'A', label: 'Customer tenant', kind: 'relation', storageCodec: 'text' },
    { id: spacer, coordinate: 'B', label: 'Notes', kind: 'text', storageCodec: 'text' },
    { id: customer, coordinate: 'C', label: 'Customer code', editable: false, storageCodec: 'text' }
  ];
  const relationRows: GridRow[] = [{
    id: row1,
    [tenant]: 'acme',
    [spacer]: 'unchanged',
    [customer]: 'cust-001'
  }];
  const draft = stageRelationChoice(relationRows, relationColumns, row1, {
    [tenant]: 'northstar',
    [customer]: 'cust-044'
  }, 'draft_relation_tuple');
  assert.deepEqual(draftIssues(draft), []);
  assert.deepEqual(applyGridDraft(relationRows, draft)[0], {
    id: row1,
    [tenant]: 'northstar',
    [spacer]: 'unchanged',
    [customer]: 'cust-044'
  });
  const action = capabilityActionForDraft(draft, {
    commandId: 'cmd_relation_tuple_01',
    fileId,
    versions,
    columns: relationColumns
  });
  assert.equal(action.type, 'range.patch');
  if (action.type !== 'range.patch') return;
  assert.equal(action.cellCount, 2);
  assert.equal(action.rows.length, 1);
  assert.deepEqual(action.rows[0]?.patch, [
    { columnId: tenant, value: { type: 'text', value: 'northstar' } },
    { columnId: customer, value: { type: 'text', value: 'cust-044' } }
  ]);

  const inserted = stageInsertRow(relationRows, relationColumns, relationRows.length, 'relation_insert');
  assert.equal(inserted.kind, 'insert');
  if (inserted.kind !== 'insert') return;
  const insertedRelation = updateInsertRelationDraft(inserted, relationColumns, {
    [tenant]: 'northstar',
    [customer]: 'cust-044'
  });
  assert.deepEqual(
    draftIssues(insertedRelation).filter((issue) => (
      issue.columnId === tenant || issue.columnId === customer
    )),
    []
  );
  assert.equal(insertedRelation.row[tenant], 'northstar');
  assert.equal(insertedRelation.row[customer], 'cust-044');
});

test('a persisted invalid draft rehydrates its raw correction value and server issue', () => {
  const hydrated = gridDraftFromPersistent({
    id: 'draft_persisted_01',
    fileId,
    rowId: row1,
    schemaVersion: 'schema_one',
    patch: [{ columnId: amount, value: { type: 'text', value: 'not-a-number' } }],
    validation: [{
      columnId: amount,
      code: 'type_mismatch',
      message: 'The typed value does not match the column'
    }],
    version: 1,
    state: 'active',
    expiresAt: '2026-08-01T12:00:00.000Z'
  }, rows, columns);
  assert.ok(hydrated);
  assert.equal(applyGridDraft(rows, hydrated)[0]?.[amount], 'not-a-number');
  assert.equal(draftIssues(hydrated)[0]?.code, 'type_mismatch');
  assert.deepEqual(persistentDraftPatch(hydrated, columns)?.patch[0]?.value, {
    type: 'text', value: 'not-a-number'
  });
});
