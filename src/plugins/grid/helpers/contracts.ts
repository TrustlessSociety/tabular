//client
import type { CanonicalJsonValue } from '../../capability/helpers/value-contracts.js';
import type {
  FileFieldKind,
  FileFormatKind,
  FileStorageType,
  ValidatorConfig
} from '../../files/helpers/contracts.js';

//The grid cell value contract exported for module callers
export type GridCellValue = string | number | boolean | CanonicalJsonValue | null;

//The grid row contract exported for module callers
export type GridRow = {
  id: string,
  [columnId: string]: GridCellValue,
};

//The grid column kind contract exported for module callers
export type GridColumnKind =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'email'
  | 'url'
  | 'phone'
  | 'price'
  | 'switch'
  | 'boolean'
  | 'select'
  | 'relation'
  | 'json';

//The grid column option contract exported for module callers
export type GridColumnOption = {
  value: string,
  label: string,
  outputLabel?: string,
  restricted?: string,
  patch?: Record<string, GridCellValue>,
};

//The grid column contract exported for module callers
export type GridColumn = {
  id: string,
  coordinate: string,
  label: string,
  kind?: GridColumnKind,
  width?: number,
  minimumWidth?: number,
  editable?: boolean,
  align?: 'left' | 'center' | 'right',
  storageCodec?: 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'time' | 'timestamp' | 'json',
  storageType?: FileStorageType,
  field?: FileFieldKind,
  format?: FileFormatKind,
  fieldConfig?: Record<string, unknown>,
  formatConfig?: Record<string, unknown>,
  validatorConfig?: ValidatorConfig,
  metadataVersion?: number,
  physicalName?: string,
  required?: boolean,
  unique?: boolean,
  generated?: boolean,
  key?: boolean,
  defaultValue?: GridCellValue,
  serverDefault?: boolean,
  options?: GridColumnOption[],
  optionLookup?: (query: string) => Promise<GridColumnOption[]>,
  relation?: {
    sourceColumnIds: string[],
    targetFileId: string,
    targetLabel: string,
    targetColumnIds: string[],
    pickerTemplate: string,
    outputTemplate: string,
  },
};

//The grid resource contract exported for module callers
export type GridResource = {
  fileId: string,
  schemaVersion: string,
  rows: GridRow[],
  columns: GridColumn[],
  versions: Record<string, string>,
  rowRanks?: Record<string, string>,
  drafts: import('../../capability/helpers/action-contracts.js').SafeDraft[],
  cursor: number,
  rowOrderVersion?: number,
  truncated?: boolean,
  view?: {
    id: string,
    version: number,
    definition: import('../../saved-views/helpers/contracts.js').SavedViewDefinition,
  },
};

//The grid relation lookup input contract exported for module callers
export type GridRelationLookupInput = {
  fileId: string,
  columnId: string,
  query: string,
  limit: number,
  selectedKeys?: GridCellValue[][],
};

//The grid relation lookup result contract exported for module callers
export type GridRelationLookupResult = {
  sourceColumnIds: string[],
  targetFileId: string,
  targetColumnIds: string[],
  options: NonNullable<GridColumn['options']>,
};

//The grid cell issue contract exported for module callers
export type GridCellIssue = {
  rowId: string,
  columnId: string,
  token: '#VALUE!' | '#ERROR!',
  message: string,
  showCellToken?: boolean,
};

//The grid cell presentation contract exported for module callers
export type GridCellPresentation = {
  fontFamily?: 'Arial' | 'Georgia' | 'Courier New',
  fontSize?: 10 | 12 | 14 | 16 | 18,
  bold?: boolean,
  italic?: boolean,
  underline?: boolean,
  textColor?: string,
  fillColor?: string,
  horizontal?: 'auto' | 'left' | 'center' | 'right',
  vertical?: 'top' | 'middle' | 'bottom',
  wrap?: 'wrap' | 'clip' | 'overflow',
  border?: 'none' | 'all' | 'inner' | 'horizontal' | 'vertical' | 'outer'
    | 'left' | 'top' | 'right' | 'bottom',
  borderColor?: string,
  borderStyle?: 'solid' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double',
  numberFormat?: 'automatic' | 'number' | 'currency' | 'percent',
};

//The grid point contract exported for module callers
export type GridPoint = {
  rowId: string,
  columnId: string,
};

//Header presentation uses a stable non-record identity so the same formatting
//map can serve body cells, saved views, and the named spreadsheet header row.
export const GRID_HEADER_ROW_ID = '__tabular_header__';

//The logical grid selection contract exported for module callers
export type LogicalGridSelection =
  | { kind: 'cell', anchor: GridPoint, focus: GridPoint, }
  | { kind: 'range', anchor: GridPoint, focus: GridPoint, }
  | { kind: 'row', rowId: string, }
  | { kind: 'header-row', }
  | { kind: 'header', columnId: string, }
  | { kind: 'column', columnId: string, };

//The grid selection coverage contract exported for module callers
export type GridSelectionCoverage = {
  activeCell: boolean,
  activeRow: boolean,
  activeColumn: boolean,
  inRange: boolean,
};

//The grid sort contract exported for module callers
export type GridSort = {
  columnId: string,
  direction: 'asc' | 'desc',
};

//The grid filter contract exported for module callers
export type GridFilter = {
  columnId: string,
  operation: '=' | '!=' | 'like' | '<' | '<=' | '>' | '>=',
  value: GridCellValue,
};

//The grid navigation direction contract exported for module callers
export type GridNavigationDirection = 'up' | 'down' | 'left' | 'right' | 'next' | 'previous';

//The grid adapter event map contract exported for module callers
export type GridAdapterEventMap = {
  ready: { rowCount: number, columnCount: number, },
  edit: { point: GridPoint, value: GridCellValue, previous: GridCellValue, },
  columnActivate: { columnId: string, },
  headerName: { columnId: string, name: string, },
  selection: { selection: LogicalGridSelection | null, },
  viewport: { renderedRows: number, activeRows: number, },
  error: { error: Error, },
  rowMove: { rowId: string, beforeRowId?: string, afterRowId?: string, },
  columnMove: { columnIds: string[], },
};

//The grid adapter event contract exported for module callers
export type GridAdapterEvent = keyof GridAdapterEventMap;

//The grid adapter config contract exported for module callers
export type GridAdapterConfig = {
  rows: GridRow[],
  columns: GridColumn[],
  height?: number | string,
  initialSelection?: LogicalGridSelection,
  presentation?: Record<string, GridCellPresentation>,
  canMoveRows?: boolean,
  canMoveColumns?: boolean,
};

//The grid adapter contract exported for module callers
export interface GridAdapter {
  mount(container: HTMLElement, config: GridAdapterConfig): Promise<void>;
  replaceRows(rows: GridRow[]): Promise<void>;
  replaceColumns(columns: GridColumn[]): void;
  updateRows(rows: GridRow[]): Promise<void>;
  setSort(sort: GridSort[]): void;
  setFilter(filters: GridFilter[]): void;
  setHeight(height: number | string): void;
  setColumnWidth(columnId: string, width: number): void;
  setIssues(issues: GridCellIssue[]): void;
  setPresentation(presentation: Record<string, GridCellPresentation>): void;
  select(selection: LogicalGridSelection): void;
  navigate(direction: GridNavigationDirection, extend?: boolean): boolean;
  editActive(initialValue?: string): boolean;
  focusActive(): boolean;
  selection(): LogicalGridSelection | null;
  on<Event extends GridAdapterEvent>(
    event: Event,
    listener: (payload: GridAdapterEventMap[Event]) => void
  ): () => void;
  destroy(): void;
}
