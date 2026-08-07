//modules
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

//client
import type { IconName } from '../../app/components/icon.js';
import type {
  CommandContext,
  CommandId,
  CommandMenuEntry,
  CommandState
} from '../helpers/contracts.js';
import { Icon } from '../../app/components/icon.js';
import { COMMAND_MENUS, commandState } from '../helpers/registry.js';

//The presentation toolbar state contract exported for module callers
export type PresentationToolbarState = {
  fontFamily: string | 'mixed',
  fontSize: number | 'mixed',
  bold: boolean | 'mixed',
  italic: boolean | 'mixed',
  underline: boolean | 'mixed',
  textColor: string | 'mixed',
  fillColor: string | 'mixed',
  horizontal: string | 'mixed',
  vertical: string | 'mixed',
  wrap: string | 'mixed',
  border: string | 'mixed',
  borderColor: string | 'mixed',
  borderStyle: string | 'mixed',
  numberFormat: string | 'mixed',
};

//The command surface props contract exported for module callers
export type CommandSurfaceProps = {
  context: CommandContext,
  presentation: PresentationToolbarState,
  stateFor?: (id: CommandId, base: CommandState) => CommandState,
  onCommand: (id: CommandId, trigger: HTMLElement) => void,
};

/**
 * Return the state for command result.
 */
function stateForCommand(
  id: CommandId,
  context: CommandContext,
  stateFor?: CommandSurfaceProps['stateFor']
) {
  const base = commandState(id, context);
  return stateFor?.(id, base) || base;
}

/**
 * Render the spreadsheet menu bar component.
 */
export function SpreadsheetMenuBar({ context, stateFor, onCommand }: Omit<CommandSurfaceProps, 'presentation'>) {
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(null);
  const [submenu, setSubmenu] = useState<string>();
  const [activeTrigger, setActiveTrigger] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);

  /**
   * Return the focus trigger result.
   */
  const focusTrigger = (index: number) => requestAnimationFrame(() => triggers.current[index]?.focus());
  /**
   * Return the owned items result.
   */
  const ownedItems = (menu: HTMLElement | null | undefined) => menu
    ? [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])')]
      .filter((item) => item.closest('[role="menu"]') === menu)
    : [];
  /**
   * Return the focus first result.
   */
  const focusFirst = (selector: string, edge: 'first' | 'last' = 'first') => requestAnimationFrame(() => {
    const menu = root.current?.querySelector<HTMLElement>(selector);
    const items = ownedItems(menu);
    items[edge === 'first' ? 0 : items.length - 1]?.focus();
  });
  /**
   * Open the menu.
   */
  const openMenu = (index: number, edge: 'first' | 'last' = 'first') => {
    setActiveTrigger(index);
    setSubmenu(undefined);
    setOpen(index);
    focusFirst(`.command-menu[data-menu-index="${index}"]`, edge);
  };
  /**
   * Close the current value.
   */
  const close = (restore = true) => {
    const current = open;
    setOpen(null);
    setSubmenu(undefined);
    if (restore && current !== null) focusTrigger(current);
  };

  useEffect(() => {
    if (open === null) return;
    /**
     * Return the outside result.
     */
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  /**
   * Handle the keys.
   */
  const handleKeys = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLButtonElement;
    const group = target.closest<HTMLElement>('[data-menu-index]');
    const index = Number(group?.dataset.menuIndex ?? -1);
    if (index < 0) return;
    const trigger = target.classList.contains('command-menu-trigger');
    if (event.key === 'Escape') {
      event.preventDefault();
      const currentSubmenu = target.closest<HTMLElement>('.command-submenu');
      if (currentSubmenu) {
        const submenuKey = currentSubmenu.dataset.submenu;
        setSubmenu(undefined);
        requestAnimationFrame(() => group?.querySelector<HTMLButtonElement>(`.command-submenu-trigger[data-submenu="${submenuKey}"]`)?.focus());
      } else close();
      return;
    }
    if (trigger) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openMenu(index, event.key === 'ArrowUp' ? 'last' : 'first');
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + COMMAND_MENUS.length) % COMMAND_MENUS.length;
        if (open === null) { setActiveTrigger(next); focusTrigger(next); } else openMenu(next);
      }
      return;
    }
    const menu = target.closest<HTMLElement>('[role="menu"]');
    const items = ownedItems(menu);
    const itemIndex = items.indexOf(target);
    if (itemIndex >= 0 && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (itemIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (target.classList.contains('command-submenu-trigger') && event.key === 'ArrowRight') {
      event.preventDefault();
      const label = target.dataset.submenu!;
      setSubmenu(label);
      focusFirst(`.command-submenu[data-submenu="${label}"]`);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const currentSubmenu = target.closest<HTMLElement>('.command-submenu');
      if (currentSubmenu) {
        const submenuKey = currentSubmenu.dataset.submenu;
        setSubmenu(undefined);
        requestAnimationFrame(() => group?.querySelector<HTMLButtonElement>(`.command-submenu-trigger[data-submenu="${submenuKey}"]`)?.focus());
      }
      else openMenu((index - 1 + COMMAND_MENUS.length) % COMMAND_MENUS.length);
    } else if (event.key === 'ArrowRight' && !target.closest('.command-submenu')) {
      event.preventDefault();
      openMenu((index + 1) % COMMAND_MENUS.length);
    } else if (event.key === 'Tab') close(false);
  };

  /**
   * Render the entries.
   */
  const renderEntries = (entries: readonly CommandMenuEntry[], menuIndex: number) => entries.map((entry, itemIndex) => {
    if (entry.type === 'separator') return <div className="command-menu-separator" role="separator" key={`separator-${itemIndex}`} />;
    if (entry.type === 'submenu') {
      const key = `${menuIndex}-${entry.label}`;
      const expanded = submenu === key;
      return <div className="command-submenu-group" key={key}>
        <button
          type="button"
          role="menuitem"
          className="command-submenu-trigger"
          data-submenu={key}
          aria-haspopup="menu"
          aria-expanded={expanded}
          onPointerEnter={() => setSubmenu(key)}
          onClick={() => setSubmenu(expanded ? undefined : key)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            setSubmenu(expanded ? undefined : key);
          }}
        ><span>{entry.label}</span><Icon name="chevron-right" /></button>
        {expanded && <div className="command-submenu" data-submenu={key} role="menu" aria-label={`${entry.label} submenu`}>
          {renderEntries(entry.entries, menuIndex)}
        </div>}
      </div>;
    }
    const state = stateForCommand(entry.id, context, stateFor);
    const label = entry.id === 'view.freeze.rows.current'
      ? `Up to row ${context.currentRowLabel || 'current'}`
      : entry.id === 'view.freeze.columns.current'
        ? `Up to column ${context.currentColumnLabel || 'current'}`
        : entry.label;
    const checkable = typeof state.checked === 'boolean' || state.mixed === true;
    return <button
      type="button"
      role={checkable ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={checkable ? state.mixed ? 'mixed' : Boolean(state.checked) : undefined}
      disabled={!state.enabled}
      aria-disabled={!state.enabled}
      title={state.reason}
      key={entry.id}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.currentTarget.click();
      }}
      onClick={(event) => {
        if (!state.enabled) return;
        onCommand(entry.id, triggers.current[menuIndex] || event.currentTarget);
        close();
      }}
    >
      <span className="command-check" aria-hidden="true">
        {state.mixed ? <Icon name="mixed" /> : state.checked ? <Icon name="check" /> : null}
      </span>
      <span className="command-label">{label}{entry.secondary && <small>{entry.secondary}</small>}</span>
      {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
    </button>;
  });

  return (
    <div ref={root} className="command-menubar" role="menubar" aria-label="Spreadsheet menus" onKeyDown={handleKeys}>
      {COMMAND_MENUS.map((menu, index) => {
        const expanded = open === index;
        return <div className="command-menu-group" data-menu-index={index} key={menu.label}>
          <button
            ref={(node) => { triggers.current[index] = node; }}
            className="command-menu-trigger"
            type="button"
            role="menuitem"
            tabIndex={activeTrigger === index ? 0 : -1}
            aria-haspopup="menu"
            aria-expanded={expanded}
            aria-controls={`${baseId}-${index}`}
            onFocus={() => setActiveTrigger(index)}
            onClick={() => expanded ? close(false) : openMenu(index)}
          >{menu.label}</button>
          {expanded && <div id={`${baseId}-${index}`} className="command-menu" data-menu-index={index} role="menu" aria-label={`${menu.label} menu`}>
            {renderEntries(menu.entries, index)}
          </div>}
        </div>;
      })}
    </div>
  );
}

type ToolPopover = 'text' | 'fill' | 'border' | 'horizontal' | 'vertical' | 'wrap' | 'more';

//The border placement contract exported for module callers
export type BorderPlacement =
  | 'all'
  | 'inner'
  | 'horizontal'
  | 'vertical'
  | 'outer'
  | 'left'
  | 'top'
  | 'right'
  | 'bottom'
  | 'none';

//The color palette kind contract exported for module callers
export type ColorPaletteKind = 'text' | 'fill' | 'border';

//The color palette rows value exported for module callers
export const COLOR_PALETTE_ROWS = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130']
] as const;

//The standard color palette value exported for module callers
export const STANDARD_COLOR_PALETTE = [
  '#000000', '#ffffff', '#4285f4', '#ea4335',
  '#fbbc04', '#34a853', '#fa6d03', '#46bdc6'
] as const;

const BORDER_CHOICES = [
  ['format.border.all', 'All borders', 'all'], ['format.border.inner', 'Inner borders', 'inner'],
  ['format.border.horizontal', 'Horizontal borders', 'horizontal'], ['format.border.vertical', 'Vertical borders', 'vertical'],
  ['format.border.outer', 'Outer borders', 'outer'], ['format.border.left', 'Left border', 'left'],
  ['format.border.top', 'Top border', 'top'], ['format.border.right', 'Right border', 'right'],
  ['format.border.bottom', 'Bottom border', 'bottom'], ['format.border.none', 'No borders', 'none']
] as Array<[CommandId, string, BorderPlacement]>;

/**
 * Return the color command result.
 */
function colorCommand(kind: ColorPaletteKind, color: string): CommandId {
  return `format.${kind === 'fill' ? 'fill' : kind}.color.${color.slice(1).toLowerCase()}` as CommandId;
}

/**
 * Return the color reset command result.
 */
function colorResetCommand(kind: ColorPaletteKind): CommandId {
  if (kind === 'text') return 'format.text.reset';
  if (kind === 'fill') return 'format.fill.reset';
  return 'format.border.color.4b5563';
}

/**
 * Return the color kind label result.
 */
function colorKindLabel(kind: ColorPaletteKind) {
  return kind === 'text' ? 'text' : kind === 'fill' ? 'background' : 'border';
}

type ColorPaletteProps = {
  kind: ColorPaletteKind,
  current: string | 'mixed',
  customColors: readonly string[],
  selectedFor: (id: CommandId) => boolean | 'mixed',
  onCommand: (id: CommandId, trigger: HTMLElement) => void,
  onCustomColor: (kind: ColorPaletteKind, color: string, trigger: HTMLElement) => void,
};

/**
 * Adds one normalized custom color to the current page session without duplicates.
 */
export function addSessionCustomColor(colors: readonly string[], color: string) {
  const normalized = color.trim().toLowerCase();
  return colors.includes(normalized) ? [...colors] : [...colors, normalized];
}

/**
 * Keeps the supplied main and Standard color order identical across all three surfaces.
 */
export function ColorPalette({
  kind,
  current,
  customColors,
  selectedFor,
  onCommand,
  onCustomColor
}: ColorPaletteProps) {
  const label = colorKindLabel(kind);
  const reset = colorResetCommand(kind);
  const customValue = current === 'mixed' || current === 'transparent'
    ? kind === 'border' ? '#4b5563' : '#ffffff'
    : current;
  /**
   * Return the swatch result.
   */
  const swatch = (color: string, group: 'main' | 'standard' | 'custom', index: number) => {
    const id = colorCommand(kind, color);
    const selected = selectedFor(id);
    return <button
      className="color-swatch"
      key={`${group}-${color}`}
      type="button"
      aria-label={`Set ${label} color to ${color.toUpperCase()}`}
      title={color.toUpperCase()}
      aria-pressed={selected}
      data-palette-group={group}
      data-palette-index={index}
      style={{ '--swatch': color } as CSSProperties}
      onClick={(event) => onCommand(id, event.currentTarget)}
    ><span aria-hidden="true" />{selected === true && <Icon className="color-swatch-check" name="check" />}</button>;
  };

  return (
    <div className="color-palette" aria-label={`${label} color palette`}>
      <button
        className="color-reset-button"
        type="button"
        aria-pressed={selectedFor(reset)}
        onClick={(event) => onCommand(reset, event.currentTarget)}
      >Reset</button>
      <div className="color-swatch-grid color-swatch-grid-main">
        {COLOR_PALETTE_ROWS.flat().map((color, index) => swatch(color, 'main', index))}
      </div>
      <span className="palette-label">Standard</span>
      <div className="color-swatch-grid color-swatch-grid-standard">
        {STANDARD_COLOR_PALETTE.map((color, index) => swatch(color, 'standard', index))}
      </div>
      <div className="color-palette-custom">
        <span className="palette-label">Custom</span>
        <div className="custom-color-row">
          <label className="custom-color-control" title={`Choose custom ${label} color`}>
            <Icon name="plus" />
            <span className="sr-only">Custom {label} color</span>
            <input
              type="color"
              aria-label={`Custom ${label} color`}
              value={customValue}
              onInput={(event) => onCustomColor(kind, event.currentTarget.value, event.currentTarget)}
            />
          </label>
          {customColors.map((color, index) => swatch(color, 'custom', index))}
        </div>
      </div>
    </div>
  );
}

type BorderFormattingAccordionProps = {
  presentation: PresentationToolbarState,
  customColors: readonly string[],
  selectedFor: (id: CommandId) => boolean | 'mixed',
  onCommand: (id: CommandId, trigger: HTMLElement) => void,
  onCustomColor: ColorPaletteProps['onCustomColor'],
};

/**
 * Keeps exactly one Border section open, with placement visible on first open.
 */
export function BorderFormattingAccordion({
  presentation,
  customColors,
  selectedFor,
  onCommand,
  onCustomColor
}: BorderFormattingAccordionProps) {
  const baseId = useId();
  const [active, setActive] = useState<'visible' | 'color' | 'style'>('visible');
  /**
   * Return the section result.
   */
  const section = (
    id: 'visible' | 'color' | 'style',
    label: string,
    content: ReactNode
  ) => {
    const expanded = active === id;
    const triggerId = `${baseId}-${id}-trigger`;
    const panelId = `${baseId}-${id}-panel`;
    return <div className="border-accordion-section" key={id}>
      <button
        id={triggerId}
        className="border-accordion-trigger"
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setActive(id)}
      ><span>{label}</span><Icon name={expanded ? 'chevron-down' : 'chevron-right'} /></button>
      {expanded && <div
        id={panelId}
        className="border-accordion-panel"
        role="region"
        aria-labelledby={triggerId}
      >{content}</div>}
    </div>;
  };

  const visible = <div className="command-choice-grid command-border-grid">{BORDER_CHOICES.map(([id, label, placement]) => <button
    key={id} type="button" aria-label={label} title={label} aria-pressed={selectedFor(id)}
    onClick={(event) => onCommand(id, event.currentTarget)}
  ><BorderGlyph placement={placement} /></button>)}</div>;
  const color = <>
    {presentation.borderColor === 'mixed' && <span className="mixed-value-note">Mixed border colors</span>}
    <ColorPalette
      kind="border"
      current={presentation.borderColor}
      customColors={customColors}
      selectedFor={selectedFor}
      onCommand={onCommand}
      onCustomColor={onCustomColor}
    />
  </>;
  const style = <div className="border-style-grid">{(['solid', 'medium', 'thick', 'dashed', 'dotted', 'double'] as const).map((lineStyle) => {
    const id = `format.border.style.${lineStyle}` as CommandId;
    return <button key={lineStyle} type="button" aria-label={`${lineStyle} border`} title={`${lineStyle} border`}
      aria-pressed={selectedFor(id)} onClick={(event) => onCommand(id, event.currentTarget)}>
      <span className={`border-style-sample border-style-${lineStyle}`} aria-hidden="true" />
    </button>;
  })}</div>;

  return (
    <div className="border-accordion" aria-label="Border formatting">
      {section('visible', 'Border visible', visible)}
      {section('color', 'Border color', color)}
      {section('style', 'Border style', style)}
    </div>
  );
}

/**
 * Return the anchored popover left result.
 */
export function anchoredPopoverLeft(
  triggerLeft: number,
  positionOriginLeft: number,
  popoverWidth: number,
  viewportWidth: number,
  gutter = 8
) {
  const minimum = gutter - positionOriginLeft;
  const maximum = Math.max(
    minimum,
    viewportWidth - gutter - positionOriginLeft - popoverWidth
  );
  return Math.max(minimum, Math.min(triggerLeft - positionOriginLeft, maximum));
}

const BORDER_PATHS: Record<BorderPlacement, string[]> = {
  all: ['M2 2H18V18H2Z', 'M10 2V18', 'M2 10H18'],
  inner: ['M10 2V18', 'M2 10H18'],
  horizontal: ['M2 10H18'],
  vertical: ['M10 2V18'],
  outer: ['M2 2H18V18H2Z'],
  left: ['M2 2V18'],
  top: ['M2 2H18'],
  right: ['M18 2V18'],
  bottom: ['M2 18H18'],
  none: []
};

/**
 * Renders one exact dotted-guide and solid-edge border placement sample.
 */
export function BorderGlyph({ placement }: { placement: BorderPlacement, }) {
  return (
    <svg className="border-placement-glyph" viewBox="0 0 20 20" aria-hidden="true">
      <path className="border-guide" d="M2 2H18V18H2ZM10 2V18M2 10H18" />
      {BORDER_PATHS[placement]?.map((path) => <path className="border-selected" d={path} key={path} />)}
    </svg>
  );
}

/**
 * Combines one formatting icon with the effective color rail beneath it.
 */
function ColorToolGlyph({ name, color }: {
  name: 'text' | 'paint-bucket',
  color: string | 'mixed',
}) {
  const effectiveColor = color === 'mixed' ? '#64748b' : color;
  return (
    <span
      className="command-color-tool"
      data-mixed={color === 'mixed'}
      style={{ '--tool-color': effectiveColor } as CSSProperties}
    >
      <Icon name={name} />
      <i />
    </span>
  );
}

/**
 * Render the formatting toolbar component.
 */
export function FormattingToolbar({ context, presentation, stateFor, onCommand }: CommandSurfaceProps) {
  const [open, setOpen] = useState<ToolPopover>();
  const [popoverLeft, setPopoverLeft] = useState(8);
  const [customColors, setCustomColors] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | undefined>(undefined);
  /**
   * Return the invoke result.
   */
  const invoke = (id: CommandId, element: HTMLElement) => {
    if (!stateForCommand(id, context, stateFor).enabled) return;
    const restore = open ? trigger.current : undefined;
    onCommand(id, element);
    setOpen(undefined);
    if (restore) requestAnimationFrame(() => restore.focus());
  };
  /**
   * Return the choose custom color result.
   */
  const chooseCustomColor: ColorPaletteProps['onCustomColor'] = (kind, color, element) => {
    setCustomColors((current) => addSessionCustomColor(current, color));
    invoke(colorCommand(kind, color), element);
  };
  /**
   * Return the toggle result.
   */
  const toggle = (name: ToolPopover, element: HTMLElement) => {
    trigger.current = element;
    const toolbarRect = root.current?.getBoundingClientRect();
    const triggerRect = element.getBoundingClientRect();
    if (toolbarRect) {
      setPopoverLeft(anchoredPopoverLeft(
        triggerRect.left,
        toolbarRect.left,
        176,
        window.innerWidth
      ));
    }
    setOpen((current) => current === name ? undefined : name);
  };
  useEffect(() => {
    if (!open) return;
    /**
     * Return the position result.
     */
    const position = () => {
      const toolbarRect = root.current?.getBoundingClientRect();
      const triggerRect = trigger.current?.getBoundingClientRect();
      const popoverRect = popover.current?.getBoundingClientRect();
      if (!toolbarRect || !triggerRect || !popoverRect) return;
      const positionOriginLeft = popoverRect.left - popover.current!.offsetLeft;
      setPopoverLeft(anchoredPopoverLeft(
        triggerRect.left,
        positionOriginLeft,
        popoverRect.width,
        window.innerWidth
      ));
    };
    position();
    /**
     * Return the down result.
     */
    const down = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(undefined);
    };
    /**
     * Return the key result.
     */
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(undefined);
      requestAnimationFrame(() => trigger.current?.focus());
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', position);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', position);
    };
  }, [open]);
  const formattingDisabled = context.selectionKind === 'none';
  const formattingReason = context.selectionKind === 'none' ? 'Select cells first.' : undefined;
  /**
   * Return the pressed result.
   */
  const pressed = (value: boolean | 'mixed') => value;
  /**
   * Return the button result.
   */
  const button = (
    id: CommandId,
    label: string,
    icon: IconName,
    value?: boolean | 'mixed',
    low = false
  ) => {
    const state = stateForCommand(id, context, stateFor);
    return <button
      className={low ? 'command-tool-low' : undefined}
      type="button"
      aria-label={label}
      aria-keyshortcuts={id === 'format.bold' ? 'Meta+B Control+B' : id === 'format.italic' ? 'Meta+I Control+I' : id === 'format.underline' ? 'Meta+U Control+U' : undefined}
      aria-pressed={typeof value === 'undefined' ? undefined : pressed(value)}
      disabled={!state.enabled}
      title={state.reason}
      onClick={(event) => invoke(id, event.currentTarget)}
    ><Icon name={icon} /></button>;
  };
  /**
   * Return the popover button result.
   */
  const popoverButton = (
    name: ToolPopover,
    label: string,
    glyph: ReactNode,
    options: { caret?: boolean, low?: boolean, } = {}
  ) => {
    const { caret = false, low = true } = options;
    return (
      <button
        className={low ? 'command-tool-low' : undefined}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open === name}
        disabled={formattingDisabled}
        title={formattingReason}
        onClick={(event) => toggle(name, event.currentTarget)}
      >
        <span className="command-tool-mark" aria-hidden="true">{glyph}</span>
        {caret && <Icon className="tool-caret" name="chevron-down" />}
      </button>
    );
  };
  /**
   * Return the selected for result.
   */
  const selectedFor = (id: CommandId): boolean | 'mixed' => {
    if (id === 'format.text.reset') return presentation.textColor === 'mixed' ? 'mixed' : presentation.textColor === '#20242a';
    if (id === 'format.fill.reset') return presentation.fillColor === 'mixed' ? 'mixed' : presentation.fillColor === 'transparent';
    if (id.startsWith('format.text.color.')) return presentation.textColor === 'mixed' ? 'mixed' : presentation.textColor === `#${id.slice('format.text.color.'.length)}`;
    if (id.startsWith('format.fill.color.')) return presentation.fillColor === 'mixed' ? 'mixed' : presentation.fillColor === `#${id.slice('format.fill.color.'.length)}`;
    if (id === 'format.text.black') return presentation.textColor === 'mixed' ? 'mixed' : presentation.textColor === '#111827';
    if (id === 'format.text.blue') return presentation.textColor === 'mixed' ? 'mixed' : presentation.textColor === '#174ea6';
    if (id === 'format.text.red') return presentation.textColor === 'mixed' ? 'mixed' : presentation.textColor === '#b42318';
    if (id === 'format.fill.gray') return presentation.fillColor === 'mixed' ? 'mixed' : presentation.fillColor === '#64748b';
    if (id === 'format.fill.blue') return presentation.fillColor === 'mixed' ? 'mixed' : presentation.fillColor === '#3b82f6';
    if (id === 'format.fill.yellow') return presentation.fillColor === 'mixed' ? 'mixed' : presentation.fillColor === '#facc15';
    if (id.startsWith('format.border.color.')) return presentation.borderColor === 'mixed' ? 'mixed' : presentation.borderColor === `#${id.slice('format.border.color.'.length)}`;
    if (id.startsWith('format.border.style.')) return presentation.borderStyle === 'mixed' ? 'mixed' : presentation.borderStyle === id.slice('format.border.style.'.length);
    if (id.startsWith('format.border.') && !id.startsWith('format.border.color.')) return presentation.border === 'mixed' ? 'mixed' : presentation.border === id.slice('format.border.'.length);
    if (id.startsWith('format.align.')) return presentation.horizontal === 'mixed' ? 'mixed' : presentation.horizontal === id.slice('format.align.'.length);
    if (id.startsWith('format.vertical.')) return presentation.vertical === 'mixed' ? 'mixed' : presentation.vertical === id.slice('format.vertical.'.length);
    if (id.startsWith('format.wrap.')) return presentation.wrap === 'mixed' ? 'mixed' : presentation.wrap === id.slice('format.wrap.'.length);
    return false;
  };
  /**
   * Return the icon choices result.
   */
  const iconChoices = (items: Array<[CommandId, string, IconName]>) => <div className="command-choice-grid">
    {items.map(([id, label, icon]) => <button
      key={id} type="button" aria-label={label} title={label}
      aria-pressed={selectedFor(id)} onClick={(event) => invoke(id, event.currentTarget)}
    ><Icon className="command-choice-icon" name={icon} /></button>)}
  </div>;
  /**
   * Render the palette.
   */
  const renderPalette = (kind: 'text' | 'fill') => {
    const current = kind === 'text' ? presentation.textColor : presentation.fillColor;
    return <div className="formatting-choice-section">
      <strong>{kind === 'text' ? 'Text color' : 'Fill color'}</strong>
      {current === 'mixed' && <span className="mixed-value-note">Mixed selection</span>}
      <ColorPalette
        kind={kind}
        current={current}
        customColors={customColors}
        selectedFor={selectedFor}
        onCommand={invoke}
        onCustomColor={chooseCustomColor}
      />
    </div>;
  };
  /**
   * Render the borders.
   */
  const renderBorders = () => <BorderFormattingAccordion
    presentation={presentation}
    customColors={customColors}
    selectedFor={selectedFor}
    onCommand={invoke}
    onCustomColor={chooseCustomColor}
  />;
  /**
   * Return the horizontal choices result.
   */
  const horizontalChoices = () => <div className="formatting-choice-section"><strong>Horizontal alignment</strong>{iconChoices([
    ['format.align.left', 'Align left', 'align-left'], ['format.align.center', 'Align center', 'align-center'], ['format.align.right', 'Align right', 'align-right']
  ])}</div>;
  /**
   * Return the vertical choices result.
   */
  const verticalChoices = () => <div className="formatting-choice-section"><strong>Vertical alignment</strong>{iconChoices([
    ['format.vertical.top', 'Align top', 'align-top'], ['format.vertical.middle', 'Align middle', 'align-middle'], ['format.vertical.bottom', 'Align bottom', 'align-bottom']
  ])}</div>;
  /**
   * Return the wrapping choices result.
   */
  const wrappingChoices = () => <div className="formatting-choice-section"><strong>Wrapping</strong>{iconChoices([
    ['format.wrap.wrap', 'Wrap text', 'wrap'], ['format.wrap.clip', 'Clip text', 'clip'], ['format.wrap.overflow', 'Overflow text', 'overflow']
  ])}</div>;
  const horizontalIcon: IconName = presentation.horizontal === 'center'
    ? 'align-center'
    : presentation.horizontal === 'right' ? 'align-right' : 'align-left';
  const verticalIcon: IconName = presentation.vertical === 'top'
    ? 'align-top'
    : presentation.vertical === 'bottom' ? 'align-bottom' : 'align-middle';
  const wrapIcon: IconName = presentation.wrap === 'wrap'
    ? 'wrap'
    : presentation.wrap === 'overflow' ? 'overflow' : 'clip';
  return (
    <div ref={root} className="formatting-toolbar" role="toolbar" aria-label="Formatting tools">
      <div className="formatting-tool-group">
        <button type="button" aria-label="Undo" disabled={!context.canUndo || context.hasDraft} title={commandState('history.undo', context).reason} onClick={(event) => invoke('history.undo', event.currentTarget)}><Icon name="undo" /></button>
        <button type="button" aria-label="Redo" disabled={!context.canRedo || context.hasDraft} title={commandState('history.redo', context).reason} onClick={(event) => invoke('history.redo', event.currentTarget)}><Icon name="redo" /></button>
      </div>
      <span className="formatting-divider" aria-hidden="true" />
      <div className="formatting-tool-group command-font-controls">
        <label><span className="sr-only">Font family</span><select
          aria-label="Font family"
          disabled={formattingDisabled}
          title={formattingReason}
          value={presentation.fontFamily === 'mixed' ? '' : presentation.fontFamily}
          onChange={(event) => {
            const id = event.currentTarget.value === 'Georgia' ? 'format.font.georgia'
              : event.currentTarget.value === 'Courier New' ? 'format.font.mono' : 'format.font.arial';
            invoke(id, event.currentTarget);
          }}
        ><option value="" disabled>Mixed</option><option>Arial</option><option>Georgia</option><option>Courier New</option></select></label>
        <button type="button" aria-label="Decrease font size" disabled={formattingDisabled} title={formattingReason} onClick={(event) => {
          const current = presentation.fontSize === 'mixed' ? 12 : presentation.fontSize;
          const next = [10, 12, 14, 16, 18].filter((value) => value < current).at(-1) || 10;
          invoke(`format.size.${next}` as CommandId, event.currentTarget);
        }}><Icon name="minus" /></button>
        <input
          type="number"
          inputMode="numeric"
          min={10}
          max={18}
          step={2}
          aria-label="Font size"
          disabled={formattingDisabled}
          title={formattingReason}
          placeholder={presentation.fontSize === 'mixed' ? '—' : undefined}
          value={presentation.fontSize === 'mixed' ? '' : presentation.fontSize}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            if ([10, 12, 14, 16, 18].includes(value)) invoke(`format.size.${value}` as CommandId, event.currentTarget);
          }}
        />
        <button type="button" aria-label="Increase font size" disabled={formattingDisabled} title={formattingReason} onClick={(event) => {
          const current = presentation.fontSize === 'mixed' ? 12 : presentation.fontSize;
          const next = [10, 12, 14, 16, 18].find((value) => value > current) || 18;
          invoke(`format.size.${next}` as CommandId, event.currentTarget);
        }}><Icon name="plus" /></button>
      </div>
      <span className="formatting-divider" aria-hidden="true" />
      <div className="formatting-tool-group">
        {button('format.bold', 'Bold', 'bold', presentation.bold)}
        {button('format.italic', 'Italic', 'italic', presentation.italic)}
        {button('format.underline', 'Underline', 'underline', presentation.underline)}
        {popoverButton('text', 'Text color', <ColorToolGlyph name="text" color={presentation.textColor} />)}
        {popoverButton('fill', 'Fill color', <ColorToolGlyph name="paint-bucket" color={presentation.fillColor} />)}
        {popoverButton('border', 'Borders', <Icon name="borders" />, { caret: true })}
        {popoverButton('horizontal', 'Horizontal alignment', <Icon name={horizontalIcon} />)}
        {popoverButton('vertical', 'Vertical alignment', <Icon name={verticalIcon} />)}
        {popoverButton('wrap', 'Wrap', <Icon name={wrapIcon} />)}
        {popoverButton('more', 'More formatting', <Icon name="ellipsis-vertical" />, { caret: true, low: false })}
      </div>
      {open && <div
        ref={popover}
        className={`formatting-popover formatting-popover-${open}`}
        role="dialog"
        aria-label={`${open} formatting choices`}
        data-anchor-label={trigger.current?.getAttribute('aria-label') || undefined}
        style={{ left: popoverLeft, right: 'auto' }}
      >
        {open === 'text' && renderPalette('text')}
        {open === 'fill' && renderPalette('fill')}
        {open === 'border' && renderBorders()}
        {open === 'horizontal' && horizontalChoices()}
        {open === 'vertical' && verticalChoices()}
        {open === 'wrap' && wrappingChoices()}
        {open === 'more' && <div className="formatting-more-surface">
          <strong>More formatting</strong>
          {renderPalette('text')}{renderPalette('fill')}{renderBorders()}
          {horizontalChoices()}{verticalChoices()}{wrappingChoices()}
        </div>}
      </div>}
    </div>
  );
}
