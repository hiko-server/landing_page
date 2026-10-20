/**
 * editor-parity (H2): the visual editor's blocks and their Markdown —
 * callouts, videos, figures and inline images, GFM tables (alignment,
 * header row, GFM shape), MDX islands, task boxes, mark nesting — the
 * commands behind the slash menu, the table toolbar and the block handle
 * (Alt+↑ / ↓), Markdown paste, and the fidelity guard the editor runs
 * before it shows a body. Headless TipTap (no DOM); synthetic text only.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Editor, type JSONContent } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { baseExtensions } from '../components/Admin/editor/extensions'
import { docToMarkdown, markdownToDoc, plainMarkdownToDoc, visualFidelity, canonicalMdast, parseMdx } from '../components/Admin/editor/markdown/index'
import { isCodeEditorHtml, looksLikeMarkdown, singleUrl, singleVideoUrl } from '../components/Admin/editor/markdown/paste'
import { describeIsland, readBlockIsland, readInlineIsland } from '../components/Admin/editor/markdown/islands'
import { markdownSlice, sliceMarkdown } from '../components/Admin/editor/markdown/bridge'
import { normalizeTables } from '../components/Admin/editor/nodes/table'
import { filterSlashItems, rawSnippet, CARET_MARK } from '../components/Admin/editor/slashItems'
import { caseStudyTemplate, templateNoteLines } from '../components/Admin/editor/caseStudyTemplate'

const md = (doc: JSONContent) => docToMarkdown(doc)
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const t = (text: string, marks?: JSONContent['marks']): JSONContent => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const roundTrip = (source: string) => docToMarkdown(markdownToDoc(source))

function withEditor(content: string | JSONContent, run: (editor: Editor) => void): void {
  const editor = new Editor({ element: undefined, extensions: baseExtensions(), content })
  try {
    run(editor)
  } finally {
    editor.destroy()
  }
}
/** Type text at the caret (JSON content: no DOM needed). */
const type = (editor: Editor, text: string) => editor.commands.insertContent({ type: 'text', text })
const markdownOf = (editor: Editor) => (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown()

/** Put the caret right after the first occurrence of `text`. */
function caretAfter(editor: Editor, text: string): void {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0) return false
    if (node.isText && node.text?.includes(text)) at = pos + node.text.indexOf(text) + text.length
    return true
  })
  assert.ok(at >= 0, `found "${text}"`)
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)))
}

// ── The bridge in the editor ─────────────────────────────────────────────

test('a Markdown string is MDX to the editor: as content and through setContent (reloads, restored drafts)', () => {
  withEditor('> [!NOTE]\n> From content.', (editor) => {
    assert.equal(editor.state.doc.firstChild?.type.name, 'callout')
    assert.ok(editor.commands.setContent('| a |\n| - |\n| 1 |\n\n<Figure src="/x.png" alt="X" />', { emitUpdate: false }))
    assert.deepEqual(
      editor.state.doc.content.content.slice(0, 2).map((n) => n.type.name),
      ['table', 'mdxBlock'],
      'a table and an island, not HTML',
    )
    assert.equal(markdownOf(editor), '| a |\n| - |\n| 1 |\n\n<Figure src="/x.png" alt="X" />')
    // Invalid MDX still opens (as plain Markdown): the visual tab is guarded before it gets here.
    assert.ok(editor.commands.setContent('<Broken', { emitUpdate: false }))
  })
})

// ── Callouts ─────────────────────────────────────────────────────────────

test('callouts read like the compiler (any case, escaped, inline text) and write as GitHub alerts', () => {
  const parsed = markdownToDoc('> [!tip] Inline title\n> continues.\n\n> \\[!WARNING\\] escaped\n\n> [!UNKNOWN] stays a quote')
  assert.deepEqual(
    parsed.content?.map((n) => [n.type, n.attrs?.type ?? null]),
    [
      ['callout', 'tip'],
      ['callout', 'warning'],
      ['blockquote', null],
    ],
  )
  assert.equal(parsed.content?.[0].content?.[0].content?.[0].text, 'Inline title\ncontinues.')
  // The marker on its own line, the body under it; a block other than a paragraph after a blank quote line.
  assert.equal(md(doc({ type: 'callout', attrs: { type: 'note' }, content: [p(t('A note.'))] })), '> [!NOTE]\n> A note.')
  assert.equal(
    md(doc({ type: 'callout', attrs: { type: 'caution' }, content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [p(t('first'))] }] }] })),
    '> [!CAUTION]\n>\n> - first',
  )
  assert.equal(md(doc({ type: 'callout', attrs: { type: 'important' }, content: [{ type: 'paragraph' }] })), '> [!IMPORTANT]')
  assert.equal(md(doc({ type: 'callout', attrs: { type: 'bogus' }, content: [p(t('x'))] })), '> [!NOTE]\n> x', 'an unknown type is a note')
})

test('callout commands: wrap, change type, unwrap; "[!TIP] " in a quote is the same callout', () => {
  withEditor('First paragraph.\n\nSecond paragraph.', (editor) => {
    caretAfter(editor, 'First')
    assert.ok(editor.commands.setCallout('tip'))
    assert.equal(markdownOf(editor), '> [!TIP]\n> First paragraph.\n\nSecond paragraph.')
    assert.ok(editor.commands.setCallout('warning'), 'inside a callout: change its type')
    assert.equal(markdownOf(editor), '> [!WARNING]\n> First paragraph.\n\nSecond paragraph.')
    assert.ok(editor.commands.unsetCallout())
    assert.equal(markdownOf(editor), 'First paragraph.\n\nSecond paragraph.')
  })
})

// ── Videos ───────────────────────────────────────────────────────────────

test('videos: only a lone top-level link is a player; titled ones write [title](url), untitled the bare URL', () => {
  const parsed = markdownToDoc('[Talk](https://youtu.be/jkAqK3vqILI)\n\nhttps://vimeo.com/76979871\n\n> [Quoted](https://youtu.be/jkAqK3vqILI)\n\n- https://youtu.be/jkAqK3vqILI')
  assert.deepEqual(
    parsed.content?.map((n) => n.type),
    ['videoEmbed', 'videoEmbed', 'blockquote', 'bulletList'],
  )
  assert.deepEqual(parsed.content?.[0].attrs, { url: 'https://youtu.be/jkAqK3vqILI', title: 'Talk' })
  assert.equal(parsed.content?.[1].attrs?.title, null)
  assert.equal(md(doc({ type: 'videoEmbed', attrs: { url: 'https://vimeo.com/76979871', title: null } })), 'https://vimeo.com/76979871')
  assert.equal(md(doc({ type: 'videoEmbed', attrs: { url: 'https://youtu.be/jkAqK3vqILI', title: 'A [live] talk' } })), '[A \\[live\\] talk](https://youtu.be/jkAqK3vqILI)')
  // An id with an underscore could read as emphasis in a bare URL: the explicit form instead.
  assert.equal(md(doc({ type: 'videoEmbed', attrs: { url: 'https://youtu.be/ab_cdEFghIJ', title: null } })), '[https://youtu.be/ab\\_cdEFghIJ](https://youtu.be/ab_cdEFghIJ)')
})

test('insertVideo lands at the top level, after the quote or list holding the caret', () => {
  withEditor('> A quote.\n\nAfter.', (editor) => {
    caretAfter(editor, 'A quote')
    assert.ok(editor.commands.insertVideo({ url: 'https://youtu.be/jkAqK3vqILI', title: 'Demo' }))
    assert.equal(markdownOf(editor), '> A quote.\n\n[Demo](https://youtu.be/jkAqK3vqILI)\n\nAfter.')
    assert.equal(editor.commands.insertVideo({ url: 'https://example.com/not-a-video' }), false)
  })
})

// ── Figures and inline images ────────────────────────────────────────────

test('a lone image is a figure (title = caption, #wide / #full kept); images in a line stay inline', () => {
  const parsed = markdownToDoc('![Chart](/uploads/c.png#wide "Caption")\n\nText ![icon](/uploads/i.png) here.\n\n![a](/uploads/a.png)\n![b](/uploads/b.png)')
  assert.deepEqual(parsed.content?.[0], { type: 'image', attrs: { src: '/uploads/c.png#wide', alt: 'Chart', title: 'Caption' } })
  assert.equal(parsed.content?.[1].content?.[1].type, 'inlineImage')
  assert.deepEqual(
    parsed.content?.[2].content?.map((n) => n.type),
    ['inlineImage', 'text', 'inlineImage'],
    'a gallery row keeps its line break',
  )
  assert.equal(md(doc({ type: 'image', attrs: { src: '/uploads/x.png#full', alt: 'X', title: 'The "x"', width: 800, height: 600 } })), '![X](/uploads/x.png#full "The \\"x\\"")')
})

// ── Tables ───────────────────────────────────────────────────────────────

test('tables keep column alignment, write a header row (empty when off) and pad ragged rows', () => {
  const parsed = markdownToDoc('| a | b | c |\n| :-- | :-: | --: |\n| 1 |\n| 1 | 2 | 3 | 4 |')
  const table = parsed.content?.[0]
  assert.equal(table?.type, 'table')
  assert.deepEqual(
    table?.content?.map((row) => row.content?.map((c) => [c.type, c.attrs?.align ?? null, c.content?.[0]?.text ?? ''])),
    [
      [
        ['tableHeader', 'left', 'a'],
        ['tableHeader', 'center', 'b'],
        ['tableHeader', 'right', 'c'],
      ],
      [
        ['tableCell', 'left', '1'],
        ['tableCell', 'center', ''],
        ['tableCell', 'right', ''],
      ],
      [
        ['tableCell', 'left', '1'],
        ['tableCell', 'center', '2'],
        ['tableCell', 'right', '3'],
      ],
    ],
  )
  assert.equal(roundTrip('| a | b | c |\n| :-- | :-: | --: |\n| 1 |\n| 1 | 2 | 3 | 4 |'), '| a | b | c |\n| :- | :-: | -: |\n| 1 | | |\n| 1 | 2 | 3 |')
  const headerless = markdownToDoc('|  |  |\n| --- | --- |\n| x | y |')
  assert.deepEqual(headerless.content?.[0].content?.map((r) => r.content?.map((c) => c.type)), [['tableCell', 'tableCell']], 'an empty header row means no header row')
  assert.equal(roundTrip('|  |  |\n| --- | --- |\n| x | y |'), '| | |\n| - | - |\n| x | y |')
  // Marks in cells; a cell has no line breaks.
  assert.equal(
    md(doc({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [t('H')] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [t('bold', [{ type: 'bold' }]), { type: 'hardBreak' }, t('x')] }] }] })),
    '| H |\n| - |\n| **bold** x |',
  )
})

test('table commands: header row stays first, alignment per column, rows move, GFM shape is kept', () => {
  withEditor('Intro', (editor) => {
    caretAfter(editor, 'Intro')
    assert.ok(editor.chain().insertTable({ rows: 3, cols: 2 }).run())
    assert.ok(editor.isActive('table'))
    assert.equal(editor.commands.addRowBefore(), false, 'nothing goes above the header row')
    assert.ok(type(editor, 'Name'))
    assert.ok(editor.commands.goToNextCell())
    assert.ok(type(editor, 'Value'))
    assert.ok(editor.commands.setColumnAlign('right'))
    assert.ok(editor.commands.goToNextCell())
    assert.ok(type(editor, 'one'))
    assert.ok(editor.commands.goToNextCell())
    assert.ok(type(editor, '1'))
    assert.ok(editor.commands.goToNextCell())
    assert.ok(type(editor, 'two'))
    assert.equal(markdownOf(editor), 'Intro\n\n| Name | Value |\n| - | -: |\n| one | 1 |\n| two | |')
    assert.ok(editor.commands.moveBlockUp(), 'Alt+↑ moves the row')
    assert.equal(markdownOf(editor), 'Intro\n\n| Name | Value |\n| - | -: |\n| two | |\n| one | 1 |')
    assert.equal(editor.commands.moveBlockUp(), false, 'not above the header row')
    assert.ok(editor.commands.toggleHeaderRow())
    assert.equal(markdownOf(editor), 'Intro\n\n| | |\n| - | -: |\n| Name | Value |\n| two | |\n| one | 1 |', 'header row off: an empty header')
    assert.ok(editor.commands.toggleHeaderRow())
    assert.ok(editor.commands.deleteColumn(), 'the caret’s column (the first)')
    assert.equal(markdownOf(editor), 'Intro\n\n| Value |\n| -: |\n| |\n| 1 |')
    assert.ok(editor.commands.deleteTable())
    assert.equal(markdownOf(editor), 'Intro')
  })
})

test('the table normaliser keeps header cells in the first row only and one alignment per column', () => {
  withEditor(
    {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { align: 'center' }, content: [t('h')] }, { type: 'tableCell', content: [t('mixed')] }] },
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [t('stray')] }, { type: 'tableCell', attrs: { align: 'right', colspan: 1 }, content: [t('x')] }] },
          ],
        },
      ],
    },
    (editor) => {
      const tr = normalizeTables(editor.state)
      assert.ok(tr)
      const after = editor.state.apply(tr)
      const cells: Array<[string, unknown]> = []
      after.doc.descendants((n) => {
        if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') cells.push([n.type.name, n.attrs.align])
        return true
      })
      assert.deepEqual(cells, [
        ['tableHeader', 'center'],
        ['tableHeader', null],
        ['tableCell', 'center'],
        ['tableCell', null],
      ])
      assert.equal(normalizeTables(after), null, 'stable')
    },
  )
})

// ── Moving blocks ────────────────────────────────────────────────────────

test('Alt+↑ / ↓: top-level blocks move whole, list items among their siblings; the caret moves along', () => {
  withEditor('One\n\n> Quote\n\n- a\n- b\n- c', (editor) => {
    caretAfter(editor, 'Quote')
    assert.ok(editor.commands.moveBlockUp())
    assert.equal(markdownOf(editor), '> Quote\n\nOne\n\n- a\n- b\n- c')
    assert.equal(editor.commands.moveBlockUp(), false, 'already first')
    assert.ok(type(editor, 'd'), 'the caret is still in the quote')
    assert.equal(markdownOf(editor), '> Quoted\n\nOne\n\n- a\n- b\n- c')
    caretAfter(editor, 'b')
    assert.ok(editor.commands.moveBlockDown())
    assert.equal(markdownOf(editor), '> Quoted\n\nOne\n\n- a\n- c\n- b')
    assert.equal(editor.commands.moveBlockDown(), false, 'already last in its list')
  })
})

// ── MDX islands ──────────────────────────────────────────────────────────

test('MDX islands keep their exact source, nested in quotes and lists too', () => {
  const source = '> Quote with <kbd>Ctrl</kbd>\n>\n> <Note>\n>   **inside**\n> </Note>\n\n- <Figure src="/uploads/a.png" alt="A" />\n- item'
  const parsed = markdownToDoc(source)
  const quote = parsed.content?.[0]
  assert.equal(quote?.content?.[0].content?.[1].type, 'mdxInline')
  assert.equal(quote?.content?.[0].content?.[1].attrs?.source, '<kbd>Ctrl</kbd>')
  assert.equal(quote?.content?.[1].attrs?.source, '<Note>\n  **inside**\n</Note>', 'the quote prefix is not part of the source')
  assert.equal(roundTrip(source), source)
  assert.deepEqual(describeIsland('<Figure src="x" />'), { kind: 'component', label: '<Figure>' })
  assert.equal(describeIsland('{/* a note */}').kind, 'comment')
  assert.equal(describeIsland('{year}').kind, 'expression')
  assert.equal(describeIsland("import X from 'y'").kind, 'esm')
  assert.deepEqual(describeIsland('[^n1]: The note.'), { kind: 'footnote', label: 'Footnote [^n1]' })
  assert.equal(describeIsland('[^n1]').kind, 'footnote-ref')
  assert.equal(describeIsland('[ref]: https://example.com').kind, 'definition')
})

test('the case-study outline keeps its guidance notes in the visual editor (MDX blocks), so the checklist still finds them', () => {
  const template = caseStudyTemplate()
  const doc = markdownToDoc(template)
  const types = doc.content?.map((n) => n.type) || []
  assert.equal(types.filter((t) => t === 'heading').length, 6)
  assert.equal(types.filter((t) => t === 'mdxBlock').length, 6)
  assert.ok(doc.content?.filter((n) => n.type === 'mdxBlock').every((n) => describeIsland(String(n.attrs?.source)).kind === 'comment'))
  const written = docToMarkdown(doc)
  assert.equal(written, template.trimEnd(), 'written back as it was')
  assert.equal(templateNoteLines(written).length, 6)
})

test('an edited island is read again: still MDX stays, plain Markdown becomes content, invalid MDX reports its line', () => {
  assert.deepEqual(readBlockIsland('<Figure src="/uploads/b.png" alt="B" />'), { ok: true, keep: true })
  const plain = readBlockIsland('Now just **text**.')
  assert.equal(plain.ok && !plain.keep && plain.content[0].type, 'paragraph')
  const broken = readBlockIsland('<Figure>\n\ntext')
  assert.equal(broken.ok, false)
  assert.ok(!broken.ok && broken.problem.line, 'a line number')
  assert.deepEqual(readBlockIsland('[^1]: Context-dependent: kept.'), { ok: true, keep: true })
  assert.deepEqual(readInlineIsland('[^1]'), { ok: true, keep: true }, 'a footnote reference cannot be read alone')
  const inline = readInlineIsland('plain *words*')
  assert.equal(inline.ok && !inline.keep && inline.content.length, 2)
  assert.equal(readInlineIsland('one\n\ntwo').ok, false)
  assert.deepEqual(readBlockIsland('   '), { ok: true, keep: false, content: [] })
})

// ── Marks ────────────────────────────────────────────────────────────────

test('marks: code inside links and bold, bold around a link, edge spaces outside the delimiters', () => {
  assert.equal(md(doc(p(t('api', [{ type: 'link', attrs: { href: 'https://example.com' } }, { type: 'code' }])))), '[`api`](https://example.com)')
  assert.equal(md(doc(p(t('x', [{ type: 'bold' }, { type: 'code' }])))), '**`x`**')
  assert.equal(md(doc(p(t('site', [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }])))), '**[site](https://example.com)**')
  assert.equal(md(doc(p(t('a ', [{ type: 'link', attrs: { href: '/x' } }, { type: 'bold' }]), t('b', [{ type: 'link', attrs: { href: '/x' } }])))), '[**a** b](/x)')
  assert.equal(md(doc(p(t('foo ', [{ type: 'bold' }]), t('bar')))), '**foo** bar')
  assert.equal(md(doc(p(t('  padded  '), { type: 'hardBreak' }))), 'padded', 'edge spaces and a final line break go')
  assert.equal(md(doc(p(t('a { b < c')))), 'a \\{ b \\< c', 'MDX braces and tags stay text')
  assert.equal(md(doc(p(t('both', [{ type: 'bold' }, { type: 'italic' }])))), '***both***')
})

test('code blocks keep the language and meta; lists keep start, spacing and task boxes', () => {
  assert.equal(roundTrip('```ts title="a.ts" {2}\nlet a = 1\n```'), '```ts title="a.ts" {2}\nlet a = 1\n```')
  assert.equal(roundTrip('3. three\n4. four'), '3. three\n4. four')
  assert.equal(roundTrip('- loose\n\n- list'), '- loose\n\n- list')
  assert.equal(roundTrip('- [ ] open\n- [x] done'), '- [ ] open\n- [x] done')
  withEditor('- [ ] open', (editor) => {
    caretAfter(editor, 'open')
    assert.ok(editor.commands.toggleTask(), '⌘↵ / Ctrl+↵')
    assert.equal(markdownOf(editor), '- [x] open')
  })
})

// ── Paste ────────────────────────────────────────────────────────────────

test('pasted text is read as Markdown only when it looks like Markdown', () => {
  for (const text of ['# Title\n\nBody', '- one\n- two', '| a | b |\n| - | - |\n| 1 | 2 |', '```js\nx()\n```', 'See [the docs](https://example.com).', 'Some **bold** words', '> quoted\n> lines', '1. first\n2. second']) {
    assert.ok(looksLikeMarkdown(text), text)
  }
  for (const text of ['Just a sentence.', '2 * 3 = 6 and 4 * 5 = 20', 'snake_case_name and other_name', 'Price: $5 - $10', 'a line\nanother line']) {
    assert.ok(!looksLikeMarkdown(text), text)
  }
  assert.equal(singleUrl(' https://example.com/a '), 'https://example.com/a')
  assert.equal(singleUrl('see https://example.com'), null)
  assert.equal(singleUrl('javascript:alert(1)'), null)
  assert.equal(singleVideoUrl('https://youtu.be/jkAqK3vqILI'), 'https://youtu.be/jkAqK3vqILI')
  assert.equal(singleVideoUrl('https://example.com'), null)
  assert.ok(isCodeEditorHtml('<div>x</div>', ['text/plain', 'text/html', 'vscode-editor-data']))
  assert.ok(isCodeEditorHtml('<meta charset="utf-8"><div style="color: #ccc; font-family: Menlo, Monaco; white-space: pre;"><div>x</div></div>', []))
  assert.ok(!isCodeEditorHtml('<h1>Title</h1><p>x</p>', []))
})

test('pasted Markdown becomes structure (lists, fences, tables, links) and raw HTML stays text', () => {
  const pasted = plainMarkdownToDoc('## Heading\n\n- [link](https://example.com)\n\n```sh\nls\n```\n\n| a |\n| - |\n| 1 |\n\n<b>not html</b> {x}')
  assert.deepEqual(
    pasted.content?.map((n) => n.type),
    ['heading', 'bulletList', 'codeBlock', 'table', 'paragraph'],
  )
  assert.equal(pasted.content?.[4].content?.map((n) => n.text).join(''), '<b>not html</b> {x}')
  withEditor('Before', (editor) => {
    const slice = markdownSlice(editor.schema, 'one **two**')
    assert.ok(slice)
    assert.equal(slice?.openStart, 1, 'a single paragraph flows into the line')
    const copied = sliceMarkdown(editor.schema.nodeFromJSON(doc(p(t('a ', [{ type: 'italic' }]), t('b')))).content)
    assert.equal(copied, '*a* b')
  })
})

// ── Fidelity guard and slash menu ────────────────────────────────────────

test('visualFidelity: invalid MDX reports where; islands are counted; same-extent nesting compares equal', () => {
  const bad = visualFidelity('Fine.\n\n<Figure src="x"\n\nmore')
  assert.equal(bad.ok, false)
  assert.ok(!bad.ok && bad.reason === 'parse' && (bad.problem.line ?? 0) >= 3, 'where the parser stopped')
  const ok = visualFidelity('Text {/* note */} and <kbd>K</kbd>.\n\n[^1]: Note.')
  assert.ok(ok.ok && ok.islands === 3)
  assert.deepEqual(canonicalMdast(parseMdx('**[x](/a)**')), canonicalMdast(parseMdx('[**x**](/a)')))
  assert.notDeepEqual(canonicalMdast(parseMdx('**a** [b](/x)')), canonicalMdast(parseMdx('[**a** b](/x)')))
})

test('slash menu: every new block has a command; the MDX tab inserts the same blocks as text', () => {
  const ids = filterSlashItems('', undefined, 'visual').map((i) => i.id)
  for (const id of ['table', 'note', 'tip', 'important', 'warning', 'caution', 'youtube', 'image', 'mdx']) assert.ok(ids.includes(id as never), id)
  assert.ok(!filterSlashItems('', undefined, 'raw').some((i) => i.id === 'mdx'), 'the MDX tab is source already')
  assert.equal(filterSlashItems('tab')[0].id, 'table')
  assert.equal(rawSnippet('table'), `| ${CARET_MARK} |  |\n| --- | --- |\n|  |  |`)
  assert.equal(rawSnippet('caution'), '> [!CAUTION]\n> |')
  assert.equal(roundTrip(rawSnippet('table').replace(CARET_MARK, '')), '| | |\n| - | - |\n| | |')
})
