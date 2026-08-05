import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CommandContext,
  CommandMenuEntry,
  CommandState
} from '../helpers/contracts.js';
import {
  COMMAND_MENUS,
  commandState,
  shortcutCommand
} from '../helpers/registry.js';

//Use one permissive context so each scenario changes only the authority or
//selection bit that owns the expected command state.
const BASE_CONTEXT = {
  selectionKind: 'cell',
  canUndo: true,
  canRedo: true,
  hasDraft: false,
  readOnly: false,
  canMutateValues: true,
  canMutateSelection: true,
  canCreateFile: true,
  canImportFile: true,
  canConfigureFile: true,
  canSaveViews: true,
  canMoveRows: true,
  canMoveRowUp: true,
  canMoveRowDown: true,
  canSortSelection: true,
  relationSelection: true
} satisfies CommandContext;

type EntryDescription = string | {
  submenu: string;
  entries: EntryDescription[];
};

/** Converts the public registry into a compact exact-contract description. */
function describeEntries(entries: readonly CommandMenuEntry[]): EntryDescription[] {
  return entries.map((entry) => {
    if (entry.type === 'separator') return '---';
    if (entry.type === 'submenu') {
      return { submenu: entry.label, entries: describeEntries(entry.entries) };
    }
    return [ entry.id, entry.label, entry.shortcut || '', entry.secondary || '' ].join('|');
  });
}

test('registry exposes the exact four accepted menus, order, labels, hints, and submenus', () => {
  //Keep the expected menu language independent from the implementation arrays
  //so accidental additions, removals, or reordering fail loudly.
  const described = COMMAND_MENUS.map((menu) => ({
    label: menu.label,
    entries: describeEntries(menu.entries)
  }));

  assert.deepEqual(described, [
    {
      label: 'File',
      entries: [
        'file.new|New|⌘N|',
        'file.open|Open||',
        'file.import|Import||',
        'file.export|Export||',
        'file.copy|Make a copy||',
        '---',
        'view.list|Views||',
        'view.new|New view||',
        '---',
        'file.version-history|Version history||Changes',
        'file.table-settings|Table settings||'
      ]
    },
    {
      label: 'Edit',
      entries: [
        'history.undo|Undo|⌘Z|',
        'history.redo|Redo|⇧⌘Z|',
        '---',
        'edit.cut|Cut|⌘X|',
        'edit.copy|Copy|⌘C|',
        'edit.paste|Paste|⌘V|',
        'edit.clear|Clear selected values|Delete|',
        '---',
        'selection.all|Select all|⌘A|',
        'find|Find|⌘F|'
      ]
    },
    {
      label: 'View',
      entries: [
        {
          submenu: 'Show',
          entries: [
            'view.gridlines|Gridlines||',
            'view.compact|Compact controls||'
          ]
        },
        {
          submenu: 'Freeze',
          entries: [
            'view.freeze.rows.none|No rows||',
            'view.freeze.rows.one|1 row||',
            'view.freeze.rows.two|2 rows||',
            'view.freeze.rows.current|Up to current row||',
            '---',
            'view.freeze.columns.none|No columns||',
            'view.freeze.columns.one|1 column||',
            'view.freeze.columns.two|2 columns||',
            'view.freeze.columns.current|Up to current column||'
          ]
        },
        {
          submenu: 'Zoom',
          entries: [
            'view.zoom.50|50%||',
            'view.zoom.75|75%||',
            'view.zoom.90|90%||',
            'view.zoom.100|100%||',
            'view.zoom.125|125%||',
            'view.zoom.150|150%||',
            'view.zoom.200|200%||'
          ]
        }
      ]
    },
    {
      label: 'Format',
      entries: [
        {
          submenu: 'Number',
          entries: [
            'format.number.auto|Automatic||',
            'format.number.plain|Number||',
            'format.number.currency|Number (2 decimals)||',
            'format.number.percent|Percent||'
          ]
        },
        {
          submenu: 'Text',
          entries: [
            'format.bold|Bold|⌘B|',
            'format.italic|Italic|⌘I|',
            'format.underline|Underline|⌘U|'
          ]
        },
        {
          submenu: 'Alignment',
          entries: [
            'format.align.left|Left||',
            'format.align.center|Center||',
            'format.align.right|Right||',
            '---',
            'format.vertical.top|Top||',
            'format.vertical.middle|Middle||',
            'format.vertical.bottom|Bottom||'
          ]
        },
        {
          submenu: 'Wrapping',
          entries: [
            'format.wrap.wrap|Wrap||',
            'format.wrap.clip|Clip||',
            'format.wrap.overflow|Overflow||'
          ]
        },
        {
          submenu: 'Font size',
          entries: [
            'format.size.10|10||',
            'format.size.12|12||',
            'format.size.14|14||',
            'format.size.16|16||',
            'format.size.18|18||'
          ]
        },
        '---',
        'format.clear|Clear formatting||'
      ]
    }
  ]);
});

test('command state applies deferred, permission, target, draft, and read-only boundaries', () => {
  //Deferred command identities remain inert whether they are hidden from the
  //accepted menus or retained visibly for orientation.
  const deferred = [
    'file.copy',
    'file.version-history',
    'view.fullscreen',
    'format.theme',
    'format.rotation',
    'format.smart-chips',
    'format.merge',
    'row.resize',
    'column.move-left',
    'column.move-right',
    'column.resize'
  ] as const;
  for (const id of deferred) {
    assert.deepEqual(commandState(id, BASE_CONTEXT), {
      enabled: false,
      reason: 'Visible for orientation; this behavior is deferred.'
    });
  }

  //CSV export is an implemented command and must not regress into the deferred
  //orientation-only set.
  assert.deepEqual(commandState('file.export', BASE_CONTEXT), { enabled: true });
  assert.deepEqual(commandState('view.list', BASE_CONTEXT), { enabled: true });
  assert.deepEqual(commandState('view.new', BASE_CONTEXT), { enabled: true });
  assert.deepEqual(commandState('row.move-up', BASE_CONTEXT), { enabled: true });
  assert.deepEqual(commandState('column.insert-left', {
    ...BASE_CONTEXT,
    selectionKind: 'column'
  }), { enabled: true });
  assert.deepEqual(commandState('column.insert-right', {
    ...BASE_CONTEXT,
    selectionKind: 'header'
  }), { enabled: true });
  assert.deepEqual(commandState('column.insert-left', BASE_CONTEXT), {
    enabled: false,
    reason: 'Select a persisted column header first.'
  });
  assert.deepEqual(commandState('column.delete', {
    ...BASE_CONTEXT,
    selectionKind: 'column'
  }), {
    enabled: false,
    reason: 'Only an inserted blank column can be removed directly.'
  });
  assert.deepEqual(commandState('column.delete', {
    ...BASE_CONTEXT,
    selectionKind: 'column',
    canDeleteColumn: true
  }), { enabled: true });
  assert.deepEqual(commandState('row.move-down', {
    ...BASE_CONTEXT,
    canMoveRows: false,
    rowOrderReason: 'Clear the explicit sort before changing shared row order.'
  }), {
    enabled: false,
    reason: 'Clear the explicit sort before changing shared row order.'
  });
  assert.deepEqual(commandState('row.move-up', {
    ...BASE_CONTEXT,
    selectionKind: 'row',
    canMoveRowUp: false,
    rowMoveUpReason: 'Select a committed row before moving it.'
  }), {
    enabled: false,
    reason: 'Select a committed row before moving it.'
  });
  assert.deepEqual(commandState('row.move-down', {
    ...BASE_CONTEXT,
    selectionKind: 'row',
    canMoveRowDown: false
  }), {
    enabled: false,
    reason: 'The selected committed row is already last.'
  });
  assert.deepEqual(commandState('column.sort-asc', {
    ...BASE_CONTEXT,
    selectionKind: 'column',
    canSortSelection: false
  }), {
    enabled: false,
    reason: 'Name this column before sorting it.'
  });
  assert.deepEqual(commandState('view.new', { ...BASE_CONTEXT, canSaveViews: false }), {
    enabled: false,
    reason: 'Save this PostgreSQL file before using views.'
  });

  const scenarios: Array<{
    label: string;
    id: Parameters<typeof commandState>[0];
    context: Partial<CommandContext>;
    expected: CommandState;
  }> = [
    {
      label: 'empty undo history',
      id: 'history.undo',
      context: { canUndo: false },
      expected: { enabled: false, reason: 'Nothing to undo.' }
    },
    {
      label: 'draft blocks redo',
      id: 'history.redo',
      context: { hasDraft: true },
      expected: { enabled: false, reason: 'Correct the retained value first.' }
    },
    {
      label: 'create-file permission',
      id: 'file.new',
      context: { canCreateFile: false },
      expected: { enabled: false, reason: 'Create-file permission is required.' }
    },
    {
      label: 'import permission',
      id: 'file.import',
      context: { canImportFile: false },
      expected: { enabled: false, reason: 'Import permission is required.' }
    },
    {
      label: 'configure-file permission',
      id: 'file.table-settings',
      context: { canConfigureFile: false },
      expected: { enabled: false, reason: 'Configure-file permission is required.' }
    },
    {
      label: 'schema command permission',
      id: 'column.configure',
      context: { canConfigureFile: false, selectionKind: 'column' },
      expected: { enabled: false, reason: 'Configure-file permission is required.' }
    },
    {
      label: 'relation target required',
      id: 'relation.configure',
      context: { relationSelection: false },
      expected: { enabled: false, reason: 'Select a relation column first.' }
    },
    {
      label: 'formatting selection required',
      id: 'format.bold',
      context: { selectionKind: 'none' },
      expected: { enabled: false, reason: 'Select cells first.' }
    },
    {
      label: 'target required',
      id: 'edit.cell',
      context: { selectionKind: 'none' },
      expected: { enabled: false, reason: 'Select a target first.' }
    },
    {
      label: 'band paste uses target-specific action',
      id: 'edit.paste',
      context: { selectionKind: 'column' },
      expected: {
        enabled: false,
        reason: 'Use the target-specific clear action for a row or column.'
      }
    },
    {
      label: 'read-only structural mutation',
      id: 'row.insert-below',
      context: { readOnly: true },
      expected: { enabled: false, reason: 'This PostgreSQL file is read-only.' }
    },
    {
      label: 'value mutation permission',
      id: 'edit.clear',
      context: { canMutateSelection: false },
      expected: { enabled: false, reason: 'Update permission is required for the selected cells.' }
    },
    {
      label: 'row mutation permission remains table scoped',
      id: 'row.insert-below',
      context: { canMutateValues: false, canMutateSelection: true },
      expected: { enabled: false, reason: 'Update permission is required.' }
    },
    {
      label: 'draft blocks value mutation',
      id: 'edit.clear',
      context: { hasDraft: true },
      expected: { enabled: false, reason: 'Correct the retained value first.' }
    },
    {
      label: 'draft blocks table settings',
      id: 'file.table-settings',
      context: { hasDraft: true },
      expected: { enabled: false, reason: 'Correct the retained value first.' }
    }
  ];

  for (const scenario of scenarios) {
    assert.deepEqual(
      commandState(scenario.id, { ...BASE_CONTEXT, ...scenario.context }),
      scenario.expected,
      scenario.label
    );
  }

  //Read-only users retain non-mutating copy access, while healthy history and
  //ordinary selected formatting remain available.
  assert.deepEqual(
    commandState('edit.copy', { ...BASE_CONTEXT, readOnly: true }),
    { enabled: true }
  );
  assert.deepEqual(commandState('history.undo', BASE_CONTEXT), { enabled: true });
  assert.deepEqual(commandState('format.bold', BASE_CONTEXT), { enabled: true });
  assert.deepEqual(commandState('format.bold', {
    ...BASE_CONTEXT,
    hasDraft: true,
    selectionKind: 'column'
  }), { enabled: true }, 'a retained data draft does not disable column formatting');
  assert.deepEqual(
    commandState('column.sort-asc', { ...BASE_CONTEXT, readOnly: true, selectionKind: 'column' }),
    { enabled: true }
  );
});

test('displayed command shortcuts route exactly and reject alternate-modifier collisions', () => {
  //Each displayed chord accepts either platform command modifier. Grid-owned
  //events are ignored by Workbench after their target handler prevents default.
  /** Builds the minimal keyboard event shape consumed by the registry. */
  const event = (overrides: Partial<Parameters<typeof shortcutCommand>[0]>) => ({
    key: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides
  });

  assert.equal(shortcutCommand(event({ key: 'b', metaKey: true })), 'format.bold');
  assert.equal(shortcutCommand(event({ key: 'I', ctrlKey: true })), 'format.italic');
  assert.equal(shortcutCommand(event({ key: 'u', metaKey: true })), 'format.underline');
  assert.equal(shortcutCommand(event({ key: 'n', metaKey: true })), 'file.new');
  assert.equal(shortcutCommand(event({ key: 'z', metaKey: true })), 'history.undo');
  assert.equal(shortcutCommand(event({ key: 'z', metaKey: true, shiftKey: true })), 'history.redo');
  assert.equal(shortcutCommand(event({ key: 'x', ctrlKey: true })), 'edit.cut');
  assert.equal(shortcutCommand(event({ key: 'c', ctrlKey: true })), 'edit.copy');
  assert.equal(shortcutCommand(event({ key: 'v', ctrlKey: true })), 'edit.paste');
  assert.equal(shortcutCommand(event({ key: 'a', ctrlKey: true })), 'selection.all');
  assert.equal(shortcutCommand(event({ key: 'f', metaKey: true })), 'find');
  assert.equal(shortcutCommand(event({ key: 'b' })), undefined);
  assert.equal(shortcutCommand(event({ key: 'b', metaKey: true, altKey: true })), undefined);
  assert.equal(shortcutCommand(event({ key: 'b', metaKey: true, shiftKey: true })), undefined);
});
