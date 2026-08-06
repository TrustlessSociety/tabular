const app = document.querySelector('#app');
const overlayRoot = document.querySelector('#overlay-root');
const searchInput = document.querySelector('#file-search');
const statusNode = document.querySelector('#status');

const ui = {
  hierarchy: null,
  files: [],
  sheet: null,
  route: { name: 'explorer', folder: null },
  search: '',
  viewMode: 'list',
  selected: { row: 0, column: 0 },
  errors: {},
  gaps: [],
  import: { step: 1, source: 'csv' },
  hoverTimer: null,
  renameEditing: false
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body;
}

function announce(message) {
  statusNode.textContent = message;
  statusNode.classList.add('visible');
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => statusNode.classList.remove('visible'), 1800);
}

function coordinate(index) {
  let result = '';
  let value = index + 1;
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'folder') return { name: 'explorer', folder: parts[1] || null };
  if (parts[0] === 'sheet') return { name: 'sheet', fileId: parts[1] || 'customer-orders' };
  if (parts[0] === 'import') return {
    name: 'import', folder: parts[1] || 'operations', importState: parts[2] || null
  };
  return { name: 'explorer', folder: null };
}

function navigate(hash) {
  if (location.hash === hash) {
    loadRoute();
  } else {
    location.hash = hash;
  }
}

async function loadRoute() {
  closeOverlay();
  ui.route = parseRoute();
  document.body.dataset.route = ui.route.name;
  searchInput.value = '';
  ui.search = '';
  if (ui.route.name === 'sheet') {
    ui.sheet = await api(`/api/state?file=${encodeURIComponent(ui.route.fileId)}`);
    renderSheet();
  } else if (ui.route.name === 'import') {
    ui.import = {
      step: ui.route.importState ? 3 : 1,
      source: 'csv', state: ui.route.importState
    };
    renderImport();
  } else {
    const data = await api(`/api/bootstrap${ui.route.folder ? `?folder=${ui.route.folder}` : ''}`);
    ui.hierarchy = data.hierarchy;
    ui.files = data.files;
    renderExplorer();
  }
  app.focus({ preventScroll: true });
}

function rootCrumbs(extra = '') {
  return `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <button class="crumb-button" data-nav="#/explorer" type="button">Acme Inc.</button>
      <span aria-hidden="true">›</span>
      <button class="crumb-button" data-nav="#/explorer" type="button">company</button>
      ${extra}
    </nav>`;
}

function viewToggle() {
  return `
    <div class="view-toggle" aria-label="View files as">
      <button class="view-button" data-view="list" type="button" aria-label="List view" aria-pressed="${ui.viewMode === 'list'}">☷</button>
      <button class="view-button" data-view="grid" type="button" aria-label="Grid view" aria-pressed="${ui.viewMode === 'grid'}">⊞</button>
    </div>`;
}

function renderExplorer() {
  const folder = ui.route.folder;
  const folderLabel = folder ? folder[0].toUpperCase() + folder.slice(1) : null;
  const query = ui.search.toLowerCase();
  const sourceItems = folder
    ? ui.files.map((file) => ({
        ...file,
        type: 'file',
        name: file.display_name,
        technical: `${file.schema_name}.${file.table_name}`
      }))
    : ui.hierarchy.schemas.map((schema) => ({
        ...schema,
        type: 'folder',
        name: schema.label,
        technical: `${schema.fileCount} files`
      }));
  const items = sourceItems.filter((item) => item.name.toLowerCase().includes(query));
  const actions = folder
    ? `<div class="folder-actions">
        <button class="secondary-button" id="new-file" type="button">New file</button>
        <button class="button" id="import-file" type="button">Import</button>
      </div>`
    : '';
  app.innerHTML = `
    <section class="explorer" data-chapter="explorer">
      <div class="section-bar">
        ${rootCrumbs(folder ? `<span aria-hidden="true">›</span><span class="crumb-button crumb-current">${folderLabel}</span>` : '')}
        ${actions}
      </div>
      <div class="section-meta">
        <h1>Files</h1>
        <span class="count">${items.length} ${items.length === 1 ? 'item' : folder ? 'files' : 'folders'}</span>
        <div class="content-tools">${viewToggle()}</div>
      </div>
      ${items.length ? `
        <div class="item-list ${ui.viewMode === 'grid' ? 'grid-mode' : ''}">
          ${items.map((item) => `
            <button class="item" type="button" data-item-type="${item.type}" data-item-id="${item.id}">
              <span class="item-icon" aria-hidden="true">${item.type === 'folder' ? '▰' : '▦'}</span>
              <span>
                <span class="item-name">${escapeHtml(item.name)}</span>
                <span class="technical">${escapeHtml(item.technical)}</span>
              </span>
              <span class="item-stat">${item.type === 'file' ? `${item.column_count} × ${item.record_count}` : `${item.fileCount} files`}</span>
              <span class="edited">Edited today&nbsp; ›</span>
            </button>`).join('')}
        </div>` : `<div class="empty-state">No current ${folder ? 'files' : 'folders'} match “${escapeHtml(ui.search)}”.</div>`}
    </section>`;
  bindNavigation();
  app.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      ui.viewMode = button.dataset.view;
      renderExplorer();
    });
  });
  app.querySelectorAll('[data-item-type]').forEach((button) => {
    button.addEventListener('click', () => {
      navigate(button.dataset.itemType === 'folder'
        ? `#/folder/${button.dataset.itemId}`
        : `#/sheet/${button.dataset.itemId}`);
    });
  });
  app.querySelector('#new-file')?.addEventListener('click', async () => {
    const file = await postAction({ type: 'create-file', folder });
    navigate(`#/sheet/${file.id}`);
  });
  app.querySelector('#import-file')?.addEventListener('click', () => navigate(`#/import/${folder}`));
}

function renderToolbar() {
  const history = ui.sheet.history ?? { undo_count: 0, redo_count: 0 };
  const formats = ui.sheet.presentation.formats ?? {};
  return `
    <div class="toolbar" role="toolbar" aria-label="Formatting toolbar" data-chapter="commands">
      <span class="tool-group">
        <button class="tool-button" data-command="undo" type="button" aria-label="Undo" title="Undo" ${history.undo_count ? '' : 'disabled'}>↶</button>
        <button class="tool-button" data-command="redo" type="button" aria-label="Redo" title="Redo" ${history.redo_count ? '' : 'disabled'}>↷</button>
      </span>
      <span class="tool-group">
        <select class="font-select" aria-label="Font family"><option>Arial</option><option>Georgia</option><option>Courier New</option></select>
        <button class="tool-button" data-command="font-down" type="button" aria-label="Decrease font size">−</button>
        <input class="font-size" value="${Number(ui.sheet.presentation.fontSize ?? 12)}" inputmode="numeric" aria-label="Font size" list="font-size-choices" />
        <datalist id="font-size-choices"><option value="10"></option><option value="12"></option><option value="14"></option><option value="16"></option><option value="18"></option></datalist>
        <button class="tool-button" data-command="font-up" type="button" aria-label="Increase font size">+</button>
      </span>
      <span class="tool-group">
        <button class="tool-button" data-format="bold" type="button" aria-label="Bold" aria-pressed="${Boolean(formats.bold)}"><b>B</b></button>
        <button class="tool-button" data-format="italic" type="button" aria-label="Italic" aria-pressed="${Boolean(formats.italic)}"><i>I</i></button>
        <button class="tool-button" data-format="underline" type="button" aria-label="Underline" aria-pressed="${Boolean(formats.underline)}"><u>U</u></button>
      </span>
      <span class="tool-group">
        <button class="tool-button" data-popover="text-color" type="button" aria-label="Text color">A̲</button>
        <button class="tool-button" data-popover="fill-color" type="button" aria-label="Fill color">▨</button>
        <button class="tool-button" data-popover="borders" type="button" aria-label="Borders">▦</button>
      </span>
      <span class="tool-group">
        <button class="tool-button" data-popover="horizontal" type="button" aria-label="Horizontal alignment">≡</button>
        <button class="tool-button" data-popover="vertical" type="button" aria-label="Vertical alignment">↕</button>
        <button class="tool-button" data-popover="wrap" type="button" aria-label="Text wrapping">↩</button>
      </span>
      <button class="tool-button more-tools" data-popover="more" type="button" aria-label="More formatting controls">•••</button>
    </div>`;
}

const menus = {
  File: [
    ['New', 'new-file', ''], ['Open', 'open', ''], ['Import', 'import', ''],
    ['Make a copy', 'make-copy', 'Representative'], ['-', '', ''],
    ['Version history', 'version-history', 'Changes'], ['Table settings', 'table-settings', '']
  ],
  Edit: [
    ['Undo', 'undo', '⌘Z'], ['Redo', 'redo', '⇧⌘Z'], ['-', '', ''],
    ['Cut', 'cut', 'Unavailable'], ['Copy', 'copy', '⌘C'], ['Paste', 'paste', 'Unavailable'],
    ['Clear selected values', 'clear', 'Delete'], ['-', '', ''],
    ['Select all', 'select-all', 'Representative'], ['Find', 'find', 'Representative']
  ],
  View: [
    ['Show', 'show', '›'], ['Freeze', 'freeze', '›'], ['Zoom', 'zoom', '100%'], ['Full screen', 'fullscreen', '']
  ],
  Format: [
    ['Theme', 'theme', 'Representative'], ['Number', 'number', '›'], ['Text', 'text', '›'],
    ['Alignment', 'alignment', '›'], ['Wrapping', 'wrapping', '›'],
    ['Rotation', 'rotation', 'Unavailable'], ['Smart chips', 'chips', 'Unavailable'],
    ['Font size', 'font-size', '›'], ['Merge cells', 'merge', 'Unavailable'],
    ['Clear formatting', 'clear-format', '']
  ]
};

const submenus = {
  show: [['Gridlines', 'show-gridlines'], ['Compact controls', 'show-compact']],
  freeze: [
    ['No rows', 'freeze-rows-0'], ['1 row', 'freeze-rows-1'], ['2 rows', 'freeze-rows-2'], ['Up to row 50', 'freeze-rows-50'],
    ['-', ''], ['No columns', 'freeze-columns-0'], ['1 column', 'freeze-columns-1'], ['2 columns', 'freeze-columns-2'], ['Up to column M', 'freeze-columns-13']
  ],
  zoom: ['50', '75', '90', '100', '125', '150', '200'].map((value) => [`${value}%`, `zoom-${value}`]),
  number: [['Automatic', 'number-auto'], ['Number', 'number-number'], ['Percent', 'number-percent'], ['Scientific', 'number-scientific']],
  text: [['Bold', 'format-bold'], ['Italic', 'format-italic'], ['Underline', 'format-underline']],
  alignment: [['Horizontal alignment', 'popover-horizontal'], ['Vertical alignment', 'popover-vertical']],
  wrapping: [['Wrap', 'choice-Wrap'], ['Clip', 'choice-Clip'], ['Overflow', 'choice-Overflow']],
  'font-size': ['10', '12', '14', '16', '18'].map((value) => [value, `font-size-${value}`])
};

function renderMenubar() {
  return `
    <div class="menubar" role="menubar" aria-label="Spreadsheet menus">
      ${Object.keys(menus).map((name) => `
        <button class="menu-trigger" type="button" role="menuitem" aria-haspopup="menu" aria-expanded="false" data-menu="${name}">${name}</button>
      `).join('')}
    </div>`;
}

function rowForKey(rowKey) {
  if (!ui.sheet) return null;
  const numeric = Number(rowKey);
  if (Number.isInteger(numeric)) return ui.sheet.records.find((row) => row.id === numeric) ?? null;
  return ui.sheet.drafts.find((draft) => draft.row_key === rowKey) ?? null;
}

function rawValue(rowKey, column) {
  const row = rowForKey(rowKey);
  if (!row) return '';
  if (row.patch) return row.patch[column.column_id] ?? '';
  return column.pg_name ? row[column.pg_name] ?? '' : '';
}

function displayValue(rowKey, column) {
  const row = rowForKey(rowKey);
  const error = ui.errors[cellStateKey(rowKey, column.column_id)];
  if (error) return '#VALUE!';
  if (!row) return '';
  if (row.patch) return row.patch[column.column_id] ?? '';
  const value = row.display?.[column.column_id] ?? rawValue(rowKey, column);
  if (column.format_type === 'badge' && value) return `<span class="badge">${escapeHtml(value)}</span>`;
  return escapeHtml(value);
}

function visibleRowKeys() {
  const existing = ui.sheet.records.map((row) => String(row.id));
  const blanks = Array.from({ length: 8 }, (_, index) => `draft-${existing.length + index + 1}`);
  return [...existing, ...blanks];
}

function renderGrid() {
  const columns = ui.sheet.columns;
  const rowKeys = visibleRowKeys();
  const logicalRows = Number(ui.sheet.presentation.logicalRows || 1000);
  const cells = [];
  cells.push('<div class="corner coordinate-corner" aria-hidden="true"></div>');
  for (const [index, column] of columns.entries()) {
    cells.push(`
      <button class="coordinate" type="button" role="columnheader" aria-colindex="${index + 2}" draggable="true"
        data-column="${column.column_id}" data-position="${column.position}">${coordinate(index)}</button>`);
  }
  cells.push('<div class="corner field-corner" aria-hidden="true">#</div>');
  for (const [index, column] of columns.entries()) {
    const gap = ui.gaps.includes(index + 1);
    cells.push(`
      <button class="field-header ${gap ? 'gap-error' : ''}" type="button" role="columnheader" aria-colindex="${index + 2}"
        data-column="${column.column_id}" data-position="${column.position}">
        ${gap ? '#ERROR!' : escapeHtml(column.label || '')}
      </button>`);
  }
  for (const [rowIndex, rowKey] of rowKeys.entries()) {
    const draft = ui.sheet.drafts.find((entry) => entry.row_key === rowKey);
    const rowError = draft && Object.keys(draft.errors || {}).length;
    cells.push(`
      <button class="row-header ${rowError ? 'row-error' : ''}" type="button" role="rowheader" aria-rowindex="${rowIndex + 3}" data-row="${rowKey}">${rowIndex + 1}</button>`);
    for (const [columnIndex, column] of columns.entries()) {
      const selected = ui.selected.row === rowIndex && ui.selected.column === columnIndex;
      const error = ui.errors[cellStateKey(rowKey, column.column_id)];
      cells.push(`
        <div class="cell ${selected ? 'selected' : ''} ${error ? 'error-cell' : ''}"
          role="gridcell" aria-rowindex="${rowIndex + 3}" aria-colindex="${columnIndex + 2}"
          aria-selected="${selected}" tabindex="${selected ? '0' : '-1'}"
          data-row="${rowKey}" data-column="${column.column_id}" data-row-index="${rowIndex}" data-column-index="${columnIndex}">
          ${displayValue(rowKey, column)}
        </div>`);
    }
  }
  return `
    <div class="sheet-scroll">
      <div class="grid" role="grid" aria-label="Tabular spreadsheet" aria-rowcount="${logicalRows + 2}" aria-colcount="${columns.length + 1}" style="--columns:${columns.length}">
        ${cells.join('')}
      </div>
    </div>`;
}

function renderSheet() {
  const { file, records, columns, presentation } = ui.sheet;
  const folderLabel = file.schema_name[0].toUpperCase() + file.schema_name.slice(1);
  app.innerHTML = `
    <section class="sheet" data-chapter="grid">
      <div class="sheet-identity">
        ${rootCrumbs(`<span aria-hidden="true">›</span><button class="crumb-button" data-nav="#/folder/${file.schema_name}" type="button">${folderLabel}</button><span aria-hidden="true">›</span><button id="file-title" class="file-title-button" type="button">${escapeHtml(file.display_name)}</button>`)}
        <span class="technical">${escapeHtml(file.schema_name)}.${escapeHtml(file.table_name)}</span>
      </div>
      ${renderMenubar()}
      ${renderToolbar()}
      ${renderGrid()}
      <footer class="sheet-foot">
        <div class="row-adder">
          <span>Rows</span>
          <input id="row-amount" type="number" min="1" max="10000" value="100" aria-label="Rows to add" />
          <button id="add-rows" class="secondary-button" type="button">Add Rows</button>
          <span class="helper">${presentation.logicalRows || 1000} logical rows</span>
        </div>
        <span class="status-line">${records.length} records · ${presentation.logicalRows || 1000} rows · ${columns.filter((column) => column.label).length} named columns</span>
      </footer>
    </section>`;
  bindNavigation();
  bindSheet();
}

function bindNavigation() {
  app.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.nav));
  });
}

function closeOverlay({ restoreFocus = false } = {}) {
  const triggerId = overlayRoot.firstElementChild?.dataset.triggerId;
  overlayRoot.replaceChildren();
  document.querySelectorAll('[aria-expanded="true"]').forEach((node) => node.setAttribute('aria-expanded', 'false'));
  if (restoreFocus && triggerId) document.getElementById(triggerId)?.focus();
}

function placeSurface(surface, rect) {
  overlayRoot.replaceChildren(surface);
  const width = surface.offsetWidth || 250;
  const height = surface.offsetHeight || 260;
  surface.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left))}px`;
  surface.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, rect.bottom + 4))}px`;
}

function makeSurface(className, trigger) {
  const surface = document.createElement('div');
  surface.className = `floating-surface ${className}`;
  surface.dataset.triggerId = trigger?.id || '';
  return surface;
}

function showMenu(trigger, name) {
  closeOverlay();
  if (!trigger.id) trigger.id = `menu-${name.toLowerCase()}`;
  trigger.setAttribute('aria-expanded', 'true');
  const surface = makeSurface('menu-surface', trigger);
  surface.setAttribute('role', 'menu');
  surface.innerHTML = menus[name].map(([label, action, hint]) => label === '-'
    ? '<div class="menu-separator" role="separator"></div>'
    : `<button class="menu-item" type="button" role="menuitem" data-action="${action}" ${['Unavailable', 'Representative'].includes(hint) ? 'disabled' : ''}><span>${label}</span><span class="shortcut">${hint}</span></button>`).join('');
  placeSurface(surface, trigger.getBoundingClientRect());
  bindMenuActions(surface);
  const items = [...surface.querySelectorAll('.menu-item:not(:disabled)')];
  items[0]?.focus();
  surface.addEventListener('keydown', (event) => {
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') items[(index + 1) % items.length]?.focus();
    if (event.key === 'ArrowUp') items[(index - 1 + items.length) % items.length]?.focus();
    if (event.key === 'Escape') closeOverlay({ restoreFocus: true });
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const triggers = [...document.querySelectorAll('.menu-trigger')];
      const triggerIndex = triggers.indexOf(trigger);
      const next = triggers[(triggerIndex + (event.key === 'ArrowRight' ? 1 : -1) + triggers.length) % triggers.length];
      showMenu(next, next.dataset.menu);
    }
    event.preventDefault();
  });
}

function showSubmenu(trigger, name) {
  const surface = makeSurface('menu-surface submenu-surface', trigger);
  surface.setAttribute('role', 'menu');
  surface.innerHTML = submenus[name].map(([label, action]) => label === '-'
    ? '<div class="menu-separator" role="separator"></div>'
    : `<button class="menu-item" type="button" role="menuitem" data-submenu-action="${action}">${label}</button>`).join('');
  placeSurface(surface, trigger.getBoundingClientRect());
  const items = [...surface.querySelectorAll('.menu-item')];
  items[0]?.focus();
  items.forEach((button) => button.addEventListener('click', () => handleSubmenuAction(button.dataset.submenuAction, trigger)));
  surface.addEventListener('keydown', (event) => {
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') items[(index + 1) % items.length]?.focus();
    if (event.key === 'ArrowUp') items[(index - 1 + items.length) % items.length]?.focus();
    if (event.key === 'Escape' || event.key === 'ArrowLeft') closeOverlay({ restoreFocus: true });
    event.preventDefault();
  });
}

async function handleSubmenuAction(action, trigger) {
  if (action.startsWith('freeze-rows-')) {
    await applyPresentation({ frozenRows: Number(action.replace('freeze-rows-', '')) });
  } else if (action.startsWith('freeze-columns-')) {
    await applyPresentation({ frozenColumns: Number(action.replace('freeze-columns-', '')) });
  } else if (action.startsWith('zoom-')) {
    await applyPresentation({ zoom: Number(action.replace('zoom-', '')) });
  } else if (action.startsWith('font-size-')) {
    await applyPresentation({ fontSize: Number(action.replace('font-size-', '')) });
  } else if (action.startsWith('format-')) {
    const format = action.replace('format-', '');
    await applyPresentation({ formats: { ...(ui.sheet.presentation.formats ?? {}), [format]: true } });
  } else if (action.startsWith('popover-')) {
    showChoicePopover(trigger, action.replace('popover-', ''));
    return;
  } else if (action.startsWith('choice-')) {
    await applyPresentation({ lastFormatChoice: action.replace('choice-', '') });
  } else {
    await applyPresentation({ lastViewChoice: action });
  }
  closeOverlay({ restoreFocus: true });
  await reloadSheet();
  announce(`${action.replaceAll('-', ' ')} recorded as session presentation state.`);
}

async function handleAction(action) {
  const fileId = ui.sheet?.file.id;
  if (action === 'new-file') {
    const file = await postAction({ type: 'create-file', folder: ui.sheet.file.schema_name });
    navigate(`#/sheet/${file.id}`);
  } else if (action === 'open') {
    navigate(`#/folder/${ui.sheet.file.schema_name}`);
  } else if (action === 'import') {
    navigate(`#/import/${ui.sheet.file.schema_name}`);
  } else if (action === 'table-settings') {
    openTableSettings();
  } else if (action === 'undo' || action === 'redo') {
    const result = await postAction({ type: action, fileId });
    announce(result.status === 'noop' ? `Nothing to ${action}.` : `${action === 'undo' ? 'Undid' : 'Redid'} ${result.actionType}.`);
    await reloadSheet();
  } else if (action === 'clear' || action === 'clear-format') {
    const cell = selectedCell();
    if (action === 'clear' && cell) await commitCell(cell, '');
    if (action === 'clear-format') await applyPresentation({ formats: {} });
  } else if (action === 'copy') {
    await copySelected();
  } else if (action === 'font-down' || action === 'font-up') {
    const sizes = [10, 12, 14, 16, 18];
    const current = Number(ui.sheet.presentation.fontSize ?? 12);
    const index = Math.max(0, sizes.indexOf(current));
    const next = sizes[Math.max(0, Math.min(sizes.length - 1, index + (action === 'font-up' ? 1 : -1)))];
    await applyPresentation({ fontSize: next });
    await reloadSheet();
    announce(`Font size ${next} applied as undoable presentation state.`);
  } else if (submenus[action]) {
    const trigger = overlayRoot.querySelector(`[data-action="${action}"]`);
    showSubmenu(trigger, action);
    return;
  } else if (action === 'fullscreen') {
    document.documentElement.requestFullscreen?.();
  } else if (['rotation', 'chips', 'merge'].includes(action)) {
    announce('This represented command is unavailable in the accepted first slice.');
  } else {
    announce(`${action.replaceAll('-', ' ')} is represented; persistence remains explicitly unproved here.`);
  }
  closeOverlay();
}

function bindMenuActions(surface) {
  surface.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => handleAction(button.dataset.action));
  });
}

function selectedCell() {
  return app.querySelector('.cell.selected');
}

function cellStateKey(rowKey, columnId, fileId = ui.sheet?.file?.id) {
  return `${fileId ?? 'unknown'}:${rowKey}:${columnId}`;
}

function selectCell(cell, { focus = true } = {}) {
  ui.selected.row = Number(cell.dataset.rowIndex);
  ui.selected.column = Number(cell.dataset.columnIndex);
  app.querySelectorAll('.cell.selected').forEach((node) => {
    node.classList.remove('selected');
    node.setAttribute('aria-selected', 'false');
    node.tabIndex = -1;
  });
  cell.classList.add('selected');
  cell.setAttribute('aria-selected', 'true');
  cell.tabIndex = 0;
  if (focus) cell.focus();
  const error = ui.errors[cellStateKey(cell.dataset.row, cell.dataset.column)];
  if (error) showErrorPopover(cell, 'Error', error);
}

function moveSelection(rowDelta, columnDelta) {
  const rows = visibleRowKeys();
  ui.selected.row = Math.max(0, Math.min(rows.length - 1, ui.selected.row + rowDelta));
  ui.selected.column = Math.max(0, Math.min(ui.sheet.columns.length - 1, ui.selected.column + columnDelta));
  const cell = app.querySelector(`.cell[data-row-index="${ui.selected.row}"][data-column-index="${ui.selected.column}"]`);
  if (cell) selectCell(cell);
}

function editorFor(cell, column) {
  const value = rawValue(cell.dataset.row, column);
  if (column.field_type === 'select') {
    const select = document.createElement('select');
    const options = column.config?.options || ['Processing', 'Ready', 'Shipped', 'Cancelled'];
    select.innerHTML = options.map((option) => `<option ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('');
    return { root: select, input: select };
  }
  if (column.field_type === 'switch') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);
    input.setAttribute('aria-label', `Edit ${column.label}`);
    return { root: input, input, read: () => input.checked };
  }
  if (column.field_type === 'price') {
    const root = document.createElement('div');
    root.className = 'price-editor';
    root.innerHTML = '<span aria-hidden="true">₱</span><input type="number" step="0.01" />';
    const input = root.querySelector('input');
    input.value = value;
    input.setAttribute('aria-label', `Edit ${column.label}`);
    return { root, input };
  }
  if (column.field_type === 'relation') {
    const root = document.createElement('div');
    root.className = 'relation-editor';
    const listId = `relation-options-${cell.dataset.row}-${cell.dataset.column}`;
    root.innerHTML = `<input type="search" role="combobox" aria-autocomplete="list" aria-expanded="true" list="${listId}" aria-label="Search ${escapeHtml(column.label)}" />
      <datalist id="${listId}">${ui.sheet.relationOptions.map((option) => `<option value="${escapeHtml(option.picker_label)}"></option>`).join('')}</datalist>`;
    const input = root.querySelector('input');
    const current = ui.sheet.relationOptions.find((option) => String(option.id) === String(value));
    input.value = current?.picker_label ?? '';
    return {
      root,
      input,
      read: () => ui.sheet.relationOptions.find((option) => option.picker_label === input.value)?.id ?? ''
    };
  }
  const input = document.createElement('input');
  input.type = column.field_type === 'date-time' ? 'datetime-local' : column.field_type === 'number' ? 'number' : 'text';
  input.value = column.field_type === 'date-time' && value ? new Date(value).toISOString().slice(0, 16) : value;
  input.setAttribute('aria-label', `Edit ${column.label || coordinate(Number(cell.dataset.columnIndex))}`);
  return { root: input, input };
}

function beginEdit(cell, initialKey = null) {
  if (!cell || cell.querySelector('input,select')) return;
  closeOverlay();
  const column = ui.sheet.columns.find((entry) => entry.column_id === cell.dataset.column);
  const editor = editorFor(cell, column);
  cell.replaceChildren(editor.root);
  const input = editor.input;
  if (initialKey && input instanceof HTMLInputElement && input.type === 'text') input.value = initialKey;
  input.focus();
  if (input.select) input.select();
  let finished = false;
  const finish = async (mode) => {
    if (finished) return;
    finished = true;
    if (mode === 'cancel') {
      renderSheet();
      selectedCell()?.focus();
      return;
    }
    const value = editor.read ? editor.read() : input.value;
    await commitCell(cell, value);
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish('cancel');
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      finish('commit');
    }
    event.stopPropagation();
  });
  input.addEventListener('blur', () => finish('commit'));
  if (column.field_type === 'switch') input.addEventListener('change', () => finish('commit'));
}

async function commitCell(cell, value) {
  const row = rowForKey(cell.dataset.row);
  const result = await postAction({
    type: 'edit-cell',
    fileId: ui.sheet.file.id,
    rowKey: cell.dataset.row,
    columnId: cell.dataset.column,
    value,
    expectedVersion: row?.version ?? null
  });
  const key = cellStateKey(cell.dataset.row, cell.dataset.column);
  if (result.status === 'invalid') {
    ui.errors[key] = result.error;
    announce('Value retained as a draft. PostgreSQL row was not changed.');
  } else if (result.status === 'conflict') {
    ui.errors[key] = `Stale version ${result.expectedVersion}; current version is ${result.actualVersion}.`;
    announce('Conflict: refresh before overwriting this record.');
  } else {
    delete ui.errors[key];
    announce(result.status.startsWith('draft') ? 'Draft saved. Row not added yet.' : 'Cell committed.');
  }
  await reloadSheet();
  const next = app.querySelector(`.cell[data-row="${cell.dataset.row}"][data-column="${cell.dataset.column}"]`);
  if (next) selectCell(next);
}

async function copySelected() {
  const cell = selectedCell();
  if (!cell) return;
  const value = rawValue(cell.dataset.row, ui.sheet.columns[Number(cell.dataset.columnIndex)]);
  const payload = {
    version: 1,
    column: cell.dataset.column,
    value
  };
  try {
    await navigator.clipboard.writeText(String(value));
  } catch {
    // Browser policy can deny clipboard in automation; the typed payload remains explicit.
  }
  announce(`Copied plain text plus Tabular typed payload v${payload.version}.`);
}

async function applyPresentation(patch) {
  ui.sheet.presentation = await postAction({
    type: 'presentation',
    fileId: ui.sheet.file.id,
    patch
  });
}

function showPalette(trigger, kind) {
  closeOverlay();
  if (!trigger.id) trigger.id = `tool-${kind}`;
  const surface = makeSurface('palette', trigger);
  const main = ['#ffffff', '#f5f6f7', '#dadce0', '#202124', '#1a73e8', '#c5221f', '#fbbc04', '#34a853'];
  const standard = ['#9334e6', '#00acc1', '#f28b82', '#a7ffeb', '#fdd663', '#81c995'];
  const selected = ui.sheet.presentation.lastColorKind === kind ? ui.sheet.presentation.lastColor : '#ffffff';
  surface.setAttribute('aria-label', kind.replace('-', ' '));
  surface.innerHTML = `
    <button class="palette-reset" type="button" data-color="#ffffff">Reset</button>
    <span class="palette-label">Main</span>
    <div class="swatch-grid main-swatches">${main.map((color, index) => `<button class="swatch" type="button" style="background:${color}" aria-label="Main color ${index + 1}" aria-pressed="${selected === color}" data-color="${color}"></button>`).join('')}</div>
    <span class="palette-label">Standard</span>
    <div class="swatch-grid standard-swatches">${standard.map((color, index) => `<button class="swatch standard" type="button" style="background:${color}" aria-label="Standard color ${index + 1}" aria-pressed="${selected === color}" data-color="${color}"></button>`).join('')}</div>
    <button class="palette-custom" type="button" data-representative="custom">Custom</button>`;
  if (kind === 'fill-color') surface.insertAdjacentHTML('beforeend', '<button class="menu-item" type="button" data-representative="conditional">Conditional formatting</button>');
  placeSurface(surface, trigger.getBoundingClientRect());
  surface.querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', async () => {
    await applyPresentation({ lastColor: button.dataset.color, lastColorKind: kind });
    announce(`${kind.replace('-', ' ')} choice recorded as presentation state.`);
    closeOverlay({ restoreFocus: true });
  }));
}

function showChoicePopover(trigger, kind) {
  closeOverlay();
  const surface = makeSurface(kind === 'borders' ? 'border-popover' : 'menu-surface', trigger);
  if (kind === 'borders') {
    const placements = ['All borders', 'Inner borders', 'Horizontal borders', 'Vertical borders', 'Outer borders', 'Left border', 'Top border', 'Right border', 'Bottom border', 'No borders'];
    surface.innerHTML = `
      <div class="border-grid">${placements.map((choice, index) => `<button class="border-choice border-choice-${index + 1}" type="button" aria-label="${choice}" title="${choice}" data-choice="${choice}"><span aria-hidden="true"></span></button>`).join('')}</div>
      <div class="border-options">
        <button class="menu-item" type="button" data-choice="Border color"><span>Border color</span><span class="border-sample color-sample" aria-hidden="true"></span></button>
        <button class="menu-item" type="button" data-choice="Solid"><span>Border style</span><span class="border-sample" aria-hidden="true"></span></button>
        <div class="line-style-grid" aria-label="Border styles">${['Solid', 'Medium', 'Thick', 'Dashed', 'Dotted', 'Double'].map((choice) => `<button type="button" aria-label="${choice} border" data-choice="${choice}"><span class="line-${choice.toLowerCase()}" aria-hidden="true"></span></button>`).join('')}</div>
      </div>`;
  } else {
  const choices = kind === 'borders'
    ? ['All borders', 'Inner borders', 'Horizontal borders', 'Vertical borders', 'Outer borders', 'Left border', 'Top border', 'Right border', 'Bottom border', 'No borders', 'Border color', 'Border style']
    : kind === 'horizontal' ? ['Align left', 'Align center', 'Align right']
    : kind === 'vertical' ? ['Align top', 'Align middle', 'Align bottom']
    : kind === 'wrap' ? ['Wrap', 'Clip', 'Overflow']
    : ['Text color', 'Fill color', 'Borders', 'Horizontal alignment', 'Vertical alignment', 'Wrap'];
  surface.innerHTML = choices.map((choice) => `<button class="menu-item" type="button" aria-label="${choice}" data-choice="${choice}"><span>${kind === 'borders' && !choice.startsWith('Border') ? '▦' : '◫'}</span><span class="shortcut">${choice}</span></button>`).join('');
  }
  placeSurface(surface, trigger.getBoundingClientRect());
  surface.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', async () => {
    await applyPresentation({ lastFormatChoice: button.dataset.choice });
    announce(`${button.dataset.choice} applied as undoable presentation state.`);
    closeOverlay({ restoreFocus: true });
  }));
}

function showErrorPopover(trigger, title, message, items = []) {
  closeOverlay();
  const surface = makeSurface('error-popover', trigger);
  surface.innerHTML = `<strong>${escapeHtml(title)}</strong><div>${escapeHtml(message)}</div>${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}`;
  placeSurface(surface, trigger.getBoundingClientRect());
}

function showContextMenu(trigger, target) {
  closeOverlay();
  const surface = makeSurface('context-surface', trigger);
  surface.setAttribute('role', 'menu');
  const definitions = target === 'cell'
    ? [['Cut', 'cut'], ['Copy', 'copy'], ['Paste', 'paste'], ['-', ''], ['Edit cell', 'edit'], ['Clear cell', 'clear'], ['Insert row above', 'insert-row'], ['Insert row below', 'insert-row']]
    : target === 'row'
    ? [['Cut row values', 'cut'], ['Copy row values', 'copy'], ['Paste row values', 'paste'], ['-', ''], ['Insert row above', 'insert-row'], ['Insert row below', 'insert-row'], ['Clear row values', 'clear-row'], ['Move row up', 'move-row'], ['Move row down', 'move-row'], ['Resize row', 'resize-row'], ['-', ''], ['Delete row…', 'delete-row']]
    : [['Cut', 'cut'], ['Copy', 'copy'], ['Paste column values', 'paste'], ['-', ''], ['Insert column left', 'insert-column'], ['Insert column right', 'insert-column'], ['Rename column', 'configure-column'], ['Configure column', 'configure-column'], ['-', ''], ['Sort ascending', 'sort'], ['Sort descending', 'sort'], ['Clear column values', 'clear-column'], ['Move column left', 'move-column-left'], ['Move column right', 'move-column-right'], ['Resize column', 'resize-column'], ['-', ''], ['Delete column…', 'delete-column']];
  surface.innerHTML = definitions.map(([label, action]) => label === '-'
    ? '<div class="menu-separator"></div>'
    : `<button class="menu-item" type="button" role="menuitem" data-context-action="${action}">${label}</button>`).join('');
  placeSurface(surface, trigger.getBoundingClientRect());
  surface.querySelectorAll('[data-context-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.contextAction;
    if (action === 'edit') beginEdit(trigger);
    else if (action === 'configure-column') openColumnSettings(trigger.dataset.column);
    else if (action.startsWith('move-column')) {
      const column = ui.sheet.columns.find((entry) => entry.column_id === trigger.dataset.column);
      const delta = action.endsWith('left') ? -1 : 1;
      const result = await postAction({ type: 'reorder-column', fileId: ui.sheet.file.id, columnId: column.column_id, targetPosition: column.position + delta });
      ui.gaps = result.gaps;
      await reloadSheet();
    } else if (action.startsWith('delete-')) openConfirmDialog(action);
    else announce(`${action.replaceAll('-', ' ')} is represented by this target-specific action boundary.`);
    closeOverlay();
  }));
}

function openConfirmDialog(action) {
  closeOverlay();
  const dialog = document.createElement('div');
  dialog.className = 'dialog';
  dialog.style.cssText = 'inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(360px,calc(100% - 24px));padding:18px';
  dialog.innerHTML = `<h2 style="margin-top:0;font-size:17px">Confirm ${escapeHtml(action.replace('delete-', 'delete '))}</h2><p>This structural action is distinct from clearing values. The Proof stops before live deletion.</p><div class="button-row" style="justify-content:flex-end"><button class="secondary-button" data-close type="button">Cancel</button><button class="danger-button" data-confirm type="button">Confirm</button></div>`;
  overlayRoot.append(dialog);
  dialog.querySelector('[data-close]').addEventListener('click', closeOverlay);
  dialog.querySelector('[data-confirm]').addEventListener('click', () => {
    announce('Confirmation captured; live destructive mutation remains unproved.');
    closeOverlay();
  });
}

function bindSheet() {
  app.querySelectorAll('.menu-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => showMenu(trigger, trigger.dataset.menu));
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter') showMenu(trigger, trigger.dataset.menu);
    });
  });
  app.querySelectorAll('[data-popover]').forEach((trigger) => trigger.addEventListener('click', () => {
    const kind = trigger.dataset.popover;
    if (kind.includes('color')) showPalette(trigger, kind);
    else showChoicePopover(trigger, kind);
  }));
  app.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', async () => {
    const pressed = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(pressed));
    await applyPresentation({
      formats: { ...(ui.sheet.presentation.formats ?? {}), [button.dataset.format]: pressed }
    });
    announce(`${button.dataset.format} recorded as presentation-only state.`);
  }));
  app.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => handleAction(button.dataset.command)));
  app.querySelector('.font-size')?.addEventListener('change', async (event) => {
    const size = Number(event.target.value);
    if (![10, 12, 14, 16, 18].includes(size)) {
      event.target.value = String(ui.sheet.presentation.fontSize ?? 12);
      announce('Choose font size 10, 12, 14, 16, or 18.');
      return;
    }
    await applyPresentation({ fontSize: size });
    await reloadSheet();
    announce(`Font size ${size} applied as undoable presentation state.`);
  });

  const grid = app.querySelector('.grid');
  grid.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');
    if (cell) selectCell(cell);
    const rowHeader = event.target.closest('.row-header');
    if (rowHeader?.classList.contains('row-error')) {
      const draft = ui.sheet.drafts.find((entry) => entry.row_key === rowHeader.dataset.row);
      showErrorPopover(rowHeader, 'Row not added', 'PostgreSQL rejected this incomplete row.', Object.values(draft.errors));
    }
    const field = event.target.closest('.field-header.gap-error');
    if (field) showErrorPopover(field, 'Missing column name', `Name column ${coordinate(Number(field.dataset.position) - 1)} before this layout can be saved.`);
  });
  grid.addEventListener('dblclick', (event) => {
    const cell = event.target.closest('.cell');
    if (cell) beginEdit(cell);
    const header = event.target.closest('.field-header');
    if (header && !header.classList.contains('gap-error')) {
      const column = ui.sheet.columns.find((entry) => entry.column_id === header.dataset.column);
      if (column.label) openColumnSettings(column.column_id);
      else beginHeaderEdit(header, column);
    }
  });
  grid.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const cell = event.target.closest('.cell');
    const row = event.target.closest('.row-header');
    const column = event.target.closest('.coordinate,.field-header');
    if (cell) {
      selectCell(cell, { focus: false });
      showContextMenu(cell, 'cell');
    } else if (row) showContextMenu(row, 'row');
    else if (column) showContextMenu(column, 'column');
  });
  grid.addEventListener('keydown', async (event) => {
    if (event.target.matches('input,select')) return;
    if (event.shiftKey && event.key === 'F10') {
      const cell = selectedCell();
      if (cell) showContextMenu(cell, 'cell');
      event.preventDefault();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      await copySelected();
      event.preventDefault();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      await handleAction(event.shiftKey ? 'redo' : 'undo');
      event.preventDefault();
      return;
    }
    if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const column = ui.sheet.columns[ui.selected.column];
      const result = await postAction({
        type: 'reorder-column',
        fileId: ui.sheet.file.id,
        columnId: column.column_id,
        targetPosition: column.position + (event.key === 'ArrowLeft' ? -1 : 1)
      });
      ui.gaps = result.gaps;
      await reloadSheet();
      event.preventDefault();
      return;
    }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[event.key]) {
      moveSelection(...moves[event.key]);
      event.preventDefault();
    } else if (event.key === 'Enter' || event.key === 'F2') {
      beginEdit(selectedCell());
      event.preventDefault();
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      await commitCell(selectedCell(), '');
      event.preventDefault();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      beginEdit(selectedCell(), event.key);
      event.preventDefault();
    }
  });
  grid.addEventListener('dragstart', (event) => {
    const coordinateNode = event.target.closest('.coordinate');
    if (coordinateNode) event.dataTransfer.setData('text/tabular-column', coordinateNode.dataset.column);
  });
  grid.querySelectorAll('.coordinate').forEach((node) => {
    node.addEventListener('dragover', (event) => event.preventDefault());
    node.addEventListener('drop', async (event) => {
      event.preventDefault();
      const columnId = event.dataTransfer.getData('text/tabular-column');
      const result = await postAction({ type: 'reorder-column', fileId: ui.sheet.file.id, columnId, targetPosition: Number(node.dataset.position) });
      ui.gaps = result.gaps;
      await reloadSheet();
      announce(result.gaps.length ? 'Column moved. Missing header positions now need names.' : 'Column moved.');
    });
  });
  grid.querySelectorAll('.error-cell').forEach((cell) => {
    cell.addEventListener('mouseenter', () => {
      clearTimeout(ui.hoverTimer);
      ui.hoverTimer = setTimeout(() => showErrorPopover(cell, 'Error', ui.errors[cellStateKey(cell.dataset.row, cell.dataset.column)]), 1000);
    });
    cell.addEventListener('mouseleave', () => clearTimeout(ui.hoverTimer));
  });
  app.querySelector('#add-rows').addEventListener('click', async () => {
    const amount = Number(app.querySelector('#row-amount').value);
    ui.sheet.presentation = await postAction({ type: 'add-rows', fileId: ui.sheet.file.id, amount });
    renderSheet();
    announce(`Added ${amount} logical rows without creating records.`);
  });
  app.querySelector('#file-title').addEventListener('click', beginRename);
  selectedCell()?.focus();
}

function beginHeaderEdit(header, column) {
  const input = document.createElement('input');
  input.setAttribute('aria-label', `Name column ${coordinate(Number(header.dataset.position) - 1)}`);
  header.replaceChildren(input);
  input.focus();
  let finished = false;
  const finish = async (cancel = false) => {
    if (finished) return;
    finished = true;
    if (!cancel && input.value.trim()) {
      await postAction({
        type: 'column-settings',
        fileId: ui.sheet.file.id,
        columnId: column.column_id,
        input: {
          label: input.value,
          fieldType: 'text',
          formatType: 'plain',
          required: false,
          uniqueValues: false,
          pgName: input.value,
          storageType: 'text'
        }
      });
    }
    await reloadSheet();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') finish(true);
    if (event.key === 'Enter' || event.key === 'Tab') finish(false);
  });
  input.addEventListener('blur', () => finish(false));
}

function beginRename() {
  if (ui.renameEditing) return;
  ui.renameEditing = true;
  const button = app.querySelector('#file-title');
  const input = document.createElement('input');
  input.className = 'title-editor';
  input.value = ui.sheet.file.display_name;
  button.replaceWith(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = async (cancel = false) => {
    if (finished) return;
    finished = true;
    ui.renameEditing = false;
    if (!cancel) {
      await postAction({ type: 'rename-file', fileId: ui.sheet.file.id, displayName: input.value });
      await reloadSheet();
      announce('Display name updated; PostgreSQL name follows only without an explicit override.');
    } else renderSheet();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(false);
    if (event.key === 'Escape') finish(true);
  });
  input.addEventListener('blur', () => finish(false));
}

function openPanel(title, body, onApply, panelName) {
  closeOverlay();
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.dataset.panel = panelName;
  panel.setAttribute('aria-label', title);
  panel.innerHTML = `
    <header class="panel-head"><h2>${escapeHtml(title)}</h2><button class="icon-button" data-close type="button" aria-label="Close panel">×</button></header>
    <div class="panel-body">${body}</div>
    <footer class="panel-actions"><button class="secondary-button" data-close type="button">Cancel</button><button class="button" data-apply type="button">Apply changes</button></footer>`;
  overlayRoot.append(panel);
  panel.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeOverlay));
  panel.querySelector('[data-apply]').addEventListener('click', () => onApply(panel));
  panel.querySelector('input,select')?.focus();
  return panel;
}

function openTableSettings() {
  const file = ui.sheet.file;
  openPanel('Table settings', `
    <label class="form-field"><span>Display name</span><input name="displayName" value="${escapeHtml(file.display_name)}" /><span class="helper">Shown in Files and at the top of this spreadsheet.</span></label>
    <label class="form-field"><span>Folder</span><select name="folder"><option value="operations" ${file.schema_name === 'operations' ? 'selected' : ''}>Operations</option><option value="finance" ${file.schema_name === 'finance' ? 'selected' : ''}>Finance</option></select></label>
    <label class="form-field"><span>PostgreSQL table name</span><input name="tableName" value="${escapeHtml(file.table_name)}" pattern="[a-z_][a-z0-9_]*" /><span class="helper">Lowercase database identity. An explicit override no longer follows the display name.</span></label>
  `, async (panel) => {
    const data = Object.fromEntries(new FormData(formFromPanel(panel)));
    await postAction({ type: 'table-settings', fileId: file.id, input: data });
    closeOverlay();
    await reloadSheet();
    announce('Table settings saved as configuration; live rename/move still requires a confirmed migration.');
  }, 'table-settings');
}

function formFromPanel(panel) {
  let form = panel.querySelector('form');
  if (!form) {
    form = document.createElement('form');
    panel.querySelectorAll('input,select,textarea').forEach((control) => form.append(control.cloneNode(true)));
  }
  return form;
}

function openColumnSettings(columnId) {
  const column = ui.sheet.columns.find((entry) => entry.column_id === columnId);
  const options = ['text', 'number', 'email', 'url', 'phone', 'relation', 'select', 'price', 'switch', 'date-time'];
  const formats = ['plain', 'email-link', 'clipped', 'related-record', 'badge', 'currency', 'yes-no', 'date-time'];
  const relation = column.config?.relation || {
    file: 'finance.invoices',
    pickerTemplate: '{invoice_number} — {customer_name}',
    savedTemplate: '{invoice_number}'
  };
  const panel = openPanel(`Configure ${column.label || coordinate(column.position - 1)}`, `
    <div data-panel="column-settings">
      <label class="form-field"><span>Column name</span><input name="label" value="${escapeHtml(column.label || '')}" /></label>
      <label class="form-field"><span>Field</span><select name="fieldType">${options.map((option) => `<option value="${option}" ${column.field_type === option ? 'selected' : ''}>${option === 'date-time' ? 'Date and time' : option[0].toUpperCase() + option.slice(1)}</option>`).join('')}</select><span class="helper">Controls entry and validation.</span></label>
      <div class="relation-fields" ${column.field_type === 'relation' ? '' : 'hidden'}>
        <label class="form-field"><span>File</span><select name="relationFile"><optgroup label="Finance"><option value="finance.invoices">Invoices</option><option value="finance.expenses">Expenses</option></optgroup><optgroup label="Operations"><option value="operations.vendors">Vendors</option><option value="operations.inventory">Inventory</option></optgroup></select></label>
        <label class="form-field"><span>Display format</span><input name="pickerTemplate" value="${escapeHtml(relation.pickerTemplate)}" /><span class="helper">Used only in the relation picker while editing.</span></label>
      </div>
      <label class="form-field"><span>Format</span><select name="formatType">${formats.map((option) => `<option value="${option}" ${column.format_type === option ? 'selected' : ''}>${option.replace('-', ' ')}</option>`).join('')}</select><span class="helper">Changes display only, not stored value.</span></label>
      <div class="saved-relation-format" ${column.format_type === 'related-record' ? '' : 'hidden'}>
        <label class="form-field"><span>Display format</span><input name="savedTemplate" value="${escapeHtml(relation.savedTemplate)}" /><span class="helper">Used for the saved cell at rest.</span></label>
      </div>
      <fieldset style="border:0;padding:0;margin:0 0 14px"><legend class="form-label">Constraints</legend>
        <label class="form-check"><input name="required" type="checkbox" ${column.required ? 'checked' : ''} /> Required</label>
        <label class="form-check"><input name="uniqueValues" type="checkbox" ${column.unique_values ? 'checked' : ''} /> Unique values</label>
      </fieldset>
      <details><summary>Advanced</summary>
        <label class="form-field"><span>PostgreSQL column name</span><input name="pgName" value="${escapeHtml(column.config?.proposedPgName || column.pg_name || column.label || '')}" /></label>
        <label class="form-field"><span>Storage type</span><input name="storageType" value="${escapeHtml(column.config?.proposedStorageType || column.storage_type)}" /></label>
        <label class="form-field"><span>Default value</span><input name="defaultValue" value="" /></label>
        <p class="notice">Changing storage or PostgreSQL identity may need a cast, rename, existing-value review, and a confirmed migration.</p>
      </details>
    </div>
  `, async (node) => {
    const value = (name) => node.querySelector(`[name="${name}"]`)?.value;
    await postAction({
      type: 'column-settings',
      fileId: ui.sheet.file.id,
      columnId,
      input: {
        label: value('label'), fieldType: value('fieldType'), formatType: value('formatType'),
        required: node.querySelector('[name="required"]').checked,
        uniqueValues: node.querySelector('[name="uniqueValues"]').checked,
        pgName: value('pgName'), storageType: value('storageType'),
        options: ['Processing', 'Ready', 'Shipped', 'Cancelled'],
        relation: { file: value('relationFile'), pickerTemplate: value('pickerTemplate'), savedTemplate: value('savedTemplate') }
      }
    });
    closeOverlay();
    await reloadSheet();
    announce('Column configuration updated; no physical migration was implied.');
  }, 'column-settings');
  const toggle = () => {
    panel.querySelector('.relation-fields').hidden = panel.querySelector('[name="fieldType"]').value !== 'relation';
    panel.querySelector('.saved-relation-format').hidden = panel.querySelector('[name="formatType"]').value !== 'related-record';
  };
  panel.querySelector('[name="fieldType"]').addEventListener('change', toggle);
  panel.querySelector('[name="formatType"]').addEventListener('change', toggle);
}

async function reloadSheet() {
  ui.sheet = await api(`/api/state?file=${encodeURIComponent(ui.sheet.file.id)}`);
  renderSheet();
}

async function postAction(body) {
  return api('/api/action', { method: 'POST', body: JSON.stringify(body) });
}

function renderImport() {
  const folder = ui.route.folder;
  const folderLabel = folder[0].toUpperCase() + folder.slice(1);
  const step = ui.import.step;
  const recovery = ui.import.state;
  const steps = ['Choose source', 'Preview values', 'Import'];
  app.innerHTML = `
    <section class="import-shell" data-chapter="import">
      <div class="import-head">${rootCrumbs(`<span aria-hidden="true">›</span><button class="crumb-button" data-nav="#/folder/${folder}" type="button">${folderLabel}</button><span aria-hidden="true">›</span><span class="crumb-button crumb-current">Import values</span>`)}</div>
      <p class="import-copy">Review source values, inferred fields, and fidelity warnings before creating a new table in ${folderLabel}.</p>
      <div class="import-layout">
        <ol class="step-list">${steps.map((label, index) => `<li class="${step === index + 1 ? 'active' : ''}"><span class="step-number">${index + 1}</span>${label}</li>`).join('')}</ol>
        <div class="import-card">
          <div class="import-body">${renderImportStep()}</div>
          <footer class="import-actions">
            ${recovery ? `
              <button class="secondary-button" data-import-action="abandon" type="button">Abandon import</button>
              <button class="secondary-button" data-import-action="choose-source" type="button">Choose another source</button>
              <button class="button" data-import-action="retry" type="button" ${recovery === 'progress' ? 'disabled' : ''}>${recovery === 'progress' ? 'Importing…' : 'Retry import'}</button>` : `
              ${step === 1 ? `<button class="secondary-button" data-import-action="cancel" type="button">Cancel</button>` : `<button class="secondary-button" data-import-action="back" type="button">Back</button>`}
              <button class="button" data-import-action="next" type="button">${step === 1 ? 'Preview values' : step === 2 ? 'Continue' : 'Import values'}</button>`}
          </footer>
        </div>
      </div>
    </section>`;
  bindNavigation();
  app.querySelectorAll('[data-source]').forEach((button) => button.addEventListener('click', () => {
    ui.import.source = button.dataset.source;
    renderImport();
  }));
  app.querySelector('[data-import-action="cancel"]')?.addEventListener('click', () => navigate(`#/folder/${folder}`));
  app.querySelector('[data-import-action="back"]')?.addEventListener('click', () => {
    ui.import.step -= 1;
    renderImport();
  });
  app.querySelector('[data-import-action="abandon"]')?.addEventListener('click', () => navigate(`#/folder/${folder}`));
  app.querySelector('[data-import-action="choose-source"]')?.addEventListener('click', () => {
    ui.import = { step: 1, source: 'csv', state: null };
    renderImport();
  });
  app.querySelector('[data-import-action="retry"]')?.addEventListener('click', () => {
    ui.import.state = 'progress';
    renderImport();
  });
  app.querySelector('[data-import-action="next"]')?.addEventListener('click', async () => {
    if (ui.import.step < 3) {
      ui.import.step += 1;
      renderImport();
      return;
    }
    const fileName = app.querySelector('[name="fileName"]').value;
    const tableName = app.querySelector('[name="tableName"]').value;
    ui.import.state = 'progress';
    renderImport();
    const result = await postAction({ type: 'import-values', input: { sourceKind: ui.import.source, fileName, tableName, folder } });
    announce('Import committed as one new PGlite table.');
    navigate(`#/sheet/${result.file.id}`);
  });
}

function renderImportStep() {
  if (ui.import.state === 'progress') return `
    <h1>Importing values</h1>
    <p>Creating a new PostgreSQL table and committing 248 reviewed rows.</p>
    <progress class="import-progress" max="100" value="64">64%</progress>
    <div class="notice"><strong>Import in progress</strong>The source is staged. The existing files in this folder remain unchanged.</div>`;
  if (ui.import.state === 'failed') return `
    <h1>Import stopped</h1>
    <p>No table was created. The staged source and review warnings are retained for a safe retry.</p>
    <div class="error-notice"><strong>Commit failed</strong>The transaction rolled back before any new file became visible.</div>`;
  if (ui.import.state === 'changed') return `
    <h1>Source changed</h1>
    <p>Q3-orders.csv changed after preview. Review the latest values before retrying.</p>
    <div class="error-notice"><strong>New source fingerprint detected</strong>The previous preview will not be committed.</div>`;
  if (ui.import.step === 1) return `
    <h1>Choose a source</h1>
    <p>Import once. Tabular will not keep this source synchronized.</p>
    <div class="source-options">
      ${[
        ['csv', 'CSV', 'Preserve source tokens.'],
        ['xlsx', 'XLSX', 'Use cached workbook values.'],
        ['google', 'Google Sheets', 'Import latest calculated values.']
      ].map(([id, label, copy]) => `<button class="source-option" type="button" data-source="${id}" aria-pressed="${ui.import.source === id}"><strong>${label}</strong><span>${copy}</span></button>`).join('')}
    </div>
    <div class="source-summary"><strong>Q3-orders.${ui.import.source === 'xlsx' ? 'xlsx' : 'csv'}</strong><div class="technical">248 rows · 6 columns · 38 KB</div><button class="link-button" type="button">Choose file</button></div>
    <div class="notice"><strong>Values only.</strong> Formulas, formatting, comments, notes, and workbook behavior are not recreated.</div>`;
  if (ui.import.step === 2) return `
    <h1>Preview values</h1>
    <p>Six inferred fields and five attributable warnings are ready for review.</p>
    <table class="preview-table"><thead><tr><th>Order ID</th><th>Customer</th><th>Total</th><th>Inference</th></tr></thead><tbody><tr><td>Q3-001</td><td>Northstar Market</td><td>12500.00</td><td>Text · Text · Price</td></tr><tr><td>Q3-002</td><td>Lumen Workshop</td><td>8840.50</td><td>Text · Text · Price</td></tr></tbody></table>
    <div class="notice"><strong>5 warnings</strong>Cached formula results will be imported as ordinary values with source coordinates.</div>`;
  return `
    <h1>Ready to import</h1>
    <p>Tabular will create one table and commit the reviewed values-only records.</p>
    <label class="form-field"><span>File name</span><input name="fileName" value="Q3 orders" /></label>
    <label class="form-field"><span>Table name</span><input name="tableName" value="q3_orders" /></label>
    <label class="form-field"><span>Folder</span><select name="folder" disabled><option>${ui.route.folder[0].toUpperCase() + ui.route.folder.slice(1)}</option></select></label>
    <table class="summary-table"><tbody><tr><th>Records</th><td>248 exact-value rows</td><td>Ready</td></tr><tr><th>Columns</th><td>6 mapped fields</td><td>Ready</td></tr><tr><th>Warnings</th><td>5 attributable items</td><td>Reviewable</td></tr></tbody></table>
    <div class="notice">The ${ui.route.folder[0].toUpperCase() + ui.route.folder.slice(1)} folder will include this table. Advanced data source: ${ui.route.folder}.q3_orders.</div>`;
}

searchInput.addEventListener('input', () => {
  ui.search = searchInput.value;
  if (ui.route.name === 'explorer') renderExplorer();
});

document.querySelector('#brand-home').addEventListener('click', () => navigate('#/explorer'));
document.addEventListener('pointerdown', (event) => {
  if (overlayRoot.children.length && !overlayRoot.contains(event.target) && !event.target.closest('[aria-haspopup], [data-popover]')) closeOverlay();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && overlayRoot.children.length) closeOverlay({ restoreFocus: true });
});
window.addEventListener('hashchange', loadRoute);

loadRoute().catch((error) => {
  app.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
