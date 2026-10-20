/**
 * Publications, phase 2, rendered to HTML: the home page's "Selected
 * publications" rows and the /about rail's Publications link — what a
 * visitor (and a screen reader) gets, and nothing without a paper.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ownerNamesFromSections, publicPublications, selectPublications } from '../lib/publications'

// Node strips TypeScript types but does not compile JSX: transpile .tsx with the project's TypeScript.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      let ts
      export async function initialize(data) { ts = (await import(data.ts)).default }
      export async function load(url, context, next) {
        if (!url.startsWith('file:') || !url.endsWith('.tsx')) return next(url, context)
        const { readFile } = await import('node:fs/promises')
        const source = await readFile(new URL(url), 'utf8')
        const out = ts.transpileModule(source, {
          fileName: url,
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        return { format: 'module', source: out.outputText, shortCircuit: true }
      }
    `),
  { parentURL: import.meta.url, data: { ts: pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href } },
)

const { default: SelectedPublications } = await import('../components/LandingPage/SelectedPublications')
const { default: IdentityRail } = await import('../components/About/IdentityRail')
const { HomeUiContext, EN_HOME_LINKS } = await import('../components/LandingPage/homeUi')
const { HOME_UI } = await import('../lib/uiStrings/home')

const SECRET = 'ZZ-HIDDEN-ZZ'

/** Static markup without the style tags Emotion inlines when no cache provider is mounted. */
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

function data(count = 3) {
  const sections = [
    { sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li' },
    {
      sessionName: 'publications',
      papers: [
        {
          title: 'Tiny models at the edge',
          authors: ['Jane Doe', `${SECRET} Person`, 'Yanpei Li'],
          hiddenItems: { authors: [1] },
          venue: 'Journal of Edge Computing',
          status: 'published',
          date: '2025-03',
          award: 'Best Paper Award',
        },
        { title: 'Under review paper', status: 'under-review', venue: `${SECRET} venue`, date: '2026', authors: ['Yanpei Li'] },
        { title: '中文论文', status: 'preprint', venue: 'arXiv', date: '2026', authors: ['李彦霈'] },
        ...Array.from({ length: Math.max(0, count - 3) }, (_, i) => ({ title: `Older paper ${i}`, status: 'published', venue: 'J', date: '2019', authors: [] })),
      ],
    },
  ]
  return selectPublications({ lang: 'en', publications: publicPublications(sections), owner: ownerNamesFromSections(sections) })!
}

/** A home section inside the home page's words (F3: LandingContent provides them). */
function inHome(el: unknown) {
  const value = { t: HOME_UI.en, lang: 'en', cvLang: 'en', links: EN_HOME_LINKS }
  return createElement(HomeUiContext.Provider, { value: value as never }, el as never)
}

test('home rows: titles link to their /publications anchors, the owner in bold, a hidden author unnamed, statuses shown', () => {
  const html = render(inHome(createElement(SelectedPublications, { data: data() })))
  assert.equal((html.match(/<h3/g) || []).length, 3)
  assert.match(html, /<h3[^>]*><a[^>]*href="\/publications#doe2025tiny"[^>]*>Tiny models at the edge<\/a><\/h3>/)
  assert.match(html, /class="[^"]*stretched-link[^"]*"/, 'the whole row is the link’s target, the title its name')
  assert.match(html, /<strong[^>]*>Yanpei Li<\/strong>/)
  assert.match(html, /<span aria-hidden="true">…<\/span><span class="sr-only">an author not shown<\/span>/)
  assert.match(html, /<cite[^>]*>Journal of Edge Computing<\/cite>/)
  assert.match(html, />Under review</, 'unpublished work carries its status')
  assert.match(html, /Best Paper Award/)
  assert.match(html, /<time dateTime="2025">2025<\/time>/)
  assert.match(html, /lang="zh-Hans"[^>]*>中文论文</, 'Chinese titles are marked')
  assert.match(html, /href="\/publications"[^>]*>All publications <span class="nudge" aria-hidden="true">→<\/span>/)
  assert.ok(!html.includes(SECRET), 'no hidden author, no venue of a paper under review')
  assert.ok(!/\[\d+\]/.test(html), 'no bracketed index labels')
})

test('home rows: more papers than rows → "All N publications"; no data → nothing', () => {
  const html = render(inHome(createElement(SelectedPublications, { data: data(5) })))
  assert.equal((html.match(/<h3/g) || []).length, 3)
  assert.match(html, />All 5 publications </)
  assert.equal(render(inHome(createElement(SelectedPublications, { data: { items: [], total: 0, lang: 'en' } }))), '')
})

const railProps = {
  identity: { name: 'Lucian Li', nick: '', nameZh: '' },
  portrait: null,
  availability: null,
  socials: [],
  nav: [],
}

test('/about rail: a Publications link with the count, named for screen readers; none without a paper', () => {
  const html = render(createElement(IdentityRail, { ...railProps, publicationCount: 3 } as never))
  const link = /<a([^>]*)href="\/publications"([^>]*)>([\s\S]*?)<\/a>/.exec(html)
  assert.ok(link, 'the link renders')
  assert.match(`${link[1]} ${link[2]}`, /aria-label="Publications: 3 papers"/, 'one accessible name, starting with the visible label')
  assert.match(link[3], /^Publications<span[^>]*aria-hidden="true"[^>]*>3<\/span><span class="nudge" aria-hidden="true">→<\/span>$/)
  const one = render(createElement(IdentityRail, { ...railProps, publicationCount: 1 } as never))
  assert.match(one, /aria-label="Publications: 1 paper"/)
  const none = render(createElement(IdentityRail, { ...railProps, publicationCount: 0 } as never))
  assert.ok(!none.includes('href="/publications"'))
  assert.ok(!render(createElement(IdentityRail, railProps as never)).includes('/publications'))
})
