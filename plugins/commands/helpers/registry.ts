import type { CommandContext, CommandId, CommandMenu, CommandState } from './contracts.js';

const command = (id: CommandId, label: string, shortcut?: string, secondary?: string) => ({
  type: 'command' as const, id, label, ...(shortcut ? { shortcut } : {}), ...(secondary ? { secondary } : {})
});
const separator = { type: 'separator' as const };

export const COMMAND_MENUS: readonly CommandMenu[] = [{
  label: 'File',
  entries: [
    command('file.new', 'New', '⌘N'),
    command('file.open', 'Open'),
    command('file.import', 'Import'),
    command('file.export', 'Export'),
    command('file.copy', 'Make a copy'),
    separator,
    command('view.list', 'Views'),
    command('view.new', 'New view'),
    separator,
    command('file.version-history', 'Version history', undefined, 'Changes'),
    command('file.table-settings', 'Table settings')
  ]
}, {
  label: 'Edit',
  entries: [
    command('history.undo', 'Undo', '⌘Z'),
    command('history.redo', 'Redo', '⇧⌘Z'),
    separator,
    command('edit.cut', 'Cut', '⌘X'),
    command('edit.copy', 'Copy', '⌘C'),
    command('edit.paste', 'Paste', '⌘V'),
    command('edit.clear', 'Clear selected values', 'Delete'),
    separator,
    command('selection.all', 'Select all', '⌘A'),
    command('find', 'Find', '⌘F')
  ]
}, {
  label: 'View',
  entries: [
    { type: 'submenu', label: 'Show', entries: [
      command('view.gridlines', 'Gridlines'),
      command('view.compact', 'Compact controls')
    ] },
    { type: 'submenu', label: 'Freeze', entries: [
      command('view.freeze.rows.none', 'No rows'),
      command('view.freeze.rows.one', '1 row'),
      command('view.freeze.rows.two', '2 rows'),
      command('view.freeze.rows.current', 'Up to current row'),
      separator,
      command('view.freeze.columns.none', 'No columns'),
      command('view.freeze.columns.one', '1 column'),
      command('view.freeze.columns.two', '2 columns'),
      command('view.freeze.columns.current', 'Up to current column')
    ] },
    { type: 'submenu', label: 'Zoom', entries: [50, 75, 90, 100, 125, 150, 200].map((value) => (
      command(`view.zoom.${value}` as CommandId, `${value}%`)
    )) },
    command('view.fullscreen', 'Full screen')
  ]
}, {
  label: 'Format',
  entries: [
    command('format.theme', 'Theme'),
    { type: 'submenu', label: 'Number', entries: [
      command('format.number.auto', 'Automatic'),
      command('format.number.plain', 'Number'),
      command('format.number.currency', 'Number (2 decimals)'),
      command('format.number.percent', 'Percent')
    ] },
    { type: 'submenu', label: 'Text', entries: [
      command('format.bold', 'Bold', '⌘B'),
      command('format.italic', 'Italic', '⌘I'),
      command('format.underline', 'Underline', '⌘U')
    ] },
    { type: 'submenu', label: 'Alignment', entries: [
      command('format.align.left', 'Left'),
      command('format.align.center', 'Center'),
      command('format.align.right', 'Right'),
      separator,
      command('format.vertical.top', 'Top'),
      command('format.vertical.middle', 'Middle'),
      command('format.vertical.bottom', 'Bottom')
    ] },
    { type: 'submenu', label: 'Wrapping', entries: [
      command('format.wrap.wrap', 'Wrap'),
      command('format.wrap.clip', 'Clip'),
      command('format.wrap.overflow', 'Overflow')
    ] },
    command('format.rotation', 'Rotation'),
    command('format.smart-chips', 'Smart chips'),
    { type: 'submenu', label: 'Font size', entries: [10, 12, 14, 16, 18].map((value) => (
      command(`format.size.${value}` as CommandId, String(value))
    )) },
    command('format.merge', 'Merge cells'),
    separator,
    command('format.clear', 'Clear formatting')
  ]
}] as const;

const DEFERRED = new Set<CommandId>([
  'file.copy', 'file.version-history',
  'view.fullscreen', 'format.theme', 'format.rotation', 'format.smart-chips',
  'format.merge', 'row.resize',
  'column.insert-left', 'column.insert-right',
  'column.move-left', 'column.move-right', 'column.resize', 'column.delete'
]);
const FORMATTING = (id: CommandId) => id.startsWith('format.');
const CONFIGURES_SCHEMA = new Set<CommandId>([
  'column.insert-left', 'column.insert-right', 'column.rename', 'column.configure',
  'column.delete', 'relation.configure'
]);
const MUTATES_SELECTED_VALUES = new Set<CommandId>([
  'edit.cut', 'edit.paste', 'edit.cell', 'edit.clear',
  'row.clear', 'column.clear'
]);
const MUTATES_TABLE_ROWS = new Set<CommandId>([
  'row.insert-above', 'row.insert-below', 'row.delete'
]);
const NEEDS_SELECTION = new Set<CommandId>([
  'edit.cut', 'edit.copy', 'edit.paste', 'edit.cell', 'edit.clear', 'row.clear', 'column.clear',
  'column.sort-asc', 'column.sort-desc', 'column.rename', 'column.configure',
  'row.insert-above', 'row.insert-below', 'row.delete', 'relation.configure'
  , 'row.move-up', 'row.move-down'
]);

export function commandState(id: CommandId, context: CommandContext): CommandState {
  if (DEFERRED.has(id)) return { enabled: false, reason: 'Visible for orientation; this behavior is deferred.' };
  if (id === 'history.undo') return context.canUndo && !context.hasDraft
    ? { enabled: true }
    : { enabled: false, reason: context.hasDraft ? 'Correct the retained value first.' : 'Nothing to undo.' };
  if (id === 'history.redo') return context.canRedo && !context.hasDraft
    ? { enabled: true }
    : { enabled: false, reason: context.hasDraft ? 'Correct the retained value first.' : 'Nothing to redo.' };
  if (id === 'file.new' && !context.canCreateFile) return { enabled: false, reason: 'Create-file permission is required.' };
  if (id === 'file.import' && !context.canImportFile) return { enabled: false, reason: 'Import permission is required.' };
  if ((id === 'view.list' || id === 'view.new') && !context.canSaveViews) {
    return { enabled: false, reason: 'Save this PostgreSQL file before using views.' };
  }
  if (id === 'file.table-settings' && !context.canConfigureFile) return { enabled: false, reason: 'Configure-file permission is required.' };
  if (CONFIGURES_SCHEMA.has(id) && !context.canConfigureFile) return { enabled: false, reason: 'Configure-file permission is required.' };
  if (id === 'relation.configure' && !context.relationSelection) return { enabled: false, reason: 'Select a relation column first.' };
  if (FORMATTING(id) && context.selectionKind === 'none') {
    return { enabled: false, reason: 'Select cells first.' };
  }
  if (NEEDS_SELECTION.has(id) && context.selectionKind === 'none') {
    return { enabled: false, reason: 'Select a target first.' };
  }
  if ((id === 'edit.cut' || id === 'edit.paste' || id === 'edit.clear')
    && (
      context.selectionKind === 'row'
      || context.selectionKind === 'header'
      || context.selectionKind === 'column'
    )) {
    return { enabled: false, reason: 'Use the target-specific clear action for a row or column.' };
  }
  if (MUTATES_SELECTED_VALUES.has(id) && (context.readOnly || !context.canMutateSelection)) {
    return {
      enabled: false,
      reason: context.readOnly
        ? 'This PostgreSQL file is read-only.'
        : 'Update permission is required for the selected cells.'
    };
  }
  if (MUTATES_TABLE_ROWS.has(id) && (context.readOnly || !context.canMutateValues)) {
    return {
      enabled: false,
      reason: context.readOnly
        ? 'This PostgreSQL file is read-only.'
        : 'Update permission is required.'
    };
  }
  if ((id === 'row.move-up' || id === 'row.move-down') && !context.canMoveRows) {
    return {
      enabled: false,
      reason: context.rowOrderReason || 'Shared row-order permission is required.'
    };
  }
  if (context.hasDraft && (
    id === 'file.table-settings' || id.startsWith('edit.') || id.startsWith('row.')
    || id.startsWith('column.') || id === 'relation.configure'
  )) {
    return { enabled: false, reason: 'Correct the retained value first.' };
  }
  return { enabled: true };
}

export function shortcutCommand(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return undefined;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'history.redo' as const : 'history.undo' as const;
  if (event.shiftKey) return undefined;
  if (key === 'n') return 'file.new' as const;
  if (key === 'x') return 'edit.cut' as const;
  if (key === 'c') return 'edit.copy' as const;
  if (key === 'v') return 'edit.paste' as const;
  if (key === 'a') return 'selection.all' as const;
  if (key === 'f') return 'find' as const;
  if (key === 'b') return 'format.bold' as const;
  if (key === 'i') return 'format.italic' as const;
  if (key === 'u') return 'format.underline' as const;
  return undefined;
}
