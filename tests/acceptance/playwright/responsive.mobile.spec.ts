import { expect, openOperationsFolder, test } from './support.js';

test('core explorer and import surfaces fit a narrow browser viewport', async ({ signedInPage: page }) => {
  await openOperationsFolder(page);
  await expect(page.getByRole('link', { name: /^Customer orders\b/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import' })).toBeVisible();
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 393);

  await page.getByRole('link', { name: 'Import' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a source' })).toBeVisible();
  const fitsViewport = await page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ));
  expect(fitsViewport).toBe(true);
});
