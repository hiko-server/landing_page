/**
 * editor-parity (H2): the visual editor's Markdown bridge is lossless.
 *
 * For every body in the corpus — synthetic fixtures covering every node the
 * editor models, the CI fixture store, and (when present locally) every
 * post, case study and page of the content store — MDX → editor document
 * → MDX must:
 *
 *   - compile to the same page (the hast of lib/mdx.ts compileMdx, text
 *     whitespace runs compared as the browser renders them);
 *   - be stable (a second round trip writes the same text);
 *   - load into a headless TipTap editor whose own getMarkdown() writes the
 *     same text and whose document passes ProseMirror's schema check;
 *   - pass visualFidelity (the guard the editor runs before showing a body).
 *
 * The live store is never modified (opened read-only) and its text never
 * leaves this process: only slugs appear in failure messages.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { Editor } from '@tiptap/core'
import { compileMdx } from '../lib/mdx'
import type { HastNode } from '../lib/rehype/hast'
import { baseExtensions } from '../components/Admin/editor/extensions'
import { docToMarkdown, markdownToDoc, visualFidelity } from '../components/Admin/editor/markdown/index'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Every construct the editor models, plus the ones it keeps as MDX islands. Synthetic text only. */
export const FIXTURES: Record<string, string> = {
  prose: 'A paragraph with **bold**, *italic*, ~~struck~~, `code` and a [link](https://example.com "Example").\n\nSecond paragraph\nwith a soft line break and a hard one\\\nhere.',
  headings: '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six',
  marks: '***both*** and **bold with *italic* inside** and [`code` link](https://example.com) and **`bold code`** and *~~mixed~~*.',
  escapes: 'Braces \\{ and \\< less-than, a \\*star\\*, an \\_underscore\\_, a \\[bracket\\], \\~tilde and a #hash at the start:\n\n\\# not a heading\n\n\\- not a list\n\n1\\. not a list either',
  lists: '- one\n- two\n  - nested\n  - nested two\n- three\n\n3. three\n4. four\n\n- loose\n\n- items\n\n- [ ] open task\n- [x] done task',
  quote: '> A quote\n> over two lines.\n>\n> - with a list\n>\n> > and a nested quote',
  code: '```ts title="example.ts" {1,3}\nconst a = 1\nconst b = 2\nconst c = a + b\n```\n\n```\nplain fence\n```\n\n````md\n```inner```\n````',
  rule: 'Above\n\n---\n\nBelow',
  callouts:
    '> [!NOTE]\n> A note.\n\n> [!TIP] Inline title text\n> continues here.\n\n> [!IMPORTANT]\n>\n> - a list first\n\n> [!warning]\n> Two paragraphs.\n>\n> The second.\n\n> [!CAUTION]\n\n> \\[!NOTE\\] escaped by an older editor',
  figures:
    '![A figure with a caption](/uploads/example.png "The caption")\n\n![Alt only](/uploads/wide.png#wide)\n\n![Full](/uploads/full.png#full "Full width")\n\nInline ![icon](/uploads/icon.png) in text.\n\n![one](/uploads/a.png)\n![two](/uploads/b.png)\n\n[![linked](/uploads/c.png)](https://example.com)',
  videos:
    'https://www.youtube.com/watch?v=jkAqK3vqILI\n\n[A titled talk](https://youtu.be/jkAqK3vqILI?t=90)\n\n[Unlisted](<https://vimeo.com/76979871/abcdef1234>)\n\nA [video link](https://vimeo.com/76979871) inside text stays a link.\n\n- [In a list](https://youtu.be/jkAqK3vqILI) stays a link',
  tables:
    '| Stage | Median | p95 |\n| :-- | :-: | --: |\n| Capture | 12 ms | **18 ms** |\n| Detect | `31` | [44](https://example.com) |\n\n|  |  |\n| --- | --- |\n| headerless | row |\n\n| a | b |\n| - | - |\n| short |\n| long | row | extra |',
  islands:
    'import { X } from "./x"\n\nexport const meta = { a: 1 }\n\n<Figure src="/uploads/x.png" alt="A figure" caption="Its caption" size="wide" />\n\nText with <kbd>Ctrl</kbd> + <kbd>C</kbd> and {/* a note */} inline.\n\n{/* A guidance note on its own line */}\n\n<details>\n<summary>Deep dive</summary>\n\nInside the **details**.\n\n</details>\n\n> Quoted <mark>marked</mark> text.\n>\n> <Callout>\n>   inside a quote\n> </Callout>\n\n- <YouTube id="jkAqK3vqILI" title="In a list" />\n- item',
  footnotes: 'A claim with a note.[^1] And a [reference link][ref].\n\n[^1]: The footnote, with **bold**.\n\n[ref]: https://example.com "Ref"',
  cjk: '这是一个**中文**段落，包含*强调*和`代码`。\n\n> [!TIP]\n> 提示内容。\n\n| 名称 | 值 |\n| --- | --- |\n| 甲 | 乙 |',
  breaks: 'Line\\\n\\\nAfter two breaks.\n\n\\\nStarts with a break',
  empty: '',
}

const noSize = () => null
const compile = (body: string) =>
  compileMdx(body, { lang: 'en', resolveSize: noSize, srcSetFor: noSize, avifSrcSetFor: noSize, placeholderFor: noSize, posterFor: noSize })

const INLINE_WRAPPERS = new Set(['strong', 'em', 'del', 'a'])

/** Same-extent inline wrappers (`<strong><a>` / `<a><strong>`) in one order: nesting is not rendered differently. */
function sortChain(node: HastNode): HastNode {
  if (!node.tagName || !INLINE_WRAPPERS.has(node.tagName)) return node
  const chain: HastNode[] = [node]
  let last = node
  while (last.children?.length === 1 && last.children[0].tagName && INLINE_WRAPPERS.has(last.children[0].tagName)) {
    last = last.children[0]
    chain.push(last)
  }
  if (chain.length < 2) return node
  const key = (n: HastNode) => `${n.tagName}|${JSON.stringify(n.properties || {})}`
  const sorted = [...chain].sort((a, b) => key(a).localeCompare(key(b)))
  let out: HastNode = { ...sorted[sorted.length - 1], children: last.children }
  for (let i = sorted.length - 2; i >= 0; i--) out = { ...sorted[i], children: [out] }
  return out
}

/** The tree as a browser renders it: text whitespace runs (outside code) are one space. */
function renderedForm(input: HastNode, inPre = false): unknown {
  const node = sortChain(input)
  if (node.type === 'text') return { t: inPre ? node.value : String(node.value || '').replace(/\s+/g, ' ') }
  const pre = inPre || node.tagName === 'pre' || node.tagName === 'code'
  const kids: unknown[] = []
  for (const child of node.children || []) {
    const c = renderedForm(child, pre) as { t?: string }
    const prev = kids[kids.length - 1] as { t?: string } | undefined
    if (c.t !== undefined && prev && prev.t !== undefined) {
      prev.t = pre ? prev.t + c.t : (prev.t + c.t).replace(/\s+/g, ' ')
      continue
    }
    kids.push(c)
  }
  const trimmed = kids.filter((k) => !((k as { t?: string }).t !== undefined && !pre && !(k as { t: string }).t.trim()))
  return { tag: node.tagName || node.type, props: node.properties || {}, kids: trimmed }
}

const roundTrip = (md: string) => docToMarkdown(markdownToDoc(md))

function editorMarkdown(md: string): { markdown: string } {
  const editor = new Editor({ element: undefined, extensions: baseExtensions(), content: markdownToDoc(md) })
  try {
    editor.state.doc.check()
    return { markdown: (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown() }
  } finally {
    editor.destroy()
  }
}

/**
 * The checks for one body. `quiet`: failures name the body only — the
 * content store's text never appears in a report.
 */
async function assertLossless(name: string, body: string, quiet = false): Promise<void> {
  const same = (actual: unknown, expected: unknown, what: string) => {
    if (quiet) assert.ok(isDeepStrictEqual(actual, expected), `${name}: ${what}`)
    else assert.deepEqual(actual, expected, `${name}: ${what}`)
  }
  const once = roundTrip(body)
  const twice = roundTrip(once)
  same(twice, once, 'a second round trip writes the same text')
  const [a, b] = await Promise.all([compile(body), compile(once)])
  same(renderedForm(b.tree as unknown as HastNode), renderedForm(a.tree as unknown as HastNode), 'the page is the same')
  same(b.toc, a.toc, 'the outline is the same')
  same(editorMarkdown(body).markdown, once, 'the editor writes the same text')
  const fidelity = visualFidelity(body)
  assert.equal(fidelity.ok, true, `${name}: visualFidelity accepts it${quiet ? '' : ` (${JSON.stringify(fidelity)})`}`)
}

test('every synthetic construct survives MDX → editor → MDX', async () => {
  for (const [name, body] of Object.entries(FIXTURES)) await assertLossless(`fixture ${name}`, body)
})

test('the CI fixture store survives MDX → editor → MDX', async () => {
  const dir = path.join(ROOT, 'e2e/fixtures/store/content')
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.mdx')) files.push(p)
    }
  }
  walk(dir)
  assert.ok(files.length >= 4, 'fixture articles found')
  for (const file of files) await assertLossless(path.relative(dir, file), matter(fs.readFileSync(file, 'utf8')).content)
})

type Row = { kind: string; slug: string; body: string }

/** Bodies of the local content store (read-only), or null without one. */
async function liveBodies(): Promise<Row[] | null> {
  const file = process.env.EDITOR_PARITY_DB || path.join(ROOT, 'data/content.db')
  if (!fs.existsSync(file)) return null
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name))
    const rows: Row[] = []
    if (tables.has('collection_items')) rows.push(...(db.prepare('SELECT collection AS kind, slug, body FROM collection_items').all() as Row[]))
    if (tables.has('pages')) rows.push(...(db.prepare("SELECT 'page' AS kind, name AS slug, body FROM pages").all() as Row[]))
    if (tables.has('pending_revisions')) {
      const cols = new Set((db.prepare('PRAGMA table_info(pending_revisions)').all() as Array<{ name: string }>).map((c) => c.name))
      if (cols.has('body') && cols.has('slug')) rows.push(...(db.prepare("SELECT 'pending' AS kind, slug, body FROM pending_revisions").all() as Row[]))
    }
    return rows
  } finally {
    db.close()
  }
}

test('every post, case study and page of the content store survives MDX → editor → MDX', async (t) => {
  const rows = await liveBodies()
  if (!rows) {
    t.skip('no data/content.db here (CI): the synthetic and fixture-store corpus above covers the same constructs')
    return
  }
  assert.ok(rows.length > 0)
  for (const row of rows) await assertLossless(`${row.kind}/${row.slug}`, row.body, true)
})
