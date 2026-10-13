/**
 * compileMdx: MDX → plain hast tree without evaluation (C1), GFM, the JSX
 * allow-list, compile errors with positions, and the real content compiling.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileMdx, excerptOf, MdxCompileError } from '../lib/mdx'
import { mapJsxElement, literalAttributes } from '../lib/rehype/stripMdxExpressions'
import { collectImages, isElement, walk, type HastNode } from '../lib/rehype/hast'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const noImages = { resolveSize: () => null, srcSetFor: () => null }

function find(tree: unknown, test: (n: HastNode) => boolean): HastNode[] {
  const out: HastNode[] = []
  walk(tree as HastNode, (n) => {
    if (test(n)) out.push(n)
  })
  return out
}
const tags = (tree: unknown, tag: string) => find(tree, (n) => isElement(n, tag))

const FIXTURE = [
  '## Overview',
  '',
  'Text {1 + 1} with ~~deleted~~ words and a bare link https://example.com/docs here.',
  '',
  '### Details',
  '',
  '```ts',
  'const answer: number = 42',
  '```',
  '',
  '![A latency chart](/uploads/chart.png)',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '<iframe src="https://www.youtube-nocookie.com/embed/jkAqK3vqILI" title={evil()} allowFullScreen />',
  '',
  '<iframe src="https://evil.example/embed" title="nope" />',
  '',
  '<script>alert(1)</script>',
  '',
  'export const leaked = 1',
].join('\n')

test('GFM constructs, headings, code and images compile to plain hast', async () => {
  const { tree, toc } = await compileMdx(FIXTURE, { lang: 'en', ...noImages })
  assert.deepEqual(
    toc.map((t) => [t.depth, t.id]),
    [
      [2, 'overview'],
      [3, 'details'],
    ],
  )
  assert.equal(tags(tree, 'del').length, 1)
  assert.equal(tags(tree, 'table').length, 1)
  const links = tags(tree, 'a').filter((a) => a.properties?.href === 'https://example.com/docs')
  assert.equal(links.length, 1, 'bare autolink')
  // rehype-pretty-code output with the dual theme.
  const pre = tags(tree, 'pre')
  assert.equal(pre.length, 1)
  assert.equal(pre[0].properties?.['data-language'], 'ts')
  const img = tags(tree, 'img')[0]
  assert.equal(img.properties?.src, '/uploads/chart.png')
  assert.equal(img.properties?.loading, 'lazy')
  // Plain JSON: no positions or plugin data survive.
  const json = JSON.stringify(tree)
  assert.ok(!json.includes('"position"'))
  assert.ok(!json.includes('"data":'))
  assert.deepEqual(JSON.parse(json), tree)
})

test('expressions, ESM and disallowed elements never reach the tree', async () => {
  const { tree } = await compileMdx(FIXTURE, { lang: 'en', ...noImages })
  const json = JSON.stringify(tree)
  assert.ok(!json.includes('1 + 1'), 'text expression stripped')
  assert.ok(!json.includes('leaked'), 'ESM stripped')
  assert.ok(!json.includes('evil()'), 'attribute expression stripped')
  assert.equal(tags(tree, 'script').length, 0)
  const frames = tags(tree, 'iframe')
  assert.equal(frames.length, 1, 'only the allowed player iframe')
  assert.equal(frames[0].properties?.src, 'https://www.youtube-nocookie.com/embed/jkAqK3vqILI')
  assert.ok(!json.includes('evil.example'))
  assert.equal(frames[0].properties?.title, 'Embedded video')
})

test('YouTube and Figure JSX become the facade element and a captioned figure', async () => {
  const body = '<YouTube id="jkAqK3vqILI" title="Demo" />\n\n<YouTube id="bad" />\n\n<Figure src="/images/a.png" alt="Alt" caption="The caption" />'
  const { tree } = await compileMdx(body, { lang: 'en', resolveSize: () => ({ width: 640, height: 400 }), srcSetFor: () => null })
  const yt = tags(tree, 'youtube-embed')
  assert.equal(yt.length, 1)
  assert.equal(yt[0].properties?.dataYoutubeId, 'jkAqK3vqILI')
  const fig = tags(tree, 'figure')[0]
  assert.deepEqual(fig.properties?.className, ['article-figure'])
  const img = tags(fig, 'img')[0]
  assert.equal(img.properties?.width, 640)
  assert.equal(tags(fig, 'figcaption').length, 1)
  assert.deepEqual(collectImages(tree as unknown as HastNode), [{ src: '/images/a.png', alt: 'Alt', caption: 'The caption', width: 640, height: 400 }])
})

test('the JSX allow-list maps attributes literally', () => {
  assert.equal(mapJsxElement('iframe', { src: 'https://player.vimeo.com/video/1' })?.hName, 'iframe')
  assert.equal(mapJsxElement('iframe', { src: 'http://player.vimeo.com/video/1' }), null)
  assert.equal(mapJsxElement('iframe', { src: 'https://youtube.com.evil.example/embed/x' }), null)
  assert.equal(mapJsxElement('script', {}), null)
  assert.equal(mapJsxElement('Foo', {}), null)
  assert.deepEqual(mapJsxElement('abbr', { title: 'HyperText', onclick: 'x' })?.hProperties, { title: 'HyperText' })
  assert.deepEqual(
    literalAttributes({
      attributes: [
        { type: 'mdxJsxAttribute', name: 'a', value: 'x' },
        { type: 'mdxJsxAttribute', name: 'b', value: null },
        { type: 'mdxJsxAttribute', name: 'c', value: { type: 'mdxJsxAttributeValueExpression' } },
        { type: 'mdxJsxExpressionAttribute', value: '...props' },
      ],
    }),
    { a: 'x', b: true },
  )
})

test('invalid MDX throws MdxCompileError with a position', async () => {
  await assert.rejects(compileMdx('Hello <b>\n\nworld'), (err: unknown) => {
    assert.ok(err instanceof MdxCompileError)
    assert.equal(err.line, 1)
    assert.ok(typeof err.column === 'number')
    assert.match(err.reason, /closing tag/)
    return true
  })
})

test('language-of-parts spans are applied for the article language', async () => {
  const { tree } = await compileMdx('## 这是什么 · What it is\n\nPlain text.', { lang: 'en', ...noImages })
  const spans = find(tree, (n) => isElement(n, 'span') && n.properties?.lang === 'zh-Hans')
  assert.equal(spans.length, 1)
})

test('excerptOf takes the first real paragraph and clamps it', async () => {
  const { tree } = await compileMdx(`![x](/a.png "Caption text that is long enough")\n\n${'Word '.repeat(60)}`, { lang: 'en', ...noImages })
  const ex = excerptOf(tree)
  assert.ok(ex.startsWith('Word Word'))
  assert.ok(Array.from(ex).length <= 155)
  assert.ok(ex.endsWith('…'))
})

test('every live post and case study in the local content store compiles', async (t) => {
  const dbFile = path.join(ROOT, 'data', 'content.db')
  if (!fs.existsSync(dbFile)) return t.skip('no local content store')
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(dbFile, { readonly: true, fileMustExist: true })
  let rows: { collection: string; slug: string; body: string }[] = []
  try {
    rows = db.prepare('SELECT collection, slug, body FROM collection_items WHERE collection IN (?, ?)').all('blog', 'work') as typeof rows
  } catch {
    return t.skip('content store has no collection_items table')
  } finally {
    db.close()
  }
  if (!rows.length) return t.skip('content store is empty')
  for (const row of rows) {
    const { tree } = await compileMdx(row.body, noImages)
    assert.equal(tree.type, 'root', `${row.collection}/${row.slug}`)
    assert.ok(tree.children.length > 0, `${row.collection}/${row.slug} has content`)
  }
})
