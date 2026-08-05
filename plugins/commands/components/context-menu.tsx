import { useEffect, useRef } from 'react';
import type { CommandContext, CommandId } from '../helpers/contracts.js';
import { commandState } from '../helpers/registry.js';

export type ContextMenuTarget = 'cell' | 'relation' | 'row' | 'header-row' | 'column' | 'explorer';
export type ContextMenuState = { target: ContextMenuTarget; x: number; y: number; trigger?: HTMLElement };

const entries: Record<ContextMenuTarget, Array<CommandId | 'separator'>> = {
  cell: ['edit.cut', 'edit.copy', 'edit.paste', 'separator', 'edit.cell', 'edit.clear', 'row.insert-above', 'row.insert-below'],
  relation: ['edit.cut', 'edit.copy', 'edit.paste', 'separator', 'edit.cell', 'edit.clear', 'relation.configure'],
  row: ['edit.cut', 'edit.copy', 'edit.paste', 'separator', 'row.insert-above', 'row.insert-below', 'row.clear', 'row.move-up', 'row.move-down', 'row.resize', 'separator', 'row.delete'],
  'header-row': ['edit.copy', 'separator', 'format.clear'],
  column: ['edit.cut', 'edit.copy', 'edit.paste', 'separator', 'column.insert-left', 'column.insert-right', 'column.rename', 'column.configure', 'separator', 'column.sort-asc', 'column.sort-desc', 'column.clear', 'column.move-left', 'column.move-right', 'column.resize', 'separator', 'column.delete'],
  explorer: ['file.open', 'separator', 'file.table-settings', 'file.copy']
};

const labels: Partial<Record<CommandId, string>> = {
  'edit.cut': 'Cut', 'edit.copy': 'Copy', 'edit.paste': 'Paste', 'edit.cell': 'Edit cell', 'edit.clear': 'Clear cell',
  'row.insert-above': 'Insert row above', 'row.insert-below': 'Insert row below', 'row.clear': 'Clear row values',
  'row.move-up': 'Move row up', 'row.move-down': 'Move row down', 'row.resize': 'Resize row', 'row.delete': 'Delete row',
  'column.insert-left': 'Insert column left', 'column.insert-right': 'Insert column right', 'column.rename': 'Rename column',
  'column.configure': 'Configure column', 'column.sort-asc': 'Sort ascending', 'column.sort-desc': 'Sort descending',
  'column.clear': 'Clear column values', 'column.move-left': 'Move column left', 'column.move-right': 'Move column right',
  'column.resize': 'Resize column', 'column.delete': 'Delete column', 'relation.configure': 'Configure relation',
  'format.clear': 'Clear header formatting',
  'file.open': 'Open', 'file.table-settings': 'Table settings', 'file.copy': 'Make a copy'
};

export function clampMenuPosition(x: number, y: number, viewportWidth: number, viewportHeight: number) {
  return { x: Math.max(8, Math.min(x, viewportWidth - 250)), y: Math.max(8, Math.min(y, viewportHeight - 430)) };
}

export function CommandContextMenu({
  menu,
  context,
  onCommand,
  onClose
}: {
  menu: ContextMenuState;
  context: CommandContext;
  onCommand: (id: CommandId, trigger: HTMLElement) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const position = clampMenuPosition(menu.x, menu.y, typeof window === 'undefined' ? 1440 : window.innerWidth, viewportHeight);
  useEffect(() => {
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus());
    const down = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, []);
  const onKeyDown = (event: React.KeyboardEvent) => {
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || [])];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index >= 0 && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      buttons[index]?.click();
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); onClose(); requestAnimationFrame(() => menu.trigger?.focus()); }
    if (index >= 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  };
  return <div
    ref={root}
    className="command-context-menu"
    role="menu"
    aria-label={`${menu.target} context menu`}
    style={{ left: position.x, top: position.y, maxHeight: Math.max(120, viewportHeight - position.y - 8) }}
    onKeyDown={onKeyDown}
  >{entries[menu.target].map((id, index) => id === 'separator'
    ? <div role="separator" className="command-menu-separator" key={`separator-${index}`} />
    : (() => {
      const state = commandState(id, context);
      return <button
        type="button"
        role="menuitem"
        key={id}
        data-command={id}
        disabled={!state.enabled}
        aria-disabled={!state.enabled}
        title={state.reason}
        onClick={(event) => { onCommand(id, event.currentTarget); onClose(); }}
      >{labels[id] || id}</button>;
    })()
  )}</div>;
}
