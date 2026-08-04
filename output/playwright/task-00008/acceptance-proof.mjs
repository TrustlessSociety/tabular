// Materialize only into /tmp with materialize-proof.mjs; this template has no session secrets.
(globalThis.__task00008Acceptance = async page => {
  const origin = '__TASK00008_ORIGIN__';
  const output = '/Users/cblanquera/server/projects/trustless/tabular/output/playwright/task-00008';
  const ordersFileId = '__TASK00008_ORDERS_FILE__';
  const customersFileId = '__TASK00008_CUSTOMERS_FILE__';
  const signals = [];
  const requests = [];
  const responses = [];
  const requestCaptures = [];
  let expectedPermissionDenial = false;
  let expectedNetworkFailure = false;
  const check = (value, message) => { if (!value) throw new Error(message); };
  const actionType = request => {
    try {
      const body = request.postData() || '';
      return body.match(/"type":"([^"]+)"/)?.[1] || body.match(/"kind":"([^"]+)"/)?.[1];
    } catch { return undefined; }
  };
  const attachSignals = (candidate, context = 'owner') => {
    candidate.on('console', message => {
      if (
        expectedPermissionDenial
        && message.type() === 'error'
        && message.text().includes('status of 403')
      ) return;
      if (
        expectedNetworkFailure
        && message.type() === 'error'
        && message.text().includes('net::ERR_FAILED')
      ) return;
      if (message.type() === 'error' || message.type() === 'warning') {
        signals.push(`console:${context}:${message.type()}:${message.text()}`);
      }
    });
    candidate.on('pageerror', error => signals.push(`pageerror:${context}:${error.message}`));
    candidate.on('requestfailed', request => {
      if (expectedNetworkFailure && request.url().endsWith('/events/grid')) {
        return;
      }
      signals.push(`requestfailed:${context}:${request.method()}:${request.url()}:${request.failure()?.errorText}`);
    });
    candidate.on('request', request => {
      if (!request.url().includes('/events/grid') && !request.url().includes('/events/files')) return;
      requestCaptures.push(request.allHeaders().then(headers => requests.push({
        context,
        path: request.url().slice(origin.length).split('?')[0],
        method: request.method(),
        action: actionType(request),
        contentType: headers['content-type'],
        origin: headers.origin,
        hasCsrf: Boolean(headers['x-tabular-csrf']),
        hasSessionCookie: Boolean(headers.cookie?.includes('tabular_session='))
      })).catch(error => signals.push(`request-headers:${context}:${error.message}`)));
    });
    candidate.on('response', response => {
      if (!response.url().includes('/events/grid') && !response.url().includes('/events/files')) return;
      responses.push({
        context,
        path: response.url().slice(origin.length).split('?')[0],
        method: response.request().method(),
        action: actionType(response.request()),
        status: response.status(),
        hasRotatedCsrf: Boolean(response.headers()['x-tabular-csrf'])
      });
      if (response.status() >= 500) signals.push(`http:${context}:${response.status()}:${response.url()}`);
    });
  };
  attachSignals(page);

  const unauthenticatedResponse = await page.context().request.get(
    `${origin}/events/grid?folder=operations&table=orders`
  );
  const unauthenticated = {
    status: unauthenticatedResponse.status(),
    body: await unauthenticatedResponse.json()
  };
  check(
    unauthenticated.status === 401 && unauthenticated.body?.error?.code === 'invalid_session',
    'Grid read boundary is not session protected'
  );
  await page.context().addCookies([{
    name: 'tabular_session',
    value: '__TASK00008_OWNER_SESSION__',
    url: origin,
    httpOnly: true,
    sameSite: 'Strict'
  }]);

  const waitGrid = async candidate => {
    await candidate.locator('.grid-stage[data-grid-ready="true"]').waitFor({ timeout: 15_000 });
    await candidate.locator('.tabulator-row').first().waitFor({ timeout: 15_000 });
  };
  const waitBlankGrid = async candidate => {
    await candidate.locator('.grid-stage[data-grid-ready="true"]').waitFor({ timeout: 15_000 });
    await candidate.locator('.tabulator-col[tabulator-field]').first().waitFor({ timeout: 15_000 });
  };
  const field = (candidate, label) => candidate.evaluate(label => {
    const headers = [...document.querySelectorAll('.tabulator-col[tabulator-field]')];
    return headers.find(header => (
      header.querySelector('.tabular-column-semantic')?.textContent?.trim() === label
    ))?.getAttribute('tabulator-field');
  }, label);
  const row = (candidate, order) => candidate.locator('.tabulator-row').filter({ hasText: order });
  const cell = async (candidate, order, label) => {
    const column = await field(candidate, label);
    check(column, `Missing ${label} column`);
    return row(candidate, order).locator(`[tabulator-field="${column}"]`);
  };
  const waitFeedback = (candidate, value) => candidate.locator('.status-bar output')
    .filter({ hasText: value }).waitFor({ timeout: 15_000 });
  const commitDraft = async candidate => {
    await candidate.getByRole('button', { name: 'Commit', exact: true }).click();
    await waitFeedback(candidate, 'Saved ·');
  };
  const editInput = async (target, value) => {
    await target.dblclick();
    const editor = target.locator('input, textarea').first();
    await editor.waitFor();
    await editor.fill(value);
    await editor.press('Enter');
  };
  const range = async (candidate, start, end) => {
    await start.click();
    await end.click({ modifiers: ['Shift'] });
    check((await candidate.locator('.name-box').textContent())?.includes(':'), 'Range selection missing');
  };
  const widths = candidate => candidate.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  const waitAction = (candidate, type) => candidate.waitForResponse(response => (
    response.url().endsWith('/events/grid') && actionType(response.request()) === type
  ));

  await page.setViewportSize({ width: 1440, height: 900 });
  const tableResponse = await page.goto(`${origin}/pages/table.html?folder=operations&table=orders`);
  check(tableResponse?.status() === 200, 'Authenticated table did not load');
  await waitGrid(page);
  check(await page.locator('.tabulator-row').count() === 3, 'Expected three owner-visible PostgreSQL rows');
  check((await page.locator('.runtime-state').textContent())?.trim() === 'Saved', 'Fresh grid must say Saved');
  check((await (await cell(page, 'ord-001', 'Unit price')).textContent())?.startsWith('₱'), 'Price output is not currency');
  check((await (await cell(page, 'ord-001', 'Active')).textContent())?.trim() === 'Yes', 'Switch output is not Yes/No');
  check((await (await cell(page, 'ord-001', 'Starts at')).textContent())?.includes('Aug 1, 10:32 AM'), 'Date-time output is not compact');
  await page.screenshot({ path: `${output}/grid-desktop.png`, fullPage: true });

  const editorMatrix = [
    ['Relation note', 'text'],
    ['Quantity', 'text'],
    ['Contact email', 'email'],
    ['Website', 'url'],
    ['Phone', 'tel'],
    ['Unit price', 'text'],
    ['Starts at', 'datetime-local']
  ];
  for (const [label, type] of editorMatrix) {
    const target = await cell(page, 'ord-001', label);
    await target.dblclick();
    const input = target.locator(`input[type="${type}"]`);
    await input.waitFor();
    if (label === 'Quantity' || label === 'Unit price') {
      check(await input.getAttribute('inputmode') === 'decimal', `${label} lacks decimal input semantics`);
    }
    if (label === 'Unit price') {
      check((await target.textContent())?.includes('₱'), 'Price editor prefix is missing');
    }
    await input.press('Escape');
  }
  const switchCell = await cell(page, 'ord-001', 'Active');
  await switchCell.dblclick();
  await switchCell.locator('input[role="switch"]').waitFor();
  await switchCell.locator('input[role="switch"]').press('Escape');
  const statusCell = await cell(page, 'ord-003', 'Status');
  await statusCell.dblclick();
  const selectList = page.locator('.tabulator-edit-list');
  await selectList.waitFor();
  check(
    (await selectList.textContent())?.includes('Draft')
      && (await selectList.textContent())?.includes('Approved')
      && !(await selectList.textContent())?.includes('Restricted'),
    'Select options are not the allowed registry'
  );
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${output}/field-matrix-desktop.png`, fullPage: true });

  await editInput(await cell(page, 'ord-001', 'Quantity'), '5');
  await commitDraft(page);
  check((await (await cell(page, 'ord-001', 'Total')).textContent())?.includes('₱62.500000000000000000'), 'Generated value did not refresh');

  await editInput(await cell(page, 'ord-001', 'Quantity'), '999');
  const persistedRejection = waitAction(page, 'draft.create');
  await page.getByRole('button', { name: 'Commit', exact: true }).click();
  await persistedRejection;
  await page.getByText('Draft needs attention').first().waitFor();
  const invalidCell = await cell(page, 'ord-001', 'Quantity');
  check((await invalidCell.textContent())?.includes('#VALUE!'), 'Invalid cell lacks #VALUE!');
  await invalidCell.click();
  const invalidCellPopover = invalidCell.getByRole('tooltip');
  await invalidCellPopover.waitFor();
  const invalidCellBox = await invalidCellPopover.boundingBox();
  check(
    invalidCellBox && invalidCellBox.x >= 16 && invalidCellBox.x + invalidCellBox.width <= 1424,
    'Invalid cell explanation is clipped by the viewport'
  );
  check(await invalidCellPopover.evaluate(element => {
    const box = element.getBoundingClientRect();
    element.style.pointerEvents = 'auto';
    const topmost = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    const visible = topmost === element || (topmost ? element.contains(topmost) : false);
    element.style.removeProperty('pointer-events');
    return visible;
  }), 'Invalid cell explanation is occluded by the grid');
  const invalidRowHeader = row(page, 'ord-001').locator('.tabulator-row-header');
  await invalidRowHeader.focus();
  const invalidRowPopover = invalidRowHeader.getByRole('tooltip');
  await invalidRowPopover.getByText('Row not added').waitFor();
  await invalidCellPopover.waitFor({ state: 'hidden' });
  const invalidRowBox = await invalidRowPopover.boundingBox();
  check(
    invalidRowBox && invalidRowBox.x >= 16 && invalidRowBox.x + invalidRowBox.width <= 1424,
    'Invalid row explanation is clipped by the viewport'
  );
  check(await invalidRowPopover.evaluate(element => {
    const box = element.getBoundingClientRect();
    element.style.pointerEvents = 'auto';
    const topmost = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    const visible = topmost === element || (topmost ? element.contains(topmost) : false);
    element.style.removeProperty('pointer-events');
    return visible;
  }), 'Invalid row explanation is occluded by the grid');
  await page.screenshot({ path: `${output}/invalid-draft-desktop.png`, fullPage: true });
  await page.reload();
  await waitGrid(page);
  await waitFeedback(page, 'Recovered persistent draft');
  const recoveredCell = await cell(page, 'ord-001', 'Quantity');
  check((await recoveredCell.textContent())?.includes('#VALUE!'), 'Reload did not recover the invalid token');
  await recoveredCell.dblclick();
  check(await recoveredCell.locator('input').inputValue() === '999', 'Reload discarded the raw attempted value');
  await recoveredCell.locator('input').fill('6');
  await recoveredCell.locator('input').press('Enter');
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Commit');
    return button && !button.hasAttribute('disabled') && button.textContent?.trim() === 'Commit';
  });
  await page.screenshot({ path: `${output}/draft-recovered-desktop.png`, fullPage: true });
  await commitDraft(page);

  const networkCell = await cell(page, 'ord-001', 'Relation note');
  await editInput(networkCell, 'network-retained-value');
  let aborted = false;
  await page.route('**/events/grid', async route => {
    if (!aborted && route.request().method() === 'POST' && actionType(route.request()) === 'record.patch') {
      aborted = true;
      expectedNetworkFailure = true;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  const persistedNetwork = waitAction(page, 'draft.create');
  await page.getByRole('button', { name: 'Commit', exact: true }).click();
  await persistedNetwork;
  await waitFeedback(page, 'server could not be reached');
  check((await networkCell.textContent())?.includes('#ERROR!'), 'Network failure lacks #ERROR!');
  await networkCell.dblclick();
  check(await networkCell.locator('input').inputValue() === 'network-retained-value', 'Network failure discarded raw input');
  await networkCell.locator('input').press('Escape');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitFeedback(page, 'Draft canceled');
  await page.unroute('**/events/grid');
  expectedNetworkFailure = false;

  const row2Price = await cell(page, 'ord-002', 'Unit price');
  await row2Price.click();
  await page.keyboard.press('Control+C');
  await range(page, await cell(page, 'ord-001', 'Unit price'), await cell(page, 'ord-003', 'Unit price'));
  const rangeSelection = await page.locator('.grid-stage').getAttribute('data-selection');
  await page.keyboard.press('Control+V');
  await page.getByText('Uncommitted draft').first().waitFor();
  await page.screenshot({ path: `${output}/range-draft-desktop.png`, fullPage: true });
  await commitDraft(page);
  check(await page.locator('.grid-stage').getAttribute('data-selection') === rangeSelection, 'Range selection was lost after save');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitFeedback(page, 'Undid · paste');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await waitFeedback(page, 'Redid · paste');
  await range(page, await cell(page, 'ord-001', 'Quantity'), await cell(page, 'ord-003', 'Quantity'));
  await page.keyboard.press('Control+D');
  await commitDraft(page);

  const confirmColumnPlan = async dialog => {
    await dialog.getByRole('button', { name: 'Review change' }).click();
    await dialog.getByRole('heading', { name: 'Review schema impact' }).waitFor();
    await dialog.getByRole('button', { name: 'Confirm owner change' }).click();
    await dialog.waitFor({ state: 'detached' });
    await waitFeedback(page, 'Owner confirmation recorded');
  };
  const reloadUntilColumn = async label => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await page.waitForTimeout(120);
      await page.reload();
      await waitGrid(page);
      if (await field(page, label)) return;
    }
    throw new Error(`Migrator did not expose ${label}`);
  };
  const addColumn = async ({ name, fieldLabel, defaultValue, required, options }) => {
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New column' });
    await dialog.getByLabel('Column name', { exact: true }).fill(name);
    await dialog.getByLabel('Field', { exact: true }).selectOption({ label: fieldLabel });
    if (defaultValue !== undefined) await dialog.getByLabel('Default', { exact: true }).fill(defaultValue);
    if (required) await dialog.getByLabel('Required', { exact: true }).check();
    if (options) await dialog.getByLabel('Allowed values', { exact: true }).fill(options.join('\n'));
    await confirmColumnPlan(dialog);
    await reloadUntilColumn(name);
  };
  await addColumn({ name: 'Browser note', fieldLabel: 'Text', defaultValue: 'seed', required: true });
  const noteHeader = page.locator('.tabulator-col[tabulator-field]').filter({ has: page.getByText('Browser note', { exact: true }) });
  await noteHeader.dblclick();
  const noteDialog = page.getByRole('dialog', { name: 'Configure Browser note' });
  await noteDialog.getByLabel('Column name', { exact: true }).fill('Browser comment');
  await confirmColumnPlan(noteDialog);
  await reloadUntilColumn('Browser comment');
  await addColumn({ name: 'Browser score', fieldLabel: 'Number', defaultValue: '5' });
  await addColumn({ name: 'Browser state', fieldLabel: 'Select', defaultValue: 'open', options: ['open', 'closed'] });
  await addColumn({ name: 'Browser label', fieldLabel: 'Generated text' });
  const generatedHeader = page.locator('.tabulator-col[tabulator-field]').filter({ has: page.getByText('Browser label', { exact: true }) });
  await generatedHeader.dblclick();
  const generatedDialog = page.getByRole('dialog', { name: 'Configure Browser label' });
  await generatedDialog.getByText('Generated, identity, and stable-key columns stay read-only in the grid.').waitFor();
  check(await generatedDialog.getByRole('button', { name: 'Review change' }).isDisabled(), 'Generated column settings allowed mutation');
  await generatedDialog.getByRole('button', { name: 'Cancel' }).click();

  const relationHeader = page.locator('.tabulator-col[tabulator-field]').filter({ has: page.getByText('Customer tenant', { exact: true }) });
  await relationHeader.dblclick();
  const relationDialog = page.getByRole('dialog', { name: 'Configure Customer tenant' });
  await page.waitForFunction(() => (
    document.activeElement?.getAttribute('aria-label') === 'Close column settings'
  ));
  check(await relationDialog.locator('details[open]').count() === 0, 'Advanced must start collapsed');
  const relationFile = relationDialog.getByLabel('File', { exact: true });
  const relationKey = relationDialog.getByLabel('Key', { exact: true });
  await relationFile.selectOption({ label: 'Keyless' });
  await relationDialog.getByText('No eligible primary or unique key is visible.').waitFor();
  check(await relationKey.isDisabled(), 'Keyless target was offered as eligible');
  await page.screenshot({ path: `${output}/relation-ineligible-desktop.png`, fullPage: true });
  await relationFile.selectOption({ label: 'Customers' });
  await relationKey.locator('option:not([value=""])').first().waitFor({ state: 'attached' });
  await relationKey.selectOption(await relationKey.locator('option:not([value=""])').first().getAttribute('value'));
  const sourceSelectors = relationDialog.getByLabel(/^Source for /);
  check(await sourceSelectors.count() === 2, 'Composite key source mapping is incomplete');
  await sourceSelectors.nth(0).selectOption({ label: 'Customer tenant' });
  await sourceSelectors.nth(1).selectOption({ label: 'Customer' });
  const mappedIds = await sourceSelectors.evaluateAll(items => items.map(item => item.value));
  const relationNoteId = await field(page, 'Relation note');
  check(mappedIds.length === 2 && !mappedIds.includes(relationNoteId), 'Relation mapping silently used the adjacent spacer');
  const displayFormats = relationDialog.getByLabel('Display format', { exact: true });
  check(await displayFormats.count() === 2, 'Relation requires two independent Display format controls');
  await displayFormats.nth(0).fill('{{label}} — {{key}}');
  await displayFormats.nth(1).fill('{{label}}');
  await relationDialog.getByRole('button', { name: 'Review change' }).click();
  await relationDialog.getByRole('heading', { name: 'Review schema impact' }).waitFor();
  await page.screenshot({ path: `${output}/relation-impact-desktop.png`, fullPage: true });
  await relationDialog.getByRole('button', { name: 'Confirm owner change' }).click();
  await relationDialog.waitFor({ state: 'detached' });
  let relationDescription;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(120);
    relationDescription = await page.evaluate(async fileId => (
      await (await fetch(`/events/files?${new URLSearchParams({ fileId })}`)).json()
    ), ordersFileId);
    if (relationDescription?.data?.constraints?.some(constraint => (
      constraint.kind === 'f' && constraint.targetFileId === '__TASK00008_CUSTOMERS_FILE__'
    ))) break;
  }
  const relationConstraint = relationDescription?.data?.constraints?.find(constraint => (
    constraint.kind === 'f' && constraint.targetFileId === customersFileId
  ));
  check(relationConstraint?.columnIds?.length === 2, 'Composite relation did not apply');
  check(!relationConstraint.columnIds.includes(relationNoteId), 'Applied relation included the adjacent spacer');
  await page.reload();
  await waitGrid(page);
  check((await (await cell(page, 'ord-003', 'Customer tenant')).textContent())?.includes('Customer 060'), 'Existing relation beyond the first lookup page rendered as a raw key');
  const liveRelationCell = await cell(page, 'ord-001', 'Customer tenant');
  await liveRelationCell.dblclick();
  const relationList = page.locator('.tabulator-edit-list');
  await relationList.waitFor();
  await relationList.getByText(/Ada Industries/).waitFor();
  const relationSearch = liveRelationCell.locator('input');
  const restrictedLookup = page.waitForResponse(response => (
    response.url().includes('/events/grid-relation')
      && response.url().includes('query=Restricted+Industries')
  ));
  await relationSearch.fill('');
  await relationSearch.pressSequentially('Restricted Industries');
  await restrictedLookup;
  await page.waitForTimeout(300);
  check(!(await relationList.textContent())?.includes('Restricted Industries'), 'RLS-restricted relation row was exposed');
  await relationSearch.fill('');
  await relationSearch.pressSequentially('Customer 060');
  await relationList.getByText(/Customer 060/).waitFor();
  await relationSearch.fill('');
  await relationSearch.pressSequentially('Turing Trading');
  await relationList.getByText(/Turing Trading/).waitFor();
  await relationList.getByText(/Turing Trading/).click();
  await page.getByText('2 relation key cells in draft').waitFor();
  await commitDraft(page);
  check((await (await cell(page, 'ord-001', 'Customer tenant')).textContent())?.includes('Turing Trading'), 'Saved relation formatter is not live');

  const customerPage = await page.context().newPage();
  attachSignals(customerPage, 'customer');
  await customerPage.goto(`${origin}/pages/table.html?folder=crm&table=customers`);
  await waitGrid(customerPage);
  await editInput(await cell(customerPage, 'cust-002', 'label'), 'Turing Live Updated');
  await commitDraft(customerPage);
  await customerPage.close();
  await page.reload();
  await waitGrid(page);
  check((await (await cell(page, 'ord-001', 'Customer tenant')).textContent())?.includes('Turing Live Updated'), 'Relation lookup used stale seeded options');

  await page.getByRole('button', { name: 'Add row', exact: true }).click();
  const draftRow = page.locator('.tabulator-row[data-tabular-row-id^="draft_row_"]');
  await draftRow.waitFor();
  await page.getByText('Draft needs attention').first().waitFor();
  const draftHeader = draftRow.locator('.tabulator-row-header');
  await draftHeader.focus();
  const draftPopover = draftHeader.getByRole('tooltip');
  await draftPopover.getByText('Row not added').waitFor();
  check(await draftRow.locator('.tabular-cell-invalid').count() === 2, 'Insert draft marked valid cells as errors');
  check(await draftPopover.locator('li').count() === 2, 'Insert row explanation lists valid fields as failures');
  check(
    (await draftPopover.textContent())?.includes('Customer tenant')
      && (await draftPopover.textContent())?.includes('Customer')
      && !(await draftPopover.textContent())?.includes('Relation note'),
    'Insert row explanation does not isolate the failing relation keys'
  );
  const relationField = await field(page, 'Customer tenant');
  await draftRow.locator(`[tabulator-field="${relationField}"]`).dblclick();
  await page.locator('.tabulator-edit-list').getByText(/Ada Industries/).click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Commit');
    return button && !button.hasAttribute('disabled') && button.textContent?.trim() === 'Commit';
  });
  await commitDraft(page);
  const insertedRow = page.locator('.tabulator-row').filter({ hasText: 'NEW-00004-B' });
  await insertedRow.waitFor();
  await insertedRow.locator(`[tabulator-field="${relationField}"]`).click();
  const deleteTrigger = page.getByRole('button', { name: 'Delete row', exact: true });
  await deleteTrigger.click();
  const deleteDialog = page.getByRole('alertdialog', { name: 'Delete this PostgreSQL row?' });
  await deleteDialog.waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Cancel');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (
    document.activeElement?.textContent?.trim() === 'Delete row'
  ));
  await deleteTrigger.click();
  await page.screenshot({ path: `${output}/delete-confirmation-desktop.png`, fullPage: true });
  await deleteDialog.getByRole('button', { name: 'Delete row' }).click();
  await waitFeedback(page, 'Saved · Delete row');
  const selectionAfterDelete = await page.locator('.grid-stage').getAttribute('data-selection');
  check(!selectionAfterDelete?.includes('draft_row_') && !selectionAfterDelete?.includes('NEW-00004-B'), 'Delete left focus on the removed row');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitFeedback(page, 'Undid · Delete row');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await waitFeedback(page, 'Redid · Delete row');

  await page.context().addCookies([{
    name: 'tabular_session',
    value: '__TASK00008_READER_SESSION__',
    url: origin,
    httpOnly: true,
    sameSite: 'Strict'
  }]);
  await page.goto(`${origin}/pages/table.html?folder=operations&table=orders`);
  await page.locator('.grid-stage[data-grid-ready="true"]').waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Add column', exact: true }).click();
  const deniedDialog = page.getByRole('dialog', { name: 'New column' });
  await deniedDialog.getByLabel('Column name', { exact: true }).fill('Reader attempt');
  expectedPermissionDenial = true;
  await deniedDialog.getByRole('button', { name: 'Review change' }).click();
  await deniedDialog.getByRole('alert').waitFor();
  expectedPermissionDenial = false;
  check(
    (await deniedDialog.getByRole('alert').textContent())?.includes('requires owning-role authority'),
    'Permission denial discarded the actionable owning-role reason'
  );
  check(await deniedDialog.getByLabel('Column name', { exact: true }).inputValue() === 'Reader attempt', 'Permission denial discarded the form');
  await page.screenshot({ path: `${output}/permission-denied-desktop.png`, fullPage: true });

  await page.context().addCookies([{
    name: 'tabular_session',
    value: '__TASK00008_OWNER_SESSION__',
    url: origin,
    httpOnly: true,
    sameSite: 'Strict'
  }]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/pages/table.html?new=1&folder=operations&table=untitled-desktop`);
  await waitBlankGrid(page);
  const blankHeader = page.locator('.tabulator-col[tabulator-field]').first();
  await blankHeader.dblclick();
  const headerInput = blankHeader.locator('.tabular-header-name-input');
  await headerInput.waitFor();
  await headerInput.fill('SKU');
  await headerInput.press('Tab');
  check((await blankHeader.locator('.tabular-column-semantic').textContent())?.trim() === 'SKU', 'Inline header naming did not create a Text column');
  await blankHeader.dblclick();
  const skuDialog = page.getByRole('dialog', { name: 'Configure SKU' });
  await skuDialog.waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (
    document.activeElement?.getAttribute('tabulator-field')
      && document.activeElement?.textContent?.includes('SKU')
  ));
  await page.screenshot({ path: `${output}/blank-header-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/pages/table.html?folder=operations&table=orders`);
  await waitGrid(page);
  const narrowBefore = await widths(page);
  check(narrowBefore.document === 390 && narrowBefore.body === 390, 'Narrow live grid overflowed');
  await editInput(await cell(page, 'ord-001', 'Quantity'), '7');
  await commitDraft(page);
  await page.screenshot({ path: `${output}/grid-narrow.png`, fullPage: true });
  await page.goto(`${origin}/pages/table.html?new=1&folder=operations&table=untitled-narrow`);
  await waitBlankGrid(page);
  const narrowHeader = page.locator('.tabulator-col[tabulator-field]').first();
  await narrowHeader.dblclick();
  await narrowHeader.locator('.tabular-header-name-input').fill('Code');
  await narrowHeader.locator('.tabular-header-name-input').press('Tab');
  await narrowHeader.dblclick();
  const narrowDialog = page.getByRole('dialog', { name: 'Configure Code' });
  const narrowBox = await narrowDialog.boundingBox();
  const narrowFooter = await narrowDialog.getByRole('button', { name: 'Review change' }).boundingBox();
  check(narrowBox && narrowBox.x >= 0 && narrowBox.x + narrowBox.width <= 390 && narrowBox.y >= 0 && narrowBox.y + narrowBox.height <= 844, 'Narrow panel exceeds viewport');
  check(narrowFooter && narrowFooter.y + narrowFooter.height <= 844, 'Narrow panel action is clipped');
  await page.screenshot({ path: `${output}/column-settings-narrow.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${output}/blank-header-narrow.png`, fullPage: true });
  const narrowAfter = await widths(page);
  check(narrowAfter.document === 390 && narrowAfter.body === 390, 'Narrow blank grid overflowed');

  const dom = await page.evaluate(() => ({
    duplicateIds: [...document.querySelectorAll('[id]')]
      .map(item => item.id).filter((id, index, all) => all.indexOf(id) !== index),
    unnamedButtons: [...document.querySelectorAll('button')]
      .filter(item => !(item.textContent || '').trim() && !item.getAttribute('aria-label')).length,
    unnamedLinks: [...document.querySelectorAll('a')]
      .filter(item => !(item.textContent || '').trim() && !item.getAttribute('aria-label')).length
  }));
  await Promise.all(requestCaptures);
  check(!dom.duplicateIds.length && dom.unnamedButtons === 0 && dom.unnamedLinks === 0, 'DOM sanity failed');
  check(signals.length === 0, `Browser/runtime signals: ${signals.join(' | ')}`);
  check(requests.some(item => item.action === 'record.patch' && item.hasCsrf && item.hasSessionCookie && item.origin === origin), 'Authenticated record.patch evidence missing');
  check(requests.some(item => item.action === 'range.patch'), 'Atomic range evidence missing');
  check(requests.some(item => item.action === 'draft.promote'), 'Persistent draft promotion evidence missing');
  check(requests.some(item => item.action === 'record.delete'), 'Delete evidence missing');
  check(requests.some(item => item.action === 'relation.create'), 'Relation DDL evidence missing');
  check(responses.filter(item => item.method === 'GET' && item.status === 200).every(item => item.hasRotatedCsrf), 'Successful reads did not rotate CSRF');

  return {
    unauthenticated,
    liveGrid: { rows: 3, freshMount: 'passed', generatedRefresh: 'passed' },
    fields: ['Text', 'Number', 'Email', 'URL', 'Phone', 'Relation', 'Select', 'Price', 'Switch', 'Date and time'],
    drafts: { rejectionReload: 'passed', rawCorrection: 'passed', networkFailureRetention: 'passed' },
    ranges: { copyPaste: 'passed', fill: 'passed', undoRedo: 'passed', selection: rangeSelection },
    rows: { insert: 'passed', delete: 'passed', undoRedo: 'passed', focus: 'passed' },
    columns: { text: 'passed', number: 'passed', select: 'passed', generated: 'passed', inlineHeader: 'passed' },
    relation: {
      target: 'crm.customers',
      composite: true,
      nonAdjacentSourceMapping: true,
      liveTargetUpdate: true,
      rlsRestrictedExcluded: true,
      independentTemplates: true
    },
    permissionFailureRetained: true,
    focus: { panelRestore: 'passed', deleteRestore: 'passed' },
    narrow: { before: narrowBefore, after: narrowAfter, panel: narrowBox, action: narrowFooter },
    dom,
    transport: {
      requestCount: requests.length,
      responseCount: responses.length,
      actions: [...new Set(requests.map(item => item.action).filter(Boolean))]
    },
    signals
  };
}, globalThis.__task00008Acceptance)
