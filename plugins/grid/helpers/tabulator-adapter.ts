import {
  TabulatorFull,
  type CellComponent,
  type ColumnComponent,
  type ColumnDefinition,
  type Options,
  type RowComponent
} from 'tabulator-tables';
import type {
  GridAdapter,
  GridAdapterConfig,
  GridAdapterEvent,
  GridAdapterEventMap,
  GridCellPresentation,
  GridCellValue,
  GridCellIssue,
  GridColumn,
  GridFilter,
  GridNavigationDirection,
  GridPoint,
  GridRow,
  GridSort,
  LogicalGridSelection
} from './contracts.js';
import { GRID_HEADER_ROW_ID } from './contracts.js';
import {
  coverageForIndexMaps,
  LogicalSelectionStore,
  spreadsheetRowNumber
} from './selection.js';

type TableEventListener = (...args: any[]) => void;

export type TabulatorTablePort = {
  on(event: string, listener: TableEventListener): void;
  off(event: string, listener: TableEventListener): void;
  getRows(activeOnly?: string): RowComponent[];
  getColumns(): ColumnComponent[];
  getRow(rowId: string): RowComponent;
  getColumn(columnId: string): ColumnComponent;
  moveColumn(from: string, to: string, after: boolean): void;
  replaceData(rows: GridRow[]): Promise<void>;
  updateData(rows: GridRow[]): Promise<void>;
  setColumns(columns: ColumnDefinition[]): void;
  setSort(sort: Array<{ column: string; dir: 'asc' | 'desc' }>): void;
  clearSort(): void;
  setFilter(filters: Array<{ field: string; type: GridFilter['operation']; value: GridCellValue }>): void;
  clearFilter(includeHeaderFilters: boolean): void;
  setHeight(height: number | string): void;
  scrollToRow(rowId: string, position?: 'top' | 'center' | 'bottom' | 'nearest', ifVisible?: boolean): Promise<void>;
  destroy(): void;
};

export type TabulatorTableFactory = (
  container: HTMLElement,
  options: Options
) => TabulatorTablePort;

const defaultFactory: TabulatorTableFactory = (container, options) => (
  new TabulatorFull(container, options) as unknown as TabulatorTablePort
);

function rowId(row: RowComponent) {
  return String((row.getData() as GridRow).id);
}

function pointFor(cell: CellComponent): GridPoint {
  return { rowId: rowId(cell.getRow()), columnId: cell.getField() };
}

function presentationKey(point: GridPoint) {
  return JSON.stringify([point.rowId, point.columnId]);
}

type RenderedBorderPlacement = Exclude<NonNullable<GridCellPresentation['border']>, 'none'>;
type RenderedBorderStyle = NonNullable<GridCellPresentation['borderStyle']>;
type BorderEdge = 'top' | 'right' | 'bottom' | 'left';

const BORDER_EDGES: Record<RenderedBorderPlacement, readonly BorderEdge[]> = {
  all: ['top', 'right', 'bottom', 'left'],
  inner: ['top', 'left'],
  horizontal: ['top', 'bottom'],
  vertical: ['left', 'right'],
  outer: ['top', 'right', 'bottom', 'left'],
  left: ['left'],
  top: ['top'],
  right: ['right'],
  bottom: ['bottom']
};

type BorderBackgroundLayer = {
  image: string;
  size: string;
  position: string;
};

/** Paints cell-edge borders without taking layout space or collapsing non-solid styles. */
export function borderBackgroundLayers(
  placement: RenderedBorderPlacement,
  style: RenderedBorderStyle,
  color: string
) {
  const layers: BorderBackgroundLayer[] = [];
  const add = (edge: BorderEdge, position: string, width: number, image: string) => {
    const horizontal = edge === 'top' || edge === 'bottom';
    layers.push({
      image,
      size: horizontal ? `100% ${width}px` : `${width}px 100%`,
      position
    });
  };
  const positionFor = (edge: BorderEdge) => ({
    top: '0 0',
    right: '100% 0',
    bottom: '0 100%',
    left: '0 0'
  })[edge];

  for (const edge of BORDER_EDGES[placement]) {
    const horizontal = edge === 'top' || edge === 'bottom';
    if (style === 'double') {
      const innerPosition = ({
        top: '0 3px',
        right: 'calc(100% - 3px) 0',
        bottom: '0 calc(100% - 3px)',
        left: '3px 0'
      })[edge];
      const image = `linear-gradient(${color}, ${color})`;
      add(edge, positionFor(edge), 1, image);
      add(edge, innerPosition, 1, image);
      continue;
    }

    const width = style === 'thick' ? 4 : style === 'medium' ? 3 : 2;
    const direction = horizontal ? 'to right' : 'to bottom';
    const image = style === 'dashed'
      ? `repeating-linear-gradient(${direction}, ${color} 0 6px, transparent 6px 10px)`
      : style === 'dotted'
        ? `repeating-linear-gradient(${direction}, ${color} 0 2px, transparent 2px 5px)`
        : `linear-gradient(${color}, ${color})`;
    add(edge, positionFor(edge), width, image);
  }

  return {
    backgroundImage: layers.map((layer) => layer.image).join(', '),
    backgroundSize: layers.map((layer) => layer.size).join(', '),
    backgroundPosition: layers.map((layer) => layer.position).join(', '),
    backgroundRepeat: layers.map(() => 'no-repeat').join(', ')
  };
}

function previousValueFor(cell: CellComponent): GridCellValue {
  const previous = (cell as CellComponent & { getOldValue?: () => unknown }).getOldValue;
  return (typeof previous === 'function' ? previous.call(cell) : cell.getValue()) as GridCellValue;
}

function extendsSelection(event: UIEvent) {
  return 'shiftKey' in event && Boolean((event as MouseEvent).shiftKey);
}

/** Distinguishes the coordinate band from the named spreadsheet header cell. */
function selectionForHeaderClick(
  columnId: string,
  target: EventTarget | null
): LogicalGridSelection | undefined {
  const element = target as { closest?: (selector: string) => unknown } | null;
  if (element?.closest?.('input, button, select, textarea')) return undefined;
  if (!target || element?.closest?.('.tabular-column-coordinate')) {
    return { kind: 'column', columnId };
  }
  return { kind: 'header', columnId };
}

function headerLabel(column: GridColumn) {
  const label = document.createElement('span');
  label.className = 'tabular-column-label';
  const coordinate = document.createElement('span');
  coordinate.className = 'tabular-column-coordinate';
  coordinate.textContent = column.coordinate;
  const semantic = document.createElement('span');
  semantic.className = 'tabular-column-semantic';
  semantic.textContent = column.label;
  label.append(coordinate, semantic);
  return label;
}

function formatterFor(
  column: GridColumn,
  issueFor: (point: GridPoint) => GridCellIssue | undefined
): ColumnDefinition['formatter'] {
  const base = baseFormatterFor(column);
  return (cell, formatterParams, onRendered) => {
    const issue = issueFor(pointFor(cell));
    if (issue && issue.showCellToken !== false) return errorOutput(issue);
    return typeof base === 'function'
      ? base(cell, formatterParams, onRendered)
      : base || String(cell.getValue() ?? '');
  };
}

function baseFormatterFor(column: GridColumn): ColumnDefinition['formatter'] {
  if (column.kind === 'relation') return (cell) => {
    const row = cell.getRow().getData() as GridRow;
    const option = column.options?.find((candidate) => candidate.patch
      && Object.entries(candidate.patch).every(([columnId, value]) => row[columnId] === value));
    return option?.outputLabel || option?.label || String(cell.getValue() ?? '');
  };
  if (column.kind === 'select') return (cell) => {
    const value = String(cell.getValue() ?? '');
    return column.options?.find((option) => option.value === value)?.label || value;
  };
  if (column.kind === 'boolean' || column.kind === 'switch') return (cell) => (
    cell.getValue() ? 'Yes' : 'No'
  );
  if (column.kind === 'number' || column.kind === 'price') return (cell) => {
    const value = cell.getValue();
    const source = String(value ?? '');
    return column.kind === 'price'
      ? fixedDecimalDisplay(source, 2)
      : exactDecimalDisplay(source);
  };
  if (column.kind === 'email' && column.format === 'email-link') {
    return (cell) => linkOutput(`mailto:${String(cell.getValue() ?? '')}`, String(cell.getValue() ?? ''));
  }
  if (column.kind === 'url' && column.format === 'link') {
    return (cell) => linkOutput(safeUrl(String(cell.getValue() ?? '')), String(cell.getValue() ?? ''));
  }
  if (column.kind === 'phone' && column.format === 'phone-link') {
    return (cell) => linkOutput(`tel:${String(cell.getValue() ?? '').replace(/[^+0-9]/g, '')}`, String(cell.getValue() ?? ''));
  }
  if (column.kind === 'datetime') return (cell) => {
    const raw = String(cell.getValue() ?? '');
    const normalized = raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw)
      ? raw
      : /[+-]\d{2}$/.test(raw)
        ? `${raw}:00`
        : `${raw}Z`;
    const parsed = new Date(normalized);
    return Number.isFinite(parsed.getTime())
      ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(parsed)
      : raw;
  };
  return undefined;
}

function editorFor(column: GridColumn): ColumnDefinition['editor'] {
  if (column.editable === false) return undefined;
  if (column.kind === 'boolean' || column.kind === 'switch') return booleanEditor(column);
  if (column.kind === 'select' || column.kind === 'relation') return 'list';
  if (column.kind === 'email') return textEditor(column, 'email');
  if (column.kind === 'url') return textEditor(column, 'url');
  if (column.kind === 'phone') return textEditor(column, 'tel');
  if (column.kind === 'datetime') return textEditor(column, 'datetime-local');
  if (column.kind === 'number' || column.kind === 'price') {
    return textEditor(column, 'text', undefined, 'decimal');
  }
  return textEditor(column, column.kind === 'date' ? 'date' : 'text');
}

function textEditor(
  column: GridColumn,
  type: string,
  prefix?: string,
  inputMode?: string
): NonNullable<ColumnDefinition['editor']> {
  return (cell, onRendered, success, cancel) => {
    const input = document.createElement('input');
    input.className = 'tabular-cell-input';
    input.type = type;
    if (inputMode) input.inputMode = inputMode;
    input.setAttribute('aria-label', `Edit ${column.label || column.coordinate}`);
    input.value = String(cell.getValue() ?? '')
      .replace(' ', 'T')
      .replace(/(?:Z|[+-]\d{2}(?::\d{2})?)$/, '');
    const finish = () => success(input.value);
    input.addEventListener('blur', finish, { once: true });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); cancel(cell.getValue()); }
      if (event.key === 'Enter') { event.preventDefault(); finish(); }
    });
    onRendered(() => { input.focus(); input.select(); });
    if (!prefix) return input;
    const wrapper = document.createElement('label');
    wrapper.className = 'tabular-prefixed-editor';
    const marker = document.createElement('span');
    marker.textContent = prefix;
    marker.setAttribute('aria-hidden', 'true');
    wrapper.append(marker, input);
    return wrapper;
  };
}

function booleanEditor(column: GridColumn): NonNullable<ColumnDefinition['editor']> {
  return (cell, onRendered, success, cancel) => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'tabular-switch-editor';
    input.checked = Boolean(cell.getValue());
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-label', `Edit ${column.label || column.coordinate}`);
    input.addEventListener('change', () => success(input.checked));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); cancel(cell.getValue()); }
    });
    onRendered(() => input.focus());
    return input;
  };
}

function exactDecimalDisplay(value: string) {
  const match = value.match(/^(-?)(\d+)(\.\d+)?$/);
  if (!match) return value;
  return `${match[1]}${match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${match[3] || ''}`;
}

/** Formats an exact decimal string to a fixed scale without losing large values. */
function fixedDecimalDisplay(value: string, scale: number) {
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const fraction = match[3] || '';
  const scaleFactor = 10n ** BigInt(scale);
  const whole = BigInt(match[2]!);
  const fixedFraction = fraction.slice(0, scale).padEnd(scale, '0');
  let scaled = (whole * scaleFactor) + BigInt(fixedFraction || '0');
  if (Number(fraction[scale] || '0') >= 5) scaled += 1n;
  const outputWhole = scaled / scaleFactor;
  const outputFraction = String(scaled % scaleFactor).padStart(scale, '0');
  const sign = match[1] && scaled !== 0n ? '-' : '';
  return `${sign}${String(outputWhole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
    + (scale ? `.${outputFraction}` : '');
}

export function presentationNumberDisplay(
  value: GridCellValue | undefined,
  format: GridCellPresentation['numberFormat']
) {
  if (!format || format === 'automatic' || value === null || typeof value === 'undefined') return undefined;
  const source = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(source)) return undefined;
  if (format === 'number') return exactDecimalDisplay(source);
  if (format === 'currency') return fixedDecimalDisplay(source, 2);
  const percentage = Number(source) * 100;
  return Number.isFinite(percentage) ? `${exactDecimalDisplay(String(percentage))}%` : undefined;
}

function linkOutput(href: string, label: string) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = label;
  // Spreadsheet cells retain ordinary click and double-click selection/editing.
  // A modifier click follows the semantic link without replacing the workbench.
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.title = 'Ctrl/Command-click to open';
  anchor.tabIndex = -1;
  anchor.addEventListener('click', (event) => {
    if (!event.ctrlKey && !event.metaKey) event.preventDefault();
  });
  return anchor;
}

function safeUrl(value: string) {
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
  } catch {
    return '#';
  }
}

function errorId(issue: GridCellIssue) {
  const safe = `${issue.rowId}-${issue.columnId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
  return `grid-error-${safe}`;
}

function rowErrorId(rowId: string) {
  return `grid-row-error-${rowId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180)}`;
}

function errorOutput(issue: GridCellIssue) {
  const wrapper = document.createElement('span');
  wrapper.className = 'tabular-error-output';
  const token = document.createElement('span');
  token.className = 'tabular-error-token';
  token.textContent = issue.token;
  const popover = document.createElement('span');
  popover.id = errorId(issue);
  popover.className = 'tabular-error-popover';
  popover.setAttribute('role', 'tooltip');
  const title = document.createElement('strong');
  title.textContent = 'Error';
  const message = document.createElement('span');
  message.textContent = issue.message;
  popover.append(title, message);
  wrapper.append(token, popover);
  return wrapper;
}

function definitions(
  columns: GridColumn[],
  issueFor: (point: GridPoint) => GridCellIssue | undefined = () => undefined
): ColumnDefinition[] {
  return columns.map((column) => ({
    field: column.id,
    title: column.label,
    titleFormatter: () => headerLabel(column),
    headerSort: false,
    width: column.width,
    minWidth: column.minimumWidth || 116,
    widthShrink: 0,
    resizable: true,
    editable: column.editable !== false,
    editor: editorFor(column),
    ...(column.kind === 'select' || column.kind === 'relation'
      ? {
        editorParams: {
          ...(column.kind === 'relation' && column.optionLookup
            ? {
              valuesLookup: async (_cell: CellComponent, term: string) => {
                const options = await column.optionLookup!(term);
                return Object.fromEntries(options
                  .filter((option) => !option.restricted)
                  .map((option) => [option.value, option.label]));
              },
              filterRemote: true,
              filterDelay: 250
            }
            : {
              values: Object.fromEntries((column.options || [])
                .filter((option) => !option.restricted)
                .map((option) => [option.value, option.label]))
            }),
          autocomplete: true,
          listOnEmpty: true,
          clearable: !column.required
        } as unknown as ColumnDefinition['editorParams']
      }
      : {}),
    formatter: formatterFor(column, issueFor),
    hozAlign: column.align || (column.kind === 'number' || column.kind === 'price' ? 'right' : 'left')
  }));
}

export class TabulatorGridAdapter implements GridAdapter {
  readonly #factory: TabulatorTableFactory;
  readonly #listeners = new Map<GridAdapterEvent, Set<(payload: any) => void>>();
  readonly #selection = new LogicalSelectionStore();
  readonly #issues = new Map<string, GridCellIssue>();
  #presentation: Record<string, GridCellPresentation> = {};
  readonly #tableListeners: Array<[string, TableEventListener]> = [];
  #container?: HTMLElement;
  #table?: TabulatorTablePort;
  #rows: GridRow[] = [];
  #columns: GridColumn[] = [];
  #activeRowOrder: string[] = [];
  #activeRowIndexes = new Map<string, number>();
  #columnIndexes = new Map<string, number>();
  #lastPoint?: GridPoint;
  #ready = false;
  #scrollElement?: HTMLElement;
  #scrollFrame?: number;
  #onViewportScroll?: () => void;
  #unsubscribeSelection?: () => void;
  #canMoveColumns = false;
  #draggedColumnId?: string;
  readonly #columnDragDisposers: Array<() => void> = [];
  #columnDragTimer?: ReturnType<typeof setTimeout>;
  #columnDragObserver?: MutationObserver;
  #pointerColumnDrag?: {
    source: string;
    startX: number;
    startY: number;
    target?: string;
    after?: boolean;
    moved: boolean;
  };
  #columnPointerDisposer?: () => void;

  constructor(factory: TabulatorTableFactory = defaultFactory) {
    this.#factory = factory;
  }

  async mount(container: HTMLElement, config: GridAdapterConfig) {
    if (this.#table) throw new Error('The grid adapter is already mounted');
    this.#container = container;
    this.#rows = config.rows.map((row) => ({ ...row }));
    this.#columns = config.columns.map((column) => ({ ...column }));
    this.#canMoveColumns = Boolean(config.canMoveColumns);
    this.#presentation = structuredClone(config.presentation || {});
    this.#refreshColumnIndexes();
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Spreadsheet grid');
    container.setAttribute('aria-rowcount', String(this.#rows.length + 1));
    container.setAttribute('aria-colcount', String(this.#columns.length + 1));
    this.#unsubscribeSelection = this.#selection.subscribe((selection) => {
      this.#renderSelection();
      this.#emit('selection', { selection });
    });
    if (config.initialSelection) {
      this.#rememberSelectionPoint(config.initialSelection);
      this.#selection.set(config.initialSelection);
    }
    try {
      this.#table = this.#factory(container, {
        data: this.#rows,
        columns: definitions(this.#columns, (point) => this.#issue(point)),
        index: 'id',
        height: config.height || '100%',
        layout: 'fitData',
        renderVertical: 'virtual',
        renderHorizontal: 'basic',
        renderVerticalBuffer: 320,
        rowHeight: 32,
        rowFormatter: (row) => {
          const element = row.getElement();
          const currentRowId = rowId(row);
          element.dataset.tabularRowId = currentRowId;
          if (this.#ready) {
            this.#projectRowElement(element, currentRowId, (columnId) => {
              try {
                return row.getCell(columnId).getElement();
              } catch {
                return undefined;
              }
            }, this.#selection.get());
          }
        },
        history: false,
        clipboard: false,
        selectableRange: false,
        selectableRows: false,
        movableRows: Boolean(config.canMoveRows),
        // Tabular owns immediate pointer/native movement below. Leaving the
        // delayed Tabulator owner active causes a single human drag to execute
        // twice and produces direction-dependent ordering.
        movableColumns: false,
        placeholder: 'No rows match this view',
        validationMode: 'highlight',
        editTriggerEvent: 'dblclick',
        rowHeader: {
          formatter: ((cell: CellComponent) => {
            const position = cell.getRow().getPosition(true);
            return typeof position === 'number' ? String(position) : '';
          }) as unknown as string,
          width: 48,
          minWidth: 48,
          hozAlign: 'right',
          headerHozAlign: 'right',
          headerSort: false,
          frozen: true,
          resizable: false,
          rowHandle: Boolean(config.canMoveRows),
          cellClick: (_event, cell) => this.select({
            kind: 'row',
            rowId: rowId(cell.getRow())
          })
        }
      });
      if (this.#canMoveColumns && typeof MutationObserver !== 'undefined') {
        this.#columnDragObserver = new MutationObserver(() => {
          this.#bindImmediateColumnDragging();
        });
        this.#columnDragObserver.observe(container, { childList: true, subtree: true });
      }
      if (
        this.#canMoveColumns
        && typeof document !== 'undefined'
        && typeof document.addEventListener === 'function'
      ) {
        const move = (event: MouseEvent) => {
          const drag = this.#pointerColumnDrag;
          if (!drag) return;
          if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
          drag.moved = true;
          this.#clearColumnDragClasses();
          const drop = this.#columnDropAt(event.clientX, drag.source);
          drag.target = drop?.target;
          drag.after = drop?.after;
          if (drop) this.#markColumnDrop(drop.target, drop.after);
        };
        const up = () => {
          const drag = this.#pointerColumnDrag;
          this.#pointerColumnDrag = undefined;
          this.#clearColumnDragClasses();
          if (drag?.moved && drag.target) {
            this.#requireTable().moveColumn(
              drag.source,
              drag.target,
              Boolean(drag.after)
            );
          }
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        this.#columnPointerDisposer = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
        };
      }
      this.#listen('tableBuilt', () => {
        this.#ready = true;
        this.#refreshActiveRowOrder();
        this.#scrollElement = container.querySelector<HTMLElement>('.tabulator-tableholder') || undefined;
        if (this.#scrollElement) {
          this.#onViewportScroll = () => {
            if (this.#scrollFrame !== undefined) cancelAnimationFrame(this.#scrollFrame);
            this.#scrollFrame = requestAnimationFrame(() => {
              this.#scrollFrame = undefined;
              this.#renderSelection();
            });
          };
          this.#scrollElement.addEventListener('scroll', this.#onViewportScroll, { passive: true });
        }
        this.#renderSelection();
        this.#bindImmediateColumnDragging();
        this.#emit('ready', {
          rowCount: this.#rows.length,
          columnCount: this.#columns.length
        });
      });
      this.#listen('renderComplete', () => {
        this.#renderSelection();
        this.#bindImmediateColumnDragging();
      });
      this.#listen('dataSorted', () => {
        this.#refreshActiveRowOrder();
        this.#renderSelection();
      });
      this.#listen('dataFiltered', () => {
        this.#refreshActiveRowOrder();
        this.#renderSelection();
      });
      this.#listen('columnResized', () => this.#renderSelection());
      this.#listen('columnMoved', () => {
        const byId = new Map(this.#columns.map((column) => [column.id, column]));
        const columnIds = this.#requireTable().getColumns().flatMap((column) => {
          const field = column.getField();
          return field && byId.has(field) ? [field] : [];
        });
        this.#columns = [
          ...columnIds.flatMap((columnId) => {
            const column = byId.get(columnId);
            return column ? [column] : [];
          }),
          ...this.#columns.filter((column) => !columnIds.includes(column.id))
        ];
        this.#refreshColumnIndexes();
        this.#emit('columnMove', { columnIds: this.#columns.map((column) => column.id) });
        this.#renderSelection();
      });
      this.#listen('cellClick', (event: UIEvent, cell: CellComponent) => {
        if (!this.#columns.some((column) => column.id === cell.getField())) return;
        const point = pointFor(cell);
        this.#lastPoint = point;
        this.#selection.selectCell(point, extendsSelection(event));
        cell.getElement().focus({ preventScroll: true });
      });
      this.#listen('headerClick', (event: UIEvent, column: ColumnComponent) => {
        const field = column.getField();
        const next = field ? selectionForHeaderClick(field, event.target) : undefined;
        if (next) this.select(next);
      });
      this.#listen('headerDblClick', (_event: UIEvent, column: ColumnComponent) => {
        const field = column.getField();
        if (!field) return;
        const logical = this.#columns.find((candidate) => candidate.id === field);
        if (logical && !logical.label) this.#beginHeaderNameEdit(column, logical);
        else {
          const element = column.getElement();
          element.tabIndex = 0;
          element.focus({ preventScroll: true });
          this.#emit('columnActivate', { columnId: field });
        }
      });
      this.#listen('cellEdited', (cell: CellComponent) => {
        this.#emit('edit', {
          point: pointFor(cell),
          value: cell.getValue() as GridCellValue,
          previous: previousValueFor(cell)
        });
      });
      this.#listen('rowMoved', (row: RowComponent) => {
        this.#refreshActiveRowOrder();
        const movedRowId = rowId(row);
        const index = this.#activeRowOrder.indexOf(movedRowId);
        if (index < 0) return;
        this.#emit('rowMove', {
          rowId: movedRowId,
          ...(this.#activeRowOrder[index - 1]
            ? { beforeRowId: this.#activeRowOrder[index - 1] }
            : {}),
          ...(this.#activeRowOrder[index + 1]
            ? { afterRowId: this.#activeRowOrder[index + 1] }
            : {})
        });
        this.#renderSelection();
      });
      queueMicrotask(() => {
        this.#renderSelection();
        this.#bindImmediateColumnDragging();
      });
      this.#columnDragTimer = setTimeout(() => {
        this.#columnDragTimer = undefined;
        this.#bindImmediateColumnDragging();
      }, 0);
    } catch (error) {
      this.#emit('error', { error: error instanceof Error ? error : new Error(String(error)) });
      this.destroy();
      throw error;
    }
  }

  async replaceRows(rows: GridRow[]) {
    const restoreFocus = typeof document !== 'undefined'
      && Boolean(this.#container?.contains(document.activeElement));
    const table = this.#requireTable();
    this.#rows = rows.map((row) => ({ ...row }));
    this.#reconcileSelection();
    await table.replaceData(this.#rows);
    this.#refreshActiveRowOrder();
    this.#updateAriaCounts();
    this.#renderSelection();
    if (restoreFocus) this.focusActive();
  }

  async updateRows(rows: GridRow[]) {
    const table = this.#requireTable();
    const updates = new Map(rows.map((row) => [row.id, row]));
    this.#rows = this.#rows.map((row) => updates.has(row.id)
      ? { ...row, ...updates.get(row.id) }
      : row);
    await table.updateData(rows);
    this.#renderSelection();
  }

  replaceColumns(columns: GridColumn[]) {
    const restoreFocus = typeof document !== 'undefined'
      && Boolean(this.#container?.contains(document.activeElement));
    const table = this.#requireTable();
    this.#columns = columns.map((column) => ({ ...column }));
    this.#refreshColumnIndexes();
    table.setColumns(definitions(this.#columns, (point) => this.#issue(point)));
    this.#reconcileSelection();
    this.#updateAriaCounts();
    this.#renderSelection();
    if (restoreFocus) this.focusActive();
  }

  setSort(sort: GridSort[]) {
    const table = this.#requireTable();
    if (sort.length === 0) table.clearSort();
    else table.setSort(sort.map((entry) => ({
      column: entry.columnId,
      dir: entry.direction
    })));
    this.#refreshActiveRowOrder();
    this.#renderSelection();
  }

  setFilter(filters: GridFilter[]) {
    const table = this.#requireTable();
    if (filters.length === 0) table.clearFilter(true);
    else table.setFilter(filters.map((entry) => ({
      field: entry.columnId,
      type: entry.operation,
      value: entry.value
    })));
    this.#refreshActiveRowOrder();
    this.#renderSelection();
  }

  setHeight(height: number | string) {
    this.#requireTable().setHeight(height);
  }

  setColumnWidth(columnId: string, width: number) {
    this.#requireTable().getColumn(columnId).setWidth(width);
    const column = this.#columns.find((candidate) => candidate.id === columnId);
    if (column) column.width = width;
  }

  setIssues(issues: GridCellIssue[]) {
    this.#issues.clear();
    for (const issue of issues) this.#issues.set(`${issue.rowId}\u0000${issue.columnId}`, issue);
    if (!this.#table) return;
    this.#table.setColumns(definitions(this.#columns, (point) => this.#issue(point)));
    this.#renderSelection();
  }

  setPresentation(presentation: Record<string, GridCellPresentation>) {
    this.#presentation = structuredClone(presentation);
    this.#renderSelection();
  }

  select(selection: LogicalGridSelection) {
    this.#rememberSelectionPoint(selection);
    this.#selection.set(selection);
  }

  navigate(direction: GridNavigationDirection, extend = false) {
    const selection = this.#selection.get();
    if (!selection) return false;
    const focus = selection.kind === 'cell' || selection.kind === 'range'
      ? selection.focus
      : this.#lastPoint;
    if (!focus) return false;
    const table = this.#requireTable();
    const rows = table.getRows('active');
    const rowOrder = rows.map(rowId);
    const columnOrder = this.#columns.map((column) => column.id);
    let rowIndex = rowOrder.indexOf(focus.rowId);
    let columnIndex = columnOrder.indexOf(focus.columnId);
    if (rowIndex < 0 || columnIndex < 0) return false;
    if (direction === 'up') rowIndex -= 1;
    if (direction === 'down') rowIndex += 1;
    if (direction === 'left' || direction === 'previous') columnIndex -= 1;
    if (direction === 'right' || direction === 'next') columnIndex += 1;
    if (columnIndex < 0 && rowIndex > 0) {
      rowIndex -= 1;
      columnIndex = columnOrder.length - 1;
    }
    if (columnIndex >= columnOrder.length && rowIndex < rowOrder.length - 1) {
      rowIndex += 1;
      columnIndex = 0;
    }
    if (
      rowIndex < 0
      || rowIndex >= rowOrder.length
      || columnIndex < 0
      || columnIndex >= columnOrder.length
    ) return false;
    const point = { rowId: rowOrder[rowIndex], columnId: columnOrder[columnIndex] };
    this.#lastPoint = point;
    this.#selection.selectCell(point, extend);
    try {
      const cell = table.getRow(point.rowId).getCell(point.columnId);
      const element = cell.getElement();
      if (element.isConnected === false) {
        void table.scrollToRow(point.rowId, 'center', false).then(() => {
          const current = this.#selection.get();
          if (
            !current
            || current.kind === 'row'
            || current.kind === 'header-row'
            || current.kind === 'header'
            || current.kind === 'column'
            || current.focus.rowId !== point.rowId
            || current.focus.columnId !== point.columnId
          ) return;
          this.#renderSelection();
          table.getRow(point.rowId).getCell(point.columnId).getElement().focus({ preventScroll: true });
        }).catch((error) => {
          this.#emit('error', {
            error: error instanceof Error ? error : new Error(String(error))
          });
        });
      } else {
        element.focus({ preventScroll: false });
      }
    } catch {
      return false;
    }
    return true;
  }

  editActive(initialValue?: string) {
    const selection = this.#selection.get();
    if (selection?.kind === 'header-row' || selection?.kind === 'header') return false;
    const point = selection && (selection.kind === 'cell' || selection.kind === 'range')
      ? selection.focus
      : this.#lastPoint;
    if (!point) return false;
    const column = this.#columns.find((candidate) => candidate.id === point.columnId);
    if (!column || column.editable === false || column.generated) return false;
    try {
      const cell = this.#requireTable().getRow(point.rowId).getCell(point.columnId);
      cell.edit(true);
      if (typeof initialValue === 'string') {
        queueMicrotask(() => {
          const editor = cell.getElement().querySelector<HTMLInputElement>('input, textarea');
          if (!editor) return;
          editor.value = initialValue;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  focusActive() {
    const selection = this.#selection.get();
    const point = selection && (selection.kind === 'cell' || selection.kind === 'range')
      ? selection.focus
      : this.#lastPoint;
    if (!point) return false;
    try {
      const table = this.#requireTable();
      const element = table.getRow(point.rowId).getCell(point.columnId).getElement();
      if (element.isConnected === false) {
        void table.scrollToRow(point.rowId, 'center', false).then(() => {
          const current = this.#selection.get();
          if (
            !current
            || current.kind === 'row'
            || current.kind === 'header-row'
            || current.kind === 'header'
            || current.kind === 'column'
            || current.focus.rowId !== point.rowId
            || current.focus.columnId !== point.columnId
          ) return;
          this.#renderSelection();
          table.getRow(point.rowId).getCell(point.columnId).getElement().focus({
            preventScroll: true
          });
        }).catch((error) => {
          this.#emit('error', {
            error: error instanceof Error ? error : new Error(String(error))
          });
        });
      } else {
        element.focus({ preventScroll: true });
      }
      return true;
    } catch {
      return false;
    }
  }

  selection() {
    return this.#selection.get();
  }

  on<Event extends GridAdapterEvent>(
    event: Event,
    listener: (payload: GridAdapterEventMap[Event]) => void
  ) {
    let listeners = this.#listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(event, listeners);
    }
    listeners.add(listener as (payload: any) => void);
    return () => listeners?.delete(listener as (payload: any) => void);
  }

  destroy() {
    this.#columnDragObserver?.disconnect();
    this.#columnDragObserver = undefined;
    this.#columnPointerDisposer?.();
    this.#columnPointerDisposer = undefined;
    this.#pointerColumnDrag = undefined;
    if (this.#columnDragTimer !== undefined) clearTimeout(this.#columnDragTimer);
    this.#columnDragTimer = undefined;
    this.#clearColumnDragging();
    if (this.#scrollFrame !== undefined) cancelAnimationFrame(this.#scrollFrame);
    if (this.#scrollElement && this.#onViewportScroll) {
      this.#scrollElement.removeEventListener('scroll', this.#onViewportScroll);
    }
    this.#scrollFrame = undefined;
    this.#scrollElement = undefined;
    this.#onViewportScroll = undefined;
    const table = this.#table;
    if (table) {
      for (const [event, listener] of this.#tableListeners) table.off(event, listener);
      table.destroy();
    }
    this.#tableListeners.length = 0;
    this.#unsubscribeSelection?.();
    this.#unsubscribeSelection = undefined;
    this.#table = undefined;
    this.#container = undefined;
    this.#ready = false;
    this.#lastPoint = undefined;
    this.#canMoveColumns = false;
  }

  /**
   * Tabulator intentionally waits before beginning its built-in column move.
   * Native header drag/drop makes a normal quick drag work as users expect,
   * while the public moveColumn API keeps Tabulator's columnMoved event as the
   * single order-change source.
   */
  #bindImmediateColumnDragging() {
    if (!this.#canMoveColumns || !this.#table) {
      this.#clearColumnDragging();
      return;
    }
    const components = this.#table.getColumns();
    if (!components.length) return;
    this.#clearColumnDragging();
    const movable = new Set(this.#columns
      .filter((column) => !column.id.startsWith('draft_'))
      .map((column) => column.id));
    for (const column of components) {
      const columnId = column.getField();
      if (!columnId) continue;
      const element = column.getElement();
      const canDrag = movable.has(columnId);
      element.draggable = canDrag;
      if (canDrag) element.setAttribute('aria-description', 'Drag to reorder column');
      const dragStart = (event: DragEvent) => {
        // Native drag/drop owns this gesture from here; suppress the mouse
        // fallback so the same release cannot reorder the column twice.
        this.#pointerColumnDrag = undefined;
        this.#draggedColumnId = columnId;
        element.classList.add('tabular-column-dragging');
        event.dataTransfer?.setData('text/plain', columnId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      };
      const mouseDown = (event: MouseEvent) => {
        if (event.button !== 0) return;
        this.#pointerColumnDrag = {
          source: columnId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false
        };
      };
      const dragOver = (event: DragEvent) => {
        if (!this.#draggedColumnId || this.#draggedColumnId === columnId) return;
        event.preventDefault();
        this.#clearColumnDragClasses();
        const rectangle = element.getBoundingClientRect();
        const after = Number.isFinite(event.clientX)
          ? event.clientX >= rectangle.left + rectangle.width / 2
          : false;
        this.#markColumnDrop(columnId, after);
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      };
      const dragLeave = () => element.classList.remove('tabular-column-drop-target');
      const drop = (event: DragEvent) => {
        event.preventDefault();
        const source = this.#draggedColumnId || event.dataTransfer?.getData('text/plain');
        this.#clearColumnDragClasses();
        this.#draggedColumnId = undefined;
        if (!source || source === columnId || !movable.has(source)) return;
        const rectangle = element.getBoundingClientRect();
        const after = Number.isFinite(event.clientX)
          ? event.clientX >= rectangle.left + rectangle.width / 2
          : false;
        this.#requireTable().moveColumn(source, columnId, after);
      };
      const click = (event: MouseEvent) => {
        const next = selectionForHeaderClick(columnId, event.target);
        if (next) this.select(next);
      };
      const dragEnd = () => {
        this.#draggedColumnId = undefined;
        this.#clearColumnDragClasses();
      };
      if (canDrag) {
        element.addEventListener('dragstart', dragStart);
        element.addEventListener('mousedown', mouseDown);
        element.addEventListener('dragend', dragEnd);
      }
      element.addEventListener('dragover', dragOver);
      element.addEventListener('dragleave', dragLeave);
      element.addEventListener('drop', drop);
      element.addEventListener('click', click);
      this.#columnDragDisposers.push(() => {
        element.draggable = false;
        element.removeAttribute('aria-description');
        if (canDrag) {
          element.removeEventListener('dragstart', dragStart);
          element.removeEventListener('mousedown', mouseDown);
          element.removeEventListener('dragend', dragEnd);
        }
        element.removeEventListener('dragover', dragOver);
        element.removeEventListener('dragleave', dragLeave);
        element.removeEventListener('drop', drop);
        element.removeEventListener('click', click);
      });
    }
  }

  /** Resolves one stable drop target from the pointer's horizontal position. */
  #columnDropAt(clientX: number, source: string) {
    const candidates = this.#requireTable().getColumns().flatMap((column) => {
      const field = column.getField();
      if (!field || field === source) return [];
      const rectangle = column.getElement().getBoundingClientRect();
      const middle = rectangle.left + rectangle.width / 2;
      const distance = clientX < rectangle.left
        ? rectangle.left - clientX
        : clientX > rectangle.right
          ? clientX - rectangle.right
          : 0;
      return [{
        target: field,
        after: clientX >= middle,
        distance
      }];
    });
    return candidates.sort((left, right) => left.distance - right.distance)[0];
  }

  /** Marks which edge of a header will receive the dragged column. */
  #markColumnDrop(columnId: string, after: boolean) {
    const element = this.#requireTable().getColumn(columnId).getElement();
    element.classList.add('tabular-column-drop-target');
    element.dataset.tabularDropEdge = after ? 'right' : 'left';
  }

  #clearColumnDragClasses() {
    for (const column of this.#table?.getColumns() || []) {
      column.getElement().classList.remove(
        'tabular-column-dragging',
        'tabular-column-drop-target'
      );
      delete column.getElement().dataset.tabularDropEdge;
    }
  }

  #clearColumnDragging() {
    for (const dispose of this.#columnDragDisposers.splice(0)) dispose();
    this.#draggedColumnId = undefined;
  }

  #listen(event: string, listener: TableEventListener) {
    const table = this.#requireTable();
    table.on(event, listener);
    this.#tableListeners.push([event, listener]);
  }

  #emit<Event extends GridAdapterEvent>(event: Event, payload: GridAdapterEventMap[Event]) {
    for (const listener of this.#listeners.get(event) || []) listener(payload);
  }

  #requireTable() {
    if (!this.#table) throw new Error('The grid adapter is not mounted');
    return this.#table;
  }

  #reconcileSelection() {
    const rowIds = new Set(this.#rows.map((row) => row.id));
    const columnIds = new Set(this.#columns.map((column) => column.id));
    this.#selection.reconcile(rowIds, columnIds);
    if (
      this.#lastPoint
      && (!rowIds.has(this.#lastPoint.rowId) || !columnIds.has(this.#lastPoint.columnId))
    ) this.#lastPoint = undefined;
  }

  #rememberSelectionPoint(selection: LogicalGridSelection) {
    if (selection.kind === 'cell' || selection.kind === 'range') {
      this.#lastPoint = { ...selection.focus };
      return;
    }
    if (selection.kind === 'row') {
      const columnId = this.#lastPoint?.columnId || this.#columns[0]?.id;
      if (columnId) this.#lastPoint = { rowId: selection.rowId, columnId };
      return;
    }
    if (selection.kind === 'header-row') return;
    const rowId = this.#lastPoint?.rowId || this.#rows[0]?.id;
    if (rowId) this.#lastPoint = { rowId, columnId: selection.columnId };
  }

  #updateAriaCounts() {
    const rowCount = String(this.#rows.length + 1);
    const columnCount = String(this.#columns.length + 1);
    this.#container?.setAttribute('aria-rowcount', rowCount);
    this.#container?.setAttribute('aria-colcount', columnCount);
    const grid = this.#container?.querySelector<HTMLElement>('.tabulator[role="grid"], .tabulator');
    grid?.setAttribute('aria-rowcount', rowCount);
    grid?.setAttribute('aria-colcount', columnCount);
  }

  #refreshActiveRowOrder() {
    if (!this.#table) return;
    this.#activeRowOrder = this.#table.getRows('active').map(rowId);
    this.#activeRowIndexes = new Map(
      this.#activeRowOrder.map((id, index) => [id, index])
    );
  }

  #refreshColumnIndexes() {
    this.#columnIndexes = new Map(
      this.#columns.map((column, index) => [column.id, index])
    );
  }

  #projectRowElement(
    rowElement: HTMLElement,
    currentRowId: string,
    cellElement: (columnId: string) => HTMLElement | undefined,
    selection: LogicalGridSelection | null
  ) {
    const rowIndex = this.#activeRowIndexes.get(currentRowId) ?? -1;
    const row = this.#rows.find((candidate) => candidate.id === currentRowId);
    rowElement.classList.remove('tabular-active-row');
    if (rowIndex >= 0) rowElement.setAttribute('aria-rowindex', String(rowIndex + 2));
    rowElement.setAttribute('aria-selected', String(
      selection?.kind === 'row' && selection.rowId === currentRowId
    ));
    if (selection?.kind === 'row' && selection.rowId === currentRowId) {
      rowElement.classList.add('tabular-active-row');
    }
    const mountedRowHeader = rowElement.querySelector<HTMLElement>('.tabulator-row-header');
    const activeAxisRow = selection?.kind === 'cell' || selection?.kind === 'range'
      ? selection.focus.rowId === currentRowId
      : false;
    mountedRowHeader?.classList.toggle('tabular-axis-row-active', activeAxisRow);
    mountedRowHeader?.setAttribute('aria-colindex', '1');
    if (rowIndex >= 0) mountedRowHeader?.setAttribute('aria-rowindex', String(rowIndex + 2));
    mountedRowHeader?.setAttribute('aria-selected', String(
      selection?.kind === 'row' && selection.rowId === currentRowId
    ));
    for (const [columnIndex, column] of this.#columns.entries()) {
      const element = cellElement(column.id);
      if (!element) continue;
      element.classList.remove(
        'tabular-active-cell',
        'tabular-active-row',
        'tabular-active-column',
        'tabular-range-cell',
        'tabular-cell-invalid',
        'tabular-error-align-right',
        'tabular-presentation-wrap',
        'tabular-presentation-overflow',
        'tabular-presentation-v-top',
        'tabular-presentation-v-middle',
        'tabular-presentation-v-bottom',
        'tabular-presentation-number'
      );
      this.#projectPresentation(element, { rowId: currentRowId, columnId: column.id }, row?.[column.id]);
      const coverage = coverageForIndexMaps(
        selection,
        { rowId: currentRowId, columnId: column.id },
        this.#activeRowIndexes,
        this.#columnIndexes
      );
      element.setAttribute('aria-colindex', String(columnIndex + 2));
      if (rowIndex >= 0) element.setAttribute('aria-rowindex', String(rowIndex + 2));
      const focusCell = coverage.activeCell;
      element.tabIndex = focusCell ? 0 : -1;
      element.setAttribute('aria-selected', String(
        coverage.inRange
        || coverage.activeCell
        || (selection?.kind === 'row' && coverage.activeRow)
        || (selection?.kind === 'column' && coverage.activeColumn)
      ));
      if (focusCell) element.classList.add('tabular-active-cell');
      if (selection?.kind === 'row' && coverage.activeRow) {
        element.classList.add('tabular-active-row');
      }
      if (selection?.kind === 'column' && coverage.activeColumn) {
        element.classList.add('tabular-active-column');
      }
      if (coverage.inRange) element.classList.add('tabular-range-cell');
      const issue = this.#issue({ rowId: currentRowId, columnId: column.id });
      if (issue && issue.showCellToken !== false) {
        element.classList.add('tabular-cell-invalid');
        const boundary = element.closest('.tabulator-tableholder')?.getBoundingClientRect();
        const rectangle = element.getBoundingClientRect();
        const viewportWidth = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth;
        const popoverWidth = Math.min(260, viewportWidth - 32);
        const maximumRight = Math.min(viewportWidth - 16, boundary?.right ?? viewportWidth);
        const overflow = Math.max(0, rectangle.left + 6 + popoverWidth - maximumRight);
        element.style.setProperty('--tabular-error-shift', `${overflow}px`);
        element.classList.toggle('tabular-error-align-right', overflow > 0);
        element.setAttribute('aria-invalid', 'true');
        element.setAttribute('aria-describedby', errorId(issue));
      } else {
        element.style.removeProperty('--tabular-error-shift');
        element.removeAttribute('aria-invalid');
        element.removeAttribute('aria-describedby');
      }
    }
    const rowIssues = [...this.#issues.values()].filter((issue) => issue.rowId === currentRowId);
    mountedRowHeader?.classList.toggle('tabular-row-invalid', rowIssues.length > 0);
    if (mountedRowHeader && rowIssues.length) {
      mountedRowHeader.tabIndex = 0;
      mountedRowHeader?.setAttribute(
        'aria-label',
        `Row ${spreadsheetRowNumber(rowIndex)}, not added: ${rowIssues.map((issue) => issue.message).join(' ')}`
      );
      mountedRowHeader.setAttribute('aria-describedby', rowErrorId(currentRowId));
      let popover = mountedRowHeader.querySelector<HTMLElement>('.tabular-row-error-popover');
      if (!popover) {
        popover = document.createElement('span');
        popover.className = 'tabular-row-error-popover';
        popover.id = rowErrorId(currentRowId);
        popover.setAttribute('role', 'tooltip');
        mountedRowHeader.append(popover);
      }
      popover.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = 'Row not added';
      const list = document.createElement('ul');
      for (const issue of rowIssues) {
        const item = document.createElement('li');
        const label = document.createElement('strong');
        label.textContent = `${this.#columns.find((column) => column.id === issue.columnId)?.label || issue.columnId}: `;
        item.append(label, issue.message);
        list.append(item);
      }
      popover.append(title, list);
    } else if (mountedRowHeader) {
      mountedRowHeader.tabIndex = -1;
      mountedRowHeader.setAttribute('aria-label', `Row ${spreadsheetRowNumber(rowIndex)}`);
      mountedRowHeader.removeAttribute('aria-describedby');
      mountedRowHeader.querySelector('.tabular-row-error-popover')?.remove();
    }
  }

  #renderSelection() {
    const table = this.#table;
    const container = this.#container;
    if (!table || !container || !this.#ready) return;
    for (const element of container.querySelectorAll(
      '.tabular-active-cell, .tabular-active-row, .tabular-active-column, .tabular-range-cell, .tabular-axis-row-active, .tabular-axis-column-active, .tabular-header-cell-active, .tabular-column-selected'
    )) {
      element.classList.remove(
        'tabular-active-cell',
        'tabular-active-row',
        'tabular-active-column',
        'tabular-range-cell',
        'tabular-axis-row-active',
        'tabular-axis-column-active',
        'tabular-header-cell-active',
        'tabular-column-selected'
      );
    }
    const selection = this.#selection.get();
    this.#updateAriaCounts();
    const rowHeader = container.querySelector<HTMLElement>(
      '.tabulator-header .tabulator-row-header'
    );
    rowHeader?.setAttribute('aria-label', 'Header row');
    rowHeader?.setAttribute('aria-colindex', '1');
    rowHeader?.setAttribute('aria-selected', String(selection?.kind === 'header-row'));
    if (rowHeader) rowHeader.tabIndex = selection?.kind === 'header-row' ? 0 : -1;
    rowHeader?.classList.toggle(
      'tabular-axis-row-active',
      selection?.kind === 'header' || selection?.kind === 'header-row'
    );
    const headerRow = container.querySelector('.tabulator-header [role="row"]');
    headerRow?.setAttribute('aria-rowindex', '1');
    const mountedRows = [...container.querySelectorAll<HTMLElement>(
      '.tabulator-row[data-tabular-row-id]'
    )];
    if (mountedRows.length > 0) {
      for (const rowElement of mountedRows) {
        const currentRowId = rowElement.dataset.tabularRowId;
        if (!currentRowId) continue;
        this.#projectRowElement(rowElement, currentRowId, (columnId) => (
          rowElement.querySelector<HTMLElement>(`.tabulator-cell[tabulator-field="${columnId}"]`) || undefined
        ), selection);
      }
    } else {
      // Structural adapter fakes do not mount a DOM tree; production always uses
      // the bounded mounted-row branch above.
      for (const row of table.getRows('visible')) {
        this.#projectRowElement(row.getElement(), rowId(row), (columnId) => {
          try {
            return row.getCell(columnId).getElement();
          } catch {
            return undefined;
          }
        }, selection);
      }
    }
    for (const [columnIndex, column] of table.getColumns().entries()) {
      const field = column.getField();
      if (!field) continue;
      const element = column.getElement();
      const coordinate = element.querySelector<HTMLElement>('.tabular-column-coordinate');
      const semantic = element.querySelector<HTMLElement>('.tabular-column-semantic');
      const activeAxis = selection?.kind === 'column' || selection?.kind === 'header'
        ? selection.columnId === field
        : selection?.kind === 'cell' || selection?.kind === 'range'
          ? selection.focus.columnId === field
          : false;
      const selectedHeader = selection?.kind === 'header-row'
        || (selection?.kind === 'header' && selection.columnId === field);
      const selectedColumn = selection?.kind === 'column' && selection.columnId === field;
      element.setAttribute('aria-colindex', String(columnIndex + 2));
      element.setAttribute('aria-selected', String(selectedHeader || selectedColumn));
      coordinate?.classList.toggle('tabular-axis-column-active', activeAxis);
      coordinate?.classList.toggle('tabular-column-selected', selectedColumn);
      semantic?.classList.toggle('tabular-header-cell-active', selectedHeader);
      semantic?.classList.toggle('tabular-column-selected', selectedColumn);
      if (semantic) {
        this.#projectPresentation(semantic, {
          rowId: GRID_HEADER_ROW_ID,
          columnId: field
        }, this.#columns.find((candidate) => candidate.id === field)?.label);
      }
    }
    this.#emit('viewport', {
      renderedRows: container.querySelectorAll('.tabulator-row').length,
      activeRows: this.#activeRowOrder.length
    });
  }

  #issue(point: GridPoint) {
    return this.#issues.get(`${point.rowId}\u0000${point.columnId}`);
  }

  #projectPresentation(element: HTMLElement, point: GridPoint, rawValue?: GridCellValue) {
    element.classList.remove(
      'tabular-presentation-wrap',
      'tabular-presentation-overflow',
      'tabular-presentation-v-top',
      'tabular-presentation-v-middle',
      'tabular-presentation-v-bottom',
      'tabular-presentation-number'
    );
    for (const property of [
      'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration',
      'color', 'background-color', 'background-image', 'background-size',
      'background-position', 'background-repeat', 'text-align', 'justify-content',
      'box-shadow', 'white-space',
      'text-overflow', 'overflow', '--tabular-number-color'
    ]) element.style.removeProperty(property);
    delete element.dataset.presentation;
    delete element.dataset.presentationNumber;
    delete element.dataset.borderStyle;
    delete element.dataset.borderColor;
    element.removeAttribute('aria-label');
    const style = this.#presentation[presentationKey(point)];
    if (!style) return;
    element.dataset.presentation = 'true';
    if (style.fontFamily) element.style.fontFamily = style.fontFamily;
    if (style.fontSize) element.style.fontSize = `${style.fontSize}px`;
    if (typeof style.bold === 'boolean') {
      element.style.fontWeight = style.bold ? '700' : '400';
    }
    if (style.italic) element.style.fontStyle = 'italic';
    if (style.underline) element.style.textDecoration = 'underline';
    if (style.textColor) element.style.color = style.textColor;
    if (style.fillColor) element.style.backgroundColor = style.fillColor;
    if (style.horizontal && style.horizontal !== 'auto') {
      element.style.textAlign = style.horizontal;
      if (element.classList.contains('tabular-column-semantic')) {
        element.style.justifyContent = style.horizontal === 'center'
          ? 'center'
          : style.horizontal === 'right'
            ? 'flex-end'
            : 'flex-start';
      }
    }
    if (style.wrap === 'wrap') element.classList.add('tabular-presentation-wrap');
    if (style.wrap === 'overflow') element.classList.add('tabular-presentation-overflow');
    if (style.vertical) element.classList.add(`tabular-presentation-v-${style.vertical}`);
    const numberOutput = presentationNumberDisplay(rawValue, style.numberFormat);
    if (numberOutput) {
      element.classList.add('tabular-presentation-number');
      element.dataset.presentationNumber = numberOutput;
      element.setAttribute('aria-label', numberOutput);
      element.style.setProperty('--tabular-number-color', style.textColor || 'var(--ink)');
      element.style.color = 'transparent';
    }
    if (style.border && style.border !== 'none') {
      const borderColor = style.borderColor || '#4b5563';
      const borderStyle = style.borderStyle || 'solid';
      element.dataset.borderStyle = borderStyle;
      element.dataset.borderColor = borderColor;
      const background = borderBackgroundLayers(style.border, borderStyle, borderColor);
      element.style.backgroundImage = background.backgroundImage;
      element.style.backgroundSize = background.backgroundSize;
      element.style.backgroundPosition = background.backgroundPosition;
      element.style.backgroundRepeat = background.backgroundRepeat;
    }
  }

  #beginHeaderNameEdit(component: ColumnComponent, column: GridColumn) {
    const host = component.getElement().querySelector<HTMLElement>('.tabular-column-semantic');
    if (!host || host.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'tabular-header-name-input';
    input.type = 'text';
    input.maxLength = 200;
    input.setAttribute('aria-label', `Name column ${column.coordinate}`);
    host.replaceChildren(input);
    let finished = false;
    const close = (commit: boolean) => {
      if (finished) return;
      finished = true;
      const name = input.value.trim();
      if (commit && name) this.#emit('headerName', { columnId: column.id, name });
      else host.textContent = '';
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(false); }
      if (event.key === 'Enter' || event.key === 'Tab') close(true);
    });
    input.addEventListener('blur', () => close(true), { once: true });
    input.addEventListener('dblclick', (event) => event.stopPropagation());
    requestAnimationFrame(() => input.focus());
  }
}
