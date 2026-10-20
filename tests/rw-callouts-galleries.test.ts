/**
 * reading-work D4 + D5: GitHub-style callouts with labels in the article's
 * language, wide / full figures, footnote and details styling hooks, and
 * galleries for consecutive images (rows by shape, merged captions,
 * lightbox captions, flat feeds).
 */
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compileMdx, excerptOf } from '../lib/mdx'
import { calloutLabel } from '../lib/rehype/alerts'
import { figureWidthOfSrc, galleryRows, withWidthFragment } from '../lib/rehype/galleries'
import { classList, collectImages, isElement, textOf, walk, type HastNode } from '../lib/rehype/hast'
import { renderFeedHtml } from '../lib/feedHtml'
import { rawSnippet, filterSlashItems } from '../components/Admin/editor/slashItems'

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

type El = HastNode & { tagName: string; properties: Record<string, unknown>; children: HastNode[] }
const html = (el: unknown) => renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

function all(tree: unknown, test: (n: HastNode) => boolean): El[] {
  const out: El[] = []
  walk(tree as HastNode, (n) => {
    if (test(n)) out.push(n as El)
  })
  return out
}
const byClass = (tree: unknown, cls: string) => all(tree, (n) => isElement(n) && classList(n).includes(cls))

/** Sizes by file name: l* landscape 1600×900, p* portrait 900×1600, s* phone screenshot 590×1280. */
const sizes = (src: string) => {
  const name = src.split('/').pop() || ''
  if (name.startsWith('l')) return { width: 1600, height: 900 }
  if (name.startsWith('p')) return { width: 900, height: 1600 }
  if (name.startsWith('s')) return { width: 590, height: 1280 }
  return null
}
const compile = (body: string, lang = 'en') => compileMdx(body, { lang, resolveSize: sizes, srcSetFor: () => null, posterFor: () => null })

test('D4 callouts: GitHub alert quotes become labelled notes; ordinary quotes stay quotes', async () => {
  const { tree } = await compile(
    ['> [!NOTE]', '> Useful context.', '', '> \\[!WARNING\\] Joined by the visual editor.', '', '> [!tip]', '>', '> Second paragraph.', '', '> [!UNKNOWN] text', '', '> A plain quote.'].join('\n'),
  )
  const callouts = byClass(tree, 'callout')
  assert.deepEqual(
    callouts.map((c) => [c.properties.dataCallout, c.properties.dataCalloutLabel, c.properties.role]),
    [
      ['note', 'Note', 'note'],
      ['warning', 'Warning', 'note'],
      ['tip', 'Tip', 'note'],
    ],
  )
  assert.equal(textOf(callouts[0]).trim(), 'Useful context.')
  assert.equal(textOf(callouts[1]).trim(), 'Joined by the visual editor.')
  assert.equal(callouts[2].children.filter((c) => isElement(c, 'p')).length, 1, 'the marker-only paragraph is gone')
  const quotes = all(tree, (n) => isElement(n, 'blockquote'))
  assert.equal(quotes.length, 2)
  assert.match(textOf(quotes[0]), /\[!UNKNOWN\] text/)
  assert.ok(!all(tree, (n) => n.type === 'text' && /\[!(NOTE|WARNING|TIP)\]/i.test(n.value || '')).length, 'markers removed')
})

test('D4 callout labels follow the article language', async () => {
  assert.equal(calloutLabel('note', 'zh-Hans'), '备注')
  assert.equal(calloutLabel('caution', 'zh-Hant'), '注意')
  assert.equal(calloutLabel('note', 'zh-TW'), '備註')
  assert.equal(calloutLabel('important', 'en-GB'), 'Important')
  const { tree } = await compile('> [!IMPORTANT]\n> 这一点很重要。', 'zh-Hans')
  assert.equal(byClass(tree, 'callout')[0].properties.dataCalloutLabel, '重要')
})

test('D4 callouts render as role="note" with an icon and label, are skipped by the excerpt, and feeds get a labelled quote', async () => {
  const { tree } = await compile('> [!CAUTION]\n> Mains voltage inside the enclosure.\n\nThe first real paragraph of the article is this one.')
  assert.equal(excerptOf(tree), 'The first real paragraph of the article is this one.')
  const { default: MDXContent } = await import('../components/MDX/MDXContent')
  const out = html(createElement(MDXContent, { tree, as: 'div' }))
  assert.match(out, /<div[^>]*role="note"[^>]*data-callout="caution"|<div[^>]*data-callout="caution"[^>]*role="note"/)
  assert.match(out, /<svg[^>]*aria-hidden="true"/)
  assert.match(out, /<span>Caution<\/span>/)
  const feed = renderFeedHtml(tree, 'https://lucian-dev.com')
  assert.match(feed, /<blockquote><p><strong>Caution:<\/strong><\/p>\s*<p>Mains voltage inside the enclosure\.<\/p>\s*<\/blockquote>/)
  assert.ok(!feed.includes('data-callout'))
})

test('D4 wide and full figures: #wide / #full on the image, or size="…" on <Figure>; the fragment leaves the src; they never join a gallery', async () => {
  const { tree } = await compile(
    ['![A wide photo](/uploads/lphoto.jpg#wide)', '', '<Figure src="/uploads/lbig.jpg" alt="Full" caption="Full width" size="full" />', '', 'Inline ![icon](/uploads/picon.png#full) in text.', '', '<Figure src="/uploads/lx.jpg" alt="x" size="giant" />'].join('\n'),
  )
  const figures = all(tree, (n) => isElement(n, 'figure'))
  assert.deepEqual(
    figures.map((f) => f.properties.dataWidth ?? null),
    ['wide', 'full', null],
  )
  const srcs = all(tree, (n) => isElement(n, 'img')).map((i) => i.properties.src)
  assert.deepEqual(srcs, ['/uploads/lphoto.jpg', '/uploads/lbig.jpg', '/uploads/picon.png', '/uploads/lx.jpg'])
  assert.equal(figureWidthOfSrc('/uploads/a.png#WIDE'), 'wide')
  assert.equal(figureWidthOfSrc('/uploads/a.png'), null)
  assert.equal(withWidthFragment('/uploads/a.png#wide', 'full'), '/uploads/a.png#full')
  assert.equal(withWidthFragment('/uploads/a.png#full', null), '/uploads/a.png')
  const { default: MDXContent } = await import('../components/MDX/MDXContent')
  const out = html(createElement(MDXContent, { tree, as: 'div' }))
  assert.match(out, /<figure[^>]*data-width="wide"/)
  assert.match(out, /<figure[^>]*data-width="full"/)
  assert.match(out, /class="[^"]*article-measure/, 'the column is an inline-size container')
})

test('D5 galleryRows: landscape alone, portraits in pairs, an odd one joins the previous pair', () => {
  assert.deepEqual(galleryRows([0.5, 0.5, 0.5]), [[0, 1, 2]])
  assert.deepEqual(galleryRows([0.7, 0.7, 0.7, 0.7]), [
    [0, 1],
    [2, 3],
  ])
  assert.deepEqual(galleryRows([0.7, 0.7, 0.7, 0.7, 0.7]), [
    [0, 1],
    [2, 3, 4],
  ])
  assert.deepEqual(galleryRows([1.6, 0.7, 0.7, 0.7, 1.6]), [[0], [1, 2, 3], [4]])
  assert.deepEqual(galleryRows([1.6, 0.7, 1.6]), [[0], [1], [2]])
  assert.deepEqual(galleryRows([1, 1]), [[0, 1]], 'squares pair up')
})

test('D5 consecutive images become one gallery with ratio cells; same captions merge; the lightbox keeps every caption', async () => {
  const { tree } = await compile(
    ['![Car Boy 产品页面](/uploads/s1.png)', '', '![Car Boy 产品页面](/uploads/s2.png)', '', '![Car Boy 产品页面](/uploads/s3.png)', '', 'After the gallery.'].join('\n'),
  )
  const [gallery] = byClass(tree, 'article-gallery')
  assert.ok(gallery, 'a gallery')
  const rows = byClass(gallery, 'gallery-row')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].properties.dataCount, 3)
  const cells = rows[0].children.filter((c) => isElement(c, 'figure')) as El[]
  assert.deepEqual(
    cells.map((c) => c.properties.dataRatio),
    [0.461, 0.461, 0.461],
  )
  assert.equal(all(gallery, (n) => isElement(n, 'figcaption')).length, 1, 'one shared caption')
  assert.equal(textOf(gallery.children[gallery.children.length - 1]), 'Car Boy 产品页面')
  assert.deepEqual(
    collectImages(tree).map((i) => i.caption),
    ['Car Boy 产品页面', 'Car Boy 产品页面', 'Car Boy 产品页面'],
  )
})

test('D5 images on consecutive lines (one paragraph) also form a gallery; different captions stay per image; one image is never a gallery', async () => {
  const { tree } = await compile(['![First](/uploads/l1.jpg)', '![Second](/uploads/p2.jpg)', '![Third](/uploads/p3.jpg)', '', 'Some text.', '', '![Alone](/uploads/l4.jpg)'].join('\n'))
  const galleries = byClass(tree, 'article-gallery')
  assert.equal(galleries.length, 1)
  const rows = byClass(galleries[0], 'gallery-row')
  assert.deepEqual(
    rows.map((r) => r.properties.dataCount),
    [1, 2],
  )
  assert.deepEqual(
    all(galleries[0], (n) => isElement(n, 'figcaption')).map((c) => textOf(c)),
    ['First', 'Second', 'Third'],
  )
  assert.equal(
    all(tree, (n) => isElement(n, 'figure') && classList(n).includes('article-figure') && !n.properties?.dataRatio).length,
    1,
    'the lone image stays a plain figure',
  )
})

test('D5 galleries render as flex rows and reach feeds as a flat list of figures', async () => {
  const { tree } = await compile(['![Same](/uploads/p1.jpg)', '', '![Same](/uploads/p2.jpg)'].join('\n'))
  const { default: MDXContent } = await import('../components/MDX/MDXContent')
  const out = html(createElement(MDXContent, { tree, as: 'div' }))
  assert.match(out, /<figure[^>]*class="[^"]*article-gallery/)
  assert.equal((out.match(/style="flex:0\.563 1 0%"/g) || []).length, 2)
  const feed = renderFeedHtml(tree, 'https://lucian-dev.com')
  assert.ok(!feed.includes('gallery'))
  assert.equal((feed.match(/<figure/g) || []).length, 2)
  assert.match(feed, /<p><em>Same<\/em><\/p>/)
})

test('D4 slash menu inserts callouts and the case-study outline', () => {
  assert.equal(rawSnippet('note'), '> [!NOTE]\n> |')
  assert.equal(rawSnippet('warning'), '> [!WARNING]\n> |')
  const outline = rawSnippet('outline')
  assert.match(outline, /^## The problem\n\n\{\/\* Case-study template: /)
  assert.equal((outline.match(/\|/g) || []).length, 1, 'one caret marker')
  assert.match(outline, /## What I learned/)
  // editor-parity (H2): every callout type the site renders has a command.
  assert.equal(filterSlashItems('callout').slice(0, 5).map((i) => i.id).sort().join(','), 'caution,important,note,tip,warning')
})

test('D4 the visual editor keeps callouts and image widths: its Markdown compiles back to a callout and a wide figure', async () => {
  const { Editor } = await import('@tiptap/core')
  const { baseExtensions } = await import('../components/Admin/editor/extensions')
  const editor = new Editor({
    element: undefined,
    extensions: baseExtensions(),
    content: {
      type: 'doc',
      content: [
        // editor-parity (H2): a callout is a node of its own, written as the GitHub alert.
        { type: 'callout', attrs: { type: 'tip' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep the servo on its own supply.' }] }] },
        // A quote that merely starts with the marker text still reads as a callout.
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[!WARNING] Mains voltage.' }] }] },
        { type: 'image', attrs: { src: '/uploads/lrig.jpg#wide', alt: 'The test rig' } },
      ],
    },
  })
  let md = ''
  try {
    md = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown()
  } finally {
    editor.destroy()
  }
  assert.match(md, /^> \[!TIP\]\n> Keep the servo/, 'the alert marker on its own line, unescaped')
  assert.match(md, /!\[The test rig\]\(\/uploads\/lrig\.jpg#wide\)/)
  const { tree } = await compile(md)
  const callouts = byClass(tree, 'callout')
  assert.deepEqual(
    callouts.map((c) => c.properties.dataCallout),
    ['tip', 'warning'],
  )
  assert.equal(textOf(callouts[0]).trim(), 'Keep the servo on its own supply.')
  assert.equal(all(tree, (n) => isElement(n, 'figure'))[0]?.properties.dataWidth, 'wide')
})

test('D4 callout markers stay out of the search text', async () => {
  const { outlineOf } = await import('../lib/searchIndex')
  assert.equal(outlineOf('> [!NOTE]\n> Keep the servo powered.\n\nPlain [!tip] words.').text, 'Keep the servo powered. Plain words.')
})
