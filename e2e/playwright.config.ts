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
 * Public pages run in four Chromium projects (desktop, tablet, phone,
 * reduced motion) and on WebKit (iPhone) and Firefox; the admin and contact
 * flows only on desktop. On the synthetic fixture store (E2E_FIXTURE=1,
 * scripts/ci/fixture-store.mjs) the performance and layout gates
 * (gates.spec.ts) and the visual baselines (visual.spec.ts, `visual`
 * project) run too. The @admin tests form their
 * own desktop project that starts once the public projects are done: they
 * change shared content (the home section order and highlights, logos, the
 * CV, drafts) and regenerate the ISR pages, which would otherwise shift a
 * public test's page between two of its own loads (e.g. a Back that
 * restores the scroll position). They also run one at a time: several of
 * them save the same home document or CV with If-Match, and two editors
 * open at once would conflict (409). If a public test fails, the admin
 * project is reported as not run.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
const CI = !!process.env.CI
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
const publicOnly = /public\.spec\.ts$/
/**
 * The public checks, the fixture-store layout gates (e2e/gates.spec.ts) and
 * the image viewer's gestures (e2e/lightbox-gestures.spec.ts: touch on
 * Safari's engine matters most), also run on WebKit and Firefox.
 */
const crossEngine = /(public|gates|lightbox-gestures)\.spec\.ts$/

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
    { name: 'chromium', use: desktop, grepInvert: /@admin/, testIgnore: /visual\.spec\.ts$/ },
    { name: 'tablet', testMatch: publicOnly, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', testMatch: publicOnly, use: { ...devices['Pixel 7'] } },
    { name: 'reduced', testMatch: publicOnly, use: { ...desktop, reducedMotion: 'reduce' } },
    // Cross-engine: the public checks on Safari's engine (iPhone — about half
    // of Hong Kong's mobile visits) and on Firefox.
    { name: 'webkit', testMatch: crossEngine, grepInvert: /@admin/, use: { ...devices['iPhone 15'] } },
    { name: 'firefox', testMatch: crossEngine, grepInvert: /@admin/, use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    // Visual baselines of the fixture store (e2e/visual.spec.ts; skipped elsewhere).
    { name: 'visual', testMatch: /visual\.spec\.ts$/, use: { ...devices['Desktop Chrome'] } },
    { name: 'admin', use: desktop, grep: /@admin/, workers: 1, dependencies: ['chromium', 'tablet', 'mobile', 'reduced', 'webkit', 'firefox', 'visual'] },
  ],
})
