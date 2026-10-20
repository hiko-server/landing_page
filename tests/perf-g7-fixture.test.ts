/**
 * G7 / CRIT-cross-engine-visual — the synthetic CI fixture store and the
 * gates that run on it.
 *
 *   - the store is owner-neutral test data (decisions.md: never open-source
 *     personal information): no owner name, contact or address, only
 *     example.com / example.org addresses, generated images without
 *     metadata, and every file it references is in it;
 *   - it can never reach production: e2e/ is outside the Docker build
 *     context, and the installer refuses a checkout with a real store;
 *   - CI runs the gates in the Playwright image of the pinned version, and
 *     the visual baselines exist for every page × viewport × theme.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { FIXTURE_DIR, FIXTURE_TIME, install } from '../scripts/ci/fixture-store.mjs'

const ROOT = process.cwd()

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? files(p) : [p]
  })
}

const textFiles = () => files(FIXTURE_DIR).filter((f) => /\.(json|mdx?)$/.test(f))

test('the fixture is owner-neutral: no owner identity, no real contact data', () => {
  const forbidden = [/yanpei/i, /李彦霈|李彥霈|彦霈/, /\blucian\b/i, /lucian-dev/i, /hiko/i, /\+852/, /\b\d{8}\b/]
  for (const file of textFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    for (const re of forbidden) assert.doesNotMatch(text, re, `${path.relative(ROOT, file)} matches ${re}`)
    for (const m of text.matchAll(/[\w.+-]+@([\w-]+\.[\w.]+)/g)) assert.match(m[1], /^example\.(com|org)$/, `${path.relative(ROOT, file)}: ${m[0]}`)
    for (const m of text.matchAll(/https?:\/\/([^/\s"')]+)/g)) assert.match(m[1], /^(www\.)?example\.(com|org)$/, `${path.relative(ROOT, file)}: ${m[0]}`)
  }
  const home = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'data/home.json'), 'utf8'))
  assert.equal(home.site.name, 'Example Person')
  assert.deepEqual(Object.values(home.socials), ['', '', '', ''], 'no social profile, so nothing is fetched from GitHub')
})

test('every upload the fixture references is in it, and every fixture image is small, synthetic and metadata-free', async () => {
  const uploads = new Set(fs.readdirSync(path.join(FIXTURE_DIR, 'uploads')))
  const referenced = new Set<string>()
  for (const file of textFiles()) for (const m of fs.readFileSync(file, 'utf8').matchAll(/\/uploads\/([A-Za-z0-9._-]+)/g)) referenced.add(m[1])
  assert.deepEqual([...referenced].filter((n) => !uploads.has(n)), [], 'missing uploads')
  assert.deepEqual([...uploads].filter((n) => !referenced.has(n)), [], 'unused uploads')
  for (const name of uploads) {
    const file = path.join(FIXTURE_DIR, 'uploads', name)
    assert.ok(fs.statSync(file).size < 100 * 1024, `${name} stays small`)
    const meta = await sharp(file).metadata()
    assert.equal(meta.exif, undefined, `${name}: no EXIF`)
    assert.equal(meta.xmp, undefined, `${name}: no XMP`)
  }
})

test('the fixture never reaches the Docker image', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8').split('\n').map((l) => l.trim())
  assert.ok(ignore.includes('e2e'), '.dockerignore keeps e2e/ (and the fixture) out of the build context')
})

test('install(): refuses a real store and production; copies data, content and uploads with variants, dated FIXTURE_TIME', async () => {
  const target = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'g7-fixture-')))
  try {
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'not-this-site' }))
    await assert.rejects(install(target), /not a checkout of this site/)
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'portfolio-studio' }))
    fs.mkdirSync(path.join(target, 'data'))
    fs.writeFileSync(path.join(target, 'data', 'content.db'), '')
    await assert.rejects(install(target), /refusing to mix test fixtures into a real store/)
    fs.rmSync(path.join(target, 'data', 'content.db'))
    const env = process.env.NODE_ENV
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    await assert.rejects(install(target), /NODE_ENV=production/)
    ;(process.env as Record<string, string | undefined>).NODE_ENV = env

    const result = await install(target)
    assert.equal(result.uploads, fs.readdirSync(path.join(FIXTURE_DIR, 'uploads')).length)
    assert.ok(result.variants > result.uploads * 4, 'WebP + AVIF variants and placeholders')
    const home = JSON.parse(fs.readFileSync(path.join(target, 'data', 'home.json'), 'utf8'))
    assert.equal(home.site.name, 'Example Person')
    for (const rel of ['content/blog/example-field-notes.mdx', 'content/work/example-sorting-station.mdx', 'content/about.mdx', 'public/uploads/example-portrait.jpg', 'public/uploads/example-portrait.jpg.w320.avif', 'public/uploads/example-portrait.jpg.w16.webp']) {
      assert.ok(fs.existsSync(path.join(target, rel)), rel)
    }
    assert.equal(fs.statSync(path.join(target, 'content/blog/example-field-notes.mdx')).mtimeMs, FIXTURE_TIME.getTime(), 'pinned dates: stable "updated" stamps')
    const again = await install(target)
    assert.equal(again.variants, 0, 'a second install keeps the variants it made')
  } finally {
    fs.rmSync(target, { recursive: true, force: true })
  }
})

test('CI runs the fixture gates in the Playwright image of the pinned version, on the platform of the baselines', () => {
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const version = String(pkg.devDependencies['@playwright/test']).replace(/^[^\d]*/, '')
  assert.match(ci, new RegExp(`image: mcr\\.microsoft\\.com/playwright:v${version.replace(/\./g, '\\.')}-noble`))
  assert.match(ci, /fixture-gates:[\s\S]*runs-on: ubuntu-24\.04-arm/)
  assert.match(ci, /scripts\/ci\/fixture-store\.mjs/)
  assert.match(ci, /E2E_FIXTURE: '1'/)
  assert.match(ci, /npx playwright install --with-deps chromium webkit firefox/)
  const config = fs.readFileSync(path.join(ROOT, 'e2e/playwright.config.ts'), 'utf8')
  for (const project of ['webkit', 'firefox', 'visual']) assert.match(config, new RegExp(`name: '${project}'`))
})

test('a visual baseline exists for every page × viewport × theme, and nothing else is stored', () => {
  const dir = path.join(ROOT, 'e2e', 'visual.spec.ts-snapshots')
  const expected: string[] = []
  for (const page of ['home', 'article', 'case-study', 'cv', 'contact']) {
    for (const viewport of ['phone', 'tablet', 'desktop']) for (const theme of ['dark', 'light']) expected.push(`${page}-${viewport}-${theme}-visual-linux.png`)
  }
  const present = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []
  assert.deepEqual(present, expected.sort())
})
