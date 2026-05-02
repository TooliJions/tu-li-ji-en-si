import { defineConfig, devices } from '@playwright/test';

const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter @cybernovelist/studio dev:e2e',
    env: {
      ...webServerEnv,
      CYBERNOVELIST_DISABLE_RATE_LIMIT: '1',
    },
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  },
});
