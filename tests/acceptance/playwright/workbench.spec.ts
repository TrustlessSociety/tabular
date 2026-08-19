import { expect, openCustomerOrders, test } from './support.js';

test.describe('spreadsheet workbench acceptance', () => {
  test('a seeded PostgreSQL table renders as an interactive spreadsheet', async ({ signedInPage: page }) => {
    await openCustomerOrders(page);

    await expect(page.getByRole('button', { name: 'Customer orders' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Orders spreadsheet' })).toBeVisible();
    const headers = page.locator('.tabulator-col[tabulator-field]');
    await expect(headers.nth(0)).toContainText('Order ID');
    await expect(headers.nth(1)).toContainText('Customer');
    await expect(headers.nth(2)).toContainText('Status');
    await expect(page.locator('.tabulator-row').filter({ hasText: 'ord-4001' })).toBeVisible();
    await expect(page.locator('.runtime-state')).toContainText(/Saved|Live|Reconnecting/);
  });

  test('spreadsheet menus open through semantic controls and dismiss with Escape', async ({ signedInPage: page }) => {
    await openCustomerOrders(page);

    const menuBar = page.getByRole('menubar', { name: 'Spreadsheet menus' });
    await menuBar.getByRole('menuitem', { name: 'View', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'View menu' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'View menu' })).toBeHidden();

    await expect(page.getByRole('toolbar', { name: 'Formatting tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  test('system activity is reachable from the signed-in product shell', async ({ signedInPage: page }) => {
    await page.getByRole('link', { name: 'System activity' }).click();

    await expect(page.getByRole('heading', { name: 'System activity', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Activity summary' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Activity filters' })).toBeVisible();
    await page.getByRole('tab', { name: /Needs attention/ }).click();
    await expect(page.getByRole('tab', { name: /Needs attention/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });
});
