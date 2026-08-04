export type GridCellValue = string | number | boolean | null;

export type GridRow = {
  id: string;
  [columnId: string]: GridCellValue;
};

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

export type GridColumnOption = {
  value: string;
  label: string;
  outputLabel?: string;
  restricted?: string;
  patch?: Record<string, GridCellValue>;
};

export type GridColumn = {
  id: string;
  coordinate: string;
  label: string;
  kind?: GridColumnKind;
  width?: number;
  minimumWidth?: number;
  editable?: boolean;
  align?: 'left' | 'center' | 'right';
  storageCodec?: 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'time' | 'timestamp' | 'json';
  field?: string;
  format?: string;
  physicalName?: string;
  required?: boolean;
  unique?: boolean;
  generated?: boolean;
  key?: boolean;
  defaultValue?: GridCellValue;
  serverDefault?: boolean;
  options?: GridColumnOption[];
  optionLookup?: (query: string) => Promise<GridColumnOption[]>;
  relation?: {
    sourceColumnIds: string[];
    targetFileId: string;
    targetLabel: string;
    targetColumnIds: string[];
    pickerTemplate: string;
    outputTemplate: string;
  };
};

export type GridResource = {
  fileId: string;
  schemaVersion: string;
  rows: GridRow[];
  columns: GridColumn[];
  versions: Record<string, string>;
  rowRanks?: Record<string, string>;
  drafts: import('../../capability/helpers/action-contracts.js').SafeDraft[];
  cursor: number;
  rowOrderVersion?: number;
  truncated?: boolean;
  view?: {
    id: string;
    version: number;
    definition: import('../../saved-views/helpers/contracts.js').SavedViewDefinition;
  };
};

export type GridRelationLookupInput = {
  fileId: string;
  columnId: string;
  query: string;
  limit: number;
  selectedKeys?: GridCellValue[][];
};

export type GridRelationLookupResult = {
  sourceColumnIds: string[];
  targetFileId: string;
  targetColumnIds: string[];
  options: NonNullable<GridColumn['options']>;
};

export type GridCellIssue = {
  rowId: string;
  columnId: string;
  token: '#VALUE!' | '#ERROR!';
  message: string;
  showCellToken?: boolean;
};

export type GridCellPresentation = {
  fontFamily?: 'Arial' | 'Georgia' | 'Courier New';
  fontSize?: 10 | 12 | 14 | 16 | 18;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: string;
  fillColor?: string;
  horizontal?: 'auto' | 'left' | 'center' | 'right';
  vertical?: 'top' | 'middle' | 'bottom';
  wrap?: 'wrap' | 'clip' | 'overflow';
  border?: 'none' | 'all' | 'inner' | 'horizontal' | 'vertical' | 'outer'
    | 'left' | 'top' | 'right' | 'bottom';
  borderColor?: string;
  borderStyle?: 'solid' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double';
  numberFormat?: 'automatic' | 'number' | 'currency' | 'percent';
};

export type GridPoint = {
  rowId: string;
  columnId: string;
};

//Header presentation uses a stable non-record identity so the same formatting
//map can serve body cells, saved views, and the named spreadsheet header row.
export const GRID_HEADER_ROW_ID = '__tabular_header__';

export type LogicalGridSelection =
  | { kind: 'cell'; anchor: GridPoint; focus: GridPoint }
  | { kind: 'range'; anchor: GridPoint; focus: GridPoint }
  | { kind: 'row'; rowId: string }
  | { kind: 'header'; columnId: string }
  | { kind: 'column'; columnId: string };

export type GridSelectionCoverage = {
  activeCell: boolean;
  activeRow: boolean;
  activeColumn: boolean;
  inRange: boolean;
};

export type GridSort = {
  columnId: string;
  direction: 'asc' | 'desc';
};

export type GridFilter = {
  columnId: string;
  operation: '=' | '!=' | 'like' | '<' | '<=' | '>' | '>=';
  value: GridCellValue;
};

export type GridNavigationDirection = 'up' | 'down' | 'left' | 'right' | 'next' | 'previous';

export type GridAdapterEventMap = {
  ready: { rowCount: number; columnCount: number };
  edit: { point: GridPoint; value: GridCellValue; previous: GridCellValue };
  columnActivate: { columnId: string };
  headerName: { columnId: string; name: string };
  selection: { selection: LogicalGridSelection | null };
  viewport: { renderedRows: number; activeRows: number };
  error: { error: Error };
  rowMove: { rowId: string; beforeRowId?: string; afterRowId?: string };
  columnMove: { columnIds: string[] };
};

export type GridAdapterEvent = keyof GridAdapterEventMap;

export type GridAdapterConfig = {
  rows: GridRow[];
  columns: GridColumn[];
  height?: number | string;
  initialSelection?: LogicalGridSelection;
  presentation?: Record<string, GridCellPresentation>;
  canMoveRows?: boolean;
  canMoveColumns?: boolean;
};

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
  selection(): LogicalGridSelection | null;
  on<Event extends GridAdapterEvent>(
    event: Event,
    listener: (payload: GridAdapterEventMap[Event]) => void
  ): () => void;
  destroy(): void;
}
