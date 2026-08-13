async page => {
  const origin = '__TASK00008_ORIGIN__';
  await page.context().addCookies([{
    name: 'tabular_session', value: '__TASK00008_OWNER_SESSION__', url: origin,
    httpOnly: true, sameSite: 'Strict'
  }]);
  const response = await page.goto(`${origin}/pages/table.html?folder=operations&table=orders`);
  await page.locator('.tabular-grid-host').waitFor();
  await page.locator('.grid-stage[data-grid-ready="true"]').waitFor();
  return page.evaluate(status => ({
    status,
    title: document.title,
    feedback: document.querySelector('.status-bar output')?.textContent,
    stage: document.querySelector('.grid-stage')?.getAttribute('data-selection'),
    headers: [...document.querySelectorAll('.tabulator-col[tabulator-field]')].map(item => ({
      field: item.getAttribute('tabulator-field'),
      text: item.textContent?.trim()
    })),
    rows: [...document.querySelectorAll('.tabulator-row')].slice(0, 4).map(item => ({
      id: item.getAttribute('data-tabular-row-id'),
      text: item.textContent?.trim(),
      cells: [...item.querySelectorAll('.tabulator-cell')].map(cell => ({
        field: cell.getAttribute('tabulator-field'), text: cell.textContent?.trim()
      }))
    }))
  }), response?.status());
}
