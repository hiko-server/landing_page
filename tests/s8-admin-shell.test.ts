import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectMdxRisks, summarizeMdxRisks } from '../components/Admin/shell/mdxRisk'
import { diffJson, formatDiffValue } from '../components/Admin/shell/jsonDiff'
import {
  isSaveShortcut,
  tabShortcutIndex,
  tabShortcutLabel,
} from '../components/Admin/shell/shortcuts'
import {
  loginHref,
  parseRevalidated,
  uploadFailureMessage,
  uploadFilename,
} from '../components/Admin/shell/http'
import {
  loginErrorMessage,
  resetPasswordErrorMessage,
  resetRequestErrorMessage,
} from '../components/Admin/shell/authMessages'

const kinds = (src: string) => detectMdxRisks(src).map((r) => r.kind)

test('plain markdown is safe for the visual editor', () => {
  const md = [
    '# Title',
    '',
    'Some **bold** text with a [link](https://x.y) and <https://auto.link>.',
    '',
    '- a < b and c > d',
    '- mail <me@example.com>',
    '',
    '---',
    '',
    '> quote',
  ].join('\n')
  assert.deepEqual(detectMdxRisks(md), [])
  assert.deepEqual(detectMdxRisks(''), [])
})

test('detects JSX, ESM, expressions, tables and footnotes', () => {
  const md = [
    "import Chart from '../components/Chart'",
    'export const meta = { a: 1 }',
    '',
    '<Callout type="info">',
    'Hello',
    '</Callout>',
    '',
    'Year {new Date().getFullYear()}',
    '',
    '| a | b |',
    '| --- | :-: |',
    '| 1 | 2 |',
    '',
    'A claim.[^1]',
    '',
    '[^1]: Source.',
    '<br/>',
    '<>fragment</>',
  ].join('\n')
  const risks = detectMdxRisks(md)
  assert.deepEqual(
    risks.map((r) => r.kind),
    ['jsx', 'esm', 'expression', 'table', 'footnote']
  )
  const jsx = risks.find((r) => r.kind === 'jsx')!
  assert.equal(jsx.count, 4)
  assert.deepEqual(jsx.lines, [4, 6, 17])
  assert.equal(risks.find((r) => r.kind === 'table')!.lines[0], 10)
  assert.equal(risks.find((r) => r.kind === 'footnote')!.count, 2)
  assert.match(summarizeMdxRisks(risks), /^JSX \/ HTML tags \(4\), import \/ export lines \(2\)/)
})

test('ignores constructs inside fenced and inline code', () => {
  const md = [
    'Use `<Callout>` and `{x}` inline.',
    '',
    '```tsx',
    "import x from 'y'",
    '<Foo bar={1} />',
    '| a | b |',
    '| - | - |',
    '```',
    '',
    '~~~~',
    '<Bar/>',
    '```',
    '~~~~',
    'after',
  ].join('\n')
  assert.deepEqual(kinds(md), [])
})

test('a table needs a delimiter row under a piped header', () => {
  assert.deepEqual(kinds('a | b\n--- | ---\n1 | 2'), ['table'])
  assert.deepEqual(kinds('Heading\n---'), [])
  assert.deepEqual(kinds('just | a pipe'), [])
})

test('diffJson reports added, removed and changed paths', () => {
  const before = { hero: { brand: 'A', tags: ['x', 'y'] }, 'odd key': 1, gone: true }
  const after = { hero: { brand: 'B', tags: ['x'] }, 'odd key': 2, fresh: { n: 1 } }
  const d = diffJson(before, after)
  assert.deepEqual(d.entries, [
    { path: 'hero.brand', kind: 'changed', before: 'A', after: 'B' },
    { path: 'hero.tags[1]', kind: 'removed', before: 'y' },
    { path: '["odd key"]', kind: 'changed', before: 1, after: 2 },
    { path: 'gone', kind: 'removed', before: true },
    { path: 'fresh', kind: 'added', after: { n: 1 } },
  ])
  assert.deepEqual(d.counts, { added: 1, removed: 2, changed: 2 })
  assert.equal(d.total, 5)
})

test('diffJson: equal documents, type changes and the limit', () => {
  assert.equal(diffJson({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }).total, 0)
  assert.deepEqual(diffJson({ a: [1] }, { a: { 0: 1 } }).entries, [
    { path: 'a', kind: 'changed', before: [1], after: { 0: 1 } },
  ])
  assert.deepEqual(diffJson(1, 2).entries[0].path, '(root)')
  const big = diffJson(
    Array.from({ length: 10 }, (_, i) => i),
    [],
    3
  )
  assert.equal(big.entries.length, 3)
  assert.equal(big.total, 10)
})

test('formatDiffValue renders compact, truncated JSON', () => {
  assert.equal(formatDiffValue(undefined), '—')
  assert.equal(formatDiffValue('a'), '"a"')
  assert.equal(formatDiffValue({ a: 1 }), '{"a":1}')
  assert.equal(formatDiffValue('x'.repeat(50), 10).length, 10)
})

const key = (over: Partial<Parameters<typeof tabShortcutIndex>[0]>) => ({
  key: '1',
  code: 'Digit1',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over,
})

test('tab shortcuts avoid browser-reserved and editor combinations', () => {
  const mac = { isMac: true, inEditable: false }
  const pc = { isMac: false, inEditable: false }
  assert.equal(tabShortcutIndex(key({ ctrlKey: true }), 4, mac), 0)
  assert.equal(tabShortcutIndex(key({ altKey: true, key: '¡' }), 4, mac), 0)
  assert.equal(
    tabShortcutIndex(key({ altKey: true, key: '¡' }), 4, { isMac: true, inEditable: true }),
    null
  )
  assert.equal(tabShortcutIndex(key({ ctrlKey: true }), 4, { isMac: true, inEditable: true }), 0)
  assert.equal(tabShortcutIndex(key({ metaKey: true }), 4, mac), null)
  assert.equal(tabShortcutIndex(key({ altKey: true, code: 'Digit3', key: '3' }), 4, pc), 2)
  assert.equal(tabShortcutIndex(key({ ctrlKey: true }), 4, pc), null)
  assert.equal(tabShortcutIndex(key({ ctrlKey: true, altKey: true }), 4, pc), null)
  assert.equal(tabShortcutIndex(key({ altKey: true, code: 'Digit5', key: '5' }), 4, pc), null)
  assert.equal(tabShortcutIndex(key({ altKey: true, shiftKey: true }), 4, pc), null)
  assert.equal(tabShortcutIndex(key({ altKey: true, code: 'KeyS', key: 's' }), 4, pc), null)
  assert.equal(tabShortcutLabel(true, 4), '⌃1–4')
  assert.equal(tabShortcutLabel(false, 4), 'Alt+1–4')
})

test('isSaveShortcut matches ⌘S / Ctrl+S only', () => {
  assert.equal(isSaveShortcut(key({ key: 's', metaKey: true })), true)
  assert.equal(isSaveShortcut(key({ key: 'S', ctrlKey: true })), true)
  assert.equal(isSaveShortcut(key({ key: 's', ctrlKey: true, altKey: true })), false)
  assert.equal(isSaveShortcut(key({ key: 's', metaKey: true, shiftKey: true })), false)
  assert.equal(isSaveShortcut(key({ key: 's' })), false)
})

test('loginHref encodes the return path and refuses off-site targets', () => {
  assert.equal(
    loginHref('/admin/blog/edit?slug=a&b=1'),
    '/admin/login?next=%2Fadmin%2Fblog%2Fedit%3Fslug%3Da%26b%3D1'
  )
  assert.equal(loginHref('//evil.example'), '/admin/login?next=%2Fadmin')
  assert.equal(loginHref('https://evil.example'), '/admin/login?next=%2Fadmin')
})

test('parseRevalidated keeps unique site paths only', () => {
  assert.deepEqual(parseRevalidated({ revalidated: ['/blog', '/blog/a', '/blog', 'x', 3] }), [
    '/blog',
    '/blog/a',
  ])
  assert.deepEqual(parseRevalidated({}), [])
  assert.deepEqual(parseRevalidated(null), [])
})

test('upload helpers', () => {
  assert.match(uploadFailureMessage(413, {}), /too large/)
  assert.equal(uploadFailureMessage(400, { error: 'Invalid dataUrl' }), 'Invalid dataUrl')
  assert.equal(uploadFailureMessage(502, {}), 'Upload failed (HTTP 502).')
  assert.equal(uploadFilename('My Photo (1).JPG', undefined, 5), '5-My-Photo-1.jpg')
  assert.equal(uploadFilename('???.png', 'webp', 5), '5-image.webp')
  assert.equal(uploadFilename('noext', undefined, 5), '5-noext.png')
})

test('auth messages stay generic', () => {
  assert.match(loginErrorMessage(401), /don’t match/)
  assert.equal(loginErrorMessage(429), resetRequestErrorMessage(429))
  assert.doesNotMatch(loginErrorMessage(429), /lock/i)
  assert.match(resetPasswordErrorMessage(400, 'Invalid or expired token'), /invalid or has expired/)
  assert.match(resetPasswordErrorMessage(400, 'Password must be 12–1024 characters'), /between 12/)
})

import { dashboardQuery, parseDashboardQuery } from '../components/Admin/shell/dashboardTabs'

test('dashboard tabs round-trip through the query string', () => {
  assert.deepEqual(parseDashboardQuery({}), { tab: 'home', view: 'studio' })
  assert.deepEqual(parseDashboardQuery({ tab: 'CV', view: 'raw' }), { tab: 'cv', view: 'raw' })
  assert.deepEqual(parseDashboardQuery({ tab: 'history' }), { tab: 'versions', view: 'studio' })
  assert.deepEqual(parseDashboardQuery({ tab: 'storage', view: 'raw' }), {
    tab: 'storage',
    view: 'studio',
  })
  assert.deepEqual(parseDashboardQuery({ tab: ['cv', 'home'] }), { tab: 'cv', view: 'studio' })
  assert.deepEqual(parseDashboardQuery({ tab: 'nope' }), { tab: 'home', view: 'studio' })
  assert.deepEqual(dashboardQuery({ tab: 'cv', view: 'raw', x: '1' }, 'home'), {
    tab: 'home',
    x: '1',
  })
  assert.deepEqual(dashboardQuery({}, 'cv', 'raw'), { tab: 'cv', view: 'raw' })
})

import { parseRestoreReport } from '../components/Admin/shell/storageReport'

test('parseRestoreReport normalises the pull report', () => {
  assert.equal(parseRestoreReport({ ok: true }), null)
  assert.equal(parseRestoreReport(null), null)
  assert.deepEqual(
    parseRestoreReport({
      report: {
        dbReplaced: true,
        r2Mirrored: 12,
        r2Removed: -1,
        revalidated: ['/blog', 'x', 4],
        warnings: ['w', ''],
      },
    }),
    { dbReplaced: true, r2Mirrored: 12, r2Removed: 0, revalidated: ['/blog'], warnings: ['w'] }
  )
  assert.deepEqual(parseRestoreReport({ report: {} }), {
    dbReplaced: false,
    r2Mirrored: 0,
    r2Removed: 0,
    revalidated: [],
    warnings: [],
  })
})

import { saveToastCopy } from '../components/Admin/shell/http'

test('saveToastCopy reports refreshed and late pages', () => {
  assert.deepEqual(saveToastCopy({ revalidated: ['/now'] }), {
    status: 'success',
    description: 'Refreshed /now',
  })
  assert.deepEqual(saveToastCopy({}), { status: 'success', description: undefined })
  const late = saveToastCopy({ revalidated: ['/blog'], revalidateFailed: ['/blog/a'] })
  assert.equal(late.status, 'warning')
  assert.match(late.description || '', /\/blog\/a.*it updates within 60 s/)
})

import { isDraftStale, parseStoredDraft } from '../components/Admin/shell/useLocalDraft'

test('isDraftStale: a draft is stale when it was based on another server version', () => {
  assert.equal(isDraftStale(null, '"5"'), false)
  assert.equal(isDraftStale({ etag: '"5"' }, '"5"'), false)
  assert.equal(isDraftStale({ etag: '"5"' }, '"6"'), true)
  assert.equal(isDraftStale({ etag: null }, null), false, 'new item, never saved')
  assert.equal(isDraftStale({ etag: null }, '"6"'), true, 'started before the first save landed elsewhere')
})

test('parseStoredDraft ignores malformed storage', () => {
  assert.deepEqual(parseStoredDraft('{"at":1,"etag":"\\"2\\"","value":{"body":"x"}}'), { at: 1, etag: '"2"', value: { body: 'x' } })
  assert.deepEqual(parseStoredDraft('{"at":1,"value":"v"}'), { at: 1, etag: null, value: 'v' })
  assert.equal(parseStoredDraft(null), null)
  assert.equal(parseStoredDraft('not json'), null)
  assert.equal(parseStoredDraft('{"value":1}'), null)
  assert.equal(parseStoredDraft('[]'), null)
})

import { filterSlashItems, normalizeLinkHref, rawCodeFence, youtubeId, youtubeTag } from '../components/Admin/editor/slashItems'
import { headingIndexAt, offsetOfLineColumn, slashTriggerAt } from '../components/Admin/editor/textareaCaret'

test('slash menu: filtering, YouTube ids, link validation and raw snippets', () => {
  // reading-work added the Note / Tip / Warning callouts and the case-study outline.
  assert.equal(filterSlashItems('').length, 14)
  assert.equal(filterSlashItems('h2')[0].id, 'h2')
  assert.equal(filterSlashItems('vid')[0].id, 'youtube')
  assert.deepEqual(filterSlashItems('zzzz'), [])
  for (const url of [
    'https://www.youtube.com/watch?v=jkAqK3vqILI&t=10',
    'https://youtu.be/jkAqK3vqILI',
    'youtube.com/shorts/jkAqK3vqILI',
    'https://www.youtube-nocookie.com/embed/jkAqK3vqILI',
    'jkAqK3vqILI',
  ]) {
    assert.equal(youtubeId(url), 'jkAqK3vqILI', url)
  }
  assert.equal(youtubeId('https://vimeo.com/123'), null)
  assert.equal(youtubeId('https://youtube.com/watch?v=short'), null)
  assert.equal(youtubeTag('jkAqK3vqILI', 'Talk "intro" <live>'), '<YouTube id="jkAqK3vqILI" title="Talk &quot;intro&quot; &#60;live&#62;" />')
  assert.equal(normalizeLinkHref('example.com/x'), 'https://example.com/x')
  assert.equal(normalizeLinkHref('/blog/a'), '/blog/a')
  assert.equal(normalizeLinkHref('#section'), '#section')
  assert.equal(normalizeLinkHref('mailto:me@example.com'), 'mailto:me@example.com')
  assert.equal(normalizeLinkHref('javascript:alert(1)'), null)
  assert.equal(normalizeLinkHref('//evil.example'), null)
  assert.equal(rawCodeFence('ts; rm'), '```tsrm\n|\n```')
})

test('raw editor helpers: "/" trigger, line/column offsets, heading under the caret', () => {
  assert.deepEqual(slashTriggerAt('Hello\n/co', 9), { from: 6, query: 'co' })
  assert.deepEqual(slashTriggerAt('word /', 6), { from: 5, query: '' })
  assert.equal(slashTriggerAt('a/b', 3), null, 'no trigger inside a word or URL')
  const text = 'one\ntwo\nthree'
  assert.equal(offsetOfLineColumn(text, 2, 2), 5)
  assert.equal(offsetOfLineColumn(text, 99, 1), 8, 'clamped to the last line')
  assert.equal(offsetOfLineColumn(text, 1, 99), 3, 'clamped to the line end')
  const doc = '# A\ntext\n```\n# not a heading\n```\n## B\nmore'
  assert.equal(headingIndexAt(doc, 0), -1)
  assert.equal(headingIndexAt(doc, doc.indexOf('text')), 0)
  assert.equal(headingIndexAt(doc, doc.indexOf('not a')), 0)
  assert.equal(headingIndexAt(doc, doc.length), 1)
})
