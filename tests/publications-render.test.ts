/**
 * Publications rendered to HTML (A4 sheet section, /cv Reading view, the web
 * item of /publications): what a visitor gets — and never a hidden value.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { publicSections } from '../lib/cvVisibility'
import { formatCitationParts, ownerNamesFromSections, publicPublications } from '../lib/publications'

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

const { default: PublicationsSection } = await import('../components/CVViewerPage/Publications')
const { default: ReadingPublications } = await import('../components/Publications/ReadingPublications')
const { default: PublicationItem } = await import('../components/Publications/PublicationItem')

const SECRET = 'ZZ-HIDDEN-ZZ'
const editorDoc = [
  { sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li', nickName: 'Lucian' },
  {
    sessionName: 'publications',
    headerName: 'Publications',
    papers: [
      {
        title: 'Edge models',
        authors: ['Jane Doe', `${SECRET} Author`, 'Yanpei Li'],
        hiddenItems: { authors: [1] },
        venue: 'Journal of Tests',
        venueType: 'journal',
        status: 'accepted',
        date: '2026-02',
        volume: '3',
        pages: '1-9',
        doi: '10.5555/edge.1',
        pdfUrl: '/uploads/edge.pdf',
        codeUrl: `https://github.com/example/${SECRET}`,
        hiddenFields: ['codeUrl'],
        abstract: 'An abstract.',
        award: 'Best Paper Award',
      },
      { title: `${SECRET} paper`, status: 'published', isVisible: false },
      { title: '基于测试的研究', authors: ['李彦霈'], venue: '测试学报', venueType: 'journal', status: 'published', date: '2024' },
    ],
  },
]
const cv = publicSections(editorDoc, 'cv')
/** Static markup without Emotion's inline <style> blocks. */
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
/** The opening tag of the first <a> whose href is `href`. */
const anchorTag = (html: string, href: string) => html.match(new RegExp(`<a [^>]*href="${href.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*>`))?.[0] || ''
const section = cv.find((s) => s.sessionName === 'publications')
const owner = ownerNamesFromSections(cv)

test('A4 sheet: citation style, owner in bold, status label, DOI spelled out, abstract never printed', () => {
  const html = render(createElement(PublicationsSection, { data: section as any, lang: 'en', owner }))
  assert.ok(!html.includes(SECRET))
  assert.match(html, /id="cv-publications"/)
  assert.match(html, /id="cv-publications-0"/)
  assert.match(html, /<strong[^>]*>Yanpei Li<\/strong>/)
  assert.match(html, /Jane Doe<\/span>, <span aria-hidden="true">…<\/span><span class="sr-only">an author not shown<\/span>, <strong/)
  assert.match(html, />Accepted</)
  assert.match(html, /href="https:\/\/doi\.org\/10\.5555\/edge\.1"[^>]*>doi\.org\/10\.5555\/edge\.1</)
  assert.match(html, /<details[^>]*class="[^"]*no-print[^"]*"/, 'the abstract is screen-only')
  assert.match(html, /<cite[^>]*>Journal of Tests<\/cite>, 3, 1–9/)
  assert.match(html, /lang="zh-Hans"[^>]*>基于测试的研究/)
  assert.match(html, /Feb 2026/)
  // Published first, then accepted.
  assert.ok(html.indexOf('基于测试的研究') < html.indexOf('Edge models'))
  // Chinese labels on the Chinese CV.
  const zh = render(createElement(PublicationsSection, { data: section as any, lang: 'zh', owner }))
  assert.match(zh, />已录用</)
  assert.match(zh, />摘要</)
  assert.match(zh, /2026\.02/)
})

test('A4 sheet: the owner falls back to the sheet’s own Personal Info; no paper → nothing', () => {
  const html = render(createElement(PublicationsSection, { data: section as any, lang: 'en', sections: cv }))
  assert.match(html, /<strong[^>]*>Yanpei Li<\/strong>/)
  const empty = render(createElement(PublicationsSection, { data: { sessionName: 'publications', papers: [{ title: 'x', status: '' }] } as any }))
  assert.equal(empty, '')
})

test('Reading view and the web item: anchors, links, status, collapsed abstract, no hidden value', () => {
  const html = render(createElement(ReadingPublications, { section, lang: 'en', owner }))
  assert.ok(!html.includes(SECRET))
  assert.match(html, /data-cv-anchor="cv-publications-0"/)
  assert.match(html, /<h3[^>]*>Edge models<\/h3>/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /class="collapse" data-open="false"/, 'abstract collapsed but in the DOM')
  assert.match(anchorTag(html, '/uploads/edge.pdf'), /target="_blank"/)
  assert.match(anchorTag(html, '/uploads/edge.pdf'), /rel="noopener noreferrer"/)
  assert.doesNotMatch(html, /github\.com/)

  const [pub] = publicPublications(cv).filter((p) => p.title === 'Edge models')
  const item = render(
    createElement(PublicationItem, { pub, parts: formatCitationParts(pub, 'en', owner), lang: 'en', headingAs: 'h2', id: 'li2026edge', permalink: true, showYear: false }),
  )
  assert.match(item, /<article[^>]*id="li2026edge"[^>]*aria-labelledby="[^"]+"/)
  assert.match(item, /<h2[^>]*>Edge models<\/h2><a[^>]*href="#li2026edge"[^>]*aria-label="Link to this paper"/, 'the permalink sits outside the heading')
  assert.match(item, /doi:<\/span><span[^>]*>10\.5555\/edge\.1<\/span>/)
  assert.match(item, /\(opens in a new tab\)/)
  assert.match(item, /ACCEPTED|Accepted/)
  assert.doesNotMatch(item, /2026<\/span><\/p>/, 'no year in the venue line on /publications')
})
