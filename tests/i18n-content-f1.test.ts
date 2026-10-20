/**
 * i18n-content F1 — the Chinese typesetting layer and the interface
 * dictionary:
 *   - lib/uiStrings is the single source of the article interface words:
 *     every table holds every language with the same keys, the article
 *     components carry no English UI literals of their own, and Chinese
 *     pages get Simplified / Traditional words;
 *   - the rehype spacing marks (CJK ↔ Latin, lib/rehype/autospace) and the
 *     Latin-emphasis flag, only in Chinese / Japanese articles, never inside
 *     code, never changing the text;
 *   - the compile pipeline labels footnotes, callouts and heading self-links
 *     in the article's language; the feeds drop the marks;
 *   - styles/globals.css: no tracking for Han, the 34em measure, 1.85
 *     leading, text-autospace with its fallback, emphasis dots, Chinese
 *     faces (local only) before system-ui.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fillUi, UI_LANGS, uiLangAttr, uiLangOf, uiText, type UiTable } from '../lib/uiStrings'
import { ARTICLE_UI, articleUiFor } from '../lib/uiStrings/article'
import { CONTENT_UI } from '../lib/uiStrings/content'
import { COMPILE_UI } from '../lib/uiStrings/compile'
import { LIST_UI } from '../lib/uiStrings/lists'
import { LANGUAGE_AUTONYMS, READ_IN } from '../lib/uiStrings/languages'
import rehypeAutospace, { needsGap, splitAtGaps, AUTOSPACE_CLASS } from '../lib/rehype/autospace'
import { compileMdx } from '../lib/mdx'
import { renderFeedHtml } from '../lib/feedHtml'
import { formatPostDate } from '../lib/postDate'
import { langWithin } from '../lib/toc'
import { textOf, walk, isElement, type HastNode } from '../lib/rehype/hast'
import { languageAutonym, readInLabel } from '../lib/translations'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const noIo = { resolveSize: () => null, srcSetFor: () => null, posterFor: () => null }

// ── The dictionary ────────────────────────────────────────────────────────

const placeholders = (v: string) => (v.match(/\{\w+\}/g) || []).sort().join(',')

function shapeOf(table: UiTable<Record<string, unknown>>) {
  return UI_LANGS.map((l) => {
    const entries = Object.entries(table[l]).map(([k, v]) => [
      k,
      typeof v === 'string' ? `string:${placeholders(v)}` : typeof v === 'object' && v ? Object.keys(v).sort().join(',') : typeof v,
    ])
    return JSON.stringify(entries.sort())
  })
}

test('every table has the same keys, as plain strings with the same {placeholders}, in every interface language', () => {
  for (const [name, table] of Object.entries({ ARTICLE_UI, CONTENT_UI, COMPILE_UI, LIST_UI })) {
    const shapes = shapeOf(table as unknown as UiTable<Record<string, unknown>>)
    for (const s of shapes) assert.equal(s, shapes[0], `${name} differs between languages`)
  }
  // No empty strings, no English left in the Chinese tables, and JSON-safe (a page receives its words as props).
  for (const table of [ARTICLE_UI, CONTENT_UI, COMPILE_UI, LIST_UI] as unknown as UiTable<Record<string, unknown>>[]) {
    assert.deepEqual(JSON.parse(JSON.stringify(table)), table)
    for (const l of UI_LANGS) {
      for (const [k, v] of Object.entries(table[l])) {
        if (typeof v === 'string') {
          assert.ok(v.trim(), `${l}.${k} is empty`)
          if (l !== 'en') assert.match(v.replace(/\{\w+\}/g, ''), /[\u3400-\u9fff]/, `${l}.${k} is not Chinese: ${v}`)
        }
      }
    }
  }
  assert.deepEqual([...UI_LANGS], ['en', 'zh-Hans', 'zh-Hant'])
  assert.equal(fillUi('{n} min, {n} again, {missing}', { n: 3 }), '3 min, 3 again, {missing}')
})

test('articleUiFor: a page gets only its own language (plus the Chinese WeChat line on an English page)', () => {
  const en = articleUiFor('en-GB')
  assert.equal(en.lang, 'en')
  assert.equal(en.t, ARTICLE_UI.en)
  assert.equal(en.qrHelpZh, ARTICLE_UI['zh-Hans'].qrHelp)
  const zh = articleUiFor('zh-Hans')
  assert.equal(zh.t.date, '日期')
  assert.equal(zh.qrHelpZh, null)
  assert.equal(articleUiFor('zh-HK').t.read, '閱讀')
  assert.equal(articleUiFor('ja').lang, 'en')
  assert.equal(articleUiFor('ja').pageLang, 'ja')
  // The article components never import a language table: the page props carry the words.
  for (const f of fs.readdirSync(path.join(ROOT, 'components/Article'))) {
    const src = read(`components/Article/${f}`)
    assert.doesNotMatch(src, /^import \{[^}]*\} from '\.\.\/\.\.\/lib\/uiStrings\/(article|languages)'/m, f)
    // Language names and "Read in …" arrive with the props (lib/translations switchLinks): types only here.
    assert.doesNotMatch(src, /^import \{[^}]*\} from '\.\.\/\.\.\/lib\/translations'/m, f)
  }
  for (const f of ['pages/blog/[slug].tsx', 'pages/work/[slug].tsx']) assert.match(read(f), /ui: articleUiFor\((post|w)\.lang\)/, f)
})

test('uiLangOf / uiText / uiLangAttr: Chinese pages get Chinese words, everything else English', () => {
  assert.equal(uiLangOf('zh-Hans'), 'zh-Hans')
  assert.equal(uiLangOf('zh'), 'zh-Hans')
  assert.equal(uiLangOf('zh-CN'), 'zh-Hans')
  assert.equal(uiLangOf('zh-Hant'), 'zh-Hant')
  assert.equal(uiLangOf('zh-TW'), 'zh-Hant')
  assert.equal(uiLangOf('zh_HK'), 'zh-Hant')
  assert.equal(uiLangOf('ja'), 'en')
  assert.equal(uiLangOf(undefined), 'en')
  assert.equal(uiText(ARTICLE_UI, 'zh-Hans').date, '日期')
  assert.equal(uiText(ARTICLE_UI, 'zh-Hans').read, '阅读')
  assert.equal(uiText(ARTICLE_UI, 'zh-Hans').allPosts, '← 全部文章')
  assert.equal(uiText(ARTICLE_UI, 'zh-Hant').read, '閱讀')
  assert.equal(uiText(ARTICLE_UI, 'en').allPosts, '← All posts')
  assert.equal(fillUi(uiText(ARTICLE_UI, 'zh-Hans').minutes, { n: 6 }), '6 分钟')
  assert.equal(uiText(CONTENT_UI, 'zh-Hans').copyCode, '复制代码')
  assert.equal(fillUi(uiText(CONTENT_UI, 'zh-Hans').imageOfAlt, { i: 2, n: 5, alt: '图' }), '第 2 张，共 5 张：图')
  assert.equal(uiText(COMPILE_UI, 'zh-TW').callout.note, '備註')
  assert.equal(uiText(LIST_UI, 'en').alsoIn, 'Also in')
  // Interface words need no lang inside a page of their own language; English labels inside a Japanese article do.
  assert.equal(uiLangAttr('en'), undefined)
  assert.equal(uiLangAttr('en-GB'), undefined)
  assert.equal(uiLangAttr('zh-Hans'), undefined)
  assert.equal(uiLangAttr('ja'), 'en')
})

test('language names and the "read in" links are written in the language they lead to', () => {
  assert.equal(languageAutonym('zh-Hans'), '简体中文')
  assert.equal(languageAutonym('zh-TW'), '繁體中文')
  assert.equal(languageAutonym('en-GB'), 'English')
  assert.equal(languageAutonym('fr'), 'fr')
  assert.equal(readInLabel('en'), 'Read in English')
  assert.equal(readInLabel('zh'), '阅读中文版')
  assert.equal(readInLabel('zh-Hant'), '閱讀中文版')
  assert.equal(readInLabel('fr'), 'fr')
  assert.equal(LANGUAGE_AUTONYMS.en, READ_IN.en.replace('Read in ', ''))
})

test('the article interface is drawn from the dictionary: no English UI literals left in the components', () => {
  const files = [
    'components/Article/ArticleBody.tsx',
    'components/Article/ArticleEnd.tsx',
    'components/Article/ArticleNav.tsx',
    'components/Article/ArticleProgress.tsx',
    'components/Article/AtAGlance.tsx',
    'components/Article/TableOfContents.tsx',
    'components/Article/LanguageSwitch.tsx',
    'components/Common/Lightbox.tsx',
    'components/MDX/CodeBlock.tsx',
    'components/MDX/Figure.tsx',
    'components/MDX/VideoEmbed.tsx',
    'pages/blog/[slug].tsx',
    'pages/work/[slug].tsx',
    'lib/rehype/footnotes.ts',
    'lib/rehype/alerts.ts',
    'lib/rehype/headings.ts',
  ]
  const phrases = [
    'On this page',
    'Article outline',
    'Reading progress',
    'Written by',
    'View CV',
    'Copy link',
    'Link copied',
    'More in this collection',
    'At a glance',
    'Copy code',
    'Enlarge image',
    'Image viewer',
    'Close image viewer',
    'Previous image',
    'Next image',
    'Play video',
    'Watch on',
    'Back to reference',
    'Link to section',
    '← All posts',
    '← All projects',
    "'Footnotes'",
    "label: 'Date'",
    "label: 'Read'",
  ]
  for (const f of files) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const p of phrases) assert.ok(!src.includes(p), `${f} still spells "${p}" itself`)
  }
  // …and the dictionary holds them.
  const dictionary = fs
    .readdirSync(path.join(ROOT, 'lib/uiStrings'))
    .map((f) => read(`lib/uiStrings/${f}`))
    .join('\n')
  for (const p of ['On this page', 'Written by', 'Copy code', 'Back to reference', 'Link to section', '← All posts', 'Also in']) assert.ok(dictionary.includes(p), p)
  // The index pages take their line from the lists table, shipped in the page's language with its props (F3).
  for (const f of ['pages/blog/index.tsx', 'pages/work/index.tsx']) {
    assert.match(read(f), /\{t\.alsoIn\}/, f)
    assert.doesNotMatch(read(f), /uiStrings\/article/, f)
    assert.doesNotMatch(read(f), /^import \{[^}]*LIST_UI[^}]*\} from/m, `${f} bundles no language table`)
  }
})

test('a Chinese post dates as 2024年5月1日; English stays "May 1, 2024"', () => {
  assert.equal(formatPostDate('2024-05-01', 'zh-Hans'), '2024年5月1日')
  assert.equal(formatPostDate('2024-05-01', 'zh-Hant'), '2024年5月1日')
  assert.equal(formatPostDate('2024-05-01'), 'May 1, 2024')
  assert.equal(formatPostDate('2024-05-01', 'en'), 'May 1, 2024')
  assert.equal(formatPostDate('not a date', 'zh-Hans'), 'not a date')
})

test('langWithin marks a short text only when its language differs from the page', () => {
  assert.equal(langWithin('Main Developer', 'zh-Hans'), 'en')
  assert.equal(langWithin('Edge AI', 'zh-Hant'), 'en')
  assert.equal(langWithin('边缘计算', 'zh-Hans'), undefined)
  assert.equal(langWithin('邊緣運算', 'zh-Hant'), undefined, 'Chinese scripts count as one language for short labels')
  assert.equal(langWithin('边缘计算', 'en'), 'zh-Hans')
  assert.equal(langWithin('Edge AI', 'en'), undefined)
  assert.equal(langWithin('Edge AI', undefined), undefined)
})

// ── Spacing between Han and Latin ────────────────────────────────────────

test('needsGap / splitAtGaps: Han or kana next to a Latin letter or ASCII digit, nothing else', () => {
  assert.ok(needsGap('用', 'T'))
  assert.ok(needsGap('w', '训'))
  assert.ok(needsGap('第', '3'))
  assert.ok(needsGap('カ', 'A'))
  assert.ok(!needsGap('用', ' '))
  assert.ok(!needsGap('，', 'A'), 'CJK punctuation is not spaced')
  assert.ok(!needsGap('用', 'Ａ'), 'full-width letters are set like ideographs')
  assert.ok(!needsGap('a', 'b'))
  assert.ok(!needsGap('', 'a'))
  assert.deepEqual(splitAtGaps('使用TensorFlow训练'), ['使用', 'TensorFlow', '训练'])
  assert.deepEqual(splitAtGaps('使用 TensorFlow 训练'), ['使用 TensorFlow 训练'])
  assert.deepEqual(splitAtGaps('推理61ms，机械3.3秒'), ['推理', '61ms，机械', '3.3', '秒'])
  assert.deepEqual(splitAtGaps(''), [''])
})

const el = (tagName: string, children: HastNode[] = [], properties: Record<string, unknown> = {}): HastNode =>
  ({ type: 'element', tagName, properties, children }) as unknown as HastNode
const txt = (value: string): HastNode => ({ type: 'text', value }) as HastNode

function gaps(tree: HastNode): number {
  let n = 0
  walk(tree, (node) => {
    if (isElement(node, 'span') && ((node.properties?.className as string[]) || []).includes(AUTOSPACE_CLASS)) n++
  })
  return n
}

test('rehypeAutospace: marks boundaries in text and between inline elements, never inside code, text unchanged', () => {
  const tree = el('root', [
    el('p', [txt('使用TensorFlow训练，按'), el('kbd', [txt('Ctrl')]), txt('键和'), el('code', [txt('npm i中文')]), txt('结束')]),
    el('p', [el('strong', [txt('模型')]), txt('YOLOv8'), txt(' 已有空格 '), txt('文字'), el('sup', [el('a', [txt('1')])])]),
    el('pre', [el('code', [txt('const 变量=1')])]),
  ])
  ;(tree as { type: string }).type = 'root'
  const before = textOf(tree)
  rehypeAutospace({ lang: 'zh-Hans' })(tree)
  assert.equal(textOf(tree), before, 'the text itself never changes')
  // 使用|TensorFlow|训练 (2), 按|<kbd>|键 (2), 和|<code> (1, the code starts with "n"), <code>…中文</code>|结束 is Han–Han (0),
  // <strong>模型</strong>|YOLOv8 (1), YOLOv8|' 已有' has a space (0), 文字|<sup> footnote ref (0).
  assert.equal(gaps(tree), 6)
  const pre = (tree.children as HastNode[])[2]
  assert.equal(gaps(pre), 0, 'code blocks are never entered')
})

test('rehypeAutospace: only Chinese and Japanese articles; Latin-only emphasis is flagged to stay italic', () => {
  const mk = () =>
    ({ type: 'root', children: [el('p', [txt('中文English'), el('em', [txt('重点')]), el('em', [txt('really')]), el('i', [txt('Mixed 中文')])])] }) as unknown as HastNode
  const en = mk()
  rehypeAutospace({ lang: 'en' })(en)
  assert.equal(gaps(en), 0)
  const ja = mk()
  rehypeAutospace({ lang: 'ja' })(ja)
  assert.ok(gaps(ja) > 0)
  const zh = mk()
  rehypeAutospace({ lang: 'zh-Hant' })(zh)
  const ems: Array<{ text: string; script: unknown }> = []
  walk(zh, (n) => {
    if (isElement(n, ['em', 'i'])) ems.push({ text: textOf(n), script: n.properties?.dataScript })
  })
  assert.deepEqual(ems, [
    { text: '重点', script: undefined },
    { text: 'really', script: 'latin' },
    { text: 'Mixed 中文', script: undefined },
  ])
})

test('compileMdx: a Chinese body gets spacing marks and Chinese labels; an English body gets neither', async () => {
  const zhBody = [
    '## 部署YOLOv8',
    '',
    '使用TensorFlow训练模型，*非常*重要[^1]。',
    '',
    '> [!NOTE]',
    '> 提示内容',
    '',
    '[^1]: 注释内容。',
  ].join('\n')
  const zh = await compileMdx(zhBody, { lang: 'zh-Hans', ...noIo })
  assert.ok(gaps(zh.tree as unknown as HastNode) >= 3)
  const html = JSON.stringify(zh.tree)
  assert.ok(html.includes('"dataCalloutLabel":"备注"'))
  assert.ok(html.includes('注释'), 'footnote label in Chinese')
  assert.ok(html.includes('返回正文（引用 1）'))
  assert.deepEqual(zh.toc.map((t) => t.text), ['部署YOLOv8'], 'the outline reads the heading as written')

  const en = await compileMdx('## Deploy\n\nTrain the *model* with [a link](https://example.com).\n', { lang: 'en', ...noIo })
  assert.equal(gaps(en.tree as unknown as HastNode), 0)

  const linked = await compileMdx('## 关于 [链接](https://example.com)\n', { lang: 'zh-Hans', ...noIo })
  assert.ok(JSON.stringify(linked.tree).includes('链接到本节：关于 链接'), 'a heading with its own link gets a Chinese self-link label')
  const linkedEn = await compileMdx('## About [link](https://example.com)\n', { lang: 'en', ...noIo })
  assert.ok(JSON.stringify(linkedEn.tree).includes('Link to section: About link'))
})

test('the feeds drop the spacing marks (they mean nothing without the site CSS)', async () => {
  const { tree } = await compileMdx('使用TensorFlow训练。', { lang: 'zh-Hans', ...noIo })
  const html = renderFeedHtml(tree, 'https://example.com')
  assert.ok(!html.includes('autospace'), html)
  assert.ok(html.includes('使用TensorFlow训练'))
})

// ── The stylesheet ───────────────────────────────────────────────────────

test('globals.css: the Chinese typesetting layer', () => {
  const css = read('styles/globals.css')
  const block = css.slice(css.indexOf('Chinese typesetting'), css.indexOf('Chinese text on every page'))
  assert.ok(block.length > 500, 'the block exists')
  // The article layer: scoped to posts and case studies. (The page-wide
  // layer after it — review round 3, VISU-3 — is guarded in
  // tests/review-r3-visu.test.ts.)
  for (const rule of block.match(/^[^\s@/*:}][^{]*\{/gm) || []) assert.match(rule, /\.article-page/, rule)
  assert.match(block, /\.article-page :lang\(zh\) \{\s*letter-spacing: 0;/)
  assert.match(block, /--measure-zh: 34em;/)
  assert.match(block, /\.article-prose:lang\(zh\) \{\s*max-width: min\(var\(--measure\), var\(--measure-zh\)\);\s*line-height: 1\.85;/)
  assert.match(block, /text-autospace: normal;/)
  assert.match(block, /@supports not \(text-autospace: normal\) \{\s*\.article-page \.autospace \{\s*margin-inline-start: 0\.125em;/)
  assert.match(block, /text-emphasis: filled dot;/)
  assert.match(block, /text-emphasis-position: under right;/)
  assert.match(block, /:not\(\[data-script='latin'\]\)/)
  // Chinese faces before system-ui, Simplified and Traditional each their own; punctuation from local fonts only.
  assert.match(block, /--font-zh-hans: 'CJK punctuation SC', var\(--font-geist-sans-face, var\(--font-geist-sans\)\), 'PingFang SC'/)
  assert.match(block, /--font-zh-hant: 'CJK punctuation TC', var\(--font-geist-sans-face, var\(--font-geist-sans\)\), 'PingFang TC'/)
  assert.ok(!/url\(/.test(block), 'nothing is downloaded')
  assert.equal((block.match(/unicode-range: U\+00B7, U\+2014, U\+2018-2019, U\+201C-201D, U\+2026;/g) || []).length, 2)
  // The face variable without the platform list is defined in _app.
  assert.match(read('pages/_app.tsx'), /--font-geist-sans-face:/)
})

test('the article pages provide their language to the pieces inside (outline, image viewer, code copy)', () => {
  for (const f of ['pages/blog/[slug].tsx', 'pages/work/[slug].tsx']) assert.match(read(f), /<ArticleRoot ui=\{articleUi\} lang=\{lang\}[^>]*>/, f)
  assert.match(read('components/Article/articleUi.tsx'), /<Box as="article" lang=\{lang\} className="article-page"[^>]*>/)
  for (const f of ['components/Article/ArticleBody.tsx', 'components/Article/TableOfContents.tsx', 'components/Article/ArticleProgress.tsx', 'components/Article/ArticleEnd.tsx', 'components/Article/ArticleNav.tsx', 'components/Article/AtAGlance.tsx']) {
    assert.match(read(f), /useArticleUi\(\)/, f)
  }
  for (const f of ['components/Common/Lightbox.tsx', 'components/MDX/CodeBlock.tsx', 'components/MDX/Figure.tsx', 'components/MDX/VideoEmbed.tsx']) {
    assert.match(read(f), /useUiLang\(/, f)
  }
})
