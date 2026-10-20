/**
 * The visual editor's Markdown serializer (editor/markdown) keeps image alt
 * text, keeps a block image on its own paragraph, and never writes the
 * display-only width / height into the Markdown. Runs a headless TipTap
 * Editor (no DOM: content is given as ProseMirror JSON).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { baseExtensions } from '../components/Admin/editor/extensions'

function markdownOf(content: Record<string, unknown>): string {
  const editor = new Editor({ element: undefined, extensions: baseExtensions(), content })
  try {
    const storage = editor.storage as unknown as { markdown: { getMarkdown: () => string } }
    return storage.markdown.getMarkdown()
  } finally {
    editor.destroy()
  }
}

const image = (attrs: Record<string, unknown>) => ({ type: 'image', attrs })
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

test("'![alt text](/uploads/a.png)' round-trips through the serializer", () => {
  assert.equal(markdownOf({ type: 'doc', content: [image({ src: '/uploads/a.png', alt: 'alt text' })] }), '![alt text](/uploads/a.png)')
})

test('a block image stays its own paragraph and drops width/height', () => {
  const md = markdownOf({
    type: 'doc',
    content: [paragraph('Before'), image({ src: '/uploads/a.png', alt: 'A chart', width: 1280, height: 720 }), paragraph('After')],
  })
  assert.equal(md, 'Before\n\n![A chart](/uploads/a.png)\n\nAfter')
})

test('alt text and URLs are escaped', () => {
  const md = markdownOf({ type: 'doc', content: [image({ src: '/uploads/a(1).png', alt: 'Graph [v2]', title: 'Say "hi"' })] })
  assert.equal(md, '![Graph \\[v2\\]](/uploads/a\\(1\\).png "Say \\"hi\\"")')
})

test('an image without alt serializes with an empty alt', () => {
  assert.equal(markdownOf({ type: 'doc', content: [image({ src: '/uploads/b.webp' })] }), '![](/uploads/b.webp)')
})
