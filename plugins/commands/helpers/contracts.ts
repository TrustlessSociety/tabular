//client
import type { GridCellPresentation } from '../../grid/helpers/contracts.js';

//The command id contract exported for module callers
export type CommandId =
  | 'file.new' | 'file.open' | 'file.import' | 'file.export' | 'file.copy'
  | 'view.list' | 'view.new' | 'file.version-history' | 'file.table-settings'
  | 'history.undo' | 'history.redo' | 'edit.cut' | 'edit.copy' | 'edit.paste'
  | 'edit.cell' | 'edit.clear' | 'selection.all' | 'find'
  | 'view.gridlines' | 'view.compact' | 'view.freeze.rows.none' | 'view.freeze.rows.one'
  | 'view.freeze.rows.two' | 'view.freeze.rows.current' | 'view.freeze.columns.none'
  | 'view.freeze.columns.one' | 'view.freeze.columns.two' | 'view.freeze.columns.current'
  | 'view.zoom.50' | 'view.zoom.75' | 'view.zoom.90' | 'view.zoom.100'
  | 'view.zoom.125' | 'view.zoom.150' | 'view.zoom.200' | 'view.fullscreen'
  | 'format.theme' | 'format.number.auto' | 'format.number.plain' | 'format.number.currency'
  | 'format.number.percent' | 'format.bold' | 'format.italic' | 'format.underline'
  | 'format.font.arial' | 'format.font.georgia' | 'format.font.mono'
  | 'format.size.10' | 'format.size.12' | 'format.size.14' | 'format.size.16'
  | 'format.size.18' | 'format.text.reset' | 'format.text.black' | 'format.text.blue' | 'format.text.red'
  | 'format.fill.reset' | 'format.fill.gray' | 'format.fill.blue' | 'format.fill.yellow'
  | `format.text.color.${string}` | `format.fill.color.${string}`
  | 'format.border.all' | 'format.border.inner' | 'format.border.horizontal'
  | 'format.border.vertical' | 'format.border.outer' | 'format.border.left'
  | 'format.border.top' | 'format.border.right' | 'format.border.bottom'
  | 'format.border.none' | `format.border.color.${string}`
  | 'format.border.style.solid' | 'format.border.style.medium' | 'format.border.style.thick'
  | 'format.border.style.dashed' | 'format.border.style.dotted' | 'format.border.style.double'
  | 'format.align.left' | 'format.align.center'
  | 'format.align.right' | 'format.vertical.top' | 'format.vertical.middle'
  | 'format.vertical.bottom' | 'format.wrap.wrap' | 'format.wrap.clip'
  | 'format.wrap.overflow' | 'format.rotation' | 'format.smart-chips'
  | 'format.merge' | 'format.clear'
  | 'row.insert-above' | 'row.insert-below' | 'row.clear' | 'row.move-up'
  | 'row.move-down' | 'row.resize' | 'row.delete'
  | 'column.insert-left' | 'column.insert-right' | 'column.rename'
  | 'column.configure' | 'column.sort-asc' | 'column.sort-desc'
  | 'column.clear' | 'column.move-left' | 'column.move-right'
  | 'column.resize' | 'column.delete' | 'relation.configure';

//The command context contract exported for module callers
export type CommandContext = {
  selectionKind: 'none' | 'cell' | 'range' | 'row' | 'header-row' | 'header' | 'column',
  canUndo: boolean,
  canRedo: boolean,
  hasDraft: boolean,
  readOnly: boolean,
  canMutateValues: boolean,
  canMutateSelection: boolean,
  canCreateFile: boolean,
  canImportFile: boolean,
  canConfigureFile: boolean,
  canSaveViews?: boolean,
  canMoveRows?: boolean,
  canMoveRowUp?: boolean,
  canMoveRowDown?: boolean,
  rowMoveUpReason?: string,
  rowMoveDownReason?: string,
  rowOrderReason?: string,
  canDeleteColumn?: boolean,
  columnDeleteReason?: string,
  canSortSelection?: boolean,
  sortReason?: string,
  relationSelection: boolean,
  currentRowLabel?: string,
  currentColumnLabel?: string,
};

//The command state contract exported for module callers
export type CommandState = {
  enabled: boolean,
  checked?: boolean,
  mixed?: boolean,
  reason?: string,
};

//The command menu entry contract exported for module callers
export type CommandMenuEntry =
  | { type: 'separator', }
  | { type: 'command', id: CommandId, label: string, shortcut?: string, secondary?: string, }
  | { type: 'submenu', label: string, entries: CommandMenuEntry[], };

//The command menu contract exported for module callers
export type CommandMenu = {
  label: 'File' | 'Edit' | 'View' | 'Format',
  entries: CommandMenuEntry[],
};

//The presentation patch contract exported for module callers
export type PresentationPatch = {
  [Property in keyof GridCellPresentation]?: GridCellPresentation[Property] | null;
};

//The presentation history frame contract exported for module callers
export type PresentationHistoryFrame = {
  kind: 'presentation',
  label: string,
  before: Record<string, GridCellPresentation>,
  after: Record<string, GridCellPresentation>,
};
