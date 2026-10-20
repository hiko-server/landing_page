/**
 * i18n-content F2 — linked EN ↔ ZH translations of posts and case studies:
 *   - lib/translations: keys, languages, reciprocal groups only (a group
 *     with two versions in one language links nothing), hreflang with
 *     x-default, one entry per piece in the indexes, the admin status and
 *     the suggested slug of a new version;
 *   - the editor form round-trips `lang` and `translationKey`;
 *   - over a real (temporary) content store: the article siblings (switch,
 *     alternates, prev / next in the article's language, the post's case
 *     study in that language, drafts only in Draft Mode), the sitemap's
 *     xhtml:link alternates, the admin list's languages, and an admin save
 *     regenerating its translations first — including the group it left.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import {
  cleanTranslationKeyInput,
  collapseTranslations,
  hreflangAlternates,
  keptVersion,
  normalizeTranslationKey,
  pieceSlugs,
  translationGroups,
  translationLang,
  translationSlug,
  translationStatus,
  type TranslatableEntry,
} from '../lib/translations'
import { BLOG_EMPTY, blogFromServer, blogToServer, WORK_EMPTY, workFromServer, workToServer } from '../components/Admin/shell/itemFrontmatter'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_ZONE_ID', 'CF_API_TOKEN', 'INDEXNOW_KEY']) delete process.env[k]
process.env.JWT_SECRET = 'i18n-content-f2-secret'
process.env.LOG_LEVEL = 'error'

const SITE = 'https://lucian-dev.com'

const entry = (slug: string, lang: string, key?: string, extra: Record<string, unknown> = {}): TranslatableEntry => ({
  slug,
  permalink: `/blog/${slug}`,
  lang,
  frontmatter: { title: `T ${slug}`, ...(key ? { translationKey: key } : {}), ...extra },
})

// ── Pure helpers ─────────────────────────────────────────────────────────

test('keys and languages', () => {
  assert.equal(normalizeTranslationKey(' Carboy '), 'carboy')
  assert.equal(normalizeTranslationKey('edge_sorter-2'), 'edge_sorter-2')
  assert.equal(normalizeTranslationKey('-bad'), '')
  assert.equal(normalizeTranslationKey('has space'), '')
  assert.equal(normalizeTranslationKey('x'.repeat(65)), '')
  assert.equal(normalizeTranslationKey(42), '')
  assert.equal(cleanTranslationKeyInput('Car Boy 社区!'), 'car-boy-')
  assert.equal(cleanTranslationKeyInput('--Edge_AI'), 'edge_ai')
  assert.equal(cleanTranslationKeyInput('a'.repeat(80)).length, 64)
  assert.equal(translationLang('zh'), 'zh-Hans')
  assert.equal(translationLang('zh-CN'), 'zh-Hans')
  assert.equal(translationLang('zh-HK'), 'zh-Hant')
  assert.equal(translationLang('en-GB'), 'en')
  assert.equal(translationLang('ja-JP'), 'ja')
  assert.equal(translationLang(''), 'en')
})

test('translationGroups: reciprocal links only, never within one language', () => {
  const groups = translationGroups([
    entry('a-en', 'en', 'a'),
    entry('a-zh', 'zh-Hans', 'a'),
    entry('a-tw', 'zh-Hant', 'a'),
    entry('b-en', 'en', 'b'),
    entry('b-en2', 'en-GB', 'b'),
    entry('b-zh', 'zh-Hans', 'b'),
    entry('c', 'en', 'c'),
    entry('d', 'en'),
  ])
  assert.deepEqual(groups.get('a-en')!.map((t) => t.slug), ['a-zh', 'a-tw'])
  assert.deepEqual(groups.get('a-zh')!.map((t) => t.slug), ['a-en', 'a-tw'])
  assert.deepEqual(groups.get('a-tw')!.map((t) => [t.slug, t.title, t.permalink]), [
    ['a-en', 'T a-en', '/blog/a-en'],
    ['a-zh', 'T a-zh', '/blog/a-zh'],
  ])
  for (const s of ['b-en', 'b-en2', 'b-zh', 'c', 'd']) assert.equal(groups.has(s), false, s)
  assert.deepEqual(pieceSlugs('a-zh', groups), ['a-zh', 'a-en', 'a-tw'])
})

test('hreflangAlternates: every version, English first, x-default English (else the page itself)', () => {
  const groups = translationGroups([entry('a-en', 'en', 'a'), entry('a-zh', 'zh-Hans', 'a')])
  const alt = hreflangAlternates({ permalink: '/blog/a-zh', lang: 'zh-Hans' }, groups.get('a-zh')!)
  assert.deepEqual(alt, [
    { hrefLang: 'en', href: `${SITE}/blog/a-en` },
    { hrefLang: 'zh-Hans', href: `${SITE}/blog/a-zh` },
    { hrefLang: 'x-default', href: `${SITE}/blog/a-en` },
  ])
  const zhOnly = translationGroups([entry('z-hans', 'zh-Hans', 'z'), entry('z-hant', 'zh-Hant', 'z')])
  assert.deepEqual(hreflangAlternates({ permalink: '/blog/z-hant', lang: 'zh-Hant' }, zhOnly.get('z-hant')!).at(-1), {
    hrefLang: 'x-default',
    href: `${SITE}/blog/z-hant`,
  })
  assert.deepEqual(hreflangAlternates({ permalink: '/blog/x', lang: 'en' }, []), [])
})

test('collapseTranslations: one entry per piece, in the wanted language, else English, else the first; order kept', () => {
  const list = [entry('a-zh', 'zh-Hans', 'a'), entry('n', 'en'), entry('a-en', 'en', 'a'), entry('z-hans', 'zh-Hans', 'z'), entry('z-hant', 'zh-Hant', 'z')]
  const en = collapseTranslations(list, 'en')
  assert.deepEqual(en.map((c) => [c.entry.slug, c.alsoIn.map((t) => t.lang)]), [
    ['n', []],
    ['a-en', ['zh-Hans']],
    ['z-hans', ['zh-Hant']],
  ])
  const zh = collapseTranslations(list, 'zh-Hans')
  assert.deepEqual(zh.map((c) => c.entry.slug), ['a-zh', 'n', 'z-hans'])
  const hant = collapseTranslations(list, 'zh-Hant')
  assert.deepEqual(hant.map((c) => c.entry.slug), ['n', 'a-en', 'z-hant'])
  const groups = translationGroups(list)
  assert.equal(keptVersion('a-zh', groups, new Set(['a-en', 'n'])), 'a-en')
  assert.equal(keptVersion('n', groups, new Set(['n'])), 'n')
  assert.equal(keptVersion('gone', groups, new Set()), 'gone')
})

test('translationStatus: the other versions, same-language conflicts, invalid keys', () => {
  const items = [
    { slug: 'a-en', lang: 'en', title: 'A', draft: false, translationKey: 'a' },
    { slug: 'a-zh', lang: 'zh-Hans', title: '甲', draft: true, translationKey: 'a' },
    { slug: 'b', lang: 'en', title: 'B', draft: false, translationKey: 'b' },
  ]
  const ok = translationStatus({ slug: 'a-en', lang: 'en', translationKey: 'a' }, items)
  assert.equal(ok.key, 'a')
  assert.equal(ok.ambiguous, false)
  assert.deepEqual(ok.members.map((m) => [m.slug, m.sameLanguage, m.draft]), [['a-zh', false, true]])
  assert.deepEqual(ok.languages, ['en', 'zh-Hans'])
  const clash = translationStatus({ slug: 'new', lang: 'en-GB', translationKey: 'a' }, items)
  assert.equal(clash.ambiguous, true)
  assert.deepEqual(clash.members.filter((m) => m.sameLanguage).map((m) => m.slug), ['a-en'])
  assert.deepEqual(translationStatus({ slug: 'b', lang: 'en', translationKey: 'b' }, items).members, [])
  assert.deepEqual(translationStatus({ slug: 'b', lang: 'en', translationKey: 'Not Valid' }, items), { key: '', invalid: true, members: [], ambiguous: false, languages: [] })
  assert.equal(translationStatus({ slug: 'b', lang: 'en', translationKey: '' }, items).invalid, false)
})

test('translationSlug: the language suffix, replacing an existing one, within 64 characters', () => {
  assert.equal(translationSlug('carboy', 'zh-Hans'), 'carboy-zh')
  assert.equal(translationSlug('carboy-zh', 'en'), 'carboy-en')
  assert.equal(translationSlug('carboy', 'zh-Hant'), 'carboy-zh-hant')
  const long = translationSlug('x'.repeat(70), 'zh-Hant')
  assert.ok(long.length <= 64 && long.endsWith('-zh-hant'), long)
})

test('the editor forms round-trip the language and the translation key', () => {
  assert.equal(BLOG_EMPTY.lang, '')
  assert.equal(WORK_EMPTY.translationKey, '')
  const post = blogFromServer({ title: 'T', date: '2026-01-01', lang: 'zh-Hans', translationKey: 'carboy' })
  assert.equal(post.lang, 'zh-Hans')
  assert.equal(post.translationKey, 'carboy')
  const out = blogToServer(post, [])
  assert.equal(out.lang, 'zh-Hans')
  assert.equal(out.translationKey, 'carboy')
  const cleared = blogToServer({ ...post, lang: '', translationKey: 'Not valid' }, [])
  assert.equal(cleared.lang, undefined)
  assert.equal(cleared.translationKey, undefined)
  const work = workToServer(workFromServer({ title: 'W', translationKey: 'swcs', lang: 'en' }), [])
  assert.equal(work.translationKey, 'swcs')
  assert.equal(work.lang, 'en')
})

// ── Over a content store ─────────────────────────────────────────────────

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-content-f2-'))
let closeDb: () => void
let store: typeof import('../lib/contentStore')

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  store = await import('../lib/contentStore')
  closeDb = (await import('../lib/db')).closeDb
  const en = 'An English body about the edge sorter, with enough words to read as English text.'
  const zh = '这是一篇关于边缘分类装置的中文文章，正文全部使用中文书写，用来测试语言识别。'
  await store.putItem('work', 'sorter', { title: 'Edge sorter', translationKey: 'sorter', period: '2025' }, en)
  await store.putItem('work', 'sorter-zh', { title: '边缘分类装置项目', translationKey: 'sorter', lang: 'zh-Hans', period: '2025' }, zh)
  await store.putItem('work', 'solo', { title: 'Solo project' }, en)
  await store.putItem('blog', 'post-en', { title: 'Building the sorter', date: '2026-05-01', translationKey: 'post', project: 'sorter', tags: ['Edge'] }, en)
  await store.putItem('blog', 'post-zh', { title: '构建边缘分类装置的经验总结', date: '2026-05-02', translationKey: 'post', project: 'sorter', tags: ['Edge'] }, zh)
  await store.putItem('blog', 'post-tw', { title: '構建邊緣分類裝置的經驗總結', date: '2026-05-03', translationKey: 'post', lang: 'zh-Hant', draft: true }, zh)
  await store.putItem('blog', 'older', { title: 'An older note', date: '2026-01-01' }, en)
  await store.putItem('blog', 'ambiguous-1', { title: 'One', date: '2025-01-01', translationKey: 'amb' }, en)
  await store.putItem('blog', 'ambiguous-2', { title: 'Two', date: '2025-01-02', translationKey: 'amb' }, en)
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('articleSiblings: the switch, the alternates and the links in the article language', async () => {
  const { getPost, getWork } = await import('../lib/mdx')
  const { articleSiblings } = await import('../lib/articleSiblings')
  const zh = (await getPost('post-zh'))!
  const s = articleSiblings('blog', zh, { draftMode: false })
  assert.deepEqual(
    s.translations.map((t) => [t.slug, t.lang, t.hreflang, t.name, t.readIn]),
    [['post-en', 'en', 'en', 'English', 'Read in English']],
    'the draft Traditional version is not linked publicly; the switch words come with the props',
  )
  assert.deepEqual(s.alternates.map((a) => a.hrefLang), ['en', 'zh-Hans', 'x-default'])
  // Prev / next and related offer each piece once, in Chinese where it exists.
  assert.deepEqual(s.posts.map((p) => p.slug), ['post-zh', 'older', 'ambiguous-2', 'ambiguous-1'])
  assert.deepEqual(s.work.map((w) => w.slug).sort(), ['solo', 'sorter-zh'])
  assert.equal(s.projectFor('sorter'), 'sorter-zh', "the post's case study in the article's language")
  assert.equal(s.projectFor(null), undefined)

  const en = (await getPost('post-en'))!
  const se = articleSiblings('blog', en, { draftMode: false })
  assert.deepEqual(se.posts.map((p) => p.slug), ['post-en', 'older', 'ambiguous-2', 'ambiguous-1'])
  assert.equal(se.projectFor('sorter'), 'sorter')

  // Draft Mode: the owner can follow the switch to the draft; no alternates on a noindex page.
  const draft = articleSiblings('blog', en, { draftMode: true })
  assert.deepEqual(draft.translations.map((t) => t.slug), ['post-zh', 'post-tw'])
  assert.deepEqual(draft.alternates, [])
  const tw = (await getPost('post-tw', { includeDrafts: true }))!
  assert.deepEqual(articleSiblings('blog', tw, { draftMode: true }).alternates, [])

  // Two versions in one language: nothing is linked.
  const amb = (await getPost('ambiguous-1'))!
  assert.deepEqual(articleSiblings('blog', amb, { draftMode: false }).translations, [])

  const w = (await getWork('sorter-zh'))!
  const sw = articleSiblings('work', w, { draftMode: false })
  assert.deepEqual(sw.translations.map((t) => t.slug), ['sorter'])
  assert.deepEqual(sw.alternates.map((a) => a.href), [`${SITE}/work/sorter`, `${SITE}/work/sorter-zh`, `${SITE}/work/sorter`])
})

test('the sitemap gives every published post and case study its translation alternates (rendered: e2e/i18n-content.spec.ts)', () => {
  const src = fs.readFileSync(path.join(originalCwd, 'pages/sitemap.xml.tsx'), 'utf8')
  assert.match(src, /const postGroups = translationGroups\(posts\)/)
  assert.match(src, /const workGroups = translationGroups\(work\)/)
  assert.match(src, /alternates: hreflangAlternates\(p, postGroups\.get\(p\.slug\) \|\| \[\]\)/)
  assert.match(src, /alternates: hreflangAlternates\(w, workGroups\.get\(w\.slug\) \|\| \[\]\)/)
  // Built from the published lists only.
  assert.match(src, /const posts = listPosts\(\)\n\s*const work = listWork\(\)/)
})

test('the indexes list each piece once (the English version) and the list APIs say which', async () => {
  const blogList = (await import('../pages/api/blog/list')).default
  let body: any
  const res: any = { statusCode: 200, setHeader() {}, status(c: number) { this.statusCode = c; return this }, json(b: unknown) { body = b; return this } }
  await blogList({ method: 'GET', query: {}, headers: {}, socket: {} } as never, res)
  const bySlug = Object.fromEntries((body.items as any[]).map((i) => [i.slug, i]))
  assert.equal(bySlug['post-en'].listed, true)
  assert.equal(bySlug['post-zh'].listed, false)
  assert.deepEqual(bySlug['post-en'].translations, [{ lang: 'zh-Hans', permalink: '/blog/post-zh' }])
  assert.equal(bySlug['post-tw'], undefined)
  assert.equal(bySlug.older.listed, true)
  assert.deepEqual(bySlug.older.translations, [])
})

const adminToken = () => jwt.sign({ role: 'admin', email: 'owner@example.test' }, process.env.JWT_SECRET!, { algorithm: 'HS256' })

let ip = 0
async function adminCall(handler: (req: any, res: any) => unknown, opts: { method?: string; query?: Record<string, string>; body?: unknown } = {}) {
  const token = adminToken()
  ip++
  const revalidated: string[] = []
  const out = { statusCode: 200, body: undefined as any, revalidated }
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
    setHeader() {
      return res
    },
    getHeader() {
      return undefined
    },
    json(b: unknown) {
      out.body = JSON.parse(JSON.stringify(b))
      return res
    },
    end(payload?: string) {
      if (typeof payload === 'string') out.body = JSON.parse(payload)
      return res
    },
    async revalidate(p: string) {
      revalidated.push(p)
    },
  }
  await handler(
    {
      method: opts.method || 'GET',
      url: '/api/admin/posts',
      query: opts.query || {},
      body: opts.body,
      cookies: { cv_admin_token: token },
      headers: { cookie: `cv_admin_token=${token}` },
      socket: { remoteAddress: `127.0.2.${(ip % 250) + 1}` },
    },
    res,
  )
  return out
}

test('admin: the list carries each item’s language; a save regenerates its translations first, and the group it left', async () => {
  const posts = (await import('../pages/api/admin/posts')).default
  const list = await adminCall(posts)
  const langs = Object.fromEntries((list.body.items as any[]).map((i) => [i.slug, i.lang]))
  assert.equal(langs['post-en'], 'en')
  assert.equal(langs['post-zh'], 'zh-Hans')
  assert.equal(langs['post-tw'], 'zh-Hant')

  const { translationPartners } = await import('../lib/mdx-admin')
  assert.deepEqual(translationPartners('blog', ['post']).sort(), ['post-en', 'post-tw', 'post-zh'])
  assert.deepEqual(translationPartners('blog', ['', undefined, 'Not valid']), [])

  // `older` joins the "post" group under a key… then leaves it again.
  const one = await adminCall(posts, { query: { slug: 'older' } })
  const join = await adminCall(posts, {
    method: 'PUT',
    body: { slug: 'older', frontmatter: { ...one.body.frontmatter, translationKey: 'post' }, body: one.body.body },
  })
  assert.equal(join.statusCode, 200, JSON.stringify(join.body))
  for (const p of ['/blog/post-en', '/blog/post-zh', '/blog/post-tw']) assert.ok(join.revalidated.includes(p), p)
  const leave = await adminCall(posts, {
    method: 'PUT',
    body: { slug: 'older', frontmatter: { ...one.body.frontmatter, translationKey: 'other' }, body: one.body.body },
  })
  assert.equal(leave.statusCode, 200)
  for (const p of ['/blog/post-en', '/blog/post-zh']) assert.ok(leave.revalidated.includes(p), `the left group's ${p} is regenerated`)
  // Partners come first among the sibling pages (the 50-page cap never drops them).
  const firstDetail = join.revalidated.filter((p) => /^\/blog\/./.test(p)).slice(0, 4)
  assert.deepEqual(firstDetail.sort(), ['/blog/older', '/blog/post-en', '/blog/post-tw', '/blog/post-zh'])
})
