//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import type {
  CellComponent,
  ColumnComponent,
  ColumnDefinition,
  Options,
  RowComponent
} from 'tabulator-tables';

//client
import type {
  GridColumn,
  GridRow,
  LogicalGridSelection
} from '../helpers/contracts.js';
import type { TabulatorTableFactory, TabulatorTablePort } from '../helpers/tabulator-adapter.js';
import {
  borderBackgroundLayers,
  presentationNumberDisplay,
  TabulatorGridAdapter
} from '../helpers/tabulator-adapter.js';

test('presentation number formats render without changing raw values', () => {
  assert.equal(presentationNumberDisplay('1234.50', 'number'), '1,234.50');
  assert.equal(presentationNumberDisplay('1234.5', 'currency'), '1,234.50');
  assert.equal(presentationNumberDisplay('0.125', 'percent'), '12.5%');
  assert.equal(presentationNumberDisplay('not-a-number', 'currency'), undefined);
  assert.equal(presentationNumberDisplay('1234.50', 'automatic'), undefined);
});

test('border presentation keeps dashed, dotted, and double edge patterns distinct', () => {
  const dashed = borderBackgroundLayers('bottom', 'dashed', '#123456');
  const dotted = borderBackgroundLayers('bottom', 'dotted', '#123456');
  const double = borderBackgroundLayers('bottom', 'double', '#123456');

  assert.match(dashed.backgroundImage, /repeating-linear-gradient\(to right, #123456 0 6px, transparent 6px 10px\)/);
  assert.equal(dashed.backgroundSize, '100% 2px');
  assert.equal(dashed.backgroundPosition, '0 100%');
  assert.match(dotted.backgroundImage, /repeating-linear-gradient\(to right, #123456 0 2px, transparent 2px 5px\)/);
  assert.notEqual(dotted.backgroundImage, dashed.backgroundImage);
  assert.equal(double.backgroundImage.match(/linear-gradient/g)?.length, 2);
  assert.equal(double.backgroundSize, '100% 1px, 100% 1px');
  assert.equal(double.backgroundPosition, '0 100%, 0 calc(100% - 3px)');
});

class FakeClassList {
  //The values state retained by this class instance
  public readonly values = new Set<string>();
  /**
   * Handle the add operation.
   */
  public add(...names: string[]) { names.forEach((name) => this.values.add(name)); }
  /**
   * Remove the current value.
   */
  public remove(...names: string[]) { names.forEach((name) => this.values.delete(name)); }
  /**
   * Handle the contains operation.
   */
  public contains(name: string) { return this.values.has(name); }
  /**
   * Handle the toggle operation.
   */
  public toggle(name: string, force?: boolean) {
    const next = typeof force === 'boolean' ? force : !this.values.has(name);
    if (next) this.values.add(name); else this.values.delete(name);
    return next;
  }
}

class FakeElement {
  //The class list state retained by this class instance
  public readonly classList = new FakeClassList();
  //The dataset state retained by this class instance
  public readonly dataset: Record<string, string> = {};
  //The attributes state retained by this class instance
  public readonly attributes = new Map<string, string>();
  //The tab index state retained by this class instance
  public tabIndex = -1;
  //The focused state retained by this class instance
  public focused = 0;
  //The is connected state retained by this class instance
  public isConnected = true;
  //The width state retained by this class instance
  public width?: number;
  //The styles state retained by this class instance
  public readonly styles = new Map<string, string>();
  //DOM event names carry different native payload shapes, so this structural
  // fake retains the browser boundary's intentionally heterogeneous events
  public readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  //The descendants state retained by this class instance
  public readonly descendants = new Map<string, FakeElement>();
  //The draggable state retained by this class instance
  public draggable = false;
  //The left state retained by this class instance
  public left = 0;
  //The style state retained by this class instance
  public readonly style: Record<string, unknown> & {
    setProperty: (name: string, value: string) => void,
    removeProperty: (name: string) => string,
  } = {
    setProperty: (name: string, value: string) => { this.styles.set(name, value); },
    removeProperty: (name: string) => {
      this.styles.delete(name);
      const camel = name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
      this.style[camel] = '';
      return '';
    }
  };
  /**
   * Set the attribute.
   */
  public setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  /**
   * Remove the attribute.
   */
  public removeAttribute(name: string) { this.attributes.delete(name); }
  /**
   * Handle the add event listener operation.
   */
  public addEventListener(
    name: string,
    //The fake mirrors DOM's event-name-dependent payload boundary
    listener: (event: unknown) => void
  ) {
    const listeners = this.listeners.get(name) || new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }
  /**
   * Remove the event listener.
   */
  public removeEventListener(
    name: string,
    //The same erased payload signature identifies the registered callback
    listener: (event: unknown) => void
  ) {
    this.listeners.get(name)?.delete(listener);
  }
  /**
   * Dispatch the current value.
   */
  public dispatch(
    name: string,
    //Each scenario supplies the event shape required by its registered handler
    event: unknown = {}
  ) {
    this.listeners.get(name)?.forEach((listener) => listener(event));
  }
  /**
   * Handle the focus operation.
   */
  public focus() { this.focused += 1; }
  /**
   * Handle the closest operation.
   */
  public closest() { return undefined; }
  /**
   * Return the bounding client rect.
   */
  public getBoundingClientRect() {
    const width = this.width || 120;
    return {
      left: this.left,
      right: this.left + width,
      top: 0,
      bottom: 32,
      width,
      height: 32,
      x: this.left,
      y: 0,
      toJSON: () => ({})
    };
  }
  /**
   * Query the selector.
   */
  public querySelector(selector: string) { return this.descendants.get(selector); }
  /**
   * Query the selector all.
   */
  public querySelectorAll() { return [] as unknown as NodeListOf<Element>; }
}

type FakeCell = CellComponent & { element: FakeElement, };
type FakeRow = RowComponent & { element: FakeElement, cells: Map<string, FakeCell>, };
type FakeColumn = ColumnComponent & { element: FakeElement, };

class FakeTable implements TabulatorTablePort {
  //Tabulator events use heterogeneous positional payloads in the real library,
  // which this structural fake mirrors without narrowing the production port
  public readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  //The columns state retained by this class instance
  public readonly columns = new Map<string, FakeColumn>();
  //The row components state retained by this class instance
  public readonly rowComponents = new Map<string, FakeRow>();
  //The rows state retained by this class instance
  public rows: GridRow[];
  //The active state retained by this class instance
  public active: GridRow[];
  //The visible start state retained by this class instance
  public visibleStart = 0;
  //The visible limit state retained by this class instance
  public visibleLimit = 2;
  //The cell accesses state retained by this class instance
  public cellAccesses = 0;
  //The options state retained by this class instance
  public options: Options;
  //The destroyed state retained by this class instance
  public destroyed = false;
  //The height state retained by this class instance
  public height: number | string = 0;
  //The scroll calls state retained by this class instance
  public readonly scrollCalls: string[] = [];

  /**
   * Create a FakeTable instance.
   */
  public constructor(options: Options) {
    this.options = options;
    this.rows = [...(options.data as GridRow[])];
    this.active = [...this.rows];
    this.installColumns(options.columns || []);
  }

  /**
   * Install the columns.
   */
  public installColumns(definitions: ColumnDefinition[]) {
    this.columns.clear();
    this.rowComponents.clear();
    for (const definition of definitions) {
      const field = String(definition.field);
      const element = new FakeElement();
      const coordinate = new FakeElement();
      coordinate.classList.add('tabular-column-coordinate');
      const semantic = new FakeElement();
      semantic.classList.add('tabular-column-semantic');
      element.descendants.set('.tabular-column-coordinate', coordinate);
      element.descendants.set('.tabular-column-semantic', semantic);
      this.columns.set(field, {
        getField: () => field,
        getElement: () => element as unknown as HTMLElement,
        setWidth: (width: number) => { element.width = width; }
      } as unknown as FakeColumn);
      this.columns.get(field)!.element = element;
    }
  }

  /**
   * Handle the on operation.
   */
  public on(
    event: string,
    //The fake mirrors Tabulator's event-name-dependent positional payloads
    listener: (...args: unknown[]) => void
  ) {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }
  /**
   * Handle the off operation.
   */
  public off(
    event: string,
    //The same erased positional signature identifies the registered callback
    listener: (...args: unknown[]) => void
  ) { this.listeners.get(event)?.delete(listener); }
  /**
   * Handle the emit operation.
   */
  public emit(
    event: string,
    //Each scenario supplies the positional payload required by that event
    ...args: unknown[]
  ) { this.listeners.get(event)?.forEach((listener) => listener(...args)); }
  /**
   * Return the rows.
   */
  public getRows(range?: string) {
    const data = range === 'visible'
      ? this.active.slice(this.visibleStart, this.visibleStart + this.visibleLimit)
      : this.active;
    return data.map((row) => this.makeRow(row));
  }
  /**
   * Return the columns.
   */
  public getColumns() { return [...this.columns.values()]; }
  /**
   * Return the row.
   */
  public getRow(rowId: string) {
    const row = this.active.find((candidate) => candidate.id === rowId);
    if (!row) throw new Error('missing row');
    return this.makeRow(row);
  }
  /**
   * Return the column.
   */
  public getColumn(columnId: string) {
    const column = this.columns.get(columnId);
    if (!column) throw new Error('missing column');
    return column;
  }
  /**
   * Move the column.
   */
  public moveColumn(from: string, to: string, after: boolean) {
    const moving = this.columns.get(from);
    const target = this.columns.get(to);
    if (!moving || !target || moving === target) return;
    const entries = [...this.columns.entries()].filter(([id]) => id !== from);
    const targetIndex = entries.findIndex(([id]) => id === to);
    entries.splice(targetIndex + (after ? 1 : 0), 0, [from, moving]);
    this.columns.clear();
    for (const [id, column] of entries) this.columns.set(id, column);
    this.emit('columnMoved', moving);
  }
  /**
   * Replace the data.
   */
  public async replaceData(rows: GridRow[]) {
    this.rows = [...rows];
    this.active = [...rows];
    this.rowComponents.clear();
    this.emit('renderComplete');
  }
  /**
   * Update the data.
   */
  public async updateData(rows: GridRow[]) {
    const updates = new Map(rows.map((row) => [row.id, row]));
    this.rows = this.rows.map((row) => ({ ...row, ...updates.get(row.id) }));
    this.active = this.active.map((row) => ({ ...row, ...updates.get(row.id) }));
    this.rowComponents.clear();
    this.emit('renderComplete');
  }
  /**
   * Set the columns.
   */
  public setColumns(definitions: ColumnDefinition[]) {
    this.options.columns = definitions;
    this.installColumns(definitions);
    this.emit('renderComplete');
  }
  /**
   * Set the sort.
   */
  public setSort(sort: Array<{ column: string, dir: 'asc' | 'desc', }>) {
    const first = sort[0];
    if (first) this.active.sort((left, right) => String(left[first.column]).localeCompare(String(right[first.column])) * (first.dir === 'asc' ? 1 : -1));
    this.emit('dataSorted');
  }
  /**
   * Clear the sort.
   */
  public clearSort() { this.active = [...this.rows]; this.emit('dataSorted'); }
  /**
   * Set the filter.
   */
  public setFilter(filters: Array<{ field: string, value: unknown, }>) {
    this.active = this.rows.filter((row) => filters.every((filter) => row[filter.field] === filter.value));
    this.emit('dataFiltered');
  }
  /**
   * Clear the filter.
   */
  public clearFilter() { this.active = [...this.rows]; this.emit('dataFiltered'); }
  /**
   * Set the height.
   */
  public setHeight(height: number | string) { this.height = height; }
  /**
   * Handle the scroll to row operation.
   */
  public async scrollToRow(rowId: string) {
    this.scrollCalls.push(rowId);
    const rowIndex = this.active.findIndex((row) => row.id === rowId);
    if (rowIndex < 0) throw new Error('missing row');
    this.visibleStart = rowIndex;
    const row = this.makeRow(this.active[rowIndex]);
    row.element.isConnected = true;
    for (const cell of row.cells.values()) cell.element.isConnected = true;
    this.emit('renderComplete');
  }
  /**
   * Handle the destroy operation.
   */
  public destroy() { this.destroyed = true; }

  /**
   * Build the row.
   */
  public makeRow(data: GridRow) {
    const existing = this.rowComponents.get(data.id);
    if (existing) return existing;
    const element = new FakeElement();
    const cells = new Map<string, FakeCell>();
    const row = {
      getData: () => data,
      getElement: () => element as unknown as HTMLElement,
      getCell: (field: string) => {
        this.cellAccesses += 1;
        return cells.get(field);
      }
    } as unknown as FakeRow;
    row.element = element;
    row.cells = cells;
    for (const field of this.columns.keys()) {
      const cellElement = new FakeElement();
      const cell = {
        getValue: () => data[field],
        getField: () => field,
        getRow: () => row,
        getElement: () => cellElement as unknown as HTMLElement
      } as unknown as FakeCell;
      cell.element = cellElement;
      cells.set(field, cell);
    }
    this.rowComponents.set(data.id, row);
    return row;
  }
}

const columns: GridColumn[] = [
  { id: 'order', coordinate: 'A', label: 'Order' },
  { id: 'status', coordinate: 'B', label: 'Status' },
  { id: 'total', coordinate: 'C', label: 'Total', kind: 'number' }
];
const rows: GridRow[] = [
  { id: '1', order: 'ORD-2', status: 'Pending', total: 20 },
  { id: '2', order: 'ORD-1', status: 'Shipped', total: 10 },
  { id: '3', order: 'ORD-3', status: 'Pending', total: 30 }
];

test('row and column movement are mounted only with current authority', async () => {
  const options: Options[] = [];
  /**
   * Return the factory result.
   */
  const factory: TabulatorTableFactory = (_container, config) => {
    options.push(config);
    return new FakeTable(config);
  };
  const denied = new TabulatorGridAdapter(factory);
  await denied.mount(new FakeElement() as unknown as HTMLElement, {
    rows,
    columns,
    canMoveRows: false,
    canMoveColumns: false
  });
  assert.equal(options[0]!.movableRows, false);
  const deniedRowHeader = options[0]!.rowHeader as ColumnDefinition;
  assert.equal(deniedRowHeader.rowHandle, false);
  const rowNumberFormatter = deniedRowHeader.formatter as unknown as (
    cell: CellComponent
  ) => string;
  const firstRowHeaderCell = {
    getRow: () => ({ getPosition: () => 1 } as unknown as RowComponent)
  } as unknown as CellComponent;
  assert.equal(rowNumberFormatter(firstRowHeaderCell), '1');
  assert.equal(options[0]!.movableColumns, false);
  denied.destroy();

  const allowed = new TabulatorGridAdapter(factory);
  await allowed.mount(new FakeElement() as unknown as HTMLElement, {
    rows,
    columns,
    canMoveRows: true,
    canMoveColumns: true
  });
  assert.equal(options[1]!.movableRows, true);
  assert.equal((options[1]!.rowHeader as ColumnDefinition).rowHandle, true);
  assert.equal(
    options[1]!.movableColumns,
    false,
    'Tabular owns immediate column dragging so Tabulator cannot move it twice'
  );
  allowed.destroy();
});

test('column movement emits the current logical order', async () => {
  let table!: FakeTable;
  const adapter = new TabulatorGridAdapter((_container, options) => (table = new FakeTable(options)));
  const moved: string[][] = [];
  adapter.on('columnMove', ({ columnIds }) => moved.push(columnIds));
  await adapter.mount(new FakeElement() as unknown as HTMLElement, {
    rows,
    columns,
    canMoveColumns: true
  });
  table.emit('tableBuilt');
  const total = table.columns.get('total')!;
  const order = table.columns.get('order')!;
  order.element.left = 0;
  table.columns.get('status')!.element.left = 120;
  total.element.left = 240;
  assert.equal(total.element.draggable, true);
  const transfer = {
    value: '',
    effectAllowed: '',
    dropEffect: '',
    /**
     * Set the data.
     */
    setData(_type: string, value: string) { this.value = value; },
    /**
     * Return the data.
     */
    getData() { return this.value; }
  };
  total.element.dispatch('dragstart', { dataTransfer: transfer });
  order.element.dispatch('dragover', {
    clientX: 10,
    dataTransfer: transfer,
    /**
     * Handle the prevent default operation.
     */
    preventDefault() {}
  });
  order.element.dispatch('drop', {
    clientX: 10,
    dataTransfer: transfer,
    /**
     * Handle the prevent default operation.
     */
    preventDefault() {}
  });
  assert.deepEqual(moved, [[ 'total', 'order', 'status' ]]);

  //Dropping on a header's right half must place the source after it instead
  // of always stopping one position short.
  total.element.dispatch('dragstart', { dataTransfer: transfer });
  table.columns.get('status')!.element.dispatch('dragover', {
    clientX: 230,
    dataTransfer: transfer,
    /**
     * Handle the prevent default operation.
     */
    preventDefault() {}
  });
  table.columns.get('status')!.element.dispatch('drop', {
    clientX: 230,
    dataTransfer: transfer,
    /**
     * Handle the prevent default operation.
     */
    preventDefault() {}
  });
  assert.deepEqual(moved.at(-1), [ 'order', 'status', 'total' ]);

  //The direct header listener keeps selection reliable even when a browser's
  // draggable-header implementation suppresses Tabulator's headerClick event.
  order.element.dispatch('click', {});
  assert.deepEqual(adapter.selection(), { kind: 'column', columnId: 'order' });
  assert.equal(order.element.attributes.get('aria-selected'), 'true');
  adapter.destroy();
});

test('named columns can use an inserted blank header as an exact drop boundary', async () => {
  let table!: FakeTable;
  const adapter = new TabulatorGridAdapter((_container, options) => (table = new FakeTable(options)));
  const moved: string[][] = [];
  const insertedBlank = {
    id: 'draft_inserted',
    coordinate: 'B',
    label: '',
    editable: true,
    kind: 'text',
    storageCodec: 'text'
  } satisfies GridColumn;
  adapter.on('columnMove', ({ columnIds }) => moved.push(columnIds));
  await adapter.mount(new FakeElement() as unknown as HTMLElement, {
    rows,
    columns: [ columns[0]!, insertedBlank, columns[1]!, columns[2]! ],
    canMoveColumns: true
  });
  table.emit('tableBuilt');
  const source = table.columns.get('status')!;
  const blank = table.columns.get('draft_inserted')!;
  source.element.left = 240;
  blank.element.left = 120;
  const transfer = {
    value: '',
    effectAllowed: '',
    dropEffect: '',
    /**
     * Set the data.
     */
    setData(_type: string, value: string) { this.value = value; },
    /**
     * Return the data.
     */
    getData() { return this.value; }
  };

  assert.equal(source.element.draggable, true);
  assert.equal(blank.element.draggable, false);
  source.element.dispatch('dragstart', { dataTransfer: transfer });
  blank.element.dispatch('dragover', {
    clientX: 130,
    dataTransfer: transfer,
    /**
     * Handle the prevent default operation.
     */
    preventDefault() {}
  });
  blank.element.dispatch('drop', {
    clientX: 130,
    dataTransfer: transfer,
    /**
     * Handle the prevent default operation.
     */
    preventDefault() {}
  });

  assert.deepEqual(moved, [[ 'order', 'status', 'draft_inserted', 'total' ]]);
  adapter.destroy();
});

test('adapter owns Tabulator configuration and restores logical selection through view changes', async () => {
  let table: FakeTable | undefined;
  /**
   * Return the factory result.
   */
  const factory: TabulatorTableFactory = (_container, options) => {
    table = new FakeTable(options);
    return table;
  };
  const container = new FakeElement();
  const adapter = new TabulatorGridAdapter(factory);
  const ready: unknown[] = [];
  adapter.on('ready', (payload) => ready.push(payload));
  await adapter.mount(container as unknown as HTMLElement, {
    rows,
    columns,
    height: 360,
    initialSelection: {
      kind: 'cell',
      anchor: { rowId: '2', columnId: 'status' },
      focus: { rowId: '2', columnId: 'status' }
    }
  });
  assert.ok(table);
  table.emit('tableBuilt');
  assert.deepEqual(ready, [{ rowCount: 3, columnCount: 3 }]);
  assert.equal(table.options.index, 'id');
  assert.equal(table.options.renderVertical, 'virtual');
  assert.equal(table.options.renderHorizontal, 'basic');
  assert.equal(table.options.editTriggerEvent, 'dblclick');
  assert.equal(table.options.columns?.every((column) => column.headerSort === false), true);
  assert.equal(container.attributes.get('aria-rowcount'), '4');
  assert.equal(container.attributes.get('aria-colcount'), '4');
  assert.equal(table.columns.get('order')?.element.attributes.get('aria-colindex'), '2');
  const firstMountedRow = table.rowComponents.get('1');
  assert.equal(firstMountedRow?.element.attributes.get('aria-rowindex'), '2');
  assert.equal(firstMountedRow?.cells.get('order')?.element.attributes.get('aria-rowindex'), '2');
  assert.equal(firstMountedRow?.cells.get('order')?.element.attributes.get('aria-colindex'), '2');
  assert.deepEqual(adapter.selection(), {
    kind: 'cell',
    anchor: { rowId: '2', columnId: 'status' },
    focus: { rowId: '2', columnId: 'status' }
  });
  const activeCell = (table.getRow('2') as FakeRow).cells.get('status')!.element;
  assert.equal(adapter.focusActive(), true, 'the visible active cell accepts keyboard focus');
  assert.equal(activeCell.focused, 1);

  adapter.replaceColumns([columns[2], columns[1], columns[0]]);
  assert.deepEqual([...table.columns.keys()], ['total', 'status', 'order']);
  assert.deepEqual(adapter.selection(), {
    kind: 'cell',
    anchor: { rowId: '2', columnId: 'status' },
    focus: { rowId: '2', columnId: 'status' }
  }, 'column definition/order replacement preserves stable logical selection');
  assert.equal(table.columns.get('total')?.element.attributes.get('aria-colindex'), '2');

  adapter.setSort([{ columnId: 'order', direction: 'asc' }]);
  adapter.setFilter([{ columnId: 'status', operation: '=', value: 'Pending' }]);
  assert.equal(adapter.selection()?.kind, 'cell', 'filtering does not discard a hidden logical selection');
  adapter.setFilter([]);
  assert.equal(adapter.navigate('down'), true);
  assert.deepEqual(adapter.selection(), {
    kind: 'cell',
    anchor: { rowId: '3', columnId: 'status' },
    focus: { rowId: '3', columnId: 'status' }
  });
  adapter.setColumnWidth('status', 222);
  assert.equal(table.columns.get('status')?.element.width, 222);
  adapter.setHeight('50vh');
  assert.equal(table.height, '50vh');
  await adapter.updateRows([{ id: '3', order: 'ORD-3', status: 'Confirmed', total: 30 }]);
  await adapter.replaceRows(rows.filter((row) => row.id !== '3'));
  assert.equal(adapter.selection(), null, 'selection clears when its stable row no longer exists');
  adapter.destroy();
  assert.equal(table.destroyed, true);
  assert.equal([...table.listeners.values()].every((listeners) => listeners.size === 0), true);
});

test('adapter translates keyboard-safe cell, range, row, column, and edit state without leaking Tabulator components', async () => {
  let table!: FakeTable;
  const adapter = new TabulatorGridAdapter((_container, options) => (table = new FakeTable(options)));
  const selections: Array<LogicalGridSelection | null> = [];
  const edits: unknown[] = [];
  adapter.on('selection', (payload) => selections.push(payload.selection));
  adapter.on('edit', (payload) => edits.push(payload));
  await adapter.mount(new FakeElement() as unknown as HTMLElement, { rows, columns });
  table.emit('tableBuilt');
  const row = table.getRow('1') as FakeRow;
  const status = row.getCell('status') as FakeCell;
  table.emit('cellClick', {} as UIEvent, status);
  const rangeEnd = (table.getRow('2') as FakeRow).getCell('total') as FakeCell;
  table.emit('cellClick', { shiftKey: true } as unknown as UIEvent, rangeEnd);
  table.emit('headerClick', {
    target: { closest: (selector: string) => selector === '.tabular-column-semantic' ? {} : undefined }
  } as unknown as UIEvent, table.getColumn('total'));
  assert.deepEqual(adapter.selection(), { kind: 'header', columnId: 'total' });
  assert.equal(row.cells.get('total')?.element.attributes.get('aria-selected'), 'false');
  table.emit('headerClick', {
    target: { closest: (selector: string) => selector === '.tabular-column-coordinate' ? {} : undefined }
  } as unknown as UIEvent, table.getColumn('total'));
  const rowHeaderClick = (table.options.rowHeader as { cellClick: (event: MouseEvent, cell: CellComponent) => void, }).cellClick;
  const rowHeader = {
    getField: () => undefined,
    getRow: () => row,
    getElement: () => new FakeElement() as unknown as HTMLElement
  } as unknown as CellComponent;
  rowHeaderClick({} as MouseEvent, rowHeader);
  table.emit('cellClick', {} as UIEvent, rowHeader);
  table.emit('cellEdited', status);
  assert.deepEqual(selections.slice(-5).map((selection) => selection?.kind), [
    'cell', 'range', 'header', 'column', 'row'
  ]);
  assert.equal(row.cells.get('status')?.element.attributes.get('aria-selected'), 'true');
  assert.equal(row.cells.get('total')?.element.tabIndex, -1, 'row selection does not outline a body cell');
  adapter.select({ kind: 'column', columnId: 'status' });
  assert.equal(row.cells.get('status')?.element.attributes.get('aria-selected'), 'true');
  assert.equal(row.cells.get('status')?.element.tabIndex, -1, 'column selection does not outline a body cell');
  assert.equal(table.columns.get('status')?.element.attributes.get('aria-selected'), 'true');
  adapter.select({ kind: 'header-row' });
  assert.deepEqual(adapter.selection(), { kind: 'header-row' });
  assert.equal(adapter.editActive(), false, 'whole-header-row selection is never a body-cell edit');
  assert.equal(adapter.navigate('down'), true, 'navigation resumes from a band selection focus point');
  assert.deepEqual(adapter.selection(), {
    kind: 'cell',
    anchor: { rowId: '2', columnId: 'status' },
    focus: { rowId: '2', columnId: 'status' }
  });
  assert.deepEqual(edits, [{
    point: { rowId: '1', columnId: 'status' },
    value: 'Pending',
    previous: 'Pending'
  }]);
  adapter.destroy();
});

test('selection projection stays bounded to mounted rows and restores an offscreen logical selection', async () => {
  let table!: FakeTable;
  const adapter = new TabulatorGridAdapter((_container, options) => (table = new FakeTable(options)));
  table = undefined as unknown as FakeTable;
  await adapter.mount(new FakeElement() as unknown as HTMLElement, {
    rows,
    columns,
    initialSelection: {
      kind: 'cell',
      anchor: { rowId: '3', columnId: 'status' },
      focus: { rowId: '3', columnId: 'status' }
    }
  });
  table.visibleLimit = 1;
  table.cellAccesses = 0;
  table.emit('tableBuilt');
  assert.equal(table.cellAccesses, columns.length, 'only the single mounted row is projected');
  assert.equal(table.rowComponents.get('1')?.cells.get('status')?.element.attributes.get('aria-selected'), 'false');
  table.visibleStart = 2;
  table.cellAccesses = 0;
  table.emit('renderComplete');
  assert.equal(table.cellAccesses, columns.length, 'virtual scrolling remains bounded');
  const restored = table.rowComponents.get('3')?.cells.get('status')?.element;
  assert.equal(restored?.attributes.get('aria-selected'), 'true');
  assert.equal(restored?.attributes.get('aria-rowindex'), '4');
  assert.equal(restored?.tabIndex, 0);
  adapter.destroy();
});

test('navigation scrolls and focuses a detached virtual row before handing off keyboard focus', async () => {
  let table!: FakeTable;
  const adapter = new TabulatorGridAdapter((_container, options) => (table = new FakeTable(options)));
  await adapter.mount(new FakeElement() as unknown as HTMLElement, {
    rows,
    columns,
    initialSelection: {
      kind: 'cell',
      anchor: { rowId: '1', columnId: 'status' },
      focus: { rowId: '1', columnId: 'status' }
    }
  });
  table.visibleLimit = 1;
  table.emit('tableBuilt');
  const target = (table.getRow('2') as FakeRow).cells.get('status')!;
  target.element.isConnected = false;
  assert.equal(adapter.navigate('down'), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(table.scrollCalls, ['2']);
  assert.equal(target.element.focused, 1);
  assert.deepEqual(adapter.selection(), {
    kind: 'cell',
    anchor: { rowId: '2', columnId: 'status' },
    focus: { rowId: '2', columnId: 'status' }
  });
  adapter.destroy();
});

test('adapter definitions cover all ten accepted field editors and output formatters', async () => {
  let table!: FakeTable;
  const fieldColumns: GridColumn[] = [
    { id: 'text', coordinate: 'A', label: 'Text', kind: 'text' },
    { id: 'number', coordinate: 'B', label: 'Number', kind: 'number' },
    { id: 'email', coordinate: 'C', label: 'Email', kind: 'email', format: 'email-link' },
    { id: 'url', coordinate: 'D', label: 'URL', kind: 'url', format: 'link' },
    { id: 'phone', coordinate: 'E', label: 'Phone', kind: 'phone', format: 'phone-link' },
    {
      id: 'relation', coordinate: 'F', label: 'Relation', kind: 'relation',
      options: [{
        value: 'relation_one', label: 'Acme — 001', outputLabel: 'Acme',
        patch: { relation: 'relation_one' }
      }],
      optionLookup: async (query) => [{
        value: 'relation_sixty', label: `Customer 060 — ${query}`, outputLabel: 'Customer 060',
        patch: { relation: 'relation_sixty' }
      }]
    },
    {
      id: 'select', coordinate: 'G', label: 'Select', kind: 'select',
      options: [{ value: 'Ready', label: 'Ready' }]
    },
    { id: 'price', coordinate: 'H', label: 'Price', kind: 'price', format: 'currency' },
    { id: 'switch', coordinate: 'I', label: 'Switch', kind: 'switch' },
    { id: 'datetime', coordinate: 'J', label: 'Date and time', kind: 'datetime' }
  ];
  const fieldRow: GridRow = {
    id: 'field-row',
    text: '002',
    number: '9007199254740993.0001',
    email: 'ap@northstar.co',
    url: 'northstar.co',
    phone: '+63 917 555 0199',
    relation: 'relation_one',
    select: 'Ready',
    price: '12345678901234567890.01',
    switch: true,
    datetime: '2026-08-01T10:32:00Z'
  };
  const adapter = new TabulatorGridAdapter((_container, options) => (table = new FakeTable(options)));
  await adapter.mount(new FakeElement() as unknown as HTMLElement, {
    rows: [fieldRow],
    columns: fieldColumns
  });
  const definitions = new Map((table.options.columns || []).map((definition) => [
    String(definition.field),
    definition
  ]));
  for (const column of fieldColumns) {
    assert.ok(definitions.get(column.id)?.editor, `${column.label} requires an editor`);
    assert.equal(typeof definitions.get(column.id)?.formatter, 'function', `${column.label} requires an output formatter`);
  }
  assert.equal(definitions.get('relation')?.editor, 'list');
  assert.equal(definitions.get('select')?.editor, 'list');
  const row = table.getRow('field-row') as FakeRow;
  const relationParams = definitions.get('relation')?.editorParams as {
    filterRemote?: boolean,
    filterDelay?: number,
    valuesLookup?: (cell: CellComponent, term: string) => Promise<Record<string, string>>,
  };
  assert.equal(relationParams.filterRemote, true);
  assert.equal(relationParams.filterDelay, 250);
  assert.deepEqual(await relationParams.valuesLookup!(row.cells.get('relation')!, 'Customer 060'), {
    relation_sixty: 'Customer 060 — Customer 060'
  });
  assert.equal(definitions.get('price')?.hozAlign, 'right');
  assert.equal(definitions.get('number')?.hozAlign, 'right');
  /**
   * Format the current value.
   */
  const format = (field: string) => {
    const formatter = definitions.get(field)?.formatter;
    assert.equal(typeof formatter, 'function');
    return (formatter as (
      cell: CellComponent,
      params: Record<string, unknown>,
      onRendered: () => void
    ) => unknown)(row.cells.get(field)!, {}, () => undefined);
  };
  assert.equal(format('number'), '9,007,199,254,740,993.0001');
  assert.equal(format('price'), '12,345,678,901,234,567,890.01');
  assert.equal(format('relation'), 'Acme');
  assert.equal(format('switch'), 'Yes');
  assert.match(String(format('datetime')), /Aug 1, 10:32 AM/);
  adapter.destroy();
});

test('grid issues project invalid state locally and clear without losing selection', async () => {
  let table!: FakeTable;
  const adapter = new TabulatorGridAdapter((_container, options) => (table = new FakeTable(options)));
  await adapter.mount(new FakeElement() as unknown as HTMLElement, {
    rows,
    columns,
    initialSelection: {
      kind: 'cell',
      anchor: { rowId: '1', columnId: 'status' },
      focus: { rowId: '1', columnId: 'status' }
    }
  });
  table.emit('tableBuilt');
  adapter.setIssues([{
    rowId: '1',
    columnId: 'status',
    token: '#VALUE!',
    message: 'Choose an available option.'
  }]);
  const invalid = (table.getRow('1') as FakeRow).cells.get('status')!.element;
  assert.equal(invalid.classList.contains('tabular-cell-invalid'), true);
  assert.equal(invalid.attributes.get('aria-invalid'), 'true');
  assert.match(invalid.attributes.get('aria-describedby') || '', /^grid-error-/);
  assert.deepEqual(adapter.selection(), {
    kind: 'cell',
    anchor: { rowId: '1', columnId: 'status' },
    focus: { rowId: '1', columnId: 'status' }
  });
  adapter.setIssues([]);
  const cleared = (table.getRow('1') as FakeRow).cells.get('status')!.element;
  assert.equal(cleared.classList.contains('tabular-cell-invalid'), false);
  assert.equal(cleared.attributes.has('aria-invalid'), false);
  adapter.destroy();
});

test('row-summary issues preserve raw cell output without an inline error token', async () => {
  let table!: FakeTable;
  const adapter = new TabulatorGridAdapter((_container, options) => (table = new FakeTable(options)));
  await adapter.mount(new FakeElement() as unknown as HTMLElement, { rows, columns });
  table.emit('tableBuilt');
  adapter.setIssues([{
    rowId: '1',
    columnId: 'status',
    token: '#VALUE!',
    message: 'Choose an available option.',
    showCellToken: false
  }]);

  const cell = (table.getRow('1') as FakeRow).cells.get('status')!;
  const definition = (table.options.columns || []).find((column) => (
    column.field === 'status'
  ));
  const formatter = definition?.formatter;
  assert.equal(typeof formatter, 'function');
  assert.equal((formatter as (
    cell: CellComponent,
    params: Record<string, unknown>,
    onRendered: () => void
  ) => unknown)(cell, {}, () => undefined), 'Pending');
  assert.equal(cell.element.classList.contains('tabular-cell-invalid'), false);
  assert.equal(cell.element.attributes.has('aria-invalid'), false);
  adapter.destroy();
});

test('presentation state projects onto mounted cells and clears safely when virtual cells are recycled', async () => {
  let table!: FakeTable;
  const adapter = new TabulatorGridAdapter((_container, options) => (table = new FakeTable(options)));
  await adapter.mount(new FakeElement() as unknown as HTMLElement, {
    rows,
    columns,
    presentation: {
      '["1","status"]': {
        bold: true,
        italic: true,
        textColor: '#174ea6',
        fillColor: '#dbeafe',
        horizontal: 'center',
        vertical: 'top',
        wrap: 'wrap',
        border: 'bottom',
        borderStyle: 'dashed'
      },
      '["__tabular_header__","status"]': {
        fillColor: '#fef3c7',
        horizontal: 'right',
        vertical: 'bottom',
        wrap: 'wrap'
      }
    }
  });
  table.emit('tableBuilt');
  const formatted = (table.getRow('1') as FakeRow).cells.get('status')!.element;
  assert.equal(formatted.dataset.presentation, 'true');
  assert.equal(formatted.style.fontWeight, '700');
  assert.equal(formatted.style.fontStyle, 'italic');
  assert.equal(formatted.style.color, '#174ea6');
  assert.equal(formatted.style.backgroundColor, '#dbeafe');
  assert.equal(formatted.style.textAlign, 'center');
  assert.equal(formatted.classList.contains('tabular-presentation-v-top'), true);
  assert.equal(formatted.classList.contains('tabular-presentation-wrap'), true);
  assert.equal(formatted.dataset.borderStyle, 'dashed');
  assert.equal(formatted.style.backgroundImage, 'repeating-linear-gradient(to right, #4b5563 0 6px, transparent 6px 10px)');
  assert.equal(formatted.style.backgroundSize, '100% 2px');
  assert.equal(formatted.style.backgroundPosition, '0 100%');
  adapter.select({ kind: 'header-row' });
  const formattedHeader = table.columns.get('status')!.element
    .querySelector('.tabular-column-semantic') as FakeElement;
  assert.equal(formattedHeader.style.backgroundColor, '#fef3c7');
  assert.equal(formattedHeader.style.textAlign, 'right');
  assert.equal(formattedHeader.style.justifyContent, 'flex-end');
  assert.equal(formattedHeader.classList.contains('tabular-presentation-v-bottom'), true);
  assert.equal(formattedHeader.classList.contains('tabular-presentation-wrap'), true);
  assert.equal(formattedHeader.classList.contains('tabular-header-cell-active'), true);

  adapter.setPresentation({
    '["__tabular_header__","status"]': { bold: false }
  });
  assert.equal(formattedHeader.style.fontWeight, '400');
  adapter.setPresentation({
    '["__tabular_header__","status"]': { bold: true }
  });
  assert.equal(formattedHeader.style.fontWeight, '700');

  adapter.setPresentation({});
  const cleared = (table.getRow('1') as FakeRow).cells.get('status')!.element;
  assert.equal(cleared.dataset.presentation, undefined);
  assert.equal(cleared.style.fontWeight, '');
  assert.equal(cleared.style.backgroundColor, '');
  assert.equal(cleared.classList.contains('tabular-presentation-v-top'), false);
  assert.equal(cleared.classList.contains('tabular-presentation-wrap'), false);
  assert.equal(formattedHeader.style.backgroundColor, '');
  assert.equal(formattedHeader.style.fontWeight, '');
  assert.equal(formattedHeader.style.justifyContent, '');
  assert.equal(formattedHeader.classList.contains('tabular-presentation-v-bottom'), false);
  assert.equal(formattedHeader.classList.contains('tabular-presentation-wrap'), false);
  adapter.destroy();
});
