/**
 * The admin editor (TipTap) needs ONE prosemirror-model: with two copies,
 * wrapping (blockquote, bullet list, the slash menu's list / quote items, the
 * "> " shortcut) and list-item splits throw "Can not convert <> to a
 * Fragment". package.json pins prosemirror-model / -transform / -view in
 * "resolutions"; this runs those commands through the same module paths the
 * editor bundle resolves (@tiptap/pm/*), so a duplicate fails here first.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Transform } from '@tiptap/pm/transform'
import { wrapIn } from '@tiptap/pm/commands'
import { splitListItem, wrapInList } from '@tiptap/pm/schema-list'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    blockquote: { group: 'block', content: 'block+', toDOM: () => ['blockquote', 0] },
    bullet_list: { group: 'block', content: 'list_item+', toDOM: () => ['ul', 0] },
    list_item: { content: 'paragraph block*', toDOM: () => ['li', 0] },
    text: {},
  },
})

const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])

function run(state: EditorState, command: (s: EditorState, d: (tr: Transaction) => void) => boolean): EditorState {
  let next = state
  const ok = command(state, (tr) => {
    next = state.apply(tr)
  })
  assert.equal(ok, true, 'command applied')
  return next
}

test('wrapping a paragraph in a blockquote and a bullet list works', () => {
  const doc = schema.node('doc', null, [p('hello')])
  const at = EditorState.create({ doc, selection: TextSelection.create(doc, 3) })
  const quoted = run(at, wrapIn(schema.nodes.blockquote))
  assert.equal(quoted.doc.firstChild?.type.name, 'blockquote')
  const listed = run(at, wrapInList(schema.nodes.bullet_list))
  assert.equal(listed.doc.firstChild?.type.name, 'bullet_list')
  // A bare transform from the transform package against the model package.
  const tr = new Transform(doc)
  const range = doc.resolve(1).blockRange(doc.resolve(6))
  assert.ok(range)
  tr.wrap(range, [{ type: schema.nodes.blockquote }])
  assert.equal(tr.doc.firstChild?.type.name, 'blockquote')
})

test('Enter at the end of a list item splits it into a new item', () => {
  const doc = schema.node('doc', null, [schema.node('bullet_list', null, [schema.node('list_item', null, [p('one')])])])
  // Inside list_item > paragraph: 1 (list) + 1 (item) + 1 (paragraph) + 3 chars.
  const end = EditorState.create({ doc, selection: TextSelection.create(doc, 6) })
  const split = run(end, splitListItem(schema.nodes.list_item))
  assert.equal(split.doc.firstChild?.childCount, 2)
})
