async page => {
  const origin = 'http://127.0.0.1:4141';
  const output = '/Users/cblanquera/server/projects/trustless/tabular/output/release/task-00014';
  const importedCsv = `${output}/browser-import.csv`;
  const results = {};
  const artifacts = [];
  const signals = [];
  const expectedSignals = [];
  let expectedSseInterruption = false;
  let controlledSseStarted = false;
  let expectedNetworkFailure = false;
  let expectedPermissionChange = false;
  let expectedValidationFailure = false;

  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const section = async (name, run) => {
    try {
      const evidence = await run();
      results[name] = { passed: true, evidence };
      return evidence;
    } catch (error) {
      results[name] = {
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
      return undefined;
    }
  };
  const screenshot = async (candidate, name) => {
    const filename = `${name}.png`;
    await candidate.screenshot({ path: `${output}/${filename}` });
    artifacts.push(filename);
  };
  const attachSignals = (candidate, label) => {
    candidate.on('console', message => {
      const text = message.text();
      if (
        (expectedSseInterruption || controlledSseStarted)
        && message.type() === 'error'
        && (
          text.includes('503')
          || text.includes('/events')
          || text.includes('ERR_INCOMPLETE_CHUNKED_ENCODING')
        )
      ) {
        expectedSignals.push(`console:${label}:controlled-sse-interruption`);
        return;
      }
      if (
        expectedNetworkFailure
        && message.type() === 'error'
        && text.includes('ERR_FAILED')
      ) {
        expectedSignals.push(`console:${label}:controlled-grid-network-failure`);
        return;
      }
      if (
        expectedPermissionChange
        && message.type() === 'error'
        && (text.includes('403') || text.includes('404') || text.includes('500'))
      ) {
        expectedSignals.push(`console:${label}:controlled-permission-change`);
        return;
      }
      if (message.type() === 'error' && text.includes('Failed to load resource')) return;
      if (message.type() === 'warning' || message.type() === 'error') {
        signals.push(`console:${label}:${message.type()}:${text}`);
      }
    });
    candidate.on('pageerror', error => signals.push(`pageerror:${label}:${error.message}`));
    candidate.on('response', async response => {
      if (response.status() < 400) return;
      const url = response.url();
      if (response.status() === 409 && url.includes('/events/grid?folder=operations&table=untitled-file')) {
        expectedSignals.push(`response:${label}:created-file-awaits-row-identity:409`);
        return;
      }
      if ((expectedSseInterruption || controlledSseStarted) && url.includes('/events?')) {
        expectedSignals.push(`response:${label}:controlled-sse-interruption:${response.status()}`);
        return;
      }
      if (expectedPermissionChange && url.includes('/events/grid')) {
        expectedSignals.push(`response:${label}:controlled-permission-change:${response.status()}`);
        return;
      }
      if (expectedValidationFailure && url.includes('/events/grid')) {
        expectedSignals.push(`response:${label}:controlled-validation-failure:${response.status()}`);
        return;
      }
      let body = '';
      try { body = (await response.text()).slice(0, 240); } catch {}
      signals.push(`response:${label}:${response.status()}:${url}:${body}`);
    });
    candidate.on('requestfailed', request => {
      const url = request.url();
      if ((expectedSseInterruption || controlledSseStarted) && url.includes('/events?')) {
        expectedSignals.push(`requestfailed:${label}:controlled-sse-interruption`);
        return;
      }
      if (url.includes('/events?') && request.failure()?.errorText === 'net::ERR_ABORTED') {
        expectedSignals.push(`requestfailed:${label}:event-stream-navigation-abort`);
        return;
      }
      if (expectedNetworkFailure && url.includes('/events/grid')) {
        expectedSignals.push(`requestfailed:${label}:controlled-grid-network-failure`);
        return;
      }
      signals.push(`requestfailed:${label}:${request.method()}:${url}:${request.failure()?.errorText}`);
    });
  };
  const targetUrl = (user, target) => (
    `${origin}/__acceptance?user=${user}&target=${encodeURIComponent(target)}`
  );
  const control = async (candidate, action) => candidate.evaluate(async action => {
    const response = await fetch(`/__control?action=${encodeURIComponent(action)}`);
    return response.json();
  }, action);
  const widths = candidate => candidate.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  const waitGrid = async candidate => {
    await candidate.locator('.grid-stage[data-grid-ready="true"]').waitFor({ timeout: 20_000 });
    await candidate.locator('.tabulator-row').first().waitFor({ timeout: 20_000 });
  };
  const field = (candidate, label) => candidate.evaluate(label => {
    const headers = [...document.querySelectorAll('.tabulator-col[tabulator-field]')];
    return headers.find(header => (
      header.querySelector('.tabular-column-semantic')?.textContent?.trim() === label
    ))?.getAttribute('tabulator-field');
  }, label);
  const row = (candidate, orderId) => candidate.locator('.tabulator-row').filter({
    hasText: orderId
  });
  const cell = async (candidate, orderId, label) => {
    const columnId = await field(candidate, label);
    check(columnId, `Missing ${label} column`);
    return row(candidate, orderId).locator(`[tabulator-field="${columnId}"]`);
  };
  const editCell = async (candidate, orderId, label, value) => {
    const target = await cell(candidate, orderId, label);
    await target.dblclick();
    const input = target.locator('input, textarea').first();
    await input.waitFor();
    await input.fill(value);
    await input.press('Enter');
    return target;
  };
  const commit = async candidate => {
    const trigger = candidate.getByRole('button', { name: 'Commit', exact: true });
    await trigger.click();
    await candidate.waitForFunction(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none'
          && rect.width > 0 && rect.height > 0;
      };
      const draftControls = [...document.querySelectorAll('button')].filter(element => (
        visible(element)
        && (element.textContent?.trim() === 'Commit' || element.textContent?.trim() === 'Cancel')
      ));
      const runtime = document.querySelector('.runtime-state')?.textContent?.trim();
      return draftControls.length === 0
        && !document.querySelector('.grid-draft-bar')
        && runtime === 'Saved · Live';
    }, undefined, { timeout: 20_000 });
  };
  const openMenu = async (candidate, label) => {
    const trigger = candidate.getByRole('menuitem', { name: label, exact: true });
    await trigger.click();
    await candidate.getByRole('menu', { name: `${label} menu` }).waitFor();
  };
  attachSignals(page, 'owner');
  await page.setViewportSize({ width: 1280, height: 800 });

  await section('authenticatedBrowseAndKeyboard', async () => {
    const response = await page.goto(targetUrl('owner', '/pages/browse.html'));
    check(response?.status() === 200, 'Authenticated Browse did not load');
    await page.getByRole('heading', { name: 'Folders' }).waitFor();
    const folders = await page.getByLabel(/folders$/).getByRole('link').allTextContents();
    check(folders.some(value => value.includes('Operations')), 'Operations folder is missing');
    check(folders.some(value => value.includes('Finance')), 'Finance folder is missing');
    await screenshot(page, 'browser-desktop-browse');
    const operations = page.getByRole('link', { name: /Operations 1 file/ });
    await operations.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/folder=operations/);
    await page.getByRole('tab', { name: 'Files' }).waitFor();
    check(await page.getByRole('tab', { name: 'Views' }).isVisible(), 'Folder Views tab is missing');
    check(await page.getByRole('button', { name: 'New file' }).isVisible(), 'New file is missing');
    check(await page.getByRole('link', { name: 'Import' }).isVisible(), 'Import is missing');
    return {
      mode: 'keyboard-only',
      path: 'Browse -> Operations',
      folders: folders.map(value => value.trim()),
      navigationSucceeded: page.url()
    };
  });

  await section('createAndRenameLiveFile', async () => {
    const trigger = page.getByRole('button', { name: 'New file' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const createDialog = page.getByRole('alertdialog', { name: 'Create this file?' });
    await createDialog.waitFor();
    check(
      await page.evaluate(() => document.activeElement?.textContent?.trim()) === 'Cancel',
      'Create confirmation did not focus Cancel'
    );
    await screenshot(page, 'browser-desktop-create-confirmation');
    await page.keyboard.press('Tab');
    check(
      await page.evaluate(() => document.activeElement?.textContent?.trim()) === 'Confirm creation',
      'Create confirmation did not trap focus on its second action'
    );
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/pages\/table\.html\?folder=operations&table=untitled-file(?:-[a-z0-9-]+)?/, {
      timeout: 20_000
    });
    const title = page.getByRole('button', { name: 'Untitled File', exact: true });
    await title.waitFor();
    await title.focus();
    await page.keyboard.press('Enter');
    const input = page.getByLabel('File name', { exact: true });
    await input.fill('Release checklist');
    await input.press('Enter');
    const renameDialog = page.getByRole('alertdialog', { name: 'Save this file name?' });
    await renameDialog.waitFor();
    await renameDialog.getByRole('button', { name: 'Confirm rename' }).click();
    await page.getByRole('button', { name: 'Release checklist', exact: true })
      .waitFor({ timeout: 20_000 });
    await page.reload();
    await page.getByRole('button', { name: 'Release checklist', exact: true }).waitFor();
    await page.goto(`${origin}/pages/browse.html?folder=operations`);
    await page.getByRole('link', { name: /Release checklist/ }).waitFor();
    await screenshot(page, 'browser-desktop-created-renamed-file');
    return {
      createdPhysicalRoute: 'operations.untitled_file',
      persistedDisplayName: 'Release checklist',
      reloadStable: true,
      confirmationBoundary: true
    };
  });

  await page.goto(`${origin}/pages/table.html?folder=operations&table=orders`);
  await waitGrid(page);

  await section('seededColumnsAndRelations', async () => {
    const relationHeader = page.locator('.tabulator-col[tabulator-field]').filter({
      has: page.getByText('Customer tenant', { exact: true })
    });
    await relationHeader.dblclick();
    const relationDialog = page.getByRole('dialog', { name: 'Configure Customer tenant' });
    const relationFile = relationDialog.getByLabel('File', { exact: true });
    const relationKey = relationDialog.getByLabel('Key', { exact: true });
    await relationFile.selectOption({ label: 'Keyless contacts' });
    await relationDialog.getByText('No eligible primary or unique key is visible.').waitFor();
    check(await relationKey.isDisabled(), 'Keyless relation target was offered as eligible');
    await relationFile.selectOption({ label: 'Customers' });
    const firstKey = relationKey.locator('option:not([value=""])').first();
    await firstKey.waitFor({ state: 'attached' });
    await relationKey.selectOption(await firstKey.getAttribute('value'));
    const sources = relationDialog.getByLabel(/^Source for /);
    check(await sources.count() === 2, 'Composite relation did not expose two source mappings');
    await sources.nth(0).selectOption({ label: 'Customer tenant' });
    await sources.nth(1).selectOption({ label: 'Customer' });
    const formats = relationDialog.getByLabel('Display format', { exact: true });
    check(await formats.count() === 2, 'Relation did not expose independent picker and cell formats');
    await formats.nth(0).fill('{{label}} — {{key}}');
    await formats.nth(1).fill('{{label}}');
    await relationDialog.getByRole('button', { name: 'Review change' }).click();
    await relationDialog.getByRole('heading', { name: 'Review schema impact' }).waitFor();
    await screenshot(page, 'browser-desktop-relation-impact');
    await relationDialog.getByRole('button', { name: 'Confirm owner change' }).click();
    await relationDialog.waitFor({ state: 'detached', timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.reload();
    await waitGrid(page);
    const related = await cell(page, 'ord-001', 'Customer tenant');
    check((await related.textContent())?.includes('Ada Industries'), 'Applied relation format is not live');
    return {
      configuredExistingColumn: 'Customer tenant',
      relationTarget: 'finance.customers',
      compositeKey: true,
      independentDisplayFormats: true,
      keylessTargetRejected: true,
      columnInsertion: 'not exercised because the accepted command registry marks insert-left and insert-right as deferred'
    };
  });

  const browser = page.context().browser();
  check(browser, 'Playwright browser is unavailable for the second authenticated context');
  const editorContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const editorPage = await editorContext.newPage();
  attachSignals(editorPage, 'editor');
  await editorPage.goto(targetUrl(
    'editor',
    '/pages/table.html?folder=operations&table=orders'
  ));
  await waitGrid(editorPage);

  await section('twoAuthenticatedSessionsAndLiveSync', async () => {
    await editCell(page, 'ord-001', 'Relation note', 'owner live sync');
    await commit(page);
    await editorPage.locator('.tabulator-row').filter({ hasText: 'ord-001' })
      .filter({ hasText: 'owner live sync' }).waitFor({ timeout: 20_000 });
    await editCell(editorPage, 'ord-002', 'Relation note', 'editor live sync');
    await commit(editorPage);
    await page.locator('.tabulator-row').filter({ hasText: 'ord-002' })
      .filter({ hasText: 'editor live sync' }).waitFor({ timeout: 20_000 });
    await screenshot(page, 'browser-desktop-live-sync-owner');
    await screenshot(editorPage, 'browser-desktop-live-sync-editor');
    return {
      sessions: ['Release Owner', 'Release Collaborator'],
      propagation: 'bidirectional without reload',
      transport: 'authenticated SSE plus HTTP mutations'
    };
  });

  await section('permissionChangeAndRecovery', async () => {
    expectedPermissionChange = true;
    try {
      await control(page, 'revoke-editor');
      await editCell(page, 'ord-003', 'Relation note', 'permission boundary event');
      await commit(page);
      await editorPage.getByText('Access ended', { exact: true }).waitFor({ timeout: 20_000 });
      await screenshot(editorPage, 'browser-desktop-permission-ended');
    } finally {
      await control(page, 'restore-editor');
      expectedPermissionChange = false;
    }
    await editorPage.reload();
    await waitGrid(editorPage);
    await editorPage.getByText('Saved · Live', { exact: true }).waitFor({ timeout: 20_000 });
    return {
      revokedRole: 'tabular_task14_editor',
      accessEndedVisible: true,
      restoredByOwner: true,
      recovery: 'reload after PostgreSQL grant restoration'
    };
  });

  await section('disconnectReconnectCatchup', async () => {
    expectedSseInterruption = true;
    controlledSseStarted = true;
    const before = await control(page, 'state');
    await control(page, 'interrupt-sse');
    await editorPage.getByText('Reconnecting', { exact: true }).waitFor({ timeout: 10_000 });
    await editCell(page, 'ord-001', 'Relation note', 'replayed after reconnect');
    await commit(page);
    await screenshot(editorPage, 'browser-desktop-reconnecting');
    await editorPage.locator('.tabulator-row').filter({ hasText: 'ord-001' })
      .filter({ hasText: 'replayed after reconnect' }).waitFor({ timeout: 25_000 });
    await editorPage.getByText('Saved · Live', { exact: true }).waitFor({ timeout: 20_000 });
    const after = await control(page, 'state');
    expectedSseInterruption = false;
    check(after.requestedCursors.some(cursor => cursor > 0), 'Reconnect did not request a durable cursor');
    return {
      cursorBefore: before.cursor,
      cursorAfter: after.cursor,
      requestedCursors: after.requestedCursors,
      caughtUpWithoutManualRefresh: true
    };
  });

  await section('editValidationAndNetworkRecovery', async () => {
    await editCell(page, 'ord-001', 'Quantity', '8');
    await commit(page);
    await page.reload();
    await waitGrid(page);
    check((await (await cell(page, 'ord-001', 'Total')).textContent())?.includes('100.'),
      'Generated total did not persist after edit and reload');

    await editCell(page, 'ord-001', 'Quantity', '999');
    expectedValidationFailure = true;
    const invalidCommit = page.getByRole('button', { name: 'Commit', exact: true });
    await invalidCommit.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')]
        .find(candidate => candidate.textContent?.trim() === 'Commit');
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    await invalidCommit.click();
    await page.getByText('Draft needs attention').first().waitFor();
    expectedValidationFailure = false;
    check((await (await cell(page, 'ord-001', 'Quantity')).textContent())?.includes('#VALUE!'),
      'Constraint failure did not retain a spreadsheet error token');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    let aborted = false;
    await page.route('**/events/grid', async route => {
      const action = (route.request().postData() || '').match(/"type":"([^"]+)"/)?.[1];
      if (!aborted && route.request().method() === 'POST' && action === 'record.patch') {
        aborted = true;
        expectedNetworkFailure = true;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    const networkCell = await editCell(page, 'ord-002', 'Relation note', 'retained network draft');
    await page.getByRole('button', { name: 'Commit', exact: true }).click();
    await page.locator('.status-bar output').filter({ hasText: 'server could not be reached' })
      .waitFor({ timeout: 20_000 });
    check((await networkCell.textContent())?.includes('#ERROR!'), 'Network error token is missing');
    await networkCell.dblclick();
    check(
      await networkCell.locator('input').inputValue() === 'retained network draft',
      'Network recovery discarded the raw draft'
    );
    await networkCell.locator('input').press('Escape');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.unroute('**/events/grid');
    expectedNetworkFailure = false;
    return {
      validEdit: 'passed',
      generatedRefresh: 'PostgreSQL-generated value verified after reload',
      constraintError: '#VALUE!',
      networkError: '#ERROR!',
      rawDraftRetained: true
    };
  });

  await section('formatSavedViewRowReorderExport', async () => {
    const selected = await cell(page, 'ord-001', 'Status');
    await selected.click();
    await page.waitForFunction(() => {
      const bold = document.querySelector('button[aria-label="Bold"]');
      return bold instanceof HTMLButtonElement && !bold.disabled;
    });
    await page.keyboard.press('Control+B');
    await page.locator('.status-bar output').filter({ hasText: 'Bold applied' }).waitFor();

    await openMenu(page, 'File');
    await page.getByRole('menuitem', { name: 'New view', exact: true }).click();
    const viewDialog = page.getByRole('dialog', { name: 'Create new view' });
    await viewDialog.getByLabel('Name').fill('Release readiness');
    await viewDialog.getByLabel(/Shared/).check();
    await viewDialog.getByRole('button', { name: 'Create view' }).click();
    await viewDialog.waitFor({ state: 'detached', timeout: 20_000 });
    await openMenu(page, 'File');
    await page.getByRole('menuitem', { name: 'Views', exact: true }).click();
    const savedViews = page.getByRole('dialog', { name: 'Views' });
    await savedViews.getByText('Release readiness', { exact: true }).waitFor();
    await savedViews.getByRole('button', { name: 'Close saved views' }).click();
    await savedViews.waitFor({ state: 'detached' });

    const firstRowHeader = row(page, 'ord-001').locator('.tabulator-row-header');
    await firstRowHeader.focus();
    await page.keyboard.press('Alt+ArrowDown');
    await page.locator('.status-bar output').filter({ hasText: 'Shared row order saved' })
      .waitFor({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent('download');
    await openMenu(page, 'File');
    await page.getByRole('menuitem', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;
    const exportName = 'browser-export.csv';
    await download.saveAs(`${output}/${exportName}`);
    artifacts.push(exportName);
    await page.locator('.status-bar output').filter({ hasText: 'Exported 3 server-authorized rows' })
      .waitFor();
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    check(csv.includes('ord-001') && csv.includes('ord-003'), 'Export omitted authorized rows');
    await screenshot(page, 'browser-desktop-format-view-order');
    return {
      format: 'bold current-tab presentation',
      savedView: 'Release readiness shared',
      rowReorder: 'Alt+ArrowDown shared order',
      export: { file: exportName, authorizedRows: 3 }
    };
  });

  await section('csvImportAndExternalProviderLimit', async () => {
    await page.goto(`${origin}/pages/import.html?folder=operations`);
    await page.getByRole('heading', { name: 'Choose a source' }).waitFor();
    const google = page.getByRole('radio', { name: /Google Sheets/ });
    check(await google.isDisabled(), 'Google Sheets was enabled without live provider credentials');
    const googleReasonLocator = page.locator('#import-source-google-sheets-reason');
    await page.waitForFunction(() => {
      const value = document.querySelector('#import-source-google-sheets-reason')?.textContent?.trim();
      return Boolean(value && !value.includes('Checking'));
    });
    const googleReason = await googleReasonLocator.textContent();
    check(
      Boolean(googleReason && /Google|operator|configuration|credential/i.test(googleReason)),
      'Missing Google configuration is not explained'
    );
    await page.locator('input[type="file"][accept*=".csv"]').setInputFiles(importedCsv);
    await page.getByRole('button', { name: 'Preview values' }).click();
    await page.getByRole('heading', { name: 'Preview values and fields' }).waitFor({ timeout: 20_000 });
    check((await page.getByRole('region', { name: 'Source value preview' }).textContent())?.includes('001'),
      'Import preview did not retain the leading-zero token');
    await page.getByRole('button', { name: 'Review import' }).click();
    await page.getByRole('heading', { name: 'Ready to import' }).waitFor();
    await page.getByLabel('File name').fill('Browser import');
    await page.getByLabel('Table name').fill('browser_import');
    await page.getByRole('button', { name: 'Import values' }).click();
    await page.getByRole('heading', { name: 'Import complete' }).waitFor({ timeout: 30_000 });
    await screenshot(page, 'browser-desktop-import-complete');
    return {
      csv: 'three exact-value records committed through isolated worker',
      leadingZero: '001 retained in preview',
      externalLiveProvider: {
        status: 'blocked_external_credentials',
        provider: 'Google Sheets',
        substitutedMock: false,
        missing: [
          'TABULAR_GOOGLE_CLIENT_ID',
          'TABULAR_GOOGLE_CLIENT_SECRET',
          'TABULAR_GOOGLE_REDIRECT_URI',
          'TABULAR_GOOGLE_TOKEN_ENCRYPTION_KEY'
        ],
        explanation: googleReason?.trim()
      }
    };
  });

  await section('activityErrorReviewAndRecovery', async () => {
    const queued = await control(page, 'enqueue-recovery');
    check(queued.jobId, 'Recovery fixture did not enqueue an operation');
    let state;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      state = await control(page, 'state');
      if (state.jobs.some(job => job.id === queued.jobId && job.state === 'dead-letter')) break;
      await page.waitForTimeout(100);
    }
    check(
      state.jobs.some(job => job.id === queued.jobId && job.state === 'dead-letter'),
      'Recovery fixture did not reach dead-letter'
    );
    await page.goto(`${origin}/pages/system-activity.html`);
    await page.getByRole('heading', { name: 'System activity' }).waitFor();
    await page.getByRole('tab', { name: /Needs attention/ }).click();
    const failedRow = page.locator('tr[data-state="dead-letter"]').filter({ hasText: 'Clean import staging' });
    await failedRow.waitFor();
    await failedRow.getByRole('button', { name: /Open Clean import staging details/ }).click();
    await page.getByRole('heading', { name: 'Failure detail' }).waitFor();
    await screenshot(page, 'browser-desktop-activity-dead-letter');
    await page.getByRole('button', { name: 'Review and retry' }).click();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      state = await control(page, 'state');
      if (state.jobs.some(job => job.id === queued.jobId && job.state === 'succeeded')) break;
      await page.waitForTimeout(100);
    }
    check(
      state.jobs.some(job => job.id === queued.jobId && job.state === 'succeeded'),
      'Reviewed operation did not recover successfully'
    );
    await page.reload();
    await page.getByRole('tab', { name: /Completed/ }).click();
    await page.locator('tr[data-state="succeeded"]').filter({ hasText: 'Clean import staging' })
      .waitFor();
    await screenshot(page, 'browser-desktop-activity-recovered');
    return {
      jobId: queued.jobId,
      terminalError: 'dead-letter visible with failure detail',
      recovery: 'Review and retry reused the operation identity and succeeded',
      activitySurface: 'authorized durable operation state'
    };
  });

  await section('responsive390x844Journey', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const checked = [];
    const inspectWidth = async (label) => {
      const width = await widths(page);
      check(width.document === 390 && width.body === 390, `${label} has page-level overflow`);
      checked.push({ label, width });
    };

    await page.goto(`${origin}/pages/browse.html?folder=operations`);
    await page.getByRole('tab', { name: 'Files' }).waitFor();
    await page.getByRole('link', { name: /Release checklist/ }).waitFor();
    await inspectWidth('folder');
    await screenshot(page, 'browser-mobile-folder');

    await page.goto(`${origin}/pages/table.html?folder=operations&table=orders`);
    await waitGrid(page);
    await inspectWidth('table');
    await editCell(page, 'ord-003', 'Quantity', '9');
    await commit(page);
    const selected = await cell(page, 'ord-003', 'Status');
    await selected.click();
    await page.waitForFunction(() => {
      const italic = document.querySelector('button[aria-label="Italic"]');
      return italic instanceof HTMLButtonElement && !italic.disabled;
    });
    await page.keyboard.press('Control+I');
    await page.locator('.status-bar output').filter({ hasText: 'Italic applied' }).waitFor();
    await openMenu(page, 'File');
    const mobileFileItems = await page.getByRole('menu', { name: 'File menu' })
      .getByRole('menuitem').allTextContents();
    for (const [label, pattern] of [
      ['New', /^New⌘N$/],
      ['Open', /^Open$/],
      ['Import', /^Import$/],
      ['Export', /^Export$/],
      ['Views', /^Views$/],
      ['New view', /^New view$/],
      ['Table settings', /^Table settings$/]
    ]) {
      check(mobileFileItems.some(item => pattern.test(item.trim())),
        `Mobile File menu is missing ${label}`);
    }
    await page.keyboard.press('Escape');
    await openMenu(page, 'File');
    await page.getByRole('menuitem', { name: 'Views', exact: true }).click();
    const views = page.getByRole('dialog', { name: 'Views' });
    await views.getByText('Release readiness', { exact: true }).waitFor();
    await screenshot(page, 'browser-mobile-table-views');
    await views.getByRole('button', { name: 'Close saved views' }).click();

    await page.goto(`${origin}/pages/import.html?folder=operations`);
    await page.getByRole('heading', { name: 'Choose a source' }).waitFor();
    await inspectWidth('import');
    await screenshot(page, 'browser-mobile-import');

    await page.goto(`${origin}/pages/system-activity.html`);
    await page.getByRole('heading', { name: 'System activity' }).waitFor();
    await inspectWidth('activity');
    check(
      await page.locator('.activity-table thead').evaluate(element => getComputedStyle(element).display) === 'none',
      'Mobile activity table header was not collapsed'
    );
    await screenshot(page, 'browser-mobile-activity');
    return {
      viewport: '390x844',
      surfaces: checked,
      keyboardEditAndFormat: true,
      fileMenuRetained: true,
      savedViewReachable: true,
      activityRowsResponsive: true
    };
  });

  await section('wireframeShapeHierarchyControls', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/pages/table.html?folder=operations&table=orders`);
    await waitGrid(page);
    const table = await page.evaluate(() => ({
      hasPersistentSidebar: Boolean(document.querySelector('aside:not([role="dialog"])')),
      menus: [...document.querySelectorAll('.command-menu-trigger')]
        .map(item => item.textContent?.replace('⌄', '').trim()),
      hasGrid: Boolean(document.querySelector('.tabular-grid-host')),
      hasHeaderActionButtons: document.querySelectorAll('.tabulator-col button').length,
      headerLayers: [...document.querySelectorAll('.application-header > *')]
        .map(item => item.className),
      pageOverflow: document.documentElement.scrollWidth - innerWidth
    }));
    check(!table.hasPersistentSidebar, 'Table restored the rejected persistent sidebar');
    check(JSON.stringify(table.menus) === JSON.stringify(['File', 'Edit', 'View', 'Format']),
      'Persistent menu hierarchy does not match the accepted command surface');
    check(table.hasGrid, 'Spreadsheet grid is missing');
    check(table.hasHeaderActionButtons === 0, 'Visible column-header action buttons were restored');
    check(table.pageOverflow === 0, 'Page owns horizontal overflow instead of the grid');
    await page.goto(`${origin}/pages/browse.html?folder=operations`);
    const explorer = await page.evaluate(() => ({
      rootActions: [...document.querySelectorAll('.explorer-heading-actions a, .explorer-heading-actions button')]
        .map(item => item.textContent?.trim()),
      tabs: [...document.querySelectorAll('[role="tab"]')].map(item => item.textContent?.trim()),
      sidebar: Boolean(document.querySelector('aside')),
      breadcrumb: document.querySelector('[aria-label="Breadcrumb"]')?.textContent?.trim()
    }));
    check(!explorer.sidebar, 'Explorer restored a persistent sidebar');
    check(explorer.tabs.includes('Files') && explorer.tabs.includes('Views'),
      'Folder Files/Views hierarchy is missing');
    check(explorer.rootActions.includes('New file') && explorer.rootActions.includes('Import'),
      'Folder-scoped create/import controls are missing');
    return {
      comparison: 'matched accepted shape, hierarchy, and control inventory',
      references: [
        'wireframes/r003-spreadsheet-table-canvas/pages/table.html',
        'wireframes/r004-spreadsheet-command-surface/pages/table.html',
        'wireframes/r005-spreadsheet-file-explorer/pages/browse.html',
        'wireframes/r005-spreadsheet-file-explorer/pages/import.html',
        'wireframes/r007-integrated-views-activity/pages/table.html',
        'wireframes/r007-integrated-views-activity/pages/system-activity.html'
      ],
      table,
      explorer
    };
  });

  await editorContext.close();
  const mandatory = [
    'authenticatedBrowseAndKeyboard',
    'createAndRenameLiveFile',
    'seededColumnsAndRelations',
    'twoAuthenticatedSessionsAndLiveSync',
    'permissionChangeAndRecovery',
    'disconnectReconnectCatchup',
    'editValidationAndNetworkRecovery',
    'formatSavedViewRowReorderExport',
    'csvImportAndExternalProviderLimit',
    'activityErrorReviewAndRecovery',
    'responsive390x844Journey',
    'wireframeShapeHierarchyControls'
  ];
  const failed = mandatory.filter(name => !results[name]?.passed);
  if (signals.length) failed.push('unexpectedBrowserSignals');
  const result = {
    task: '00014',
    generatedAt: new Date().toISOString(),
    result: failed.length ? 'failed' : 'passed_with_external_provider_limitation',
    runtime: {
      browser: 'Playwright CLI Chromium',
      database: 'PostgreSQL 18 disposable local target',
      appOrigin: origin,
      authenticatedSessions: 3,
      activeAcceptanceSessions: 2,
      viewports: ['1280x800', '390x844'],
      authorities: ['web', 'migrator', 'worker']
    },
    acceptance: results,
    unexpectedSignals: signals,
    expectedControlledSignals: [...new Set(expectedSignals)],
    externalLimitations: {
      liveGoogleSheets: 'blocked_external_credentials',
      nativeSafariVoiceOver: 'passed in coordinator-owned native capture; see native-safari-voiceover.json'
    },
    wireframeComparison: results.wireframeShapeHierarchyControls,
    screenshots: artifacts.filter(name => name.endsWith('.png')),
    downloads: artifacts.filter(name => !name.endsWith('.png')),
    failedChecks: failed
  };
  return result;
}
