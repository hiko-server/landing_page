/**
 * Rendered markup of the article components (static server render):
 * ArticleNav's related links carry no role="group" (it would rename the
 * link), MetaGrid is a real description list, and MDXContent renders a
 * compiled tree — figures, the YouTube facade, allowed iframes, code with a
 * copy button — without evaluating anything.
 *
 * The components are .tsx; a test-local loader transpiles them with the
 * project's TypeScript (JSX → react/jsx-runtime) so they run under node:test.
 */
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

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

/** Static markup without Emotion's inline <style> tags. */
const html = (el: unknown) =>
  renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

test('ArticleNav: related links use data-group, never role="group"; pager links carry rel', async () => {
  const { default: ArticleNav } = await import('../components/Article/ArticleNav')
  const item = (slug: string, kind: 'blog' | 'work' = 'blog') => ({
    kind,
    slug,
    title: `Title ${slug}`,
    permalink: `/${kind}/${slug}`,
    description: 'About it',
    meta: '2026-05-30',
    lang: 'en',
    tags: ['x'],
  })
  const out = html(
    createElement(ArticleNav, {
      before: { label: 'Newer', item: item('a') },
      after: { label: 'Older', item: item('b') },
      related: [item('c'), item('d', 'work')],
    }),
  )
  assert.ok(!/role="group"/.test(out), 'no role="group" anywhere')
  assert.equal((out.match(/data-group=""/g) || []).length, 2)
  assert.match(out, /<a[^>]*rel="prev"[^>]*href="\/blog\/a"|<a[^>]*href="\/blog\/a"[^>]*rel="prev"/)
  assert.match(out, /rel="next"/)
})

test('MetaGrid renders a <dl> of dt/dd pairs and skips empty values', async () => {
  const { default: MetaGrid, MetaChips } = await import('../components/Article/MetaGrid')
  const out = html(
    createElement(MetaGrid, {
      items: [
        { label: 'Role', value: 'Main developer' },
        { label: 'Timeline', value: null },
        { label: 'Stack', value: createElement(MetaChips, { items: ['Next.js', '机器学习'], label: 'Stack' }), wide: true },
      ],
    }),
  )
  assert.match(out, /^<dl[\s>]/)
  assert.equal((out.match(/<dt[\s>]/g) || []).length, 2)
  assert.equal((out.match(/<dd[\s>]/g) || []).length, 2)
  assert.ok(!out.includes('Timeline'))
  assert.match(out, /<ul[^>]*aria-label="Stack"/)
  assert.match(out, /<li[^>]*lang="zh-Hans"[^>]*>机器学习<\/li>/)
})

test('MDXContent renders a compiled tree: figure, YouTube facade, iframe frame, code + copy button', async () => {
  const { compileMdx } = await import('../lib/mdx')
  const { default: MDXContent } = await import('../components/MDX/MDXContent')
  const body = [
    '## Overview',
    '',
    'Some text with a [link](https://example.com) and `code`.',
    '',
    '![A chart of latency](/images/x.png)',
    '',
    '<YouTube id="jkAqK3vqILI" title="Demo run" />',
    '',
    '<iframe src="https://player.vimeo.com/video/1" title="Vimeo demo" />',
    '',
    '```ts',
    'const a = 1',
    'const b = 2',
    '```',
  ].join('\n')
  const { tree } = await compileMdx(body, { lang: 'en', resolveSize: () => ({ width: 800, height: 500 }), srcSetFor: () => null })
  const out = html(createElement(MDXContent, { tree, as: 'div' }))
  assert.match(out, /<h2[^>]*id="overview"/)
  assert.match(out, /<figure[^>]*class="[^"]*article-figure/)
  assert.match(out, /<img[^>]*width="800"[^>]*height="500"|<img[^>]*height="500"[^>]*width="800"/)
  assert.match(out, /<figcaption[^>]*>A chart of latency<\/figcaption>/)
  // Facade: a labelled button, no player frame yet, and no thumbnail from
  // YouTube (posters are copies in /uploads — reading-work D3).
  assert.match(out, /<button[^>]*aria-label="Play video: Demo run"/)
  assert.ok(!out.includes('ytimg.com'))
  assert.ok(!out.includes('youtube-nocookie.com/embed/jkAqK3vqILI'))
  assert.match(out, /<iframe[^>]*src="https:\/\/player\.vimeo\.com\/video\/1"/)
  assert.match(out, /aria-label="Copy code"/)
  // No zoom buttons on the server (they are added after mount).
  assert.ok(!out.includes('Enlarge image'))
})

test('the article prose column uses the prose token and the 68ch measure', async () => {
  const { default: MDXContent } = await import('../components/MDX/MDXContent')
  const out = html(createElement(MDXContent, { tree: { type: 'root', children: [{ type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: 'Hi' }] }] } }))
  assert.match(out, /<article[^>]*class="[^"]*article-prose/)
  assert.match(out, /<p[^>]*>Hi<\/p>/)
})

test('CodeBlock copies exactly the code text (newlines kept, no label)', async () => {
  const { codeText } = await import('../components/MDX/CodeBlock')
  const code = createElement(
    'code',
    null,
    createElement('span', { 'data-line': '' }, createElement('span', null, 'const'), ' a = 1'),
    '\n',
    createElement('span', { 'data-line': '' }, 'b()'),
  )
  assert.equal(codeText(code), 'const a = 1\nb()')
  assert.equal(codeText([null, false, 'x', 3]), 'x3')
})
