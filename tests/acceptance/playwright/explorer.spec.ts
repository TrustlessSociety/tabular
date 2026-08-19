import { expect, openOperationsFolder, test } from './support.js';

test.describe('file explorer acceptance', () => {
  test('users can search folders and retain their chosen layout', async ({ signedInPage: page }) => {
    const explorer = page.getByRole('region', { name: 'File explorer' });
    const search = page.getByRole('searchbox', { name: 'Search files' });

    await expect(page.getByRole('link', { name: /^Operations\b/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Finance\b/ })).toBeVisible();
    await search.fill('Finance');
    await expect(explorer.locator('.explorer-item')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /^Finance\b/ })).toBeVisible();

    await search.clear();
    await page.getByRole('button', { name: 'Grid view' }).click();
    await expect(explorer).toHaveAttribute('data-view', 'grid');
    await page.reload();
    await expect(explorer).toHaveAttribute('data-view', 'grid');
  });

  test('folder navigation separates files from saved views', async ({ signedInPage: page }) => {
    await openOperationsFolder(page);

    await expect(page.getByRole('link', { name: /^Customer orders\b/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Fulfillment queue\b/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Views' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('tab') === 'views');
    await expect(page.getByRole('tab', { name: 'Views' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/No views yet|No matching views/)).toBeVisible();
  });

  test('the import entry point exposes source choices without mutating data', async ({ signedInPage: page }) => {
    await openOperationsFolder(page);
    await page.getByRole('link', { name: 'Import' }).click();

    await expect(page.getByRole('heading', { name: 'Import values' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose a source' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /CSV/ })).toBeEnabled();
    await expect(page.getByRole('radio', { name: /XLSX/ })).toBeEnabled();
    await expect(page.getByRole('radio', { name: /Google Sheets/ })).toBeVisible();
    await expect(page.getByRole('note', { name: 'Values only' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preview values' })).toBeDisabled();
  });
});
