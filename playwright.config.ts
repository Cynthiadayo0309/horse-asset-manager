import { defineConfig, devices } from '@playwright/test';

const localBrowserProjects = process.env.CI
  ? []
  : [
      { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' as const } },
      { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' as const } },
    ];

export default defineConfig({
  testDir: './tests/e2e',
  // E2E scenarios share the local D1 instance, so keep database mutations serial.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
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
    ...localBrowserProjects,
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
