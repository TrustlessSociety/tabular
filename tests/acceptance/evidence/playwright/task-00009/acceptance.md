# Task 00009 Browser Acceptance

Result: **passed**.

The accepted command surface was exercised against a task-scoped PostgreSQL 18
fixture in the Codex in-app browser at 1440x900 and 390x844.

## Evidence

- File, Edit, View, and Format exposed the exact menu hierarchy. One-shot
  commands used `menuitem`; stateful choices used `menuitemcheckbox` with
  checked or mixed state. Disabled, deferred, permission, and destructive
  commands carried accurate reasons.
- Keyboard traversal passed for Down/Up, top-level Left/Right switching,
  submenu Right entry, explicit Enter activation, one-level Escape dismissal,
  Shift+F10/Menu invocation, and trigger focus restoration.
- An individual numeric cell visibly rendered Currency without changing its
  raw value, then accepted bold, green text, yellow fill, blue dashed bottom
  border state, centered/top alignment, and wrapping. Presentation survived a
  reload in the current tab.
- A three-cell range exposed mixed Bold state. Italic applied to all three;
  Undo, Redo, Clear formatting, and Undo Clear restored the expected states.
- Cell/range Copy reported `Copied 3 cells` and serialized A1:C1 as one
  tab-delimited matrix. The browser harness reserves native clipboard chords,
  so the live handler was exercised through its allowed modified key path while
  exact Ctrl/Command+C routing was covered by the focused shortcut tests.
  Relation configuration opened the correct column panel; row Delete stopped
  at confirmation; column Sort changed view order; explorer Table settings
  opened for the owner.
- Protected owner columns disabled selected-cell Cut, Paste, Edit, and Clear
  while retaining permitted row commands. Reader context menus independently
  disabled value mutation, schema configuration, and Table settings with exact
  reasons; non-mutating Copy, Export, and column Sort stayed enabled.
- Context-menu opening preserved row-header and cell geometry exactly.
- At 390x844, File/Edit/View/Format and font/size/B/I/U/More remained visible.
  The full lower-priority surface was available inside a bounded scrolling More
  popover. Its final bounds were x=118..382, preserving an 8px right gutter;
  the 473px column context menu also stayed inside the viewport.
- Final checks found no document horizontal overflow, duplicate IDs, unnamed
  visible buttons, browser warnings, or browser errors.

## Verification

- Focused command/grid/UI suite: 24/24 passed.
- Full `npm run verify`: 86/86 tests passed.
- Typecheck, production build, artifact integrity, architecture, built runtime,
  and entrypoint verification passed.
- Expected warnings only: npm's existing user `python` config warning and
  Node's existing `module.register()` deprecation warning.

## Screenshots

- `formatting-desktop-1440x900-final.png`
- `menus-desktop-1440x900-final.png`
- `row-delete-confirmation-1440x900.png`
- `explorer-context-desktop.png`
- `narrow-more-390x844.png`
- `narrow-column-context-390x844.png`

## Frozen Boundary

Saved views and multi-user presentation persistence remain Task 00010 scope.
Representative structural commands, advanced number semantics, and
production-complete border rendering remain visibly deferred or explicitly
non-production-complete as accepted by the frozen command-surface contract.

Cleanup passed: the browser was finalized, listeners stopped, temporary
session files deleted, ports 3068/3069 released, and the PostgreSQL container
removed.
