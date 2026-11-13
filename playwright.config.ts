import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5192',
    acceptDownloads: true,
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npx vite --port 5192 --strictPort',
    port: 5192,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
    { name: 'android-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
