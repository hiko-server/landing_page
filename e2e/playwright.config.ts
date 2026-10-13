import { defineConfig, devices } from '@playwright/test'

/**
 * Browser E2E + accessibility gate (`yarn e2e`).
 *
 * Runs against an already running build — never a dev server:
 *   - CI: the Docker image built from this commit, started with an EMPTY
 *     data volume (E2E_BASE_URL=http://127.0.0.1:3000, ADMIN_EMAIL/ADMIN_PASS
 *     from the job env);
 *   - after a deploy: production with real content, admin specs excluded:
 *       E2E_BASE_URL=https://lucian-dev.com yarn e2e --grep-invert @admin
 *
 * Public pages run in four projects (desktop, tablet, phone, reduced motion);
 * the admin and contact flows only on desktop.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
const CI = !!process.env.CI
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
const publicOnly = /public\.spec\.ts$/

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  outputDir: '../test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'Asia/Hong_Kong',
  },
  projects: [
    { name: 'chromium', use: desktop },
    { name: 'tablet', testMatch: publicOnly, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', testMatch: publicOnly, use: { ...devices['Pixel 7'] } },
    { name: 'reduced', testMatch: publicOnly, use: { ...desktop, reducedMotion: 'reduce' } },
  ],
})
