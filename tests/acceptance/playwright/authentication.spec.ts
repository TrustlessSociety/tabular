import { test as base, expect } from '@playwright/test';

import { acceptanceUsername, signIn } from './support.js';

base.describe('authentication acceptance', () => {
  base('protected pages reveal no application data before sign-in', async ({ page }) => {
    await page.goto('/pages/system-activity.html');

    await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'System activity', exact: true })).toHaveCount(0);

    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: 'Sign in to Tabular' })).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
  });

  base('invalid credentials fail without creating a browser session', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('PostgreSQL role').fill('not_a_tabular_role');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toContainText('Sign-in failed');
    await expect(page).toHaveURL(/\/auth\/login$/);
    await page.goto('/auth/account');
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  base('a signed-in user can inspect the account and revoke the session', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: /^Account:/ }).click();

    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
    await expect(page.locator('#signed-in-identity')).toContainText(acceptanceUsername);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/auth\/login$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});
