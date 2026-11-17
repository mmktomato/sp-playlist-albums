import { defineConfig, devices } from '@playwright/test'
import { BASE_PATH } from './app.config.ts'
import { E2E_CLIENT_ID } from './tests/e2e/support/constants.ts'

const PREVIEW_ORIGIN = 'http://127.0.0.1:15556'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: PREVIEW_ORIGIN + BASE_PATH,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'e2e-iphone',
      testMatch: 'e2e/**/*.spec.ts',
      use: { ...devices['iPhone 15'], serviceWorkers: 'block' },
    },
    {
      name: 'e2e-pixel',
      testMatch: 'e2e/**/*.spec.ts',
      use: { ...devices['Pixel 7'], serviceWorkers: 'block' },
    },
    {
      name: 'pwa-iphone',
      testMatch: 'pwa/**/*.spec.ts',
      use: { ...devices['iPhone 15'] },
    },
    {
      name: 'pwa-pixel',
      testMatch: 'pwa/**/*.spec.ts',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: PREVIEW_ORIGIN + BASE_PATH,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SPOTIFY_CLIENT_ID: E2E_CLIENT_ID,
    },
  },
})
