import { expect, test as base, type Page } from '@playwright/test';

export const acceptanceUsername = process.env.TABULAR_ACCEPTANCE_USERNAME || 'tabular_reviewer';
const password = process.env.TABULAR_ACCEPTANCE_PASSWORD || 'review-local-only-2026';

/** Sign in through the same visible form used by a normal browser session. */
export async function signIn(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.getByLabel('PostgreSQL role').fill(acceptanceUsername);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.getByRole('region', { name: 'File explorer' })).toBeVisible();
}

/** Navigate to the seeded Operations folder through the visible explorer. */
export async function openOperationsFolder(page: Page) {
  await page.getByRole('link', { name: /^Operations\b/ }).click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/pages/browse.html'
    && url.searchParams.get('folder') === 'operations'
  ));
  await expect(page.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
}

/** Open the seeded customer-orders spreadsheet through visible file links. */
export async function openCustomerOrders(page: Page) {
  await openOperationsFolder(page);
  await page.getByRole('link', { name: /^Customer orders\b/ }).click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/pages/table.html'
    && url.searchParams.get('folder') === 'operations'
    && url.searchParams.get('table') === 'customer-orders'
  ));
  await expect(page.locator('.grid-stage')).toHaveAttribute('data-grid-ready', 'true');
}

export { expect };

export const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ page }, use) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await signIn(page);
    await use(page);
    expect(pageErrors, 'The page emitted uncaught browser errors').toEqual([]);
  }
});
