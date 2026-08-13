// Playwright CLI proof template for Task 00007.
// Replace the two session placeholders only in a disposable copy after seeding
// owner and reader identities through the test provider into durable PostgreSQL sessions.
// Run with: playwright_cli.sh --session task00007 run-code --filename <disposable-copy>
async page => {
  const output = '/Users/cblanquera/server/projects/trustless/tabular/output/playwright/task-00007';
  const ownerCookie = '__TASK00007_OWNER_SESSION__';
  const readerCookie = '__TASK00007_READER_SESSION__';
  const signals = [];
  const explorerRequests = [];
  const explorerResponses = [];
  const attachSignals = (candidate, context = 'owner') => {
    candidate.on('console', message => {
      if (message.type() === 'error' || message.type() === 'warning') signals.push(`console:${message.type()}:${message.text()}`);
    });
    candidate.on('pageerror', error => signals.push(`pageerror:${error.message}`));
    candidate.on('request', async request => {
      if (!request.url().endsWith('/events/explorer')) return;
      const headers = await request.allHeaders();
      explorerRequests.push({
        context,
        method: request.method(),
        contentType: headers['content-type'],
        origin: headers.origin,
        hasCsrf: Boolean(headers['x-tabular-csrf']),
        hasSessionCookie: Boolean(headers.cookie?.includes('tabular_session='))
      });
    });
    candidate.on('response', response => {
      if (response.url().endsWith('/events/explorer')) {
        explorerResponses.push({ context, status: response.status() });
      }
    });
  };
  attachSignals(page);
  const check = (value, message) => { if (!value) throw new Error(message); };
  const widths = async candidate => candidate.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  const domSanity = async candidate => candidate.evaluate(() => ({
    duplicateIds: [...document.querySelectorAll('[id]')].map(item => item.id).filter((id, index, all) => all.indexOf(id) !== index),
    unnamedButtons: [...document.querySelectorAll('button')].filter(item => !(item.textContent || '').trim() && !item.getAttribute('aria-label')).length,
    unnamedLinks: [...document.querySelectorAll('a')].filter(item => !(item.textContent || '').trim() && !item.getAttribute('aria-label')).length
  }));

  await page.context().addCookies([{
    name: 'tabular_session',
    value: ownerCookie,
    url: 'http://127.0.0.1:3067',
    httpOnly: true,
    sameSite: 'Strict'
  }]);

  const acceptanceBrowser = page.context().browser();
  check(acceptanceBrowser, 'Browser handle unavailable');
  const unauthenticatedContext = await acceptanceBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  const unauthenticatedPage = await unauthenticatedContext.newPage();
  const unauthenticatedResponse = await unauthenticatedPage.goto('http://127.0.0.1:3067/pages/browse.html');
  const unauthenticated = {
    status: unauthenticatedResponse?.status(),
    title: await unauthenticatedPage.title(),
    signInRequired: await unauthenticatedPage.getByRole('heading', { name: 'Sign in required' }).count() === 1
  };
  check(unauthenticated.status === 401 && unauthenticated.signInRequired, 'Unauthenticated Explorer boundary is not protected');
  await unauthenticatedContext.close();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:3067/pages/browse.html');
  const ownerFolders = await page.locator('.explorer-collection .explorer-item').allTextContents();
  check(ownerFolders.length === 2 && ownerFolders.some(value => value.includes('Operations')) && ownerFolders.some(value => value.includes('Finance')), 'Authenticated root hierarchy is wrong');
  await page.screenshot({ path: `${output}/root-desktop.png`, fullPage: true });
  await page.goto('http://127.0.0.1:3067/pages/browse.html?folder=operations&tab=files');
  await page.getByRole('button', { name: 'New file' }).waitFor();
  await page.getByRole('button', { name: 'List view' }).click();
  await page.screenshot({ path: `${output}/folder-desktop.png`, fullPage: true });
  check(await page.getByRole('button', { name: 'New file' }).count() === 1, 'Owner New file action missing');
  check(await page.getByRole('link', { name: 'Import' }).count() === 1, 'Owner Import action missing');
  const vendors = page.locator('[data-stable-id]').filter({ hasText: 'Vendors' });
  const vendorStableId = await vendors.getAttribute('data-stable-id');
  await page.getByRole('searchbox', { name: 'Search files' }).fill('vendors');
  check(await page.locator('[data-stable-id]').count() === 1, 'Scoped file search did not return one item');
  check(await page.locator('[data-stable-id]').getAttribute('data-stable-id') === vendorStableId, 'Stable ID changed through search');
  await page.getByRole('searchbox', { name: 'Search files' }).fill('missing-file');
  check(await page.getByText('No matching files').count() === 1, 'Missing scoped empty state');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'Grid view' }).click();
  check(await page.locator('.file-explorer').getAttribute('data-view') === 'grid', 'Grid mode did not apply');
  await page.reload();
  check(await page.locator('.file-explorer').getAttribute('data-view') === 'grid', 'Grid mode did not survive reload');
  await page.screenshot({ path: `${output}/explorer-desktop.png`, fullPage: true });

  const filesTab = page.getByRole('tab', { name: 'Files' });
  await filesTab.focus();
  await filesTab.press('ArrowRight');
  await page.waitForURL(/tab=views/);
  check(await page.getByRole('searchbox', { name: 'Search views' }).count() === 1, 'Views search name did not update');
  check(await page.getByRole('tab', { name: 'Views' }).getAttribute('tabindex') === '0', 'Views did not become the roving tab stop');
  await page.reload();
  check(page.url().includes('tab=views'), 'Views route state did not survive reload');
  const [savedPage] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('link', { name: /Ready to ship/ }).click()
  ]);
  attachSignals(savedPage, 'saved-view');
  await savedPage.waitForLoadState('domcontentloaded');
  await savedPage.getByRole('navigation', { name: 'File location' }).getByText('Ready to ship').waitFor();
  check(savedPage.url().includes('view=ready'), 'Saved view route was dropped');
  check(await savedPage.title() === 'Ready to ship — Customer orders — Tabular', 'Saved-view document title is wrong');
  await savedPage.locator('.tabular-grid-host').waitFor();
  await savedPage.waitForTimeout(300);
  check((await savedPage.locator('.status-bar output').textContent())?.includes('Applied saved view ready'), 'Saved view was not applied');
  await savedPage.close();

  await page.goto('http://127.0.0.1:3067/pages/browse.html?folder=operations&state=loading');
  check(await page.getByText('Loading files').count() === 1, 'Loading state missing');
  await page.getByRole('button', { name: 'Show loaded items' }).click();
  check(await page.locator('[data-stable-id]').count() === 6, 'Loading recovery lost folder items');
  await page.goto('http://127.0.0.1:3067/pages/browse.html?folder=operations&state=error');
  check(await page.getByText('Files could not be loaded').count() === 1, 'Error state missing');
  await page.getByRole('button', { name: 'Retry' }).click();
  check(await page.locator('[data-stable-id]').count() === 6, 'Error recovery lost folder items');
  await page.goto('http://127.0.0.1:3067/pages/browse.html?folder=operations&state=empty');
  check(await page.getByText('No files yet').count() === 1, 'Empty state missing');

  await page.goto('http://127.0.0.1:3067/pages/table.html?folder=operations&table=customer-orders');
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Table settings' }).click();
  const existingSettings = page.getByRole('dialog', { name: 'Table settings' });
  await existingSettings.getByLabel('Display name').fill('Customer order archive');
  await existingSettings.getByLabel('Folder').selectOption({ label: 'Finance' });
  await existingSettings.getByRole('button', { name: 'Apply changes' }).click();
  await page.getByRole('button', { name: 'Customer order archive' }).waitFor();
  check(await page.getByRole('navigation', { name: 'File location' }).getByRole('link', { name: 'Finance' }).count() === 1, 'Existing file did not retain its temporary destination folder');

  await page.goto('http://127.0.0.1:3067/pages/browse.html?folder=operations&tab=files');
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/events/explorer'))
    .then(response => response.status());
  await page.getByRole('button', { name: 'New file' }).click();
  const plannedStatus = await responsePromise;
  await page.waitForURL(/new=1/);
  const plannedRequestId = page.url().match(/[?&]plan=(ddl_[A-Za-z0-9_-]+)/)?.[1];
  check(plannedStatus === 200 && plannedRequestId, 'New file did not cross the authenticated Files plan boundary');
  await page.locator('.tabular-grid-host').waitFor();
  check(await page.locator('[role="grid"]').getAttribute('aria-rowcount') === '1001', 'Blank grid row count is wrong');
  check(await page.locator('[role="grid"]').getAttribute('aria-colcount') === '13', 'Blank grid column count is wrong');
  const coordinateHeaders = await page.getByRole('columnheader').allTextContents();
  const rowHeaderName = await page.getByRole('columnheader').first().getAttribute('aria-label');
  check(rowHeaderName === 'Row number' && JSON.stringify(coordinateHeaders.slice(1)) === JSON.stringify(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']), 'Blank coordinate headers are wrong');

  const title = page.getByRole('button', { name: 'Untitled File' });
  await title.click();
  const titleInput = page.getByRole('textbox', { name: 'File name' });
  await titleInput.fill('Vendors');
  await titleInput.press('Enter');
  await page.getByRole('alert').filter({ hasText: 'A file named “Vendors” already exists in Operations.' }).waitFor();
  check(await titleInput.evaluate(element => document.activeElement === element), 'Rename conflict did not restore input focus');
  await titleInput.fill('Incident log');
  await titleInput.press('Enter');
  const renamedTitle = page.getByRole('button', { name: 'Incident log' });
  await renamedTitle.waitFor();
  check(await renamedTitle.evaluate(element => document.activeElement === element), 'Rename commit did not restore title focus');

  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Table settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Table settings' });
  await dialog.waitFor();
  const closeSettings = page.getByRole('button', { name: 'Close table settings' });
  check(await closeSettings.evaluate(element => document.activeElement === element), 'Table settings did not take focus');
  await closeSettings.press('Tab');
  check(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), 'Table settings focus escaped to the background');
  await dialog.getByLabel('Display name').fill('Incident archive');
  await dialog.getByLabel('Folder').selectOption({ label: 'Finance' });
  await dialog.getByLabel('PostgreSQL table name').fill('incident_archive');
  await page.screenshot({ path: `${output}/table-settings-desktop.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Apply changes' }).click();
  await page.getByRole('button', { name: 'Incident archive' }).waitFor();
  check((await page.locator('.status-bar output').textContent())?.includes('Temporary settings updated'), 'Settings boundary wording is wrong');

  const readerContext = await acceptanceBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  await readerContext.addCookies([{ name: 'tabular_session', value: readerCookie, url: 'http://127.0.0.1:3067', httpOnly: true, sameSite: 'Strict' }]);
  const readerPage = await readerContext.newPage();
  attachSignals(readerPage, 'reader');
  await readerPage.goto('http://127.0.0.1:3067/pages/browse.html?folder=operations');
  check(await readerPage.getByText('View only').count() === 1, 'Reader denied notice missing');
  check(await readerPage.getByRole('button', { name: 'New file' }).count() === 0, 'Reader received New file');
  check(await readerPage.getByRole('link', { name: 'Import' }).count() === 0, 'Reader received Import');
  await readerPage.getByRole('link', { name: /Customer orders/ }).click();
  await readerPage.waitForURL(/table=customer-orders/);
  await readerPage.getByRole('button', { name: 'Customer orders' }).click();
  const deniedRename = readerPage.getByRole('textbox', { name: 'File name' });
  await deniedRename.fill('Forbidden rename');
  await deniedRename.press('Enter');
  await readerPage.getByRole('alert').filter({ hasText: 'You do not have permission to change files in this folder.' }).waitFor();
  check(await deniedRename.evaluate(element => document.activeElement === element), 'Denied rename did not retain focus');
  await readerContext.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3067/pages/browse.html?folder=operations&tab=files');
  await page.screenshot({ path: `${output}/explorer-narrow.png`, fullPage: true });
  await page.screenshot({ path: `${output}/folder-narrow.png`, fullPage: true });
  const narrowExplorer = await widths(page);
  check(narrowExplorer.document === 390 && narrowExplorer.body === 390, 'Narrow Explorer overflows the document');
  check(await page.getByRole('button', { name: 'New file' }).count() === 1, 'Narrow New file missing');
  check(await page.getByRole('link', { name: 'Import' }).count() === 1, 'Narrow Import missing');
  await page.goto('http://127.0.0.1:3067/pages/table.html?new=1&folder=operations&table=untitled-file');
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Table settings' }).click();
  await page.getByRole('dialog', { name: 'Table settings' }).waitFor();
  await page.screenshot({ path: `${output}/table-settings-narrow.png`, fullPage: true });
  const narrowSettings = await widths(page);
  const settingsBox = await page.getByRole('dialog', { name: 'Table settings' }).boundingBox();
  const applyBox = await page.getByRole('button', { name: 'Apply changes' }).boundingBox();
  const cancelBox = await page.getByRole('button', { name: 'Cancel' }).boundingBox();
  check(narrowSettings.document === 390 && narrowSettings.body === 390, 'Narrow settings overflows the document');
  check(settingsBox && settingsBox.x >= 0 && settingsBox.x + settingsBox.width <= 390 && settingsBox.y >= 0 && settingsBox.y + settingsBox.height <= 844, 'Narrow settings dialog exceeds viewport');
  check(applyBox && cancelBox && applyBox.y + applyBox.height <= 844 && cancelBox.y + cancelBox.height <= 844, 'Narrow settings actions are clipped');

  const sanity = await domSanity(page);
  check(sanity.duplicateIds.length === 0 && sanity.unnamedButtons === 0 && sanity.unnamedLinks === 0, 'DOM sanity failed');
  return {
    authentication: 'provider-double session crossed durable session and PostgreSQL authority',
    unauthenticated,
    ownerFolders,
    vendorStableId,
    plannedRequestId,
    savedView: 'ready applied and reload-addressable',
    states: ['loading recovered', 'error recovered', 'empty', 'permission denied followed into table'],
    blank: { rowcount: 1001, colcount: 13, rowHeaderName, coordinateHeaders: coordinateHeaders.slice(1) },
    focus: ['modal contained', 'rename conflict restored', 'rename commit restored', 'tablist arrow navigated'],
    narrowExplorer,
    narrowSettings,
    settingsBox,
    applyBox,
    cancelBox,
    sanity,
    explorerRequests,
    explorerResponses,
    signals
  };
}
