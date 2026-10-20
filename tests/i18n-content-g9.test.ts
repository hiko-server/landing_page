/**
 * i18n-content G9 — /llms.txt, /llms-full.txt and the Markdown twins of
 * posts and case studies:
 *   - the MDX → Markdown conversion evaluates nothing and shows only what
 *     the page shows (same allow-list as the renderer), with absolute,
 *     safe URLs;
 *   - the twin's metadata, the llms index and the full text;
 *   - LEAKS, over a real (temporary) content store: a draft — its slug,
 *     title, body — and hidden CV data never appear in a twin, /llms.txt
 *     or /llms-full.txt; a draft's twin is a 404; the CV is linked only in
 *     the languages that have public content, and never quoted;
 *   - the /api/md route (headers, 304, 404, methods), the rewrites, the
 *     edge purge on saves, and robots.txt unchanged.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { articleMarkdown, buildLlmsTxt, mdxToMarkdown, videoWatchUrl, absoluteMarkdownUrl } from '../lib/markdownTwin'
import { LLMS_PATHS, markdownTwinPath, markdownTwinPaths, MARKDOWN_CACHE_CONTROL } from '../lib/markdownTwinPaths'
import { derivedPurgePaths } from '../lib/revalidate'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_ZONE_ID', 'CF_API_TOKEN', 'INDEXNOW_KEY']) delete process.env[k]
process.env.LOG_LEVEL = 'error'

const SITE = 'https://lucian-dev.com'
const ctx = { siteUrl: SITE, pageUrl: `${SITE}/blog/x` }
const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ── Conversion ───────────────────────────────────────────────────────────

test('mdxToMarkdown: nothing is evaluated, only what the page shows, URLs absolute and safe', () => {
  const md = mdxToMarkdown(
    [
      "import X from './x'",
      'export const meta = { secret: 1 }',
      '',
      '{/* A template note the page never shows */}',
      '',
      '## Section {1 + 1}',
      '',
      'Text with a [relative link](/work/y), an [anchor](#section), a [bad one](javascript:alert(1)) and <kbd>Ctrl</kbd>.',
      '',
      '<Figure src="/uploads/a.png" alt="Diagram" caption="The pipeline" size="wide" />',
      '',
      '<Figure alt="No source" />',
      '',
      '![Inline](/uploads/b.png#full)',
      '',
      '<YouTube id="jkAqK3vqILI" title="Demo" />',
      '',
      '<iframe src="https://player.vimeo.com/video/123456" title="Vimeo demo"></iframe>',
      '',
      '<iframe src="https://evil.example/embed"></iframe>',
      '',
      '<Unknown>kept words</Unknown>',
      '',
      '> [!NOTE]',
      '> A callout.',
      '',
      '```js',
      'const a = {b}',
      '```',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
    ].join('\n'),
    ctx,
  )
  assert.ok(!md.includes('import X'), md)
  assert.ok(!md.includes('secret'), md)
  assert.ok(!md.includes('template note'), md)
  assert.ok(!md.includes('1 + 1'), md)
  assert.match(md, /^## Section/m)
  assert.ok(md.includes(`[relative link](${SITE}/work/y)`), md)
  assert.ok(md.includes(`[anchor](${SITE}/blog/x#section)`), md)
  assert.ok(md.includes('bad one') && !md.includes('javascript:'), md)
  assert.ok(md.includes('`Ctrl`'), md)
  assert.ok(md.includes(`![Diagram](${SITE}/uploads/a.png)`), md)
  assert.ok(md.includes('_The pipeline_'), md)
  assert.ok(!md.includes('No source'), 'a figure without an image shows nothing, like the page')
  assert.ok(md.includes(`![Inline](${SITE}/uploads/b.png)`), 'the width hint is dropped')
  assert.ok(md.includes('[Demo](https://www.youtube.com/watch?v=jkAqK3vqILI)'), md)
  assert.ok(md.includes('[Vimeo demo](https://vimeo.com/123456)'), md)
  assert.ok(!md.includes('evil.example'), md)
  assert.ok(md.includes('kept words'), md)
  assert.match(md, /^> \[!NOTE\]$/m)
  assert.ok(md.includes('```js\nconst a = {b}\n```'), 'code is literal')
  assert.match(md, /\| a \| b \|/)
})

test('helpers: absolute URLs, video watch pages, twin paths', () => {
  assert.equal(absoluteMarkdownUrl('/blog/a', ctx), `${SITE}/blog/a`)
  assert.equal(absoluteMarkdownUrl('https://example.com/a', ctx), 'https://example.com/a')
  assert.equal(absoluteMarkdownUrl('data:text/html,x', ctx), '')
  assert.equal(absoluteMarkdownUrl('#a b', ctx), '')
  assert.equal(videoWatchUrl('https://www.youtube-nocookie.com/embed/jkAqK3vqILI?start=30'), 'https://www.youtube.com/watch?v=jkAqK3vqILI&t=30s')
  assert.equal(markdownTwinPath('/blog/a'), '/blog/a.md')
  assert.deepEqual(markdownTwinPaths(['/blog', '/blog/a', '/work/b', '/about', '/blog/a/b']), ['/blog/a.md', '/work/b.md'])
  assert.deepEqual([...LLMS_PATHS], ['/llms.txt', '/llms-full.txt'])
  assert.match(MARKDOWN_CACHE_CONTROL, /s-maxage=300/)
})

test('articleMarkdown: title, description, metadata, translations, "At a glance", then the body', () => {
  const post = articleMarkdown(
    {
      kind: 'blog',
      title: 'Edge sorter',
      description: 'What I learned.',
      lang: 'en',
      permalink: '/blog/edge',
      readingMinutes: 4,
      author: 'Example Person',
      date: '2026-05-01',
      updated: '2026-06-01',
      tags: ['Edge AI', 'Jetson'],
      project: { title: 'The sorter', permalink: '/work/sorter' },
      translations: [{ slug: 'edge-zh', permalink: '/blog/edge-zh', lang: 'zh-Hans', title: '边缘' }],
      body: 'Body text.',
    },
    SITE,
  )
  assert.ok(post.startsWith('# Edge sorter\n\n> What I learned.\n'), post)
  for (const line of [
    '- Author: Example Person',
    '- Type: Post',
    '- Published: 2026-05-01',
    '- Updated: 2026-06-01',
    '- Language: English (en)',
    `- Also in: [简体中文](<${SITE}/blog/edge-zh.md>) (zh-Hans)`,
    '- Reading time: 4 min',
    '- Tags: Edge AI, Jetson',
    `- Case study: [The sorter](<${SITE}/work/sorter>)`,
    `- Canonical: <${SITE}/blog/edge>`,
  ]) {
    assert.ok(post.includes(line), line)
  }
  assert.ok(post.trimEnd().endsWith('---\n\nBody text.'), post)

  const work = articleMarkdown(
    {
      kind: 'work',
      title: 'The sorter',
      lang: 'zh-Hans',
      permalink: '/work/sorter',
      readingMinutes: 6,
      author: 'Example Person',
      summary: 'Sorted waste at the edge.',
      role: 'Solo',
      tech: ['Jetson'],
      link: 'javascript:alert(1)',
      repo: 'https://github.com/example/sorter',
      outcomes: [{ value: '93.6', unit: '%', label: 'accuracy', source: 'Test set', sourceUrl: '#results' } as never],
      links: [{ label: 'Report', url: '/uploads/report.pdf' }],
      body: '正文。',
    },
    SITE,
  )
  assert.ok(work.includes('- Type: Case study'))
  assert.ok(work.includes('- Language: 简体中文 (zh-Hans)'))
  assert.ok(!work.includes('javascript:'), 'unsafe links are dropped')
  assert.ok(work.includes(`- Source code: <https://github.com/example/sorter>`))
  assert.ok(work.includes(`- Report: <${SITE}/uploads/report.pdf>`))
  assert.ok(work.includes('## At a glance\n\nSorted waste at the edge.'), work)
  assert.match(work, /- 93\.6\s?% — accuracy \(source: Test set, https:\/\/lucian-dev\.com\/work\/sorter#results\)/)
})

test('buildLlmsTxt: the CV and /publications only where they exist; no contact details', () => {
  const base = {
    siteUrl: SITE,
    name: 'Example Person',
    summary: 'Software engineer.',
    work: [{ title: 'Sorter', permalink: '/work/sorter', lang: 'en', description: 'An edge sorter.' }],
    posts: [{ title: '边缘', permalink: '/blog/edge-zh', lang: 'zh-Hans', date: '2026-05-01' }],
    publications: false,
    cv: { en: true, zh: false },
  }
  const txt = buildLlmsTxt(base)
  assert.ok(txt.startsWith('# Example Person\n\n> Software engineer.\n'))
  assert.ok(txt.includes(`- [CV (English)](<${SITE}/cv>)`))
  assert.ok(!txt.includes('/cv/zh'), 'no Chinese CV without public content')
  assert.ok(!txt.includes('/publications'))
  assert.ok(txt.includes(`## Case studies\n\n- [Sorter](<${SITE}/work/sorter.md>): An edge sorter.`))
  assert.ok(txt.includes(`- [边缘](<${SITE}/blog/edge-zh.md>) (简体中文, 2026-05-01)`))
  assert.ok(txt.includes('## Optional'))
  assert.ok(!/@|\+\d{3}|tel:|mailto:/.test(txt), 'no contact details')
  const all = buildLlmsTxt({ ...base, publications: true, cv: { en: true, zh: true } })
  assert.ok(all.includes(`${SITE}/publications`))
  assert.ok(all.includes(`${SITE}/cv/zh.pdf`))
  const none = buildLlmsTxt({ ...base, cv: { en: false, zh: false } })
  assert.ok(none.includes('## Profile\n') && !none.includes('/cv'))
})

// ── Over a content store: drafts and hidden CV data never leak ───────────

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-content-g9-'))
let closeDb: () => void
let llms: typeof import('../lib/llms')
const DRAFT = 'ZZDRAFTCANARYZZ'
const HIDDEN = 'ZZHIDDENCVZZ'

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  const store = await import('../lib/contentStore')
  const { writeCvData } = await import('../lib/cvdata')
  closeDb = (await import('../lib/db')).closeDb
  llms = await import('../lib/llms')
  await store.putItem('blog', 'public-post', { title: 'A public post', description: 'Public description.', date: '2026-05-01', translationKey: 'pp' }, 'Public **body** with a [link](/work/case).')
  await store.putItem('blog', 'public-post-zh', { title: '一篇公开文章的中文版本', date: '2026-05-02', translationKey: 'pp' }, '公开的中文正文，用来测试双语链接。')
  await store.putItem('blog', `draft-${DRAFT.toLowerCase()}`, { title: `Draft ${DRAFT}`, description: DRAFT, date: '2026-06-01', draft: true, translationKey: 'pp-draft' }, `Body ${DRAFT}`)
  await store.putItem('work', 'case', { title: 'A case', summary: 'It worked.', role: 'Solo' }, 'Case body.')
  await store.putItem('work', 'hidden-case', { title: `Hidden ${DRAFT}`, draft: true }, `Hidden ${DRAFT}`)
  await store.putPage('now', { title: 'Now', description: 'What I am doing now.' }, 'Now body.')
  const ok = await writeCvData({
    en: [
      {
        sessionName: 'personalInformation',
        firstName: 'Example',
        lastName: 'Person',
        email: `${HIDDEN}@example.com`,
        phone: `+1 555 ${HIDDEN}`,
        address: `${HIDDEN} Street`,
        hiddenFields: ['email', 'phone', 'address'],
      },
      { sessionName: 'workExperience', experiences: [{ jobTitle: 'Engineer', companyName: 'Example Co', startDate: '2024-01', endDate: '2025-01' }] },
      { sessionName: 'selfAssessment', content: `${HIDDEN} assessment`, isVisible: false },
    ],
    zh: [],
  })
  assert.equal(ok.ok, true)
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('twins: published items only; a draft (or an unknown / malformed slug) has none', () => {
  const twin = llms.loadMarkdownTwin('blog', 'public-post')
  assert.ok(twin)
  assert.equal(twin.lang, 'en')
  assert.equal(twin.permalink, '/blog/public-post')
  assert.ok(twin.markdown.startsWith('# A public post\n'))
  assert.ok(twin.markdown.includes(`[link](${SITE}/work/case)`))
  assert.ok(twin.markdown.includes(`- Also in: [简体中文](<${SITE}/blog/public-post-zh.md>) (zh-Hans)`))
  assert.equal(llms.loadMarkdownTwin('blog', `draft-${DRAFT.toLowerCase()}`), null)
  assert.equal(llms.loadMarkdownTwin('work', 'hidden-case'), null)
  assert.equal(llms.loadMarkdownTwin('blog', 'nope'), null)
  assert.equal(llms.loadMarkdownTwin('blog', '../data/content'), null)
  assert.equal(llms.loadMarkdownTwin('work', 'public-post'), null, 'a post is not a case study')
  const zh = llms.loadMarkdownTwin('blog', 'public-post-zh')!
  assert.equal(zh.lang, 'zh-Hans')
  assert.ok(!zh.markdown.includes('draft'), 'the draft with another key is never a translation')
})

test('LEAK: /llms.txt and /llms-full.txt hold no draft and no CV data; the CV is linked where it is public', async () => {
  const index = await llms.loadLlmsTxt()
  const full = llms.loadLlmsFullTxt()
  for (const [name, text] of [['llms.txt', index], ['llms-full.txt', full]] as const) {
    assert.ok(!text.includes(DRAFT), `${name}: draft`)
    assert.ok(!text.toLowerCase().includes(DRAFT.toLowerCase()), `${name}: draft slug`)
    assert.ok(!text.includes(HIDDEN), `${name}: hidden CV data`)
    assert.ok(!text.includes('Example Co'), `${name}: the CV is linked, never quoted`)
    assert.ok(!/mailto:|tel:/.test(text), `${name}: contact details`)
  }
  assert.ok(index.includes(`${SITE}/blog/public-post.md`))
  assert.ok(index.includes(`${SITE}/blog/public-post-zh.md`))
  assert.ok(index.includes(`${SITE}/work/case.md`))
  assert.ok(index.includes(`[Now](<${SITE}/now>): What I am doing now.`))
  assert.ok(index.includes(`[CV (English)](<${SITE}/cv>)`), 'the English CV has public content')
  assert.ok(!index.includes(`${SITE}/cv/zh`), 'the Chinese CV is empty: not linked')
  assert.ok(!index.includes('/publications'), 'no public papers')
  assert.ok(full.includes('# A case') && full.includes('Case body.'))
  assert.ok(full.includes('Public **body**'))
  assert.equal((full.match(/^- Canonical: /gm) || []).length, 3, 'one twin per published piece')
})

type MockRes = { statusCode: number; headers: Record<string, string>; body: string | undefined }

async function md(query: Record<string, string>, method = 'GET', headers: Record<string, string> = {}): Promise<MockRes> {
  const handler = (await import('../pages/api/md')).default
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(c: number) {
      out.statusCode = c
    },
    status(c: number) {
      out.statusCode = c
      return res
    },
    setHeader(k: string, v: unknown) {
      out.headers[k.toLowerCase()] = String(v)
      return res
    },
    getHeader(k: string) {
      return out.headers[k.toLowerCase()]
    },
    json(b: unknown) {
      out.body = JSON.stringify(b)
      return res
    },
    end(b?: Buffer | string) {
      if (b !== undefined) out.body = Buffer.isBuffer(b) ? b.toString('utf8') : b
      return res
    },
  }
  await handler({ method, query, headers, url: '/api/md', socket: {} } as never, res)
  return out
}

test('/api/md: Markdown with canonical, noindex, language and an ETag; 304; 404 for drafts; GET and HEAD only', async () => {
  const ok = await md({ collection: 'blog', slug: 'public-post' })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.headers['content-type'], 'text/markdown; charset=utf-8')
  assert.equal(ok.headers['x-robots-tag'], 'noindex')
  assert.equal(ok.headers.link, `<${SITE}/blog/public-post>; rel="canonical"`)
  assert.equal(ok.headers['content-language'], 'en')
  assert.equal(ok.headers['cache-control'], MARKDOWN_CACHE_CONTROL)
  assert.ok(ok.headers.etag)
  assert.ok(ok.body?.startsWith('# A public post'))
  const again = await md({ collection: 'blog', slug: 'public-post' }, 'GET', { 'if-none-match': ok.headers.etag })
  assert.equal(again.statusCode, 304)
  const head = await md({ collection: 'blog', slug: 'public-post' }, 'HEAD')
  assert.equal(head.statusCode, 200)
  assert.equal(head.body, undefined)
  const draft = await md({ collection: 'blog', slug: `draft-${DRAFT.toLowerCase()}` })
  assert.equal(draft.statusCode, 404)
  assert.ok(!draft.body?.includes(DRAFT))
  assert.equal(draft.headers['x-robots-tag'], 'noindex')
  assert.equal((await md({ collection: 'cv', slug: 'x' })).statusCode, 400)
  assert.equal((await md({ collection: 'blog', slug: 'public-post' }, 'POST')).statusCode, 405)
})

test('the twins are linked from their pages, rewritten from .md addresses, purged on saves; robots.txt unchanged', async () => {
  for (const f of ['pages/blog/[slug].tsx', 'pages/work/[slug].tsx']) {
    assert.match(read(f), /rel="alternate" type="text\/markdown" href=\{markdownTwinPath\(path\)\}/, f)
    assert.match(read(f), /\{!frontmatter\.draft && \(/, `${f}: no twin link on a draft`)
  }
  const require = createRequire(import.meta.url)
  const cfg = require(path.join(ROOT, 'next.config.js'))
  const { beforeFiles } = await cfg.rewrites()
  assert.ok(beforeFiles.some((r: { source: string; destination: string }) => r.source === '/blog/:slug.md' && r.destination === '/api/md?collection=blog&slug=:slug'))
  assert.ok(beforeFiles.some((r: { source: string; destination: string }) => r.source === '/work/:slug.md' && r.destination === '/api/md?collection=work&slug=:slug'))

  const purged = derivedPurgePaths(['/blog', '/blog/a', '/work/b'])
  for (const p of ['/blog/a.md', '/work/b.md', '/llms.txt', '/llms-full.txt', '/sitemap.xml']) assert.ok(purged.includes(p), p)
  assert.ok(!purged.includes('/blog.md'))
  assert.deepEqual(derivedPurgePaths(['/uses']), ['/api/search-index', '/llms.txt'])

  for (const f of ['pages/llms.txt.tsx', 'pages/llms-full.txt.tsx']) {
    const src = read(f)
    assert.match(src, /'Content-Type', 'text\/plain; charset=utf-8'/, f)
    assert.match(src, /'X-Robots-Tag', 'noindex'/, f)
    assert.match(src, /MARKDOWN_CACHE_CONTROL/, f)
  }

  const robots = read('public/robots.txt')
  assert.ok(!/llms|GPTBot|ClaudeBot|CCBot|Google-Extended/i.test(robots), 'the robots policy is unchanged')
  assert.match(robots, /^User-agent: \*\nAllow: \//)
})
