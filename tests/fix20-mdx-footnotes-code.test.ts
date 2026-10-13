/**
 * FIX-20 — latent MDX rendering defects:
 *
 *   - GFM footnotes: remark-rehype's visually hidden endnotes heading
 *     (h2#footnote-label) went into the article TOC, in English even in a
 *     Chinese article, with a self-link nobody could see; the labels are now
 *     in the article's language (lib/rehype/footnotes.ts), the heading is
 *     left out of the outline (lib/rehype/headings.ts) and footnote targets
 *     clear the sticky header;
 *   - rehype-pretty-code's highlighted lines / characters and line numbers
 *     had no CSS ({2} did nothing); they are styled in CodeBlock with a band
 *     that never lowers token contrast (--code-line-highlight);
 *   - a code block's title rendered as a centred image caption; it is now the
 *     block's filename tab (CodeFigure → CodeBlock);
 *   - rehype-pretty-code's data-theme="github-dark-dimmed github-light" on
 *     <pre>/<code> matched Chakra's `[data-theme]` token scope, so in dark
 *     mode the block got the LIGHT background under dark-theme token colours;
 *     the attribute is dropped at compile time (lib/rehype/codeThemeAttr.ts).
 *
 * The components are .tsx; a test-local loader transpiles them with the
 * project's TypeScript (JSX → react/jsx-runtime) so they run under node:test.
 */
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { ChakraProvider } from '@chakra-ui/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CODE_THEMES, compileMdx } from '../lib/mdx'
import { footnoteLabel } from '../lib/rehype/footnotes'
import { codeText, splitCodeFigure } from '../components/MDX/codeFigure'
import { semanticColors } from '../theme/color'

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

const noImages = { resolveSize: () => null, srcSetFor: () => null }

type Node = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Node[] }

function findAll(tree: unknown, match: (n: Node) => boolean): Node[] {
  const out: Node[] = []
  const visit = (n: Node) => {
    if (match(n)) out.push(n)
    for (const c of n.children || []) visit(c)
  }
  visit(tree as Node)
  return out
}

const el = (tag: string) => (n: Node) => n.type === 'element' && n.tagName === tag
const text = (n: Node): string => (n.type === 'text' ? n.value || '' : (n.children || []).map(text).join(''))

/** Static markup inside the site theme, with Emotion's <style> tags (the CSS) split off. */
async function render(tree: unknown): Promise<{ html: string; css: string }> {
  const { default: MDXContent } = await import('../components/MDX/MDXContent')
  const { default: theme } = await import('../theme/chakra.js')
  const raw = renderToStaticMarkup(createElement(ChakraProvider, { theme }, createElement(MDXContent, { tree: tree as any, as: 'div' })))
  const css = Array.from(raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g), (m) => m[1]).join('\n')
  const html = raw.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
  // Only the article: the provider adds its own markup around it.
  return { html: html.slice(html.indexOf('<div class="article-prose')), css }
}

// ── Footnotes ────────────────────────────────────────────────────────────

const ZH_BODY = ['## 系统结构', '', '推理只用了 61 毫秒。[^1] 机械部分更慢[^slow]。', '', '[^1]: 在 Jetson 上测得。', '[^slow]: 舵机需要 3.3 秒。'].join('\n')

test('footnotes in a zh-Hans article: Chinese labels, and the endnotes heading is not in the TOC', async () => {
  const { tree, toc } = await compileMdx(ZH_BODY, { lang: 'zh-Hans', ...noImages })
  assert.deepEqual(
    toc.map((t) => t.id),
    ['系统结构'],
    'only the article heading',
  )
  const [section] = findAll(tree, (n) => el('section')(n) && !!n.properties?.dataFootnotes)
  assert.ok(section, 'the endnotes section is rendered')
  const [label] = findAll(section, el('h2'))
  assert.equal(label.properties?.id, 'footnote-label')
  assert.equal(text(label), '注释')
  assert.deepEqual(label.children, [{ type: 'text', value: '注释' }], 'no self-link inside the visually hidden heading')
  const back = findAll(section, (n) => el('a')(n) && n.properties?.dataFootnoteBackref !== undefined)
  assert.deepEqual(
    back.map((a) => a.properties?.ariaLabel),
    ['返回正文（引用 1）', '返回正文（引用 2）'],
  )
  assert.equal(text(back[0]), '↩︎', 'text-presentation arrow (no iOS emoji)')
  const refs = findAll(tree, (n) => el('a')(n) && n.properties?.dataFootnoteRef !== undefined)
  assert.equal(refs.length, 2)
  assert.ok(refs.every((r) => String(r.properties?.ariaDescribedBy) === 'footnote-label'))
})

test('footnotes in English keep the English labels; a re-reference gets its own numbered back link', async () => {
  const { tree, toc } = await compileMdx('## Setup\n\nFirst[^a] and again[^a].\n\n[^a]: Measured on the bench.', { lang: 'en', ...noImages })
  assert.deepEqual(
    toc.map((t) => t.text),
    ['Setup'],
  )
  const [label] = findAll(tree, (n) => el('h2')(n) && n.properties?.id === 'footnote-label')
  assert.equal(text(label), 'Footnotes')
  const back = findAll(tree, (n) => el('a')(n) && n.properties?.dataFootnoteBackref !== undefined)
  assert.deepEqual(
    back.map((a) => a.properties?.ariaLabel),
    ['Back to reference 1', 'Back to reference 1-2'],
  )
  assert.equal(text(back[1]), '↩︎2')
})

test('footnote labels per language; an author heading called "Footnotes" stays in the TOC', async () => {
  assert.equal(footnoteLabel('zh-Hans'), '注释')
  assert.equal(footnoteLabel('zh'), '注释')
  assert.equal(footnoteLabel('zh-Hant'), '註釋')
  assert.equal(footnoteLabel('zh-TW'), '註釋')
  assert.equal(footnoteLabel('en'), 'Footnotes')
  assert.equal(footnoteLabel(undefined), 'Footnotes')
  const { toc } = await compileMdx('## Footnotes\n\nA section the author named so.[^1]\n\n[^1]: Note.', { lang: 'en', ...noImages })
  assert.deepEqual(
    toc.map((t) => t.id),
    ['footnotes'],
  )
})

test('rendered footnotes: targets clear the sticky header; refs and back links are styled as links', async () => {
  const { tree } = await compileMdx(ZH_BODY, { lang: 'zh-Hans', ...noImages })
  const { html, css } = await render(tree)
  assert.match(html, /<section[^>]*data-footnotes[^>]*>\s*<h2[^>]*id="footnote-label"[^>]*>注释<\/h2>/)
  assert.match(html, /<li[^>]*id="user-content-fn-1"/)
  // COR-4: the header clearance once (no html scroll-padding adds it again) plus 16px of air.
  assert.match(css, /\[id\^="user-content-fn"\]\{scroll-margin-top:calc\(var\(--header-h\) \+ 16px \+ 16px\);?\}/)
  assert.match(css, /a\[data-footnote-ref\][^{]*\{[^}]*color:var\(--chakra-colors-accent-text\)[^}]*text-decoration:underline/, 'refs and back links are underlined, not marked by colour alone')
  assert.match(css, /section\[data-footnotes\]\{[^}]*border-top:1px solid/)
})

// ── Code blocks ──────────────────────────────────────────────────────────

const CODE_BODY = ['```ts title="lib/sorter.ts" {2} showLineNumbers', 'const a = 1', 'const b = 2', 'const c = 3', '```'].join('\n')

test('compile: a titled block keeps its title figcaption; {2} marks only line 2; showLineNumbers marks the code', async () => {
  const { tree } = await compileMdx(CODE_BODY, { lang: 'en', ...noImages })
  const [figure] = findAll(tree, (n) => el('figure')(n) && n.properties?.['data-rehype-pretty-code-figure'] !== undefined)
  const [caption, pre] = figure.children || []
  assert.equal(caption.tagName, 'figcaption')
  assert.equal(text(caption), 'lib/sorter.ts')
  assert.equal(pre.tagName, 'pre')
  const lines = findAll(pre, (n) => el('span')(n) && n.properties?.['data-line'] !== undefined)
  assert.deepEqual(
    lines.map((l) => l.properties?.['data-highlighted-line'] !== undefined),
    [false, true, false],
  )
  const [code] = findAll(pre, el('code'))
  assert.notEqual(code.properties?.['data-line-numbers'], undefined)
  // No element may carry data-theme: Chakra scopes its colour tokens by [data-theme].
  assert.deepEqual(
    findAll(tree, (n) => n.type === 'element' && (n.properties?.['data-theme'] !== undefined || n.properties?.dataTheme !== undefined)),
    [],
  )
  const inline = await compileMdx('Run `npm test{:sh}` first.', { lang: 'en', ...noImages })
  assert.deepEqual(
    findAll(inline.tree, (n) => n.type === 'element' && n.properties?.['data-theme'] !== undefined),
    [],
    'inline highlighted code too',
  )
})

test('splitCodeFigure: title text, the <pre> element and the rest (a caption)', () => {
  const title = createElement('figcaption', { 'data-rehype-pretty-code-title': '', 'data-language': 'ts' }, 'lib/', 'a.ts')
  const pre = createElement('pre', { 'data-language': 'ts', tabIndex: 0 }, createElement('code', null, 'x'))
  const caption = createElement('figcaption', { 'data-rehype-pretty-code-caption': '' }, 'What it does')
  const parts = splitCodeFigure([title, pre, caption])
  assert.equal(parts.title, 'lib/a.ts')
  assert.equal(parts.pre?.type, 'pre')
  assert.equal(parts.rest.length, 1)
  assert.equal(codeText(parts.rest[0]), 'What it does')
  assert.deepEqual(splitCodeFigure([pre]).title, '')
  assert.equal(splitCodeFigure([title]).pre, null)
})

test('render: the title is the block’s filename tab (the figure’s caption), not a centred image caption', async () => {
  const { tree } = await compileMdx(CODE_BODY, { lang: 'en', ...noImages })
  const { html, css } = await render(tree)
  assert.equal((html.match(/<figure/g) || []).length, 1, 'one figure: the block itself')
  assert.match(html, /^<div[^>]*><figure[^>]*data-rehype-pretty-code-figure=""[^>]*><figcaption[^>]*class="[^"]*code-title[^"]*"[^>]*><span[^>]*>lib\/sorter\.ts<\/span><span[^>]*aria-hidden="true"[^>]*>ts<\/span><\/figcaption><pre/)
  assert.ok(!html.includes('data-rehype-pretty-code-title'), 'the compiled caption element is replaced by the tab')
  assert.ok(!html.includes('data-theme='), 'code blocks follow the page colour mode (no [data-theme] token reset)')
  assert.match(html, /aria-label="Copy code"/)
  // Highlighted lines and line numbers have styles now.
  assert.match(css, /\[data-highlighted-line\]\{[^}]*background:var\(--code-line-highlight\)[^}]*border-left-color:var\(--accent\)/)
  assert.match(css, /code\[data-line-numbers\] ?> ?\[data-line\]::before\{[^}]*content:counter\(line\)[^}]*color:var\(--chakra-colors-page-fg-secondary\)/)
  assert.match(css, /\[data-highlighted-chars\]\{[^}]*background:var\(--code-line-highlight\)/)
})

test('render: an untitled block is unchanged; a titled block with a caption keeps the caption as the figcaption', async () => {
  const plain = await render((await compileMdx('```js\nlet a = 1\n```', { lang: 'en', ...noImages })).tree)
  assert.match(plain.html, /^<div[^>]*><figure data-rehype-pretty-code-figure=""><div[^>]*><pre/)
  assert.ok(!plain.html.includes('code-title'))

  const both = await render((await compileMdx('```js title="a.js" caption="Runs once at boot"\nlet a = 1\n```', { lang: 'en', ...noImages })).tree)
  assert.equal((both.html.match(/<figcaption/g) || []).length, 1, 'a figure has one figcaption')
  assert.match(both.html, /<div[^>]*class="[^"]*code-title[^"]*"[^>]*><span[^>]*>a\.js<\/span>/)
  assert.match(both.html, /<figcaption[^>]*>Runs once at boot<\/figcaption>/)
})

// ── Contrast ─────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** --code-line-highlight per colour mode (styles/globals.css). */
function highlightBands(): { light: string; dark: string } {
  const css = fs.readFileSync(path.join(process.cwd(), 'styles', 'globals.css'), 'utf8')
  const light = /:root\s*\{\s*--code-line-highlight:\s*(#[0-9a-f]{6});\s*\}/i.exec(css)?.[1]
  const dark = /\[data-theme='dark'\],\s*\.chakra-ui-dark\s*\{\s*--code-line-highlight:\s*(#[0-9a-f]{6});\s*\}/i.exec(css)?.[1]
  assert.ok(light && dark, '--code-line-highlight is defined for both modes')
  return { light, dark }
}

test('the highlight band never lowers token contrast; gutter and tab text meet AA in both modes', () => {
  const { light, dark } = highlightBands()
  const block = semanticColors['page.bg-elevated']
  // Light mode: dark tokens on a band at least as light as the block.
  assert.ok(luminance(light) >= luminance(block.light), `${light} is not lighter than ${block.light}`)
  // Dark mode: light tokens on a band at least as dark as the block.
  assert.ok(luminance(dark) <= luminance(block.dark), `${dark} is not darker than ${block.dark}`)
  // e.g. the github-light comment colour keeps (at least) its contrast.
  assert.ok(contrast('#6a737d', light) >= contrast('#6a737d', block.light))
  assert.ok(contrast('#768390', dark) >= contrast('#768390', block.dark))
  for (const mode of ['light', 'dark'] as const) {
    const band = mode === 'light' ? light : dark
    const gutter = semanticColors['page.fg-secondary'][mode]
    assert.ok(contrast(gutter, block[mode]) >= 4.5, `line numbers on the block (${mode})`)
    assert.ok(contrast(gutter, band) >= 4.5, `line numbers on a highlighted line (${mode})`)
    assert.ok(contrast(semanticColors['page.fg'][mode], semanticColors['page.bg-overlay'][mode]) >= 4.5, `tab filename (${mode})`)
    assert.ok(contrast(gutter, semanticColors['page.bg-overlay'][mode]) >= 4.5, `tab language (${mode})`)
  }
})

test('every syntax-token colour of both code themes meets 4.5:1 on the block and on a highlighted line', async () => {
  const { bundledThemes } = await import('shiki')
  const bands = highlightBands()
  for (const mode of ['light', 'dark'] as const) {
    const name = CODE_THEMES[mode]
    const theme = (await bundledThemes[name]()).default as {
      colors?: Record<string, string>
      tokenColors?: Array<{ scope?: unknown; settings?: { foreground?: string; background?: string } }>
    }
    // Token colours drawn on the block itself (a rule with its own background — diff markup — brings its own contrast).
    const colours = new Set<string>()
    const fg = theme.colors?.['editor.foreground']
    if (fg) colours.add(fg.slice(0, 7).toLowerCase())
    for (const rule of theme.tokenColors || []) {
      const f = rule.settings?.foreground
      if (f && !rule.settings?.background && /^#[0-9a-f]{6}/i.test(f)) colours.add(f.slice(0, 7).toLowerCase())
    }
    assert.ok(colours.size > 5, `${name}: token colours found`)
    const failing = [...colours]
      .map((c) => ({ c, block: contrast(c, semanticColors['page.bg-elevated'][mode]), band: contrast(c, bands[mode]) }))
      .filter((r) => r.block < 4.5 || r.band < 4.5)
      .map((r) => `${r.c} ${r.block.toFixed(2)}/${r.band.toFixed(2)}`)
    assert.deepEqual(failing, [], `${name} (${mode}) tokens below 4.5:1`)
  }
})
