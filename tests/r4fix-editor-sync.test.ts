/**
 * The rich editor's loop guards (components/Admin/editor/editorSync.ts):
 * content equality, when an incoming `value` is (not) given to TipTap, and
 * the selector equality that keeps metadata-only transactions — the kind
 * TipTap's <BubbleMenu> dispatches on every render — from re-rendering the
 * editor (the React #185 "maximum update depth" loop after a 409).
 * Runs a headless TipTap Editor (no DOM: content is ProseMirror JSON).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { baseExtensions } from '../components/Admin/editor/extensions'
import {
  EMPTY_TOOLBAR_STATE,
  normalizeMarkdown,
  planVisualSync,
  sameMarkdown,
  sameToolbarState,
  sameViewSnapshot,
  viewSnapshot,
} from '../components/Admin/editor/editorSync'

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...texts: string[]) => ({ type: 'doc', content: texts.map(paragraph) })

function withEditor(content: Record<string, unknown>, run: (editor: Editor) => void) {
  const editor = new Editor({ element: undefined, extensions: baseExtensions(), content })
  try {
    run(editor)
  } finally {
    editor.destroy()
  }
}

const markdownOf = (editor: Editor) =>
  (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown()

test('Markdown equality ignores line endings and trailing whitespace only', () => {
  assert.equal(normalizeMarkdown('a\r\nb\rc\n\n  '), 'a\nb\nc')
  assert.ok(sameMarkdown('First version.\n', 'First version.'))
  assert.ok(sameMarkdown('a\r\n\r\nb', 'a\n\nb\n'))
  assert.ok(!sameMarkdown('a\n\nb', 'a\nb'))
  assert.ok(!sameMarkdown('  indented', 'indented'))
  assert.ok(!sameMarkdown('*a*', '_a_'))
})

test('a value TipTap already holds is never set again', () => {
  let serialised = 0
  const current = () => {
    serialised++
    return 'ignored'
  }
  // The editor's own echo (onUpdate → parent state → value prop).
  assert.equal(planVisualSync('Hello **there**', 'Hello **there**', current), 'none')
  // A trailing newline from the server is the same content.
  assert.equal(planVisualSync('First version.\n', 'First version.', current), 'none')
  assert.equal(serialised, 0, 'the document is only serialised when the value differs')
})

test('a value the document already serialises to is recorded, not applied', () => {
  assert.equal(planVisualSync('Body\n', 'Older body', () => 'Body'), 'record')
})

test('a different value is applied; without an editor to ask it is applied too', () => {
  assert.equal(planVisualSync('New body', 'Old body', () => 'Old body'), 'apply')
  assert.equal(planVisualSync('New body', 'Old body', () => null), 'apply')
  assert.equal(planVisualSync('New body', 'Old body'), 'apply')
  // Clearing the body is a change, too.
  assert.equal(planVisualSync('', 'Old body', () => 'Old body'), 'apply')
})

test('the echo of a programmatic setContent settles in one step', () => {
  withEditor(doc('Old body'), (editor) => {
    let updates = 0
    editor.on('update', () => updates++)
    let lastApplied = markdownOf(editor)
    // An outside value arrives (load / reload / draft restore).
    editor.commands.setContent(doc('First version.'), { emitUpdate: false })
    lastApplied = 'First version.\n'
    assert.equal(updates, 0, 'programmatic content never emits an update')
    // The same value arriving again (or re-serialised by TipTap) is a no-op.
    assert.equal(planVisualSync('First version.\n', lastApplied, () => markdownOf(editor)), 'none')
    assert.equal(planVisualSync(markdownOf(editor), lastApplied, () => markdownOf(editor)), 'none')
  })
})

test('metadata-only transactions keep the bubble snapshot equal', () => {
  withEditor(doc('Hello world'), (editor) => {
    const before = viewSnapshot(editor.state, true)
    // What <BubbleMenu> dispatches whenever its props change.
    const next = editor.state.apply(editor.state.tr.setMeta('linkBubble', { type: 'updateOptions', options: {} }))
    assert.ok(sameViewSnapshot(before, viewSnapshot(next, true)))
    const shown = next.apply(next.tr.setMeta('linkBubble', 'show'))
    assert.ok(sameViewSnapshot(before, viewSnapshot(shown, true)))
  })
})

test('document, selection, stored-mark and editability changes do re-render the bubbles', () => {
  withEditor(doc('Hello world'), (editor) => {
    const state = editor.state
    const before = viewSnapshot(state, true)

    const typed = state.apply(state.tr.insertText('!', 1))
    assert.ok(!sameViewSnapshot(before, viewSnapshot(typed, true)))

    const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)))
    assert.ok(!sameViewSnapshot(before, viewSnapshot(selected, true)))

    const bold = state.apply(state.tr.addStoredMark(state.schema.marks.bold.create()))
    assert.ok(!sameViewSnapshot(before, viewSnapshot(bold, true)))

    assert.ok(!sameViewSnapshot(before, viewSnapshot(state, false)))
    assert.ok(sameViewSnapshot(null, null))
    assert.ok(!sameViewSnapshot(before, null))
  })
})

test('toolbar state compares by value', () => {
  assert.ok(sameToolbarState({ ...EMPTY_TOOLBAR_STATE }, { ...EMPTY_TOOLBAR_STATE }))
  assert.ok(!sameToolbarState({ ...EMPTY_TOOLBAR_STATE, bold: true }, { ...EMPTY_TOOLBAR_STATE }))
  assert.ok(!sameToolbarState({ ...EMPTY_TOOLBAR_STATE, canUndo: true }, { ...EMPTY_TOOLBAR_STATE }))
  assert.ok(!sameToolbarState(EMPTY_TOOLBAR_STATE, null))
})
