const ROW_COUNT = 100_000;
const COLUMN_COUNT = 200;
const MOUNTED_ROWS = 12;
const MOUNTED_COLUMNS = 8;

const grid = document.querySelector('#grid');
const state = document.querySelector('#state');
const activeLabel = document.querySelector('#active-label');
const mountedCount = document.querySelector('#mounted-count');
const clipboardState = document.querySelector('#clipboard-state');

const selection = {
  row: 0,
  column: 0,
  baseRow: 0,
  baseColumn: 0,
  editing: false
};

function cellId(row, column) {
  return `cell-${row}-${column}`;
}

function ensureMounted() {
  if (
    selection.row < selection.baseRow ||
    selection.row >= selection.baseRow + MOUNTED_ROWS
  ) {
    selection.baseRow = Math.min(
      selection.row,
      ROW_COUNT - MOUNTED_ROWS
    );
  }
  if (
    selection.column < selection.baseColumn ||
    selection.column >= selection.baseColumn + MOUNTED_COLUMNS
  ) {
    selection.baseColumn = Math.min(
      selection.column,
      COLUMN_COUNT - MOUNTED_COLUMNS
    );
  }
}

function valueFor(row, column) {
  return `R${row + 1}:C${column + 1}`;
}

function render({ focus = false } = {}) {
  ensureMounted();
  grid.replaceChildren();
  const header = document.createElement('div');
  header.className = 'grid-row header-row';
  header.setAttribute('role', 'row');
  header.setAttribute('aria-rowindex', '1');
  for (
    let column = selection.baseColumn;
    column < selection.baseColumn + MOUNTED_COLUMNS;
    column += 1
  ) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell header-cell';
    cell.setAttribute('role', 'columnheader');
    cell.setAttribute('aria-colindex', String(column + 1));
    cell.textContent = `Column ${column + 1}`;
    header.append(cell);
  }
  grid.append(header);

  for (
    let row = selection.baseRow;
    row < selection.baseRow + MOUNTED_ROWS;
    row += 1
  ) {
    const rowElement = document.createElement('div');
    rowElement.className = 'grid-row';
    rowElement.setAttribute('role', 'row');
    rowElement.setAttribute('aria-rowindex', String(row + 2));
    for (
      let column = selection.baseColumn;
      column < selection.baseColumn + MOUNTED_COLUMNS;
      column += 1
    ) {
      const cell = document.createElement('div');
      const active = row === selection.row && column === selection.column;
      cell.id = cellId(row, column);
      cell.className = `grid-cell${active ? ' active' : ''}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-rowindex', String(row + 2));
      cell.setAttribute('aria-colindex', String(column + 1));
      cell.setAttribute('aria-selected', String(active));
      cell.tabIndex = active ? 0 : -1;
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      cell.textContent = valueFor(row, column);
      rowElement.append(cell);
    }
    grid.append(rowElement);
  }

  const active = document.querySelector(
    `#${cellId(selection.row, selection.column)}`
  );
  activeLabel.textContent = `R${selection.row + 1} · C${selection.column + 1}`;
  mountedCount.textContent = String(MOUNTED_ROWS * MOUNTED_COLUMNS);
  state.textContent =
    `Active row ${selection.row + 1} of ${ROW_COUNT}, ` +
    `column ${selection.column + 1} of ${COLUMN_COUNT}. ` +
    `Mounted rows ${selection.baseRow + 1}–${selection.baseRow + MOUNTED_ROWS}, ` +
    `columns ${selection.baseColumn + 1}–${selection.baseColumn + MOUNTED_COLUMNS}.`;
  if (focus) active?.focus();
}

function move(rowDelta, columnDelta) {
  selection.row = Math.max(
    0,
    Math.min(ROW_COUNT - 1, selection.row + rowDelta)
  );
  selection.column = Math.max(
    0,
    Math.min(COLUMN_COUNT - 1, selection.column + columnDelta)
  );
  render({ focus: true });
}

function beginEdit() {
  if (selection.editing) return;
  selection.editing = true;
  const cell = document.querySelector(
    `#${cellId(selection.row, selection.column)}`
  );
  const input = document.createElement('input');
  input.setAttribute(
    'aria-label',
    `Edit row ${selection.row + 1}, column ${selection.column + 1}`
  );
  input.value = cell.textContent;
  cell.replaceChildren(input);
  input.focus();
  input.select();
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      selection.editing = false;
      state.textContent =
        `Draft saved for row ${selection.row + 1}, ` +
        `column ${selection.column + 1}: ${input.value}`;
      cell.dataset.draft = input.value;
      cell.textContent = input.value;
      cell.focus();
    } else if (event.key === 'Escape') {
      selection.editing = false;
      render({ focus: true });
    }
    event.stopPropagation();
  });
}

grid.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 'End') {
    selection.row = ROW_COUNT - 1;
    selection.column = COLUMN_COUNT - 1;
    render({ focus: true });
    event.preventDefault();
    return;
  }
  const movements = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    PageDown: [MOUNTED_ROWS, 0],
    PageUp: [-MOUNTED_ROWS, 0]
  };
  if (movements[event.key]) {
    move(...movements[event.key]);
    event.preventDefault();
  } else if (event.key === 'Enter') {
    beginEdit();
    event.preventDefault();
  }
});

grid.addEventListener('click', (event) => {
  const cell = event.target.closest('[role="gridcell"]');
  if (!cell) return;
  selection.row = Number(cell.dataset.row);
  selection.column = Number(cell.dataset.column);
  render({ focus: true });
});

function copyTypedSample() {
  const payload = {
    version: 1,
    columns: [
      { id: 'c001', storageType: 'text' },
      { id: 'c002', storageType: 'numeric' }
    ],
    rows: [
      [
        { kind: 'string', value: 'Alpha' },
        { kind: 'number', value: 12.5 }
      ]
    ]
  };
  clipboardState.textContent =
    'text/plain: Alpha\\t12.5\n' +
    'text/html: <table>…</table>\n' +
    `application/x-tabular+json: ${JSON.stringify(payload)}`;
  state.textContent = 'Prepared three clipboard formats with typed metadata.';
}

document.querySelector('#jump-last').addEventListener('click', () => {
  selection.row = ROW_COUNT - 1;
  selection.column = COLUMN_COUNT - 1;
  render({ focus: true });
});
document.querySelector('#copy-sample').addEventListener('click', copyTypedSample);

render();
document.querySelector(`#${cellId(0, 0)}`).focus();
