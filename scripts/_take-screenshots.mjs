/* eslint-disable no-console */
/**
 * One-shot README screenshot generator.
 *
 *   # 1. Install the headless driver locally (NOT a project devDep —
 *   #    we don't want every contributor pulling 12 MB for screenshots).
 *   npm install --no-save --legacy-peer-deps puppeteer-core
 *
 *   # 2. Boot dev on port 3001 in a separate terminal:
 *   yarn dev -- -p 3001
 *
 *   # 3. Pre-flight (so headless login works without exposing real creds):
 *   cp data/admin.json data/admin.json.bak
 *   node -e "const c=require('crypto'),fs=require('fs'),s=c.randomBytes(16).toString('hex');\
 *     fs.writeFileSync('data/admin.json',JSON.stringify({email:'dev@local.test',\
 *     passwordHash:c.scryptSync('dev-screenshot-pass-2026',s,64).toString('hex'),\
 *     salt:s,resets:[],failedLogins:[]},null,2))"
 *
 *   # 4. Run:
 *   node scripts/_take-screenshots.mjs
 *
 *   # 5. Restore:
 *   mv data/admin.json.bak data/admin.json
 *
 * Writes PNGs under docs/screenshots/ with the filenames the README
 * expects (`hero-light.png`, `admin-{home,storage,cv-studio}.png`).
 *
 * Uses puppeteer-core against the system Chrome (no chromium download).
 * Pointing at the system browser keeps the install footprint tiny so
 * `--no-save` is appropriate; after the screenshots are committed you
 * can `rm -rf node_modules && yarn install --frozen-lockfile` to drop
 * puppeteer-core back out of the tree.
 *
 * Note: the CV Studio screenshot will expose real cvdata via the
 * Personal Information section + the live preview pane. For OSS docs,
 * also scrub data/content.db's `cvdata` KV before this step — see the
 * inline Node snippet in scripts/ history or the project's own contact
 * stub helpers.
 */
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import fs from 'node:fs'

const BASE = process.env.SHOT_BASE || 'http://localhost:3001'
const ADMIN_EMAIL = process.env.SHOT_ADMIN_EMAIL || 'dev@local.test'
const ADMIN_PASS = process.env.SHOT_ADMIN_PASS || 'dev-screenshot-pass-2026'
const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 2 }
const OUT_DIR = path.resolve('docs/screenshots')

// Standard Chrome install location on Windows. Falls back to Edge if missing.
function findBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  throw new Error('No Chrome/Edge found on standard Windows paths.')
}

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

async function shot(page, file, opts = {}) {
  const out = path.join(OUT_DIR, file)
  await page.screenshot({ path: out, type: 'png', fullPage: opts.fullPage ?? false })
  const stat = fs.statSync(out)
  console.log(`  ✓ ${file}  (${(stat.size / 1024).toFixed(0)} KB)`)
}

async function waitForReady(page, ms = 1200) {
  // Settle SSR + framer-motion entrance animations + lazy chunks.
  await page.evaluate(
    (m) => new Promise((r) => setTimeout(r, m)),
    ms,
  )
}

async function main() {
  ensureOutDir()
  const exePath = findBrowser()
  console.log(`Browser: ${exePath}`)
  console.log(`Base:    ${BASE}`)
  console.log(`Out:     ${OUT_DIR}`)

  const browser = await puppeteer.launch({
    executablePath: exePath,
    headless: 'new',
    defaultViewport: VIEWPORT,
    args: ['--hide-scrollbars', '--disable-blink-features=AutomationControlled'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport(VIEWPORT)

    // ── 1. Home, light mode ────────────────────────────────────────
    console.log('\n[1/4] Home (light)')
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
    // Force Chakra to switch — its colour-mode is sticky in localStorage.
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('chakra-ui-color-mode', 'light')
      } catch {}
    })
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60_000 })
    await waitForReady(page, 2000)
    await shot(page, 'hero-light.png')

    // ── 2. Login ───────────────────────────────────────────────────
    console.log('\n[*]    Authenticating…')
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle2', timeout: 30_000 })
    await page.type('input[type=email]', ADMIN_EMAIL)
    await page.type('input[type=password]', ADMIN_PASS)
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null),
      page.click('button[type=submit]'),
    ])
    await waitForReady(page, 1500)
    // Confirm we landed in /admin (not bounced back to /login).
    const url = page.url()
    if (!/\/admin(?!\/login)/.test(url)) {
      throw new Error(`Login failed — landed on ${url}`)
    }
    console.log(`  ✓ logged in → ${url}`)

    // ── 3. Admin tabs ──────────────────────────────────────────────
    const tabs = [
      { tab: 'home', file: 'admin-home.png' },
      { tab: 'storage', file: 'admin-storage.png' },
      { tab: 'cv', file: 'admin-cv-studio.png' },
    ]
    for (const t of tabs) {
      console.log(`\n[*]    /admin/dashboard?tab=${t.tab}`)
      await page.goto(`${BASE}/admin/dashboard?tab=${t.tab}`, {
        waitUntil: 'networkidle2',
        timeout: 60_000,
      })
      await waitForReady(page, 2500)
      await shot(page, t.file)
    }

    console.log('\nDone.')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
