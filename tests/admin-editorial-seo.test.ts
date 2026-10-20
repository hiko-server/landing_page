/**
 * H1 — "Search & sharing": what the panel shows is what the page sends —
 * the <title> (composeTitle + the search title), the description (the
 * owner's, else the first paragraph, clamped like CustomHead), Google's
 * ~600 px title cut (measured), the length guidance, the card alt text —
 * and the card previews are the real, signed /api/og card for the unsaved
 * state (admin-only endpoint). WeChat is shown honestly: title and a
 * generic link icon, no image or description.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import {
  DESCRIPTION_FALLBACK_BELOW,
  SERP_TITLE_PX,
  descriptionAdvice,
  effectiveDescription,
  firstParagraph,
  fitToWidth,
  languageLabel,
  pageTitleFor,
  serpBreadcrumb,
  serpDate,
} from '../lib/serpPreview'
import { PERSON_NAME, PERSON_SHORT_NAME, SITE_HOST, cardImageAlt, clampDescription } from '../lib/schema'
import { verifyOgSignature } from '../lib/og/sign'
import { BLOG_EMPTY, blogFromServer, blogToServer, workFromServer, workToServer } from '../components/Admin/shell/itemFrontmatter'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** 10 px per character: a deterministic stand-in for canvas measureText. */
const measure = (s: string) => Array.from(s).length * 10

test('Google’s title cut is measured in pixels, with an ellipsis that still fits', () => {
  const short = fitToWidth('Short title', SERP_TITLE_PX, measure)
  assert.deepEqual(short, { text: 'Short title', truncated: false, width: 110 })
  const long = fitToWidth('x'.repeat(80), SERP_TITLE_PX, measure)
  assert.equal(long.truncated, true)
  assert.equal(long.width, 800)
  assert.ok(measure(long.text) <= SERP_TITLE_PX)
  assert.ok(long.text.endsWith('…'))
  // Code points, not UTF-16 units: an emoji is never split.
  const emoji = fitToWidth('🙂'.repeat(70), SERP_TITLE_PX, measure)
  assert.ok(!emoji.text.includes('�'))
})

test('the page title is the search title (or the title) plus the owner — exactly what CustomHead sends', () => {
  assert.equal(pageTitleFor({ title: 'Edge waste sorter' }), `Edge waste sorter · ${PERSON_SHORT_NAME}`)
  assert.equal(pageTitleFor({ title: 'Edge waste sorter', seoTitle: '  Lessons from an edge AI sorter ' }), `Lessons from an edge AI sorter · ${PERSON_SHORT_NAME}`)
  // lib/mdx keeps at most 60 characters of a search title; the preview cuts the same way.
  assert.equal(pageTitleFor({ title: 'T', seoTitle: 'y'.repeat(80) }), `${'y'.repeat(60)} · ${PERSON_SHORT_NAME}`)
})

test('the description is the owner’s, or — under 70 characters — the first real paragraph, clamped to 155', () => {
  const body = '# Heading\n\n![cover](/uploads/a.png)\n\nShort.\n\nThis is the first real paragraph of the article, long enough to be the summary that search engines show under the title when the description is too short.'
  assert.match(firstParagraph(body), /^This is the first real paragraph/)
  const d = effectiveDescription('Too short.', body)
  assert.equal(d, clampDescription('Too short.', firstParagraph(body)))
  assert.ok(Array.from(d).length <= 155)
  const own = 'A description that is comfortably longer than seventy characters, so the page uses it as written.'
  assert.equal(effectiveDescription(own, body), own)
  // No description: the page's own fallback sentence, then the first paragraph.
  const fallback = `Edge — an essay by ${PERSON_NAME}.`
  assert.equal(effectiveDescription('', body, fallback), clampDescription(fallback, firstParagraph(body)))
  assert.equal(firstParagraph('```js\nconst x = 1 // a long line of code that is not prose at all\n```\n\n- a list item that is long enough to count'), '')
})

test('length guidance for the description', () => {
  assert.equal(descriptionAdvice('').level, 'warning')
  assert.match(descriptionAdvice('x'.repeat(40)).text, new RegExp(`under ${DESCRIPTION_FALLBACK_BELOW}`))
  assert.equal(descriptionAdvice('x'.repeat(120)).level, 'ok')
  assert.match(descriptionAdvice('x'.repeat(200)).text, /cut it near 155/)
})

test('breadcrumb, date and language labels of the Google preview', () => {
  assert.equal(serpBreadcrumb('/blog/edge-sorter'), `${SITE_HOST} › blog › edge-sorter`)
  assert.equal(serpDate('2026-05-30'), 'May 30, 2026')
  assert.equal(serpDate('not a date'), '')
  assert.equal(languageLabel('zh-Hans'), '简体中文 (Simplified Chinese)')
  assert.equal(languageLabel('fr'), 'fr')
})

test('the card alt text adds the owner’s cover description only when the card shows that cover', () => {
  assert.equal(cardImageAlt('Title', '', 'unused'), `Title — ${PERSON_NAME}`)
  assert.equal(cardImageAlt('Title', '/uploads/c.jpg', ' A sorter on a bench '), `Title — ${PERSON_NAME}. A sorter on a bench`)
  // WebP covers are not drawn on the card (Satori decodes PNG / JPEG), so the alt does not describe them.
  assert.equal(cardImageAlt('Title', '/uploads/c.webp', 'A sorter'), `Title — ${PERSON_NAME}`)
  for (const page of ['pages/blog/[slug].tsx', 'pages/work/[slug].tsx']) assert.match(read(page), /imageAlt=\{cardImageAlt\(/)
})

test('the forms model the search title, language, "updated" and the post cover alt (cleared fields are removed)', () => {
  const stored = { title: 'T', date: '2026-05-30', seoTitle: 'Search T', lang: 'zh-Hans', updated: '2026-10-01', cover: '/uploads/c.jpg', coverAlt: 'Bench' }
  const fm = blogFromServer(stored)
  assert.deepEqual([fm.seoTitle, fm.lang, fm.updated, fm.coverAlt], ['Search T', 'zh-Hans', '2026-10-01', 'Bench'])
  const out = blogToServer({ ...fm, seoTitle: ' ', lang: '', updated: '' }, [])
  assert.equal(out.seoTitle, undefined)
  assert.equal(out.lang, undefined)
  assert.equal(out.updated, undefined)
  assert.equal(blogToServer({ ...fm, cover: '' }, []).coverAlt, undefined, 'no cover, no cover alt')
  assert.equal(BLOG_EMPTY.updated, '')
  const w = workFromServer({ title: 'W', seoTitle: 'S', lang: 'en' })
  assert.deepEqual(workToServer({ ...w, seoTitle: '' }, []).seoTitle, undefined)
  assert.equal(workToServer(w, []).lang, 'en')
})

test('the panel is honest about WeChat and loads only on demand', () => {
  const panel = read('components/Admin/editor/SeoPanel.tsx')
  assert.match(panel, /label="WeChat · chat"/)
  assert.match(panel, /only the page title and a generic link icon — no image or description/)
  assert.match(panel, /JS-SDK/)
  const wechat = panel.slice(panel.indexOf('label="WeChat · chat"'))
  assert.doesNotMatch(wechat.slice(0, wechat.indexOf('</PreviewFrame>')), /CardImage/, 'no card image in the WeChat preview')
  assert.match(panel, /setTimeout\(async \(\) => \{[\s\S]*\/api\/admin\/og-preview[\s\S]*\}, 800\)/, 'debounced 800 ms')
  const section = read('components/Admin/editor/SeoSection.tsx')
  assert.match(section, /dynamic\(\(\) => import\('\.\/SeoPanel'\)/)
  assert.match(section, /\{open \? <SeoPanel/)
})

// ── /api/admin/og-preview ───────────────────────────────────────────────

const SECRET = 'admin-editorial-seo-secret'
process.env.JWT_SECRET = SECRET
const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-editorial-seo-'))
let handler: (req: any, res: any) => unknown
let sessionId = ''
let closeAuthDb: () => void

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  handler = (await import('../pages/api/admin/og-preview')).default
  closeAuthDb = (await import('../lib/adminAuth/db')).closeAuthDb
  const { createSession } = await import('../lib/adminAuth/sessions')
  sessionId = createSession({ method: 'password', ttlMs: 3_600_000, device: null, ipPrefix: null, country: null }).id
})

after(() => {
  closeAuthDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

async function call(body: unknown, { auth = true, method = 'POST' } = {}) {
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test', sid: sessionId }, SECRET, { algorithm: 'HS256' })
  const out = { statusCode: 200, body: undefined as any, headers: {} as Record<string, string> }
  const res: any = {
    status(c: number) {
      out.statusCode = c
      return res
    },
    setHeader(k: string, v: unknown) {
      out.headers[k.toLowerCase()] = String(v)
      return res
    },
    getHeader: (k: string) => out.headers[k.toLowerCase()],
    json(b: unknown) {
      out.body = JSON.parse(JSON.stringify(b))
      return res
    },
    end() {
      return res
    },
  }
  const cookies = auth ? { cv_admin_token: token } : {}
  await handler({ method, url: '/api/admin/og-preview', query: {}, body, cookies, headers: auth ? { cookie: `cv_admin_token=${token}` } : {}, socket: { remoteAddress: '127.0.0.31' } }, res)
  return out
}

test('og-preview signs the card of the unsaved state (same-origin path, no-store); the card verifies', async () => {
  const out = await call({ collection: 'blog', title: 'A draft title', lang: 'zh', date: '2026-05-30', mins: 4, tags: ['Edge AI', 'CV', 'IoT', 'extra'], cover: '/uploads/c.jpg' })
  assert.equal(out.statusCode, 200)
  assert.equal(out.headers['cache-control'], 'no-store')
  assert.match(out.body.card, /^\/api\/og\?/)
  const params = new URL(`https://x${out.body.card}`).searchParams
  assert.equal(params.get('title'), 'A draft title')
  assert.equal(params.get('lang'), 'zh')
  assert.equal(params.get('tags'), 'Edge AI,CV,IoT', 'at most three tags, like the page')
  assert.equal(verifyOgSignature(params), true)
  assert.equal(new URL(`https://x${out.body.square}`).searchParams.get('size'), 'square')
})

test('og-preview refuses without a session, without a title or for another collection', async () => {
  assert.equal((await call({ collection: 'blog', title: 'T' }, { auth: false })).statusCode, 401)
  assert.equal((await call({ collection: 'blog', title: '  ' })).statusCode, 400)
  assert.equal((await call({ collection: 'cv', title: 'T' })).statusCode, 400)
  assert.equal((await call({}, { method: 'GET' })).statusCode, 405)
})
