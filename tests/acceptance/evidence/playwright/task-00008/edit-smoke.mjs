async page => {
  const origin = '__TASK00008_ORIGIN__';
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.context().addCookies([{
    name: 'tabular_session', value: '__TASK00008_OWNER_SESSION__', url: origin,
    httpOnly: true, sameSite: 'Strict'
  }]);
  await page.goto(`${origin}/pages/table.html?folder=operations&table=orders`);
  await page.locator('.grid-stage[data-grid-ready="true"]').waitFor();
  const field = async label => page.locator('.tabulator-col[tabulator-field]')
    .filter({ has: page.locator('.tabular-column-semantic', { hasText: label }) })
    .getAttribute('tabulator-field');
  const row = order => page.locator('.tabulator-row').filter({ hasText: order });
  const quantity = await field('Quantity');
  const unitPrice = await field('Unit price');
  const total = await field('Total');
  check(quantity && unitPrice && total, 'Expected fields unavailable');

  const priceCell = row('ord-001').locator(`[tabulator-field="${unitPrice}"]`);
  await priceCell.dblclick();
  const priceInput = priceCell.locator('input');
  await priceInput.fill('13.75');
  await priceInput.press('Enter');
  await page.getByText('Uncommitted draft').waitFor();
  check((await priceCell.textContent())?.includes('13.75'), 'Pointer draft was not shown');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  check((await priceCell.textContent())?.includes('12.500000000000000000'), 'Cancel did not restore accepted value');

  const quantityCell = row('ord-001').locator(`[tabulator-field="${quantity}"]`);
  await quantityCell.click();
  await quantityCell.press('Enter');
  const quantityInput = quantityCell.locator('input');
  await quantityInput.fill('5');
  await quantityInput.press('Enter');
  await page.getByText('Uncommitted draft').waitFor();
  await page.getByRole('button', { name: 'Commit', exact: true }).click();
  await page.locator('.status-bar output').filter({ hasText: 'Saved · Edit 1 cell' }).waitFor();
  check((await row('ord-001').locator(`[tabulator-field="${quantity}"]`).textContent())?.trim() === '5', 'Keyboard edit did not save');
  check((await row('ord-001').locator(`[tabulator-field="${total}"]`).textContent())?.includes('62.500000000000000000'), 'Generated total was not refreshed');

  const invalidCell = row('ord-001').locator(`[tabulator-field="${quantity}"]`);
  await invalidCell.dblclick();
  await invalidCell.locator('input').fill('999');
  await invalidCell.locator('input').press('Enter');
  await page.getByRole('button', { name: 'Commit', exact: true }).click();
  await page.getByText('Draft needs attention').waitFor();
  check((await page.locator('.status-bar output').textContent())?.includes('PostgreSQL rejected'), 'Constraint error was not actionable');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  check((await row('ord-001').locator(`[tabulator-field="${quantity}"]`).textContent())?.trim() === '5', 'Failed draft rollback lost accepted value');
  return { quantity, unitPrice, total, feedback: await page.locator('.status-bar output').textContent() };
}
