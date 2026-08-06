import { TabulatorFull as Tabulator } from './vendor/tabulator.mjs';
import { LogicalSelectionModel } from './logical-selection.mjs';

const gridNode = document.querySelector('#logical-grid');
const summaryNode = document.querySelector('#selection-summary');
const statusNode = document.querySelector('#selection-status');
const recordNode = document.querySelector('#record-summary');
const boldButton = document.querySelector('#bold-selection');

const state = await fetch('./api/state?file=customer-orders').then((response) => response.json());
const columnIds = state.columns.map((column) => column.column_id);
const rowIds = Array.from({ length: state.presentation.logicalRows }, (_, index) =>
  index < state.records.length ? `record:${state.records[index].id}` : `logical:${index + 1}`
);
const selection = new LogicalSelectionModel(rowIds, columnIds);
const boldCells = new Set([
  `${rowIds[0]}:${columnIds[0]}`,
  `${rowIds[1]}:${columnIds[1]}`
]);

function recordAt(index) {
  return state.records[index] ?? null;
}

function valueFor(record, column) {
  if (!record || !column.pg_name) return '';
  return record.display?.[column.column_id] ?? record[column.pg_name] ?? '';
}

function buildData() {
  return rowIds.map((rowId, index) => {
    const record = recordAt(index);
    const row = { __rowId: rowId, __position: index + 1 };
    for (const column of state.columns) row[column.column_id] = valueFor(record, column);
    return row;
  });
}

function cellName(rowId, columnId) {
  return `${columnIds.indexOf(columnId) + 1}:${rowIds.indexOf(rowId) + 1}`;
}

function updateSelectionUi(message = '') {
  const current = selection.snapshot();
  const start = current.anchor ? cellName(current.anchor.rowId, current.anchor.columnId) : '';
  const end = current.focus ? cellName(current.focus.rowId, current.focus.columnId) : '';
  summaryNode.textContent = current.cellCount
    ? `${current.kind} ${start}${start === end ? '' : ` to ${end}`} · ${current.cellCount.toLocaleString()} cells`
    : 'No selection';
  const bold = selection.presentationState((rowId, columnId) => boldCells.has(`${rowId}:${columnId}`));
  boldButton.setAttribute('aria-pressed', String(bold.pressed));
  boldButton.disabled = bold.disabled;
  statusNode.textContent = message;
}

function syncFromRange(range) {
  const rows = range.getRows();
  const columns = range.getColumns();
  if (!rows.length || !columns.length) return;
  const kind = rows.length === rowIds.length && columns.length === 1
    ? 'column'
    : rows.length === 1 && columns.length === columnIds.length
      ? 'row'
      : rows.length === 1 && columns.length === 1 ? 'cell' : 'range';
  selection.selectRange(
    rows[0].getIndex(),
    columns[0].getField(),
    rows.at(-1).getIndex(),
    columns.at(-1).getField(),
    kind
  );
  updateSelectionUi();
}

function decorateRow(row) {
  const element = row.getElement();
  const rowId = row.getIndex();
  const position = rowIds.indexOf(rowId);
  element.dataset.rowId = rowId;
  element.setAttribute('aria-rowindex', String(position + 2));
  row.getCells().forEach((cell) => {
    const field = cell.getColumn().getField();
    const columnIndex = field === '__position' ? 1 : columnIds.indexOf(field) + 2;
    cell.getElement().setAttribute('aria-colindex', String(columnIndex));
  });
}

function applyGridAria() {
  gridNode.setAttribute('aria-label', 'Tabular spreadsheet');
  gridNode.setAttribute('aria-rowcount', String(rowIds.length + 1));
  gridNode.setAttribute('aria-colcount', String(columnIds.length + 1));
  gridNode.querySelector('.tabulator-headers')?.setAttribute('aria-rowindex', '1');
  gridNode.querySelectorAll('.tabulator-col[role="columnheader"]').forEach((header, index) => {
    header.setAttribute('aria-colindex', String(index + 1));
  });
}

const table = new Tabulator(gridNode, {
  index: '__rowId',
  height: 'min(560px, calc(100vh - 246px))',
  data: buildData(),
  layout: 'fitDataTable',
  renderVertical: 'virtual',
  selectableRange: 1,
  selectableRangeRows: true,
  selectableRangeColumns: true,
  selectableRangeInitializeDefault: false,
  selectableRangeClearCells: false,
  editTriggerEvent: 'dblclick',
  rowFormatter: decorateRow,
  rowHeader: {
    title: '#',
    field: '__position',
    formatter: 'rownum',
    frozen: true,
    headerSort: false,
    resizable: false,
    width: 52
  },
  columns: state.columns.map((column, index) => ({
    title: column.label || '',
    field: column.column_id,
    width: index === 1 ? 180 : 132,
    minWidth: 96,
    headerSort: false,
    editor: false,
    cssClass: column.label ? '' : 'future-column'
  }))
});

async function restoreSelection() {
  const current = selection.snapshot();
  if (!current.anchor) return;
  table.getRanges().forEach((range) => range.remove());
  table.addRange(
    table.getRow(current.anchor.rowId).getCell(current.anchor.columnId),
    table.getRow(current.focus.rowId).getCell(current.focus.columnId)
  );
  updateSelectionUi('Selection restored from stable row and column identities.');
}

table.on('tableBuilt', () => {
  applyGridAria();
  recordNode.textContent = `${state.records.length} loaded records · ${rowIds.length.toLocaleString()} logical rows · ${columnIds.length} columns`;
  selection.selectCell(rowIds[0], columnIds[0]);
  restoreSelection();
});
table.on('renderComplete', applyGridAria);
table.on('rangeAdded', syncFromRange);
table.on('rangeChanged', syncFromRange);
table.on('columnMoved', () => {
  selection.setOrder(rowIds, table.getColumns().map((column) => column.getField()).filter((field) => columnIds.includes(field)));
  queueMicrotask(restoreSelection);
});

document.querySelector('#copy-selection').addEventListener('click', async () => {
  const targets = selection.targetIds();
  const text = targets.rowIds.map((rowId) => targets.columnIds
    .map((columnId) => table.getRow(rowId).getData()[columnId] ?? '')
    .join('\t')).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    updateSelectionUi(`Copied ${targets.cellCount.toLocaleString()} aligned cells.`);
  } catch {
    updateSelectionUi('Clipboard permission was unavailable; selection alignment was retained.');
  }
});

document.querySelector('#clear-selection').addEventListener('click', async () => {
  const targets = selection.targetIds();
  const plan = await fetch('./api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'prepare-range-action',
      fileId: 'customer-orders',
      operation: 'clear',
      rowIds: targets.rowIds,
      columnIds: targets.columnIds
    })
  }).then((response) => response.json());
  if (plan.status !== 'planned') {
    updateSelectionUi(`Clear could not be prepared: ${plan.message ?? 'unknown error'}.`);
    return;
  }
  const updates = targets.rowIds.map((rowId) => ({
    __rowId: rowId,
    ...Object.fromEntries(targets.columnIds.map((columnId) => [columnId, '']))
  }));
  await table.updateData(updates);
  updateSelectionUi(`PGlite prepared action ${plan.id} for ${plan.cell_count.toLocaleString()} aligned cells.`);
});

boldButton.addEventListener('click', () => {
  const targets = selection.targetIds();
  const next = boldButton.getAttribute('aria-pressed') !== 'true';
  for (const rowId of targets.rowIds) {
    for (const columnId of targets.columnIds) {
      const key = `${rowId}:${columnId}`;
      if (next) boldCells.add(key); else boldCells.delete(key);
    }
  }
  updateSelectionUi(`Bold ${next ? 'applied to' : 'removed from'} ${targets.cellCount.toLocaleString()} cells.`);
});

window.r003Proof = {
  async selectRange(anchorRowId, anchorColumnId, focusRowId, focusColumnId) {
    selection.selectRange(anchorRowId, anchorColumnId, focusRowId, focusColumnId);
    await restoreSelection();
    return this.snapshot();
  },
  async scrollToRow(rowId) {
    await table.scrollToRow(rowId, 'center', false);
    return this.snapshot();
  },
  async refreshData() {
    const before = this.snapshot();
    await table.setData(buildData());
    await restoreSelection();
    return { before, after: this.snapshot() };
  },
  snapshot() {
    const mounted = [...gridNode.querySelectorAll('.tabulator-row')]
      .map((row) => row.getAttribute('data-row-id'))
      .filter(Boolean);
    const current = selection.snapshot();
    const { rowIds: selectedRowIds, columnIds: selectedColumnIds, ...selectionState } = current;
    return {
      ...selectionState,
      selectedRowCount: selectedRowIds.length,
      selectedColumnCount: selectedColumnIds.length,
      mountedRowCount: mounted.length,
      anchorMounted: current.anchor ? mounted.includes(current.anchor.rowId) : false,
      focusMounted: current.focus ? mounted.includes(current.focus.rowId) : false,
      ariaRowCount: gridNode.getAttribute('aria-rowcount'),
      ariaColumnCount: gridNode.getAttribute('aria-colcount'),
      boldState: boldButton.getAttribute('aria-pressed')
    };
  }
};
