/**
 * Round-5 article fixes:
 *
 *   RT-2   an image sharing its paragraph with text renders phrasing content
 *          only, and block elements (inline <Figure>, iframes, the YouTube
 *          facade, <details>) are lifted out of paragraphs — the server HTML
 *          parses back to the same tree, so it hydrates without #418/#423;
 *   UI-1   inline code wraps (inline + overflow-wrap: anywhere), code blocks
 *          keep their layout;
 *   SEC4-6 javascript: / data: URLs never leave the compiler or reach a feed;
 *   SEC4-7 only YouTube /embed/<id> and Vimeo /video/<id> player URLs embed;
 *   RT-4   RSS pubDate and JSON Feed date_published name the same instant.
 *
 * The components are .tsx; a test-local loader transpiles them with the
 * project's TypeScript (JSX → react/jsx-runtime) so they run under node:test.
 */
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fromHtml } from 'hast-util-from-html'
import { compileMdx } from '../lib/mdx'
import { isElement, walk, type HastNode } from '../lib/rehype/hast'
import { embedSrc, mapJsxElement } from '../lib/rehype/stripMdxExpressions'
import { safeLinkHref, safeMediaSrc, safeSrcSet } from '../lib/rehype/safeUrls'
import rehypeImages from '../lib/rehype/images'

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

const SITE = 'https://lucian-dev.com'
const noImages = { lang: 'en', resolveSize: () => null, srcSetFor: () => null }
const sized = { lang: 'en', resolveSize: () => ({ width: 800, height: 500 }), srcSetFor: () => null }

function find(tree: unknown, test: (n: HastNode) => boolean): HastNode[] {
  const out: HastNode[] = []
  walk(tree as HastNode, (n) => {
    if (test(n)) out.push(n)
  })
  return out
}
const tags = (tree: unknown, tag: string) => find(tree, (n) => isElement(n, tag))

/** Static markup of a compiled body, with and without Emotion's <style> tags. */
async function render(body: string, opts: Parameters<typeof compileMdx>[1] = sized) {
  const { tree } = await compileMdx(body, opts)
  const { default: MDXContent } = await import('../components/MDX/MDXContent')
  const raw = renderToStaticMarkup(createElement(MDXContent, { tree, as: 'div' }))
  return { tree, raw, html: raw.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '') }
}

/** Every `<p …>…</p>` of the markup (paragraphs never nest, so the first </p> closes it). */
const paragraphs = (html: string): string[] => Array.from(html.match(/<p[\s>][\s\S]*?<\/p>/g) || [], String)

const BLOCK_IN_P = /<(div|figure|figcaption|section|details|summary|ul|ol|table|pre|blockquote|p)[\s>]/

/** Markup an HTML parser keeps as-is: no block start tag inside any paragraph, same <p> count after parsing. */
function assertParagraphsHold(html: string) {
  for (const p of paragraphs(html)) assert.ok(!BLOCK_IN_P.test(p.slice(2)), `block element inside a paragraph: ${p.slice(0, 200)}`)
  // Parse it like the browser does: a block start tag would close the open <p>.
  const parsed = fromHtml(html, { fragment: true }) as unknown as HastNode
  const parsedPs = find(parsed, (n) => isElement(n, 'p'))
  assert.equal(parsedPs.length, (html.match(/<p[\s>]/g) || []).length, 'the parser opened or closed no extra paragraphs')
}

// ── RT-2: valid paragraphs ────────────────────────────────────────────────

test('RT-2: an image followed by text in one paragraph renders phrasing content only', async () => {
  // The /blog/ydc-award shape.
  const { html } = await render('![1755661280418.jpg](/uploads/1780041073786-1755661280418.jpg)(Ref: [https://www.linkedin.com/posts/x](https://www.linkedin.com/posts/x))')
  const ps = paragraphs(html)
  assert.equal(ps.length, 1)
  assert.match(ps[0], /<img[^>]*src="\/uploads\/1780041073786-1755661280418\.jpg"/)
  assert.match(ps[0], /\(Ref: /)
  assert.ok(!/<div[\s>]/.test(ps[0]), 'no <div> between <p> and </p>')
  assert.ok(!/<figure[\s>]|<figcaption[\s>]/.test(ps[0]), 'no figure / figcaption inside the paragraph')
  assertParagraphsHold(html)
  // The parsed DOM keeps the image and the text in the same paragraph.
  const parsed = fromHtml(html, { fragment: true }) as unknown as HastNode
  const p = find(parsed, (n) => isElement(n, 'p'))[0]
  assert.equal(tags(p, 'img').length, 1)
})

test('RT-2: unknown-size and linked images in a paragraph stay valid too', async () => {
  const { html: unknown } = await render('Before ![x](/a.png) after', noImages)
  assertParagraphsHold(unknown)
  assert.equal(paragraphs(unknown).length, 1)
  assert.match(paragraphs(unknown)[0], /Before <span[^>]*><span[^>]*><img[^>]*src="\/a\.png"[^>]*><\/span><\/span> after/)
  const { html: linked } = await render('See [![badge](/b.png)](https://example.com) here')
  assertParagraphsHold(linked)
  assert.match(paragraphs(linked)[0], /<a[^>]*href="https:\/\/example\.com"[^>]*>[\s\S]*<img/)
})

test('RT-2: block-level JSX inside a paragraph is lifted out (figure, iframe, YouTube, details)', async () => {
  const body = [
    'Text <Figure src="/a.png" caption="Cap" /> more',
    '',
    '*T <iframe src="https://www.youtube.com/embed/jkAqK3vqILI" title="Talk" /> u* v',
    '',
    '<YouTube id="jkAqK3vqILI" title="Demo" />(source)',
    '',
    'Q <details><summary>S</summary>D</details> R',
  ].join('\n')
  const { tree, html } = await render(body)
  // In the tree: no block element has a <p> ancestor.
  walk(tree as unknown as HastNode, (n) => {
    if (!isElement(n, 'p')) return
    for (const tag of ['figure', 'figcaption', 'iframe', 'youtube-embed', 'details', 'summary']) assert.equal(tags(n, tag).length, 0, `<${tag}> inside <p>`)
  })
  const top = (tree.children as HastNode[]).filter((n) => n.type === 'element').map((n) => n.tagName)
  assert.deepEqual(top, ['p', 'figure', 'p', 'p', 'iframe', 'p', 'youtube-embed', 'p', 'p', 'details', 'p'])
  // The emphasis is split with the paragraph; nothing is lost.
  assert.match(html, /<p[^>]*><em>T <\/em><\/p>/)
  assert.match(html, /<p[^>]*><em> u<\/em> v<\/p>/)
  assert.match(html, /<figcaption[^>]*>Cap<\/figcaption>/)
  assert.match(html, /\(source\)/)
  assertParagraphsHold(html)
})

test('RT-2: a <Figure> inside a link becomes the linked image (the link survives)', async () => {
  const { tree, html } = await render('[<Figure src="/b.png" alt="B" caption="c" />](https://x.com) after')
  assert.equal(tags(tree, 'figure').length, 0)
  const a = tags(tree, 'a')[0]
  assert.equal(a.properties?.href, 'https://x.com')
  assert.equal(tags(a, 'img')[0].properties?.src, '/b.png')
  assertParagraphsHold(html)
})

test('RT-2: lone images still become captioned figures in place of their paragraph', async () => {
  const { tree, html } = await render('![A chart of latency](/images/x.png)\n\nNext paragraph.')
  assert.equal(tree.children[0].type === 'element' && tree.children[0].tagName, 'figure')
  assert.match(html, /<figure[^>]*class="[^"]*article-figure[^"]*"[^>]*><span[^>]*><span[^>]*><img/)
  assert.match(html, /<figcaption[^>]*>A chart of latency<\/figcaption>/)
  assertParagraphsHold(html)
})

// ── UI-1: inline code wraps ───────────────────────────────────────────────

test('UI-1: inline code is inline with overflow-wrap:anywhere; code blocks are unchanged', async () => {
  const { raw } = await render('Edit `components/Admin/CVEditorStudio.tsx` here.\n\n```\nplain block\n```\n\n```ts\nconst a = 1\n```')
  const css = (raw.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n')
  const rulesFor = (cls: string) => (css.match(new RegExp(`\\.${cls}\\{[^}]*\\}`, 'g')) || []).join('')
  const codeClass = (re: RegExp) => {
    const m = re.exec(raw)
    assert.ok(m, `code element ${re}`)
    const cls = /class="[^"]*\b(css-[a-z0-9]+)/.exec(m[0])
    assert.ok(cls, 'emotion class on the code element')
    return rulesFor(cls[1])
  }
  const inline = codeClass(/<code[^>]*>components\/Admin\/CVEditorStudio\.tsx<\/code>/)
  assert.match(inline, /display:inline;/)
  assert.match(inline, /overflow-wrap:anywhere/)
  assert.match(inline, /word-break:break-word/)
  assert.match(inline, /box-decoration-break:clone/)
  // Code blocks keep Chakra's inline-block code (the highlighted one also has display:grid inline).
  for (const block of [codeClass(/<code[^>]*>plain block/), codeClass(/<code[^>]*data-language="ts"[^>]*>/)]) {
    assert.match(block, /display:inline-block/)
    assert.ok(!/overflow-wrap:anywhere/.test(block), 'block code is not affected')
  }
})

// ── SEC4-6: safe URLs at compile time and in feeds ────────────────────────

const URL_FIXTURE = [
  '## Section',
  '',
  'A [bad link](javascript:alert(1)), a [data link](data:text/html,x), a [relative](/blog/hello), a [jump](#section) and a note[^1].',
  '',
  '![svg](data:image/svg+xml,abc)',
  '',
  'Inline ![svg](data:image/svg+xml,abc) image and ![cdn](//cdn.example.com/a.png).',
  '',
  '<img src="data:image/svg+xml,abc" />',
  '',
  '<Figure src="data:image/svg+xml,abc" caption="Gone" />',
  '',
  '[^1]: The note.',
].join('\n')

test('SEC4-6: the compiled tree carries no javascript: / data: URL; fragments and relative links survive', async () => {
  const { tree } = await compileMdx(URL_FIXTURE, noImages)
  const json = JSON.stringify(tree)
  assert.ok(!/javascript:/i.test(json), 'no javascript: URL')
  assert.ok(!/data:/i.test(json), 'no data: URL')
  // Refused links are unwrapped: their text stays.
  const p = tags(tree, 'p')[0]
  assert.match(JSON.stringify(p), /"bad link"/)
  assert.match(JSON.stringify(p), /"data link"/)
  const hrefs = tags(tree, 'a').map((a) => a.properties?.href)
  assert.ok(hrefs.includes('/blog/hello'), 'relative /blog link kept')
  assert.ok(hrefs.includes('#section'), 'in-page fragment kept')
  assert.ok(hrefs.includes('#user-content-fn-1'), 'footnote reference kept')
  assert.ok(hrefs.includes('#user-content-fnref-1'), 'footnote back-reference kept')
  assert.ok(hrefs.includes('#section') && tags(tree, 'h2').some((h) => tags(h, 'a')[0]?.properties?.href === '#section'), 'heading anchor kept')
  // Refused images are dropped (no empty paragraph / figure left); //host becomes https.
  const srcs = tags(tree, 'img').map((i) => i.properties?.src)
  assert.deepEqual(srcs, ['https://cdn.example.com/a.png'])
  assert.equal(tags(tree, 'figure').length, 0)
  assert.ok(!json.includes('Gone'))
  assert.ok(tags(tree, 'p').every((n) => (n.children || []).some((c) => c.type !== 'text' || (c.value || '').trim())), 'no empty paragraph')
})

test('SEC4-6: feed HTML resolves relative links and never emits javascript: / data: URLs', async () => {
  const { renderFeedHtml } = await import('../lib/feedHtml')
  const { tree } = await compileMdx(URL_FIXTURE, noImages)
  const html = renderFeedHtml(tree, { site: SITE, pageUrl: `${SITE}/blog/x` })
  assert.ok(!/javascript:|data:/i.test(html))
  assert.match(html, /href="https:\/\/lucian-dev\.com\/blog\/hello"/)
  assert.match(html, /href="https:\/\/lucian-dev\.com\/blog\/x#section"/)
  assert.match(html, /href="https:\/\/lucian-dev\.com\/blog\/x#user-content-fn-1"/)
  assert.match(html, /src="https:\/\/cdn\.example\.com\/a\.png"/)
  assert.match(html, /bad link/)

  // Defence in depth: a tree that never went through the compiler.
  const raw = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [
          { type: 'element', tagName: 'a', properties: { href: 'javascript:alert(1)' }, children: [{ type: 'text', value: 'click' }] },
          { type: 'element', tagName: 'a', properties: { href: ' JaVaScRiPt:alert(1)' }, children: [{ type: 'text', value: 'again' }] },
          { type: 'element', tagName: 'img', properties: { src: 'data:image/svg+xml,abc', alt: 'x' }, children: [] },
          { type: 'element', tagName: 'img', properties: { src: '/uploads/a.png', alt: 'ok' }, children: [] },
          { type: 'element', tagName: 'a', properties: { href: '/work/y' }, children: [{ type: 'text', value: 'work' }] },
        ],
      },
      { type: 'element', tagName: 'iframe', properties: { src: 'javascript:alert(1)', title: 'bad' }, children: [] },
    ],
  }
  const out = renderFeedHtml(raw as never, SITE)
  assert.ok(!/javascript:|data:/i.test(out), out)
  assert.match(out, /<p>clickagain<img src="https:\/\/lucian-dev\.com\/uploads\/a\.png" alt="ok"><a href="https:\/\/lucian-dev\.com\/work\/y">work<\/a><\/p>/)
  assert.ok(!out.includes('Watch bad'))
})

test('SEC4-6: URL rules — links, media sources and srcset entries', async () => {
  assert.equal(safeLinkHref('#section'), '#section')
  assert.equal(safeLinkHref('/blog/hello'), '/blog/hello')
  assert.equal(safeLinkHref('https://x.com'), 'https://x.com')
  assert.equal(safeLinkHref('mailto:a@b.co'), 'mailto:a@b.co')
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com', '/\\evil.com', '/\t/evil.com', '', 42]) assert.equal(safeLinkHref(bad), '', String(bad))
  assert.equal(safeMediaSrc('/uploads/a.png'), '/uploads/a.png')
  assert.equal(safeMediaSrc('https://cdn.x/a.png'), 'https://cdn.x/a.png')
  assert.equal(safeMediaSrc('//cdn.example.com/a.png'), 'https://cdn.example.com/a.png')
  for (const bad of ['data:image/png;base64,AAAA', 'javascript:x', 'blob:https://x/1', 'a.png', '#x', 'mailto:a@b.co', '//']) assert.equal(safeMediaSrc(bad), '', bad)
  assert.equal(safeSrcSet('/a.w640.webp 640w, /a.png 800w'), '/a.w640.webp 640w, /a.png 800w')
  assert.equal(safeSrcSet('data:image/png;base64,AA,BB 1x, /a.png 2x'), '/a.png 2x')
  assert.equal(safeSrcSet('/a.png onerror=x, /b.png 1x'), '/b.png 1x')
  assert.equal(safeSrcSet('javascript:x 1x'), '')
  // The images plugin filters a resolver's srcset the same way.
  const img: HastNode = { type: 'element', tagName: 'img', properties: { src: '/a.png', alt: '' }, children: [] }
  await rehypeImages({ srcSetFor: () => 'data:image/png;base64,AA 1x, /a.w640.webp 640w' })({ type: 'root', children: [img] })
  assert.equal(img.properties?.srcSet, '/a.w640.webp 640w')
})

// ── SEC4-7: embed allow-list ──────────────────────────────────────────────

test('SEC4-7: only player URLs embed; the src is rebuilt from the id and allowed parameters', () => {
  assert.equal(embedSrc('https://www.youtube-nocookie.com/embed/jkAqK3vqILI'), 'https://www.youtube-nocookie.com/embed/jkAqK3vqILI')
  assert.equal(embedSrc('https://youtube-nocookie.com/embed/jkAqK3vqILI'), 'https://www.youtube-nocookie.com/embed/jkAqK3vqILI')
  assert.equal(embedSrc('https://youtube.com/embed/jkAqK3vqILI?si=abc_D-1&start=30'), 'https://www.youtube.com/embed/jkAqK3vqILI?start=30&si=abc_D-1')
  assert.equal(embedSrc('https://www.youtube.com/embed/jkAqK3vqILI?start=30&onload=x&origin=https://evil'), 'https://www.youtube.com/embed/jkAqK3vqILI?start=30')
  assert.equal(embedSrc('https://player.vimeo.com/video/123456?h=abc123&badge=0&app_id=58479'), 'https://player.vimeo.com/video/123456?h=abc123&badge=0&app_id=58479')
  assert.equal(embedSrc('https://player.vimeo.com/video/1'), 'https://player.vimeo.com/video/1')
  for (const bad of [
    'https://www.youtube.com/redirect?q=https://evil.example',
    'https://www.youtube.com/watch?v=jkAqK3vqILI',
    'https://www.youtube.com/embed/short',
    'https://www.youtube.com/embed/jkAqK3vqILI/../../redirect',
    'https://www.youtube.com/embed/jkAqK3vqILI?start=1"onload="x',
    'https://www.youtube.com/embed/jkAqK3vqILI#t=1',
    'https://youtube.com.evil.example/embed/jkAqK3vqILI',
    'http://www.youtube.com/embed/jkAqK3vqILI',
    'https://player.vimeo.com/api/player.js',
    'https://player.vimeo.com/video/abc',
    'https://vimeo.com/123',
  ]) {
    assert.equal(embedSrc(bad), null, bad)
    assert.equal(mapJsxElement('iframe', { src: bad }), null, bad)
  }
  assert.equal(mapJsxElement('iframe', { src: ' https://youtube.com/embed/jkAqK3vqILI?t=1m2s ' })?.hProperties.src, 'https://www.youtube.com/embed/jkAqK3vqILI?t=1m2s')
})

test('SEC4-7: compiled iframes use the rebuilt player URL; others never reach the tree', async () => {
  const body = [
    '<iframe src="https://www.youtube.com/embed/jkAqK3vqILI?start=5&evil=1" title="Talk" />',
    '',
    '<iframe src="https://www.youtube.com/redirect?q=https://evil.example" title="nope" />',
  ].join('\n')
  const { tree } = await compileMdx(body, noImages)
  const frames = tags(tree, 'iframe')
  assert.equal(frames.length, 1)
  assert.equal(frames[0].properties?.src, 'https://www.youtube.com/embed/jkAqK3vqILI?start=5')
  assert.ok(!JSON.stringify(tree).includes('redirect'))
})

// ── RT-4: feed dates agree ────────────────────────────────────────────────

test('RT-4: RSS pubDate and JSON Feed date_published are the same instant', async () => {
  const { buildRss, buildJsonFeed } = await import('../lib/feedHtml')
  const item = (url: string, published: string) => ({ url, title: url, html: '<p>x</p>', lang: 'en', published, modified: published, tags: [] })
  const items = [
    item(`${SITE}/blog/day`, '2026-05-30'),
    item(`${SITE}/work/stamp`, '2026-06-01T10:11:12.000Z'),
    item(`${SITE}/blog/offset`, '2026-06-02T09:00:00+08:00'),
  ]
  const xml = buildRss({ title: 't', link: SITE, selfUrl: `${SITE}/feed.xml`, description: 'd' }, items)
  const json = buildJsonFeed(SITE, items)
  const pubDates = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => m[1])
  assert.equal(pubDates.length, 3)
  for (const [i, pub] of pubDates.entries()) {
    assert.equal(Date.parse(pub), Date.parse(json.items[i].date_published!), `${items[i].url}: ${pub} vs ${json.items[i].date_published}`)
  }
  // A bare day is midnight in the site's zone (+08:00), not UTC midnight.
  assert.equal(pubDates[0], 'Fri, 29 May 2026 16:00:00 GMT')
  // Full timestamps are kept, not truncated to the day.
  assert.equal(pubDates[1], 'Mon, 01 Jun 2026 10:11:12 GMT')
  assert.equal(pubDates[2], 'Tue, 02 Jun 2026 01:00:00 GMT')
  assert.match(xml, /<lastBuildDate>Tue, 02 Jun 2026 01:00:00 GMT<\/lastBuildDate>/)
})
