/**
 * F3 — a genuinely bilingual site: the interface dictionary (lib/uiStrings),
 * the EN / ZH page pairs (lib/zhRoutes), which Chinese pages exist
 * (lib/zhSite, over a content store), the home document in each language
 * (lib/homeLocale), the owner's Chinese copy through the home write path
 * and the Home editor's form, the Chinese contact reasons, the index pages,
 * the sitemap's alternates, llms.txt and the ISR pages that vanish. The
 * rendered pages: e2e/bilingual-site.spec.ts.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { UI_LANGS, type UiLang } from '../lib/uiStrings'
import { CHROME_UI, chromeUiFor } from '../lib/uiStrings/chrome'
import { CHROME_EN } from '../lib/uiStrings/chrome-en'
import { MENU_UI } from '../lib/uiStrings/menu'
import { PALETTE_UI } from '../lib/uiStrings/palette'
import { NOT_FOUND_UI } from '../lib/uiStrings/notFound'
import { LIST_UI } from '../lib/uiStrings/lists'
import { CONTACT_UI, CONTACT_EN } from '../lib/uiStrings/contact'
import { ABOUT_UI, ABOUT_EN } from '../lib/uiStrings/about'
import { HOME_UI } from '../lib/uiStrings/home'
import { ASK_ENTRY_UI } from '../lib/uiStrings/askEntry'
import { CV_UI, cvUiFor } from '../lib/uiStrings/cv'
import { CV_FIELDS_UI } from '../lib/uiStrings/cvFields'
import { autonymOf, switchLabel } from '../lib/uiStrings/languages'
import {
  CV_ZH_PATH,
  ZH_PAIRED,
  ZH_PATHS,
  enPageLanguages,
  enPathOf,
  isZhSitePath,
  pairAlternates,
  zhHref,
  zhPageLanguages,
  zhPathOf,
} from '../lib/zhRoutes'
import { chineseHome, englishHome, zhCaption, zhHighlight, zhHomeDescription } from '../lib/homeLocale'
import { normalizeHomeWrite, type HomeData } from '../lib/homeShape'
import { formFromHome, serializeHome } from '../components/Admin/home/homeForm'
import { PRIMARY_LINKS, isActiveLink, localizeNav } from '../components/Chrome/chrome'
import { pageAdminPath, pageFixedLang, pagePublicPath } from '../lib/pageNames'
import { pageRevalidatePaths, STATIC_CONTENT_PATHS } from '../lib/revalidate'
import { buildLlmsTxt } from '../lib/markdownTwin'

/** The checkout (the store tests below chdir into a temp directory first). */
const ROOT = process.cwd()

// ── The dictionary ───────────────────────────────────────────────────────

/** Every leaf of a table entry as [path, value]: strings, and arrays of strings. */
function leaves(value: unknown, at = ''): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${at}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, at ? `${at}.${k}` : k))
  return [[at, value]]
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

const TABLES = {
  CHROME_UI,
  MENU_UI,
  PALETTE_UI,
  NOT_FOUND_UI,
  LIST_UI,
  CONTACT_UI,
  ABOUT_UI,
  HOME_UI,
  ASK_ENTRY_UI,
  CV_UI,
  CV_FIELDS_UI,
} as const

/**
 * Maps the English table leaves empty on purpose: the contact form shows the
 * server's own English message, the Chinese form its Chinese words for the
 * error's `code` (checked below).
 */
const OPEN_MAPS = /^errors\.codes\./
const DATE_LINES = /\.(?:date|dateTime|day|dayWithYear|monthYear)$/

test('every table holds every interface language with the same keys, strings only, and the same placeholders', () => {
  for (const [name, table] of Object.entries(TABLES)) {
    assert.deepEqual(Object.keys(table).sort(), [...UI_LANGS].sort(), name)
    const en = new Map(leaves(table.en))
    for (const lang of UI_LANGS) {
      const own = new Map(leaves((table as Record<UiLang, unknown>)[lang]).filter(([k]) => !OPEN_MAPS.test(k)))
      assert.deepEqual([...own.keys()].sort(), [...en.keys()].sort(), `${name}.${lang}: the same keys as English`)
      for (const [key, v] of own) {
        assert.equal(typeof v, 'string', `${name}.${lang}.${key} is a string`)
        const s = v as string
        // A few entries are deliberately empty (a separator, a suffix the language does not need).
        if (s === '') assert.equal(typeof en.get(key), 'string', `${name}.${lang}.${key}`)
        // A translation fills only values the English line has (it may leave one out: the
        // Chinese GitHub feed does not quote GitHub's English event names).
        // Dates take the month by name ({month}) or by number ({m}, the Chinese "10月").
        const known = [...placeholders(String(en.get(key))), ...(DATE_LINES.test(key) ? ['m'] : [])]
        for (const p of placeholders(s)) assert.ok(known.includes(p), `${name}.${lang}.${key}: {${p}}`)

      }
    }
  }
})

test('the Chinese contact form explains every error the contact endpoint can answer', () => {
  const api = fs.readFileSync(path.join(ROOT, 'pages/api/contact.ts'), 'utf8')
  const codes = new Set([...api.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]))
  for (const c of ['BUSY', 'UNAVAILABLE']) assert.match(api, new RegExp(`'${c}'`))
  codes.add('BUSY').add('UNAVAILABLE')
  for (const lang of ['zh-Hans', 'zh-Hant'] as const) {
    assert.deepEqual(Object.keys(CONTACT_UI[lang].errors.codes).sort(), [...codes].sort(), lang)
  }
})

/** Words that read the same in the Chinese interface (names, formats, symbols). */
const SAME_IN_CHINESE = /^(?:[\s\d\W_]*|\S+@example\.com|https?:\/\/\S*|.*\b(?:PDF|JSON|A4|CV|GitHub|GitLab|LinkedIn|WhatsApp|ORCID|RSS|Lucian|Next\.js|Markdown|PR|txt|json|jsonresume\.org)\b.*|English(?: CV)?|English|中文简历|Ctrl|⌘|Esc|Tab|Enter)$/

test('the Chinese tables are written in Chinese: no English line left untranslated', () => {
  for (const [name, table] of Object.entries(TABLES)) {
    const en = new Map(leaves(table.en))
    for (const lang of ['zh-Hans', 'zh-Hant'] as const) {
      for (const [key, v] of leaves(table[lang])) {
        const s = String(v)
        if (s !== en.get(key) || !/[A-Za-z]{3,}/.test(s)) continue
        assert.match(s, SAME_IN_CHINESE, `${name}.${lang}.${key} is still English: "${s}"`)
      }
    }
  }
})

test('the chrome ships Chinese words only to a Chinese page: English is the shared bundle', () => {
  assert.equal(chromeUiFor('en'), null)
  assert.equal(chromeUiFor('ja'), null, 'a Japanese article keeps the English chrome (marked lang="en")')
  assert.equal(chromeUiFor(undefined), null)
  assert.deepEqual(chromeUiFor('zh-Hans'), { lang: 'zh-Hans', t: CHROME_UI['zh-Hans'] })
  assert.deepEqual(chromeUiFor('zh-TW'), { lang: 'zh-Hant', t: CHROME_UI['zh-Hant'] })
  assert.equal(CHROME_UI.en, CHROME_EN)
  assert.equal(CHROME_UI['zh-Hans'].nav.writing, '文章')
  assert.equal(CHROME_UI['zh-Hans'].skip.length > 0, true)
  // The page's other tables are picked the same way.
  assert.equal(CONTACT_UI.en, CONTACT_EN)
  assert.equal(ABOUT_UI.en, ABOUT_EN)
  assert.equal(cvUiFor('zh'), CV_UI['zh-Hans'])
  assert.equal(cvUiFor('en'), CV_UI.en)
})

test('_app bundles only the English chrome; the Chinese chrome loads with a Chinese page', () => {
  const app = fs.readFileSync(path.join(ROOT, 'pages/_app.tsx'), 'utf8')
  assert.doesNotMatch(app, /^import (?!type )[^\n]*uiStrings\/chrome'/m, 'no static import of the whole table')
  assert.match(app, /import\('\.\.\/lib\/uiStrings\/chrome'\)/)
  for (const f of ['components/Header/Header.tsx', 'components/Footer/Footer.tsx', 'components/Chrome/SiteChrome.tsx']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /uiStrings\/(chrome|menu|palette)'/, `${f} reads its words from context`)
  }
})

test('the language switch names the other version in its own language', () => {
  assert.equal(switchLabel('zh-Hans', [{ lang: 'zh-Hans' }]), '中文')
  assert.equal(switchLabel('en', [{ lang: 'en' }]), 'English')
  assert.equal(switchLabel('zh-Hans', [{ lang: 'zh-Hans' }, { lang: 'zh-Hant' }]), '简体', 'both scripts: told apart')
  assert.equal(switchLabel('zh-Hant', [{ lang: 'zh-Hans' }, { lang: 'zh-Hant' }]), '繁體')
  assert.equal(autonymOf('zh-Hans'), '简体中文')
  assert.equal(autonymOf('en'), 'English')
})

// ── Routes ───────────────────────────────────────────────────────────────

test('the five pairs, their alternates and the language links of each side', () => {
  assert.deepEqual(ZH_PAIRED.map(zhPathOf), [...ZH_PATHS])
  assert.deepEqual(ZH_PATHS.map(enPathOf), [...ZH_PAIRED])
  assert.equal(zhPathOf('/now'), null, 'no Chinese /now')
  assert.equal(zhPathOf('constructor'), null)
  assert.equal(enPathOf('/zh/now'), null)
  assert.equal(isZhSitePath('/zh'), true)
  assert.equal(isZhSitePath('/zh/about#about-bio'), true)
  assert.equal(isZhSitePath('/zhx'), false)
  assert.deepEqual(pairAlternates('/about', '/zh/about'), [
    { hrefLang: 'en', href: '/about' },
    { hrefLang: 'zh-Hans', href: '/zh/about' },
    { hrefLang: 'x-default', href: '/about' },
  ])
  // The English page announces its Chinese page only while it exists.
  assert.deepEqual(enPageLanguages('/about', []), { langLinks: [], alternates: [] })
  assert.deepEqual(enPageLanguages('/about', ['/about']).langLinks, [{ lang: 'zh-Hans', href: '/zh/about' }])
  assert.equal(enPageLanguages('/about', ['/about']).alternates.length, 3)
  assert.deepEqual(enPageLanguages('/now', ['/now']), { langLinks: [], alternates: [] })
  assert.deepEqual(zhPageLanguages('/contact').langLinks, [{ lang: 'en', href: '/contact' }])
})

test('links from a Chinese page lead to the Chinese pages that exist, the CV to the Chinese CV', () => {
  const live = ['/', '/blog']
  assert.equal(zhHref('/', live), '/zh')
  assert.equal(zhHref('/blog?tag=Edge#list', live), '/zh/blog?tag=Edge#list')
  assert.equal(zhHref('/about', live), '/about', 'no Chinese bio: the English page')
  assert.equal(zhHref('/cv#cv-education', []), `${CV_ZH_PATH}#cv-education`)
  assert.equal(zhHref('/now', live), '/now')
  assert.equal(zhHref('https://example.com/', live), 'https://example.com/')

  const nav = localizeNav(PRIMARY_LINKS, CHROME_UI['zh-Hans'], live)
  assert.deepEqual(
    nav.map((l) => [l.name, l.url, l.base ?? null]),
    [
      ['首页', '/zh', '/'],
      ['关于', '/about', null],
      ['项目', '/work', null],
      ['文章', '/zh/blog', '/blog'],
      ['简历', '/cv/zh', '/cv'],
      ['近况', '/now', null],
      ['工具', '/uses', null],
      ['联系', '/contact', null],
    ],
  )
  const writing = nav[3]
  assert.equal(isActiveLink('/zh/blog', writing), true)
  assert.equal(isActiveLink('/blog/a-chinese-post', writing), true, 'a Chinese post marks 文章')
  assert.equal(isActiveLink('/zh/about', nav[0]), false, '/zh is exact')
  assert.equal(isActiveLink('/zh', nav[0]), true)
  // English pages keep their links and labels.
  assert.deepEqual(localizeNav(PRIMARY_LINKS, CHROME_EN, null).map((l) => l.url), PRIMARY_LINKS.map((l) => l.url))
})

test('the owner’s "Edit this page" from a Chinese page opens its Chinese copy', async () => {
  const { adminEditTarget } = await import('../components/Chrome/adminEditTarget')
  assert.deepEqual(adminEditTarget('/zh', undefined), { label: 'Edit the Chinese copy', href: '/admin/dashboard?tab=home#home-chinese' })
  assert.deepEqual(adminEditTarget('/zh/contact', undefined)?.href, '/admin/dashboard?tab=home#home-chinese')
  assert.deepEqual(adminEditTarget('/zh/about', undefined), { label: 'Edit the Chinese bio', href: '/admin/about?lang=zh' })
  assert.equal(adminEditTarget('/zh/blog', undefined), null)
})

test('the Chinese bio is a page of its own: /zh/about, edited at /admin/about?lang=zh, regenerating its pair', () => {
  assert.equal(pagePublicPath('about-zh'), '/zh/about')
  assert.equal(pageAdminPath('about-zh'), '/admin/about?lang=zh')
  assert.equal(pageFixedLang('about-zh'), 'zh-Hans')
  assert.equal(pageFixedLang('about'), null)
  assert.equal(pagePublicPath('now'), '/now')
  assert.deepEqual(pageRevalidatePaths('about'), ['/about'])
  const zh = pageRevalidatePaths('about-zh')
  for (const p of ['/zh/about', '/about', '/cv/zh', ...ZH_PATHS]) assert.ok(zh.includes(p), p)
  for (const p of ZH_PATHS) assert.ok(STATIC_CONTENT_PATHS.includes(p as never), `restores regenerate ${p}`)
})

test('saving or removing the Chinese bio is recorded in the activity log', async () => {
  const { describeAdminWrite } = await import('../lib/audit/describe')
  const d = (body: unknown) => describeAdminWrite('admin/page', { method: 'PUT', query: {}, body })
  assert.deepEqual(d({ name: 'about-zh', body: '中文简介' }), { action: 'page.save', area: 'page', target: 'about-zh', summary: 'Saved the Chinese bio (/zh/about)' })
  assert.equal(d({ name: 'about-zh', body: ' ' })?.summary, 'Removed the Chinese bio (/zh/about)')
  assert.equal(d({ name: 'about', body: ' ' })?.summary, 'Removed the About bio')
  const { auditTargetHref } = await import('../lib/audit/describe')
  assert.equal(auditTargetHref('page', 'about-zh'), '/admin/about?lang=zh')
  assert.equal(auditTargetHref('page', 'now'), '/admin/now')
})

// ── The home document in each language ──────────────────────────────────

const HOME: HomeData = {
  hero: {
    welcome: 'Hi',
    brand: 'Example Person',
    tagline: 'Engineer | builds things',
    tagline_zh: '工程师 | 做东西',
    avatarUrl: '/uploads/a.webp',
    currentlyCoding: { label: 'coding', project: 'Example', note: 'since 2024', label_zh: '正在写', project_zh: '示例', note_zh: '' },
  },
  socials: {},
  brands: [],
  quickAccess: [],
  photos: [{ url: '/uploads/p.webp', describe: 'A desk', describe_zh: '书桌' }, { url: '/uploads/q.webp', describe: 'A street' }],
  highlights: [
    { value: '1st', label: 'Example prize', href: '/cv', value_zh: '第一名', label_zh: '示例奖项' },
    { value: '2nd', label: 'Other prize', href: '/cv' },
  ],
  contact: {
    heading: 'Write',
    blurb: 'I reply.',
    eyebrow: 'Reach',
    reasons: ['Hiring', 'Talk'],
    heading_zh: '写信',
    blurb_zh: '我会回复。',
    reasons_zh: { Talk: '聊聊' },
  },
  availability: { status: 'open', label: 'Open to roles', label_zh: '开放机会', roles: ['Engineer'], roles_zh: ['工程师'] },
} as HomeData

test('the English page ships no Chinese copy; the Chinese page shows only the owner’s Chinese', () => {
  const en = englishHome(HOME)
  assert.doesNotMatch(JSON.stringify(en), /_zh/, 'no _zh field on /')
  assert.equal(en.hero.tagline, 'Engineer | builds things')

  const zh = chineseHome(HOME)
  assert.equal(zh.hero.tagline, '工程师 | 做东西')
  assert.deepEqual(zh.hero.currentlyCoding, { label: '正在写', project: '示例', note: '' }, 'a blank line stays blank, never English')
  assert.equal(zh.contact?.heading, '写信')
  assert.equal(zh.contact?.eyebrow, '', 'no Chinese eyebrow: the built-in Chinese one shows')
  assert.equal(zh.availability?.label, '开放机会')
  assert.deepEqual(zh.availability?.roles, ['工程师'])
  assert.doesNotMatch(JSON.stringify(zh.contact), /reasons_zh|heading_zh/)

  assert.deepEqual(zhHighlight(HOME.highlights![0]), { ...HOME.highlights![0], value: '第一名', label: '示例奖项' })
  assert.equal(zhHighlight(HOME.highlights![1]).lang, 'en', 'English words are marked English')
  assert.deepEqual(zhCaption(HOME.photos![0]), { describe: '书桌' })
  assert.deepEqual(zhCaption(HOME.photos![1]), { describe: 'A street', lang: 'en' })
  assert.equal(zhHomeDescription('示例', '工程师 | 做东西'), '示例（Lucian）：工程师，做东西。')
})

test('the home write path keeps the Chinese copy tidy and rejects half a highlight', () => {
  const ok = normalizeHomeWrite({
    ...HOME,
    hero: { ...HOME.hero, tagline_zh: '  工程师 | 做东西 \n', currentlyCoding: { ...HOME.hero.currentlyCoding!, note_zh: '   ' } },
    contact: { ...HOME.contact, eyebrow_zh: '', reasons_zh: { Talk: ' 聊聊 ', Gone: '旧的', Hiring: '' } },
  } as HomeData)
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  assert.equal(ok.home.hero.tagline_zh, '工程师 | 做东西')
  assert.ok(!('note_zh' in (ok.home.hero.currentlyCoding || {})), 'blank lines are dropped')
  assert.ok(!('eyebrow_zh' in (ok.home.contact || {})))
  assert.deepEqual(ok.home.contact?.reasons_zh, { Talk: '聊聊' }, 'only the current reasons, keyed by the English one')

  const half = normalizeHomeWrite({ ...HOME, highlights: [{ value: 'A', label: 'B', href: '/cv', value_zh: '甲' }] } as HomeData)
  assert.equal(half.ok, false)
  if (!half.ok) assert.ok(half.errors.some((e) => e.path === 'highlights.0.label_zh'))

  const list = normalizeHomeWrite({ ...HOME, contact: { ...HOME.contact, reasons_zh: ['聊聊'] as never } } as HomeData)
  assert.equal(list.ok, false, 'reasons_zh is a map, not a list')

  const proto = normalizeHomeWrite({ ...HOME, contact: { ...HOME.contact, reasons: ['constructor'], reasons_zh: {} } } as HomeData)
  assert.equal(proto.ok, true, 'a reason named like an Object property has no inherited name')
  if (proto.ok) assert.ok(!('reasons_zh' in (proto.home.contact || {})))

  const long = normalizeHomeWrite({ ...HOME, contact: { ...HOME.contact, blurb_zh: '长'.repeat(401) } } as HomeData)
  assert.equal(long.ok, false)
})

test('the Home editor round-trips the Chinese copy and leaves blank fields out', () => {
  const form = formFromHome(HOME, () => 'id')
  assert.equal(form.hero.tagline_zh, '工程师 | 做东西')
  assert.equal(form.photos[0].describe_zh, '书桌')
  assert.equal(form.highlights[0].value_zh, '第一名')
  assert.deepEqual(form.contact.reasons_zh, { Talk: '聊聊' })
  const out = serializeHome(form)
  assert.equal(out.hero.tagline_zh, '工程师 | 做东西')
  assert.deepEqual(out.hero.currentlyCoding, { label: 'coding', project: 'Example', note: 'since 2024', label_zh: '正在写', project_zh: '示例' })
  assert.equal(out.photos?.[0].describe_zh, '书桌')
  assert.ok(!('describe_zh' in (out.photos?.[1] || {})))
  assert.deepEqual(out.highlights?.[0], { value: '1st', label: 'Example prize', href: '/cv', value_zh: '第一名', label_zh: '示例奖项' })
  assert.deepEqual(out.highlights?.[1], { value: '2nd', label: 'Other prize', href: '/cv' })
  assert.equal(out.contact?.heading_zh, '写信')
  assert.ok(!('eyebrow_zh' in (out.contact || {})))
  assert.deepEqual(out.contact?.reasons_zh, { Talk: '聊聊' })
  assert.equal(normalizeHomeWrite(out).ok, true)

  // A reason renamed in the editor loses its Chinese name (it was keyed by the old one).
  const renamed = serializeHome({ ...form, contact: { ...form.contact, reasons: ['Hiring', 'Chat'] } })
  assert.ok(!('reasons_zh' in (renamed.contact || {})))

  // A draft saved by an older editor build (no Chinese fields) still serializes.
  const old = JSON.parse(JSON.stringify(form))
  delete old.hero.tagline_zh
  delete old.contact.reasons_zh
  delete old.contact.heading_zh
  const fromOld = serializeHome(old)
  assert.ok(!('tagline_zh' in fromOld.hero))
  assert.ok(!('heading_zh' in (fromOld.contact || {})))
})

test('the Chinese contact form names each reason in Chinese, or marks the English one', async () => {
  const { zhReasonOptions } = await import('../lib/contactPage')
  const names = CONTACT_UI['zh-Hans'].reasons as Record<string, string>
  const builtIn = zhReasonOptions(null, names)
  assert.deepEqual(
    builtIn.map((r) => r.label),
    ['项目咨询', '招聘', '合作', '顾问咨询', '指导交流', '其他'],
  )
  assert.ok(builtIn.every((r) => !r.lang))
  const custom = zhReasonOptions({ reasons: ['Hiring', 'Talk', 'Other thing'], intents: { Talk: 'collab' }, reasons_zh: { Talk: '聊聊' } }, names)
  assert.deepEqual(
    custom.map((r) => [r.label, r.intent, r.lang ?? null]),
    [
      ['招聘', 'other', null],
      ['聊聊', 'collab', null],
      ['Other thing', 'other', 'en'],
    ],
    'a built-in reason keeps its built-in name; one without a Chinese name stays English, marked',
  )
})

// ── llms.txt ─────────────────────────────────────────────────────────────

test('llms.txt lists the Chinese pages that exist', () => {
  const base = { siteUrl: 'https://example.com', name: 'Example Person', summary: 'S', work: [], posts: [], publications: false, cv: { en: true, zh: true } }
  assert.doesNotMatch(buildLlmsTxt(base), /The site in Chinese/)
  const txt = buildLlmsTxt({ ...base, zhPages: ['/zh', '/zh/contact'] })
  assert.match(txt, /- The site in Chinese \(简体中文\): \[Home\]\(<https:\/\/example\.com\/zh>\), \[Contact\]\(<https:\/\/example\.com\/zh\/contact>\)\n/)
})

// ── Over a content store ─────────────────────────────────────────────────

const originalCwd = ROOT
let tmp = ''
let store: typeof import('../lib/contentStore')

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bilingual-site-'))
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'NEXT_PHASE']) delete process.env[k]
  store = await import('../lib/contentStore')
})

after(async () => {
  const { closeDb } = await import('../lib/db')
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const EN_BODY = 'An English body about an example project, with enough words to read as English text.'
const ZH_BODY = '这是一篇关于示例项目的中文文章，正文全部使用中文书写，用来测试语言识别。'

test('a Chinese page exists only while its Chinese copy is written', async () => {
  const { zhAvailable } = await import('../lib/zhSite')
  const { vanishingRoutes } = await import('../lib/isrPages')
  assert.deepEqual(zhAvailable(), [], 'an empty store has no Chinese page')
  const zhRoute = () => vanishingRoutes().find((r) => r.name === 'zh')!
  assert.equal(zhRoute().match('/zh/about'), true)
  assert.equal(zhRoute().match('/zh/now'), false)
  assert.equal(zhRoute().exists('/zh'), false)

  await store.putKv('home', { hero: { welcome: '', brand: 'B', tagline: 'T' }, socials: {}, brands: [], quickAccess: [], contact: { blurb: 'x' } })
  assert.deepEqual(zhAvailable(), [], 'English copy alone publishes nothing in Chinese')

  await store.putKv('home', {
    hero: { welcome: '', brand: 'B', tagline: 'T', tagline_zh: '工程师' },
    socials: {},
    brands: [],
    quickAccess: [],
    contact: { blurb_zh: '我会回复。' },
  })
  await store.putPage('about-zh', { title: '关于' }, ZH_BODY)
  await store.putItem('blog', 'post-en', { title: 'An English post', date: '2026-05-01', translationKey: 'p' }, EN_BODY)
  await store.putItem('blog', 'post-zh', { title: '一篇中文文章', date: '2026-05-02', translationKey: 'p', lang: 'zh-Hans' }, ZH_BODY)
  await store.putItem('work', 'draft-zh', { title: '草稿项目', lang: 'zh-Hans', draft: true }, ZH_BODY)
  await store.putItem('work', 'case-en', { title: 'A case study' }, EN_BODY)
  assert.deepEqual(zhAvailable(), ['/', '/about', '/blog', '/contact'], 'a draft does not publish /zh/work')
  assert.equal(zhRoute().exists('/zh/blog'), true)
  assert.equal(zhRoute().exists('/zh/work'), false)

  await store.putPage('about-zh', { title: '关于' }, '   ')
  assert.ok(!zhAvailable().includes('/about'), 'clearing the Chinese bio takes /zh/about down')
})

test('/zh/blog lists the posts in Chinese with their other versions; /blog announces it', async () => {
  const { loadBlogIndex, loadWorkIndex } = await import('../lib/indexPages')
  const zh = await loadBlogIndex('zh-Hans')
  assert.ok('props' in zh)
  if (!('props' in zh)) return
  assert.deepEqual(zh.props.posts.map((p) => p.slug), ['post-zh'])
  assert.deepEqual(zh.props.posts[0].alsoIn.map((a) => a.lang), ['en'])
  assert.equal(zh.props.lang, 'zh-Hans')
  assert.deepEqual(zh.props.langLinks, [{ lang: 'en', href: '/blog' }])
  assert.equal(zh.props.ui.lang, 'zh-Hans')
  assert.equal(zh.props.chromeUi?.lang, 'zh-Hans')

  const en = await loadBlogIndex('en')
  assert.ok('props' in en)
  if (!('props' in en)) return
  assert.deepEqual(en.props.langLinks, [{ lang: 'zh-Hans', href: '/zh/blog' }])
  assert.deepEqual(en.props.alternates.map((a) => a.hrefLang), ['en', 'zh-Hans', 'x-default'])
  assert.equal(en.props.chromeUi, undefined, 'the English page ships no chrome table')

  const work = await loadWorkIndex('zh-Hans')
  assert.ok('notFound' in work && work.notFound, 'no published case study in Chinese: /zh/work is a 404')
  const workEn = await loadWorkIndex('en')
  assert.ok('props' in workEn)
  if ('props' in workEn) assert.deepEqual(workEn.props.langLinks, [], 'and /work hides the switch')
})

test('/zh/contact: 404 without the Chinese heading or blurb, else the Chinese copy only', async () => {
  const { loadContactPage } = await import('../lib/contactPage')
  const r = await loadContactPage('zh-Hans')
  assert.ok('props' in r)
  if (!('props' in r)) return
  assert.equal(r.props.home?.contact?.blurb, '我会回复。')
  assert.doesNotMatch(JSON.stringify(r.props.home), /_zh|"tagline"/)
  assert.equal(r.props.ui?.lang, 'zh-Hans')
  assert.deepEqual(r.props.langLinks, [{ lang: 'en', href: '/contact' }])

  const en = await loadContactPage('en')
  assert.equal(en.props.ui, null, 'the English page uses the bundled English words')
  assert.deepEqual(en.props.langLinks, [{ lang: 'zh-Hans', href: '/zh/contact' }])
  assert.doesNotMatch(JSON.stringify(en.props.home), /_zh/)

  await store.putKv('home', { hero: { welcome: '', brand: 'B', tagline: 'T', tagline_zh: '工程师' }, socials: {}, brands: [], quickAccess: [], contact: {} })
  const gone = await loadContactPage('zh-Hans')
  assert.ok('notFound' in gone && gone.notFound)
})

test('the sitemap lists each Chinese page that exists, with its English page as reciprocal alternates (rendered: e2e/bilingual-site.spec.ts)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/sitemap.xml.tsx'), 'utf8')
  assert.match(src, /const zhOn = new Set\(zhAvailable\(\)\)/)
  assert.match(src, /pairAlternates\(path, zh\)\.map\(\(a\) => \(\{ hrefLang: a\.hrefLang, href: absUrl\(a\.href\) \}\)\)/)
  for (const p of ZH_PAIRED) assert.match(src, new RegExp(`\\.\\.\\.pair\\('${p.replace(/\//g, '\\/')}'`), p)
})
