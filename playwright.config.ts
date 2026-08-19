import { defineConfig, devices } from '@playwright/test';

const managedPort = 3100;
const managedOrigin = `http://127.0.0.1:${managedPort}`;
const externalOrigin = process.env.TABULAR_PLAYWRIGHT_BASE_URL;
const baseURL = externalOrigin || managedOrigin;

export default defineConfig({
  testDir: './tests/acceptance/playwright',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: externalOrigin ? undefined : {
    command: 'npm run dev',
    env: {
      TABULAR_HOST: '127.0.0.1',
      TABULAR_PORT: String(managedPort),
      TABULAR_PUBLIC_ORIGIN: managedOrigin,
      TABULAR_WEB_DATABASE_URL: '',
      TABULAR_MIGRATOR_DATABASE_URL: '',
      TABULAR_WORKER_DATABASE_URL: ''
    },
    url: `${managedOrigin}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: '**/*.mobile.spec.ts',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chromium',
      testMatch: '**/*.mobile.spec.ts',
      use: { ...devices['Pixel 5'] }
    }
  ]
});
