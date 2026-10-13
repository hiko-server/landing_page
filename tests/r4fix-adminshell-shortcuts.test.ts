import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'

// Node strips TypeScript types but does not compile JSX: transpile .tsx
// components with the project's TypeScript so their exports can be tested.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      let ts
      export async function initialize(data) { ts = (await import(data.ts)).default }
      export async function load(url, context, next) {
        if (!url.startsWith('file:') || !url.endsWith('.tsx')) return next(url, context)
        const { readFile } = await import('node:fs/promises')
        const source = await readFile(new URL(url), 'utf8')
        const out = ts.transpileModule(source, {
          fileName: url,
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        return { format: 'module', source: out.outputText, shortCircuit: true }
      }
    `),
  {
    parentURL: import.meta.url,
    data: { ts: pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href },
  }
)

const { overlayShortcutGroups, authoringShortcutGroup } = await import('../components/Admin/shell/ShortcutsOverlay')

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const flat = (isMac: boolean) => overlayShortcutGroups(isMac, 6).flatMap((g) => g.items.map((it) => ({ ...it, group: g.title })))

test('the overlay lists the authoring shortcuts with platform labels', () => {
  const mac = authoringShortcutGroup(true).items.map((it) => it.keys.join('+'))
  const other = authoringShortcutGroup(false).items.map((it) => it.keys.join('+'))
  assert.deepEqual(mac, ['⌘+⇧+P', '/', '⌘+K'])
  assert.deepEqual(other, ['Ctrl+Shift+P', '/', 'Ctrl+K'])
  for (const isMac of [true, false]) {
    const groups = overlayShortcutGroups(isMac, 6)
    assert.equal(groups.at(-1)?.title, authoringShortcutGroup(isMac).title)
    const labels = authoringShortcutGroup(isMac).items.map((it) => it.label)
    assert.match(labels[0], /live preview/i)
    assert.match(labels[0], /Write \| Preview/)
    assert.match(labels[1], /Visual and MDX/)
    assert.match(labels[2], /link/i)
    assert.match(labels[2], /Visual tab/)
  }
})

test('each authoring binding appears exactly once and no other platform glyph leaks', () => {
  for (const isMac of [true, false]) {
    const items = flat(isMac)
    for (const it of authoringShortcutGroup(isMac).items) {
      assert.equal(items.filter((x) => x.keys.join('+') === it.keys.join('+') && x.label === it.label).length, 1)
    }
    const keys = items.flatMap((it) => it.keys)
    if (isMac) assert.ok(!keys.includes('Ctrl') && !keys.includes('Shift'), 'macOS shows ⌘ / ⇧')
    else assert.ok(!keys.includes('⌘') && !keys.includes('⇧'), 'elsewhere shows Ctrl / Shift')
    // The admin-wide groups are still there.
    assert.ok(items.some((it) => it.keys[0] === '?'))
    assert.ok(items.some((it) => it.label === 'Save the open editor'))
    assert.ok(overlayShortcutGroups(isMac, 6).every((g) => g.items.length > 0))
  }
})

test('the listed bindings match what the editors implement', () => {
  const preview = read('components/Admin/shell/LivePreview.tsx')
  assert.match(preview, /\(e\.metaKey \|\| e\.ctrlKey\) && e\.shiftKey && !e\.altKey && e\.key\.toLowerCase\(\) === 'p'/)
  const editor = read('components/Admin/RichEditor.tsx')
  assert.match(editor, /\(event\.metaKey \|\| event\.ctrlKey\) && !event\.altKey && event\.key\.toLowerCase\(\) === 'k'[\s\S]{0,120}openLink\(\)/)
  assert.match(editor, /createSlashCommand\(/, 'Visual tab slash menu')
  assert.match(editor, /slashTriggerAt\(/, 'MDX tab slash menu')
  assert.match(editor, /<Tab \{\.\.\.tabStyle\}>Visual<\/Tab>/)
  assert.match(editor, /<Tab \{\.\.\.tabStyle\}>MDX<\/Tab>/)
})
