import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type {
  CommandContext,
  CommandId,
  CommandMenuEntry,
  CommandState
} from '../helpers/contracts.js';
import { COMMAND_MENUS, commandState } from '../helpers/registry.js';

export type PresentationToolbarState = {
  fontFamily: string | 'mixed';
  fontSize: number | 'mixed';
  bold: boolean | 'mixed';
  italic: boolean | 'mixed';
  underline: boolean | 'mixed';
  textColor: string | 'mixed';
  fillColor: string | 'mixed';
  horizontal: string | 'mixed';
  vertical: string | 'mixed';
  wrap: string | 'mixed';
  border: string | 'mixed';
  borderColor: string | 'mixed';
  borderStyle: string | 'mixed';
  numberFormat: string | 'mixed';
};

export type CommandSurfaceProps = {
  context: CommandContext;
  presentation: PresentationToolbarState;
  stateFor?: (id: CommandId, base: CommandState) => CommandState;
  onCommand: (id: CommandId, trigger: HTMLElement) => void;
};

function stateForCommand(
  id: CommandId,
  context: CommandContext,
  stateFor?: CommandSurfaceProps['stateFor']
) {
  const base = commandState(id, context);
  return stateFor?.(id, base) || base;
}

export function SpreadsheetMenuBar({ context, stateFor, onCommand }: Omit<CommandSurfaceProps, 'presentation'>) {
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(null);
  const [submenu, setSubmenu] = useState<string>();
  const [activeTrigger, setActiveTrigger] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTrigger = (index: number) => requestAnimationFrame(() => triggers.current[index]?.focus());
  const ownedItems = (menu: HTMLElement | null | undefined) => menu
    ? [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])')]
      .filter((item) => item.closest('[role="menu"]') === menu)
    : [];
  const focusFirst = (selector: string, edge: 'first' | 'last' = 'first') => requestAnimationFrame(() => {
    const menu = root.current?.querySelector<HTMLElement>(selector);
    const items = ownedItems(menu);
    items[edge === 'first' ? 0 : items.length - 1]?.focus();
  });
  const openMenu = (index: number, edge: 'first' | 'last' = 'first') => {
    setActiveTrigger(index);
    setSubmenu(undefined);
    setOpen(index);
    focusFirst(`.command-menu[data-menu-index="${index}"]`, edge);
  };
  const close = (restore = true) => {
    const current = open;
    setOpen(null);
    setSubmenu(undefined);
    if (restore && current !== null) focusTrigger(current);
  };

  useEffect(() => {
    if (open === null) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

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
        ><span>{entry.label}</span><span aria-hidden="true">›</span></button>
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
      <span className="command-check" aria-hidden="true">{state.mixed ? '—' : state.checked ? '✓' : ''}</span>
      <span className="command-label">{label}{entry.secondary && <small>{entry.secondary}</small>}</span>
      {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
    </button>;
  });

  return <div ref={root} className="command-menubar" role="menubar" aria-label="Spreadsheet menus" onKeyDown={handleKeys}>
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
        >{menu.label}<span aria-hidden="true">⌄</span></button>
        {expanded && <div id={`${baseId}-${index}`} className="command-menu" data-menu-index={index} role="menu" aria-label={`${menu.label} menu`}>
          {renderEntries(menu.entries, index)}
        </div>}
      </div>;
    })}
  </div>;
}

type ToolPopover = 'text' | 'fill' | 'border' | 'horizontal' | 'vertical' | 'wrap' | 'more';

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

const BORDER_PATHS: Record<string, string[]> = {
  all: ['M2 2H18V18H2Z', 'M10 2V18', 'M2 10H18'],
  inner: ['M10 2V18', 'M2 10H18'],
  horizontal: ['M2 2H18', 'M2 10H18', 'M2 18H18'],
  vertical: ['M2 2V18', 'M10 2V18', 'M18 2V18'],
  outer: ['M2 2H18V18H2Z'],
  left: ['M2 2V18'],
  top: ['M2 2H18'],
  right: ['M18 2V18'],
  bottom: ['M2 18H18'],
  none: []
};

function BorderGlyph({ placement }: { placement: string }) {
  return <svg className="border-placement-glyph" viewBox="0 0 20 20" aria-hidden="true">
    <path className="border-guide" d="M2 2H18V18H2ZM10 2V18M2 10H18" />
    {BORDER_PATHS[placement]?.map((path) => <path className="border-selected" d={path} key={path} />)}
  </svg>;
}

export function FormattingToolbar({ context, presentation, stateFor, onCommand }: CommandSurfaceProps) {
  const [open, setOpen] = useState<ToolPopover>();
  const [popoverLeft, setPopoverLeft] = useState(8);
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | undefined>(undefined);
  const invoke = (id: CommandId, element: HTMLElement) => {
    if (!stateForCommand(id, context, stateFor).enabled) return;
    const restore = open ? trigger.current : undefined;
    onCommand(id, element);
    setOpen(undefined);
    if (restore) requestAnimationFrame(() => restore.focus());
  };
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
    const down = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(undefined);
    };
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
  const pressed = (value: boolean | 'mixed') => value;
  const button = (id: CommandId, label: string, glyph: string, value?: boolean | 'mixed', low = false) => {
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
    ><span aria-hidden="true">{glyph}</span></button>;
  };
  const popoverButton = (name: ToolPopover, label: string, glyph: string, low = true) => <button
    className={low ? 'command-tool-low' : undefined}
    type="button"
    aria-label={label}
    aria-haspopup="dialog"
    aria-expanded={open === name}
    disabled={formattingDisabled}
    title={formattingReason}
    onClick={(event) => toggle(name, event.currentTarget)}
  ><span aria-hidden="true">{glyph}</span><span className="tool-caret" aria-hidden="true">⌄</span></button>;
  const paletteChoices = (kind: 'text' | 'fill') => ({
    main: kind === 'text' ? [
      ['format.text.reset', 'Reset text color', 'transparent'],
      ['format.text.color.475569', 'Slate', '#475569'],
      ['format.text.color.1d4ed8', 'Royal blue', '#1d4ed8'],
      ['format.text.color.9f1239', 'Rose', '#9f1239']
    ] : [
      ['format.fill.reset', 'Reset fill', 'transparent'],
      ['format.fill.color.e2e8f0', 'Light slate', '#e2e8f0'],
      ['format.fill.color.dbeafe', 'Light blue', '#dbeafe'],
      ['format.fill.color.fef3c7', 'Light yellow', '#fef3c7']
    ],
    standard: kind === 'text' ? [
      ['format.text.black', 'Charcoal', '#111827'],
      ['format.text.blue', 'Blue', '#174ea6'],
      ['format.text.red', 'Red', '#b42318'],
      ['format.text.color.15803d', 'Green', '#15803d']
    ] : [
      ['format.fill.gray', 'Gray', '#64748b'],
      ['format.fill.blue', 'Blue', '#3b82f6'],
      ['format.fill.yellow', 'Yellow', '#facc15'],
      ['format.fill.color.dcfce7', 'Green', '#dcfce7']
    ]
  }) as { main: Array<[CommandId, string, string]>; standard: Array<[CommandId, string, string]> };
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
  const iconChoices = (items: Array<[CommandId, string, string]>) => <div className="command-choice-grid">
    {items.map(([id, label, glyph]) => <button
      key={id} type="button" aria-label={label} title={label}
      aria-pressed={selectedFor(id)} onClick={(event) => invoke(id, event.currentTarget)}
    ><span aria-hidden="true">{glyph}</span></button>)}
  </div>;
  const borderChoices = [
    ['format.border.all', 'All borders', 'all'], ['format.border.inner', 'Inner borders', 'inner'],
    ['format.border.horizontal', 'Horizontal borders', 'horizontal'], ['format.border.vertical', 'Vertical borders', 'vertical'],
    ['format.border.outer', 'Outer borders', 'outer'], ['format.border.left', 'Left border', 'left'],
    ['format.border.top', 'Top border', 'top'], ['format.border.right', 'Right border', 'right'],
    ['format.border.bottom', 'Bottom border', 'bottom'], ['format.border.none', 'No borders', 'none']
  ] as Array<[CommandId, string, string]>;
  const renderPalette = (kind: 'text' | 'fill') => {
    const choices = paletteChoices(kind);
    const current = kind === 'text' ? presentation.textColor : presentation.fillColor;
    const grid = (label: string, items: Array<[CommandId, string, string]>) => <>
      <span className="palette-label">{label}</span>
      <div className={`color-swatch-grid color-swatch-grid-${label.toLowerCase()}`}>{items.map(([id, name, color]) => <button
        key={id} type="button" aria-label={name} title={name} aria-pressed={selectedFor(id)}
        style={{ '--swatch': color } as CSSProperties} onClick={(event) => invoke(id, event.currentTarget)}
      ><span aria-hidden="true" /></button>)}</div>
    </>;
    return <div className="formatting-choice-section">
      <strong>{kind === 'text' ? 'Text color' : 'Fill color'}</strong>
      {current === 'mixed' && <span className="mixed-value-note">Mixed selection</span>}
      {grid('Main', choices.main)}{grid('Standard', choices.standard)}
      <button type="button" disabled title="Custom colors are deferred">Custom…</button>
      {kind === 'fill' && <button type="button" disabled title="Conditional formatting is representative only">Conditional formatting…</button>}
    </div>;
  };
  const renderBorders = () => <div className="formatting-choice-section formatting-border-layout">
    <strong>Borders</strong>
    <div className="command-choice-grid command-border-grid">{borderChoices.map(([id, label, placement]) => <button
      key={id} type="button" aria-label={label} title={label} aria-pressed={selectedFor(id)}
      onClick={(event) => invoke(id, event.currentTarget)}
    ><BorderGlyph placement={placement} /></button>)}</div>
    <label>Border color <input
      type="color" aria-label="Border color"
      value={presentation.borderColor === 'mixed' ? '#4b5563' : presentation.borderColor}
      onChange={(event) => invoke(`format.border.color.${event.currentTarget.value.slice(1)}`, event.currentTarget)}
    /></label>
    <div className="border-color-grid" aria-label="Border color presets">{([
      ['4b5563', 'Charcoal border'], ['174ea6', 'Blue border'], ['b42318', 'Red border']
    ] as const).map(([color, label]) => {
      const id = `format.border.color.${color}` as CommandId;
      return <button key={color} type="button" aria-label={label} title={label}
        aria-pressed={selectedFor(id)} style={{ '--swatch': `#${color}` } as CSSProperties}
        onClick={(event) => invoke(id, event.currentTarget)}><span aria-hidden="true" /></button>;
    })}</div>
    {presentation.borderColor === 'mixed' && <span className="mixed-value-note">Mixed border colors</span>}
    <span className="palette-label">Border style</span>
    <div className="border-style-grid">{(['solid', 'medium', 'thick', 'dashed', 'dotted', 'double'] as const).map((style) => {
      const id = `format.border.style.${style}` as CommandId;
      return <button key={style} type="button" aria-label={`${style} border`} title={`${style} border`}
        aria-pressed={selectedFor(id)} onClick={(event) => invoke(id, event.currentTarget)}>
        <span className={`border-style-sample border-style-${style}`} aria-hidden="true" />
      </button>;
    })}</div>
  </div>;
  const horizontalChoices = () => <div className="formatting-choice-section"><strong>Horizontal alignment</strong>{iconChoices([
    ['format.align.left', 'Align left', '≡'], ['format.align.center', 'Align center', '≣'], ['format.align.right', 'Align right', '≡']
  ])}</div>;
  const verticalChoices = () => <div className="formatting-choice-section"><strong>Vertical alignment</strong>{iconChoices([
    ['format.vertical.top', 'Align top', '⇧'], ['format.vertical.middle', 'Align middle', '↕'], ['format.vertical.bottom', 'Align bottom', '⇩']
  ])}</div>;
  const wrappingChoices = () => <div className="formatting-choice-section"><strong>Wrapping</strong>{iconChoices([
    ['format.wrap.wrap', 'Wrap text', '↩'], ['format.wrap.clip', 'Clip text', '⊣'], ['format.wrap.overflow', 'Overflow text', '→']
  ])}</div>;
  return <div ref={root} className="formatting-toolbar" role="toolbar" aria-label="Formatting tools">
    <div className="formatting-tool-group">
      <button type="button" aria-label="Undo" disabled={!context.canUndo || context.hasDraft} title={commandState('history.undo', context).reason} onClick={(event) => invoke('history.undo', event.currentTarget)}>↶</button>
      <button type="button" aria-label="Redo" disabled={!context.canRedo || context.hasDraft} title={commandState('history.redo', context).reason} onClick={(event) => invoke('history.redo', event.currentTarget)}>↷</button>
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
      }}>−</button>
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
      }}>+</button>
    </div>
    <span className="formatting-divider" aria-hidden="true" />
    <div className="formatting-tool-group">
      {button('format.bold', 'Bold', 'B', presentation.bold)}
      {button('format.italic', 'Italic', 'I', presentation.italic)}
      {button('format.underline', 'Underline', 'U', presentation.underline)}
      {popoverButton('text', 'Text color', 'A')}
      {popoverButton('fill', 'Fill color', '▣')}
      {popoverButton('border', 'Borders', '▦')}
      {popoverButton('horizontal', 'Horizontal alignment', '≡')}
      {popoverButton('vertical', 'Vertical alignment', '↕')}
      {popoverButton('wrap', 'Wrap', '↩')}
      {popoverButton('more', 'More formatting', '•••', false)}
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
  </div>;
}
