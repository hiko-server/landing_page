/**
 * reading-work D7 + D8 + E8: the end-of-article author card and share row
 * (public data only, QR drawn on the server, no third party until the reader
 * acts), post ↔ case-study links and shareable tag filters (with the
 * pre-paint script), and the /work archive of every public CV project.
 */
import { register } from 'node:module'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { hasTag, resolveTagParam, tagCounts, tagHref, tagSlug, tagSlugList, TAG_PREPAINT_SCRIPT, TAG_PREPAINT_STYLE_ID } from '../lib/tagFilter'
import { projectLinks, relatedArticles, toArticleLink, type ArticleLink } from '../components/Article/collectionNav'
import { archiveRows, archiveYears } from '../lib/projectArchive'
import { SECTION_BY_NAME } from '../lib/cvSections'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { readFileSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      import { createRequire } from 'node:module'
      const require = createRequire(${JSON.stringify(new URL('../package.json', import.meta.url).href)})
      const ts = require('typescript')
      export async function resolve(specifier, context, next) {
        if (specifier === 'next/link' || specifier === 'next/router' || specifier === 'next/head') return next(specifier + '.js', context)
        return next(specifier, context)
      }
      export async function load(url, context, next) {
        if (url.startsWith('file:') && url.endsWith('.tsx') && !url.includes('/node_modules/')) {
          const source = readFileSync(fileURLToPath(url), 'utf8')
          const out = ts.transpileModule(source, {
            fileName: fileURLToPath(url),
            compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
          })
          return { format: 'module', source: out.outputText, shortCircuit: true }
        }
        return next(url, context)
      }
    `),
  import.meta.url,
)

const html = (el: unknown) => renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-share-'))
let db: typeof import('../lib/db')

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true })
  db = await import('../lib/db')
})

after(() => {
  db.closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

// ── D8 tag filters ─────────────────────────────────────────────────────────

test('D8 tag slugs, counts and the ?tag= resolution', () => {
  assert.equal(tagSlug(' Edge AI '), 'edge-ai')
  assert.equal(tagSlug('C++ / Rust'), 'c-rust')
  assert.equal(tagSlug('计算机视觉'), '计算机视觉')
  assert.equal(tagSlug('ＹＯＬＯ'), 'yolo', 'NFKC folds full-width letters')
  const tags = tagCounts([['Edge AI', 'YOLO'], ['edge ai', 'Jetson'], undefined, ['YOLO', 'YOLO']])
  assert.deepEqual(tags, [
    { tag: 'Edge AI', slug: 'edge-ai', count: 2 },
    { tag: 'Jetson', slug: 'jetson', count: 1 },
    { tag: 'YOLO', slug: 'yolo', count: 2 },
  ])
  assert.equal(resolveTagParam('edge-ai', tags)?.tag, 'Edge AI')
  assert.equal(resolveTagParam('Edge AI', tags)?.slug, 'edge-ai')
  assert.equal(resolveTagParam(['yolo', 'x'], tags)?.slug, 'yolo')
  assert.equal(resolveTagParam('unknown', tags), null)
  assert.equal(resolveTagParam(undefined, tags), null)
  assert.equal(tagSlugList(['Edge AI', 'edge-ai', 'YOLO']), 'edge-ai yolo')
  assert.ok(hasTag(['Edge AI'], 'edge-ai'))
  assert.equal(tagHref('/blog', 'Edge AI'), '/blog?tag=edge-ai')
  assert.equal(tagHref('/work', '计算机视觉'), `/work?tag=${encodeURIComponent('计算机视觉')}`)
})

function runPrepaint(search: string, known: string[]) {
  const appended: Array<{ id: string; textContent: string }> = []
  const context = {
    URLSearchParams,
    JSON,
    location: { search },
    document: {
      currentScript: { getAttribute: (name: string) => (name === 'data-tags' ? JSON.stringify(known) : null) },
      createElement: () => ({ id: '', textContent: '' }),
      head: { appendChild: (el: { id: string; textContent: string }) => appended.push(el) },
    },
  }
  vm.runInNewContext(TAG_PREPAINT_SCRIPT, context)
  return appended
}

test('D8 the pre-paint script hides non-matching items only for a known tag', () => {
  const hit = runPrepaint('?tag=Edge%20AI', ['edge-ai', 'yolo'])
  assert.equal(hit.length, 1)
  assert.equal(hit[0].id, TAG_PREPAINT_STYLE_ID)
  assert.equal(hit[0].textContent, '[data-tag-item]:not([data-tag-slugs~="edge-ai"]){display:none!important}')
  assert.equal(runPrepaint('?tag=unknown', ['edge-ai']).length, 0)
  assert.equal(runPrepaint('', ['edge-ai']).length, 0)
  assert.equal(runPrepaint('?tag=%22%5D%7Bx', ['edge-ai']).length, 0, 'nothing but a known slug reaches the CSS')
})

// ── D8 post ↔ case-study links ─────────────────────────────────────────────

const link = (kind: 'blog' | 'work', slug: string, tags: string[], project?: string): ArticleLink => ({
  kind,
  slug,
  title: slug,
  permalink: `/${kind}/${slug}`,
  description: null,
  meta: null,
  lang: 'en',
  tags,
  ...(project ? { project } : {}),
})

test('D8 explicit project links come first in Related, then tag overlap; both directions', () => {
  const pool = [link('blog', 'swcs-post', ['YOLO'], 'swcs'), link('blog', 'other', ['YOLO', 'Jetson']), link('work', 'swcs', ['YOLO', 'Jetson']), link('work', 'carboy', [])]
  const post = { kind: 'blog' as const, slug: 'swcs-post', tags: ['YOLO'], project: 'swcs' }
  assert.deepEqual(
    projectLinks(post, pool).map((x) => x.slug),
    ['swcs'],
  )
  assert.deepEqual(
    relatedArticles(post, pool).map((x) => `${x.kind}/${x.slug}`),
    ['work/swcs', 'blog/other'],
  )
  const study = { kind: 'work' as const, slug: 'swcs', tags: [] }
  assert.deepEqual(
    relatedArticles(study, pool).map((x) => x.slug),
    ['swcs-post'],
    'a case study lists the posts about it even without shared tags',
  )
  assert.deepEqual(relatedArticles({ kind: 'blog', slug: 'other', tags: [] }, pool), [])
  const b = toArticleLink('blog', { slug: 's', permalink: '/blog/s', lang: 'en', frontmatter: { title: 'S', project: 'swcs' } })
  assert.equal(b.project, 'swcs')
  const w = toArticleLink('work', { slug: 'w', permalink: '/work/w', lang: 'en', frontmatter: { title: 'W', project: 'x' } })
  assert.equal('project' in w, false)
})

test('D8 stack and tag chips link to the filtered lists', async () => {
  const { MetaChips } = await import('../components/Article/MetaGrid')
  const out = html(createElement(MetaChips, { items: ['Edge AI', 'YOLO'], label: 'Tags', hrefFor: (t: string) => tagHref('/blog', t) }))
  assert.match(out, /<a[^>]*href="\/blog\?tag=edge-ai"[^>]*>Edge AI<\/a>/)
  assert.match(out, /<a[^>]*href="\/blog\?tag=yolo"/)
  assert.ok(!html(createElement(MetaChips, { items: ['X'], label: 'Stack' })).includes('<a'), 'plain chips without hrefFor')
})

// ── D7 author card and sharing ─────────────────────────────────────────────

test('D7 author card data: public CV name, tagline role, cropped portrait, availability only when set', async () => {
  const { loadAuthorCard } = await import('../lib/authorCard')
  const store = await import('../lib/contentStore')
  const bare = loadAuthorCard()
  assert.equal(bare.name, 'Li Yanpei (Lucian)')
  assert.equal(bare.role, 'Software Engineer')
  assert.equal(bare.avatar, null)
  assert.equal(bare.availability, null)
  await store.putKv('home', {
    hero: { welcome: '', brand: 'B', tagline: 'Full-Stack Engineer | ML | CV', avatarUrl: '/uploads/me.jpg', avatarTransform: { x: 12.345, y: 140 } },
    socials: {},
    brands: [],
    quickAccess: [],
    availability: { status: 'open', label: 'Open to backend roles' },
  })
  const card = loadAuthorCard()
  assert.equal(card.role, 'Full-Stack Engineer')
  assert.deepEqual(card.avatar, { src: '/uploads/me.jpg', srcSet: null, avifSrcSet: null, position: '12.3% 100%' })
  assert.deepEqual(card.availability, { status: 'open', label: 'Open to backend roles' })
})

test('D7 ArticleEnd: author card with CV and contact links, share row with copy, LinkedIn and a WeChat QR toggle', async () => {
  const { default: ArticleEnd } = await import('../components/Article/ArticleEnd')
  // The article's words come from its page (i18n-content F1: components/Article/articleUi).
  const { ArticleLanguage } = await import('../components/Article/articleUi')
  const { articleUiFor } = await import('../lib/uiStrings/article')
  const inArticle = (lang: string, el: ReturnType<typeof createElement>) => createElement(ArticleLanguage, { ui: articleUiFor(lang) }, el)
  const author = { name: 'Li Yanpei (Lucian)', role: 'Full-Stack Engineer', avatar: { src: '/uploads/me.jpg', srcSet: null, position: '50% 50%' }, availability: { status: 'open' as const, label: 'Open to backend roles' } }
  const share = { url: 'https://lucian-dev.com/blog/swcs', title: 'SWCS', qrSvg: '<svg aria-hidden="true" viewBox="0 0 1 1"></svg>' }
  const out = html(inArticle('en', createElement(ArticleEnd, { author, share })))
  assert.match(out, /<section[^>]*aria-labelledby="author-heading"/)
  assert.match(out, /<a[^>]*href="\/about"[^>]*>Li Yanpei \(Lucian\)<\/a>/)
  assert.match(out, /Full-Stack Engineer/)
  assert.match(out, /Open to backend roles/)
  assert.match(out, /<a[^>]*href="\/cv"[^>]*>View CV<\/a>/)
  assert.match(out, /<a[^>]*href="\/contact"[^>]*>Contact<\/a>/)
  assert.match(out, /<button[^>]*>.*Copy link<\/button>/)
  assert.ok(!out.includes('Share…'), 'the system share sheet is offered only after hydration, where it exists')
  assert.match(out, new RegExp(`href="https://www\\.linkedin\\.com/sharing/share-offsite/\\?url=${encodeURIComponent(share.url).replace(/[.?]/g, '\\$&')}"`))
  assert.match(out, /<button[^>]*aria-expanded="false"[^>]*>.*WeChat<\/button>/)
  assert.ok(!out.includes('QR code of'), 'the QR panel is closed until asked for')
  const zh = html(inArticle('zh-Hans', createElement(ArticleEnd, { author: { ...author, avatar: null, availability: null }, share: { ...share, qrSvg: null } })))
  assert.match(zh, /href="\/cv\/zh"[^>]*>查看简历<\/a>/)
  assert.match(zh, />作者</)
  assert.match(zh, /lang="en"[^>]*>Li Yanpei \(Lucian\)</, 'the English name is marked inside the Chinese card')
  assert.ok(!zh.includes('WeChat'), 'no QR toggle without a QR code')
  assert.match(zh, />LY</, 'initials without a portrait')
})

// ── E8 archive ─────────────────────────────────────────────────────────────

test('E8 archive years: one year once, open or future ends as "now"', () => {
  const now = new Date('2026-10-13T00:00:00Z')
  assert.deepEqual(archiveYears('2024-10', '2026-03', now), { years: '2024 – 2026', startYear: '2024', endYear: '2026' })
  assert.deepEqual(archiveYears('2023-08', '2023-10', now).years, '2023')
  assert.deepEqual(archiveYears('2025-01', 'Present', now).years, '2025 – now')
  assert.deepEqual(archiveYears('2025-01', '2027-06', now).years, '2025 – now')
  assert.deepEqual(archiveYears('', '', now).years, '')
})

test('E8 archive rows: every public CV project, newest first, linked to its case study and borrowing what the CV leaves empty', () => {
  const now = new Date('2026-10-13T00:00:00Z')
  const section = {
    sessionName: 'project',
    projectExperience: [
      { title: 'Project GAIA: Design Data Structure', startDate: '2022-11', endDate: '2023-11', description: 'NoSQL design.' },
      { title: 'WeGreen AI (wegreen.ltd)', startDate: '2024-10', endDate: '2026-03', description: 'Waste sorting.', caseStudy: 'swcs', role: '', relatedSkills: [] },
      { title: 'Running thing', startDate: '2025-02', endDate: 'Present', role: 'Lead', relatedSkills: ['Next.js', 'next.js', 'Go'], url: 'https://run.example', repo: 'javascript:alert(1)' },
      { title: 'Hidden summary', startDate: '2021-01', endDate: '2021-05', description: 'secret', redacted: ['description'] },
      { title: '', startDate: '2020-01' },
    ],
  }
  const works = [{ slug: 'swcs', title: 'Smart Waste Classification System (SWCS)', permalink: '/work/swcs', role: 'Solo capstone', tech: ['Edge AI', 'YOLO'], link: 'https://swcs.example', repo: 'https://github.com/x/swcs' }]
  const rows = archiveRows([{ sessionName: 'education' }, section], works, now)
  assert.deepEqual(
    rows.map((r) => r.title),
    ['Running thing', 'WeGreen AI (wegreen.ltd)', 'Project GAIA: Design Data Structure', 'Hidden summary'],
  )
  const [running, wegreen, gaia, hidden] = rows
  assert.equal(running.years, '2025 – now')
  assert.equal(running.role, 'Lead')
  assert.deepEqual(running.stack, ['Next.js', 'Go'])
  assert.deepEqual(running.links, [{ kind: 'site', url: 'https://run.example' }], 'unsafe links are dropped')
  assert.equal(running.caseStudy, null)
  assert.deepEqual(wegreen.caseStudy, { slug: 'swcs', title: works[0].title, permalink: '/work/swcs' })
  assert.equal(wegreen.role, 'Solo capstone', 'borrowed from the case study')
  assert.deepEqual(wegreen.stack, ['Edge AI', 'YOLO'])
  assert.deepEqual(
    wegreen.links.map((l) => l.kind),
    ['site', 'repo'],
  )
  assert.equal(gaia.caseStudy, null, 'no loose title matching')
  assert.equal(hidden.summary, '', 'a hidden field stays hidden')
  assert.deepEqual(archiveRows(null, works, now), [])
})

test('E8 the CV Studio project form offers role and stack for the archive', () => {
  const fields = SECTION_BY_NAME.project.lists?.[0].fields.map((f) => `${f.key}:${f.kind}`) || []
  assert.ok(fields.includes('role:text'))
  assert.ok(fields.includes('relatedSkills:tags'))
})

test('E8 ProjectArchive: a real table from md up and cards on phones, case-study links, nothing without projects', async () => {
  const { default: ProjectArchive } = await import('../components/Work/ProjectArchive')
  assert.equal(html(createElement(ProjectArchive, { rows: [], total: 0 })), '')
  const row = {
    key: '0',
    title: 'WeGreen AI',
    years: '2024 – 2026',
    startYear: '2024',
    endYear: '2026',
    summary: 'Waste sorting.',
    role: 'Lead',
    stack: ['Edge AI'],
    links: [{ kind: 'site' as const, url: 'https://wegreen.example' }],
    caseStudy: { slug: 'swcs', title: 'SWCS', permalink: '/work/swcs' },
  }
  const out = html(createElement(ProjectArchive, { rows: [row], total: 1 }))
  assert.match(out, /<table/)
  assert.match(out, /<caption[^>]*>All projects from the CV, newest first<\/caption>/)
  assert.equal((out.match(/<th[^>]*scope="col"/g) || []).length, 5)
  assert.match(out, /<th[^>]*scope="row"/)
  assert.match(out, /<tr[^>]*data-tag-item=""[^>]*data-tag-slugs="edge-ai"|<tr[^>]*data-tag-slugs="edge-ai"[^>]*data-tag-item=""/)
  assert.equal((out.match(/href="\/work\/swcs"/g) || []).length, 2, 'table and card both link the case study')
  assert.match(out, /Case study<span class="sr-only">: SWCS<\/span>/)
  assert.match(out, /<a[^>]*target="_blank"[^>]*href="https:\/\/wegreen\.example"/)
  // Columns no project fills are left out instead of a column of dashes.
  const bare = html(createElement(ProjectArchive, { rows: [{ ...row, role: '', stack: [], links: [], caseStudy: null }], total: 1 }))
  assert.equal((bare.match(/<th[^>]*scope="col"/g) || []).length, 2)
  assert.ok(!bare.includes('Built with'))
})
