/**
 * Cross-stream integration of wave 2A (the merged streams working together):
 * each block names the streams it joins. Source-level and pure checks; the
 * behaviour is covered end to end in e2e/wave2a-integration.spec.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { EXPORT_PATHS, cvPdfPath } from '../lib/cvExport/paths'
import { EXPORT_PATHS as FILE_EXPORT_PATHS } from '../lib/cvExport/files'
import {
  COLLECTION_EXTRA_PATHS,
  CV_DOCUMENT_PATHS,
  CV_PAGE_PATHS,
  HOME_PAGE_PATHS,
  STATIC_CONTENT_PATHS,
  derivedPurgePaths,
} from '../lib/revalidate'
import { BUILD_REVALIDATE_SECONDS, PROFILE_REVALIDATE_SECONDS } from '../lib/isr'
import { CV_REVALIDATE_SECONDS } from '../lib/cvPage'
import { CONTACT_REVALIDATE_SECONDS } from '../lib/contactPage'

const ROOT = process.cwd()
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8')

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(path.join(ROOT, rel)).isDirectory()) sources(rel, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(rel)
  }
  return out
}

// ── (c) home-about-isr + chrome-identity + cv-docs: CV download links ───────

test('(c) every CV download link points at the server-rendered PDFs, never the print dialog', () => {
  assert.equal(cvPdfPath('en'), '/cv.pdf')
  assert.equal(cvPdfPath('zh'), '/cv/zh.pdf')
  assert.equal(FILE_EXPORT_PATHS, EXPORT_PATHS, 'one table of export paths')
  const offenders = [...sources('components'), ...sources('pages'), ...sources('layout')].filter((f) =>
    /href=(\{`|["'{])\/cv(\?lang=\$\{[^}]+\})?[?&]print=1/.test(read(f)),
  )
  assert.deepEqual(offenders, [], 'links to /cv?print=1')
  assert.match(read('components/About/IdentityRail.tsx'), /href=\{cvPdfPath\(cvLang\)\}/)
  assert.match(read('pages/about/index.tsx'), /cvLang=\{active\}/)
  assert.match(read('components/Admin/cvStudio/Preview.tsx'), /href=\{cvPdfPath\(lang\)\}/)
  // The palette downloads both languages.
  const palette = read('components/General-UI/CommandPalette.tsx')
  assert.match(palette, /downloadFile\('\/cv\.pdf'\)/)
  assert.match(palette, /downloadFile\('\/cv\/zh\.pdf'\)/)
})

// ── (d) home-about-isr + cv-docs + cv-studio-contact: one ISR picture ───────

const sorted = (list: readonly string[]) => [...list].sort()

test('(d) the five profile pages are ISR with their streams\' windows, one build-phase rule', () => {
  assert.equal(PROFILE_REVALIDATE_SECONDS, 3600)
  assert.equal(CV_REVALIDATE_SECONDS, 60)
  assert.equal(CONTACT_REVALIDATE_SECONDS, 300)
  assert.equal(BUILD_REVALIDATE_SECONDS, 1)
  for (const page of ['pages/index.tsx', 'pages/about/index.tsx']) {
    assert.match(read(page), /export const getStaticProps/)
    assert.match(read(page), /revalidate: revalidateAfter\(PROFILE_REVALIDATE_SECONDS\)/)
  }
  for (const page of ['pages/cv/index.tsx', 'pages/cv/zh.tsx', 'pages/contact/index.tsx']) {
    assert.match(read(page), /export const getStaticProps/)
    assert.doesNotMatch(read(page), /getServerSideProps/)
  }
  assert.match(read('lib/cvPage.ts'), /revalidate: revalidateAfter\(CV_REVALIDATE_SECONDS\)/)
  assert.match(read('lib/contactPage.ts'), /revalidate: revalidateAfter\(CONTACT_REVALIDATE_SECONDS\)/)
  // One expireTime for every ISR page.
  assert.equal((read('next.config.js').match(/expireTime:/g) || []).length, 1)
})

test('(d) every admin write regenerates exactly the pages that render what it changed', () => {
  // Home saves: availability feeds the CV header and the /contact card.
  assert.deepEqual(sorted(HOME_PAGE_PATHS), ['/', '/about', '/contact', '/cv', '/cv/zh', '/now'])
  // CV saves: /work lists every public project; /now the current roles.
  assert.deepEqual(sorted(CV_PAGE_PATHS), ['/', '/about', '/cv', '/cv/zh', '/now', '/work'])
  assert.deepEqual([...CV_DOCUMENT_PATHS], ['/cv', '/cv/zh'])
  // The API routes use these lists (with the confirm pass) — no private copies.
  assert.match(read('pages/api/home.ts'), /export const HOME_STATIC_PATHS: readonly string\[\] = \[\.\.\.HOME_PAGE_PATHS\]/)
  assert.match(read('pages/api/home.ts'), /revalidatePaths\(res, paths, \{ confirm: paths \}\)/)
  assert.match(read('pages/api/home.ts'), /warmCvExports\(\)/)
  assert.match(read('pages/api/cvdata.ts'), /export const CV_STATIC_PATHS: readonly string\[\] = \[\.\.\.CV_PAGE_PATHS\]/)
  assert.match(read('pages/api/cvdata.ts'), /revalidatePaths\(res, paths, \{ confirm: paths \}\)/)
  assert.match(read('pages/api/versions.ts'), /const STATIC_PATHS: Record<JsonDocType, string\[\]> = \{ cv: \[\.\.\.CV_PAGE_PATHS\], home: \[\.\.\.HOME_PAGE_PATHS\] \}/)
  assert.match(read('pages/api/mongo.ts'), /if \(counts\.cv\) restoredPaths\.push\(\.\.\.CV_PAGE_PATHS\)/)
  assert.match(read('pages/api/mongo.ts'), /if \(counts\.home\) restoredPaths\.push\(\.\.\.HOME_PAGE_PATHS\)/)
  // About-page (bio) saves and restores regenerate /about only.
  assert.match(read('pages/api/admin/page.ts'), /const paths = \[`\/\$\{name\}`\]/)
  // Post / case-study saves: their collection, the pages linking them and the CV (skill evidence, case-study links).
  assert.deepEqual([...COLLECTION_EXTRA_PATHS.blog], ['/'])
  assert.deepEqual([...COLLECTION_EXTRA_PATHS.work], ['/', '/about'])
  assert.match(read('lib/mdx-admin.ts'), /\.\.\.COLLECTION_EXTRA_PATHS\[c\], \.\.\.CV_DOCUMENT_PATHS\]/)
  // Restores and storage pulls regenerate every ISR page.
  for (const p of new Set([...HOME_PAGE_PATHS, ...CV_PAGE_PATHS, '/blog', '/uses', '/colophon'])) {
    assert.ok((STATIC_CONTENT_PATHS as readonly string[]).includes(p), `restores regenerate ${p}`)
  }
  // A CV page change purges its files at the edge.
  assert.deepEqual(sorted(derivedPurgePaths(['/cv/zh'])), ['/cv/zh.json', '/cv/zh.pdf', '/cv/zh.txt'])
})

// ── (e) tokens-theme + reading-work: one icon set, the token type scale ─────

test('(e) reading-work components draw their icons from the Lucide set, no inline SVG glyphs', () => {
  const uses: Record<string, RegExp> = {
    'components/MDX/Callout.tsx': /import \{ InfoIcon, LightbulbIcon, MessageSquareWarningIcon, OctagonAlertIcon, TriangleAlertIcon \} from '\.\.\/Icons\/ui\/content'/,
    'components/Article/ArticleEnd.tsx': /import \{ CopyIcon, QrCodeIcon, ShareIcon \} from '\.\.\/Icons\/ui\/content'/,
    'components/MDX/VideoEmbed.tsx': /import \{ PlayIcon \} from '\.\.\/Icons\/ui\/content'/,
  }
  for (const [f, re] of Object.entries(uses)) {
    const code = read(f)
    assert.match(code, re, f)
    assert.doesNotMatch(code, /<svg|as="svg"/, `${f}: inline SVG`)
    assert.doesNotMatch(code, /ease-out-quart|cubic-bezier/, `${f}: motion tokens`)
  }
  // The rewritten /work card keeps tokens-theme's type scale, status tokens and star icon.
  const work = read('pages/work/index.tsx')
  assert.match(work, /\.\.\.textStyleProps\(featured \? 'title-lg' : 'title-md'\)/)
  assert.match(work, /<StarIcon size="xs" \/>/)
  assert.match(work, /textStyle="label"/)
  assert.match(work, /borderRadius="card"/)
  assert.match(work, /boxShadow: 'elevation\.md'/)
  assert.doesNotMatch(work, /fontSize=(\{[^}]*)?["']\d+px/)
  assert.doesNotMatch(work, /var\(--font-geist-mono\)/)
})

// ── (h) security-a + reading-work + every stream: the CSP and the social cards ─

test('(h) the CSP allows what the merged code needs and nothing more', () => {
  const { buildCsp, CSP_DIRECTIVES } = createRequire(import.meta.url)('../lib/csp.js') as {
    buildCsp: (env?: string) => string
    CSP_DIRECTIVES: Record<string, string[]>
  }
  const csp = buildCsp('production')
  // security-a: violations are reported to the site's own error monitor.
  assert.match(csp, /; report-uri \/api\/e$/)
  // The browser connects to its own origin only (GitHub through /api/github/*, beacons to /api/e and /api/a).
  assert.deepEqual(CSP_DIRECTIVES['connect-src'], ["'self'"])
  // reading-work: posters are same-origin uploads; players load only after a click, from these hosts.
  assert.ok(CSP_DIRECTIVES['img-src'].includes("'self'"))
  assert.deepEqual(CSP_DIRECTIVES['frame-src'], ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'])
  assert.match(read('lib/videoPoster.ts'), /\/uploads\//)
  // No third-party script, analytics or monitoring host.
  assert.deepEqual(CSP_DIRECTIVES['script-src'], ["'self'", "'unsafe-inline'"])
  assert.ok(!/sentry|cloudflareinsights|googletagmanager|hcaptcha/i.test(csp))
})

test('(h) social cards: fixed pages use presets, articles sign their free-text cards in the loader', () => {
  const pages = [...sources('pages'), ...sources('components')].filter((f) => !f.startsWith('pages/api/') && !f.includes('/Admin/'))
  for (const f of pages) assert.doesNotMatch(read(f), /\bogImageUrl\(/, `${f}: unsigned free-text card`)
  for (const f of ['pages/blog/[slug].tsx', 'pages/work/[slug].tsx']) {
    assert.match(read(f), /ogImages: \{ card: signedOgImageUrl\(card\), square: signedOgImageUrl\(\{ \.\.\.card, size: 'square' \}\) \}/, f)
  }
  assert.match(read('components/CVViewerPage/CvPageView.tsx'), /image=\{ogPresetUrl\('cv'/)
})

// ── (i) security-a's migration runner owns every schema change ──────────────

test('(i) no table, column or index is created outside scripts/db migrations', () => {
  const ddl = /\b(create|alter)\s+table\b|\bcreate\s+(unique\s+)?index\b|\badd\s+column\b/i
  const files = [...sources('lib'), ...sources('pages'), ...sources('components'), ...sources('scripts')].filter(
    (f) => !f.startsWith('scripts/db/'),
  )
  const mjs = readdirSync(path.join(ROOT, 'scripts'))
    .filter((n) => n.endsWith('.mjs'))
    .map((n) => `scripts/${n}`)
  const offenders = [...files, ...mjs].filter((f) => ddl.test(read(f)))
  assert.deepEqual(offenders, [], 'schema changes belong in scripts/db/<store>/NNN-name.mjs')
  // Each store's index registers its migrations in order.
  for (const store of ['content', 'analytics', 'auth']) {
    const dir = path.join(ROOT, 'scripts/db', store)
    const files = readdirSync(dir).filter((n) => /^\d{3}-.+\.mjs$/.test(n)).sort()
    const index = read(`scripts/db/${store}/index.mjs`)
    for (const f of files) assert.ok(index.includes(`./${f}`), `${store}: ${f} registered`)
  }
})

// ── security-a + cv-docs: the image carries every runtime asset ─────────────

test('the Docker image carries the runtime assets and libraries the merged code reads', () => {
  const cfg = createRequire(import.meta.url)('../next.config.js') as {
    outputFileTracingIncludes: Record<string, string[]>
    serverExternalPackages: string[]
  }
  assert.deepEqual(cfg.outputFileTracingIncludes['/api/og'], ['./assets/og/*.ttf'])
  assert.ok(cfg.outputFileTracingIncludes['/api/cv/export'].includes('./assets/pdf/**/*'))
  assert.deepEqual([...cfg.serverExternalPackages].sort(), ['fontkit', 'linebreak', 'pdfkit'])
  const docker = read('Dockerfile')
  assert.match(docker, /test -f \/app\/assets\/og\/Geist-Regular\.ttf/)
  assert.match(docker, /test -f \/app\/assets\/pdf\/NotoSansSC-Regular\.subset\.ttf/)
  assert.match(docker, /require\('pdfkit'\); require\('fontkit'\); require\('linebreak'\)/)
  assert.match(docker, /test -f \/app\/scripts\/db\/migrate\.mjs/)
  // assets/ is part of the build context (only runtime data and uploads are ignored).
  assert.doesNotMatch(read('.dockerignore'), /^assets/m)
})
