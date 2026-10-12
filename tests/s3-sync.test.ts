import { test } from 'node:test'
import assert from 'node:assert/strict'
import matter from 'gray-matter'
import {
  SKEW_MS,
  canonicalJson,
  decideSync,
  jsonSafeFrontmatter,
  mapLimit,
  nameFromKey,
  parseMdx,
  prettyJson,
  sameJsonText,
  sameMdx,
  serializeMdx,
} from '../scripts/content-helpers.mjs'

const T = 1_790_000_000_000

test('decideSync: a git seed row never shadows R2, however new its timestamp', () => {
  assert.equal(decideSync({ local: { at: T + 86_400_000, isSeed: true }, remote: { at: T } }), 'pull')
})

test('decideSync: a real local edit newer than R2 is pushed back, not skipped', () => {
  assert.equal(decideSync({ local: { at: T + SKEW_MS + 1, isSeed: false }, remote: { at: T } }), 'push')
})

test('decideSync: R2 newer, or a tie within the skew window, pulls (content is compared before writing)', () => {
  assert.equal(decideSync({ local: { at: T, isSeed: false }, remote: { at: T + 60_000 } }), 'pull')
  assert.equal(decideSync({ local: { at: T + SKEW_MS, isSeed: false }, remote: { at: T } }), 'pull')
  assert.equal(decideSync({ local: { at: T, isSeed: false }, remote: { at: T + 50 } }), 'pull')
})

test('decideSync: one-sided keys', () => {
  assert.equal(decideSync({ local: null, remote: { at: T } }), 'pull')
  assert.equal(decideSync({ local: { at: T, isSeed: false }, remote: null }), 'push')
  assert.equal(decideSync({ local: { at: T, isSeed: true }, remote: null }), 'push')
  assert.equal(decideSync({ local: null, remote: null }), 'none')
})

test('decideSync: tombstones are respected unless R2 rewrote the slug after the deletion', () => {
  assert.equal(decideSync({ local: null, remote: { at: T }, tombstoneAt: T + 1000 }), 'delete-remote')
  assert.equal(decideSync({ local: null, remote: { at: T + SKEW_MS }, tombstoneAt: T }), 'delete-remote')
  assert.equal(decideSync({ local: null, remote: { at: T + SKEW_MS + 1 }, tombstoneAt: T }), 'pull')
})

test('jsonSafeFrontmatter matches the app: midnight dates become YYYY-MM-DD', () => {
  const out = jsonSafeFrontmatter({
    date: new Date('2024-05-01T00:00:00Z'),
    at: new Date('2024-05-01T10:30:00Z'),
    bad: new Date('nope'),
    tags: [new Date('2024-01-02T00:00:00Z'), 'x'],
    gone: undefined,
  })
  assert.deepEqual(out, { date: '2024-05-01', at: '2024-05-01T10:30:00.000Z', bad: null, tags: ['2024-01-02', 'x'] })
})

test('canonicalJson ignores key order at every depth', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: 2 } }), canonicalJson({ a: { c: 2, d: [1, { x: 2, y: 1 }] }, b: 1 }))
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]))
})

test('sameJsonText compares parsed JSON (pretty vs compact are equal)', () => {
  assert.equal(sameJsonText('{"a":1,"b":[1,2]}', '{\n  "b": [1, 2],\n  "a": 1\n}'), true)
  assert.equal(sameJsonText('{"a":1}', '{"a":2}'), false)
  assert.equal(sameJsonText('{bad', '{bad'), true)
  assert.equal(sameJsonText('{bad', '{"a":1}'), false)
})

test('MDX round trip through R2 serialisation is not treated as an edit', () => {
  const doc = { frontmatter: { title: 'Hello', date: '2024-05-01', tags: ['a'] }, body: 'First line\n\nSecond' }
  const back = parseMdx(matter, serializeMdx(matter, doc.frontmatter, doc.body))
  assert.equal(sameMdx(doc, back), true)
  assert.equal(sameMdx(doc, { ...back, body: back.body + 'more' }), false)
  assert.equal(sameMdx(doc, { ...back, frontmatter: { ...back.frontmatter, title: 'Other' } }), false)
})

test('parseMdx normalises unquoted YAML dates like the app does', () => {
  const parsed = parseMdx(matter, '---\ntitle: X\ndate: 2024-05-01\n---\nBody\n')
  assert.deepEqual(parsed.frontmatter, { title: 'X', date: '2024-05-01' })
  assert.throws(() => parseMdx(matter, '---\ntitle: [unclosed\n---\nBody'))
})

test('prettyJson pretty-prints valid JSON and leaves anything else untouched', () => {
  assert.equal(prettyJson('{"a":1}'), '{\n  "a": 1\n}')
  assert.equal(prettyJson('{oops'), '{oops')
})

test('nameFromKey accepts only safe basenames with the expected extension', () => {
  assert.equal(nameFromKey('blog/hello-world.mdx'), 'hello-world')
  assert.equal(nameFromKey('blog/hello.md'), 'hello')
  assert.equal(nameFromKey('data/home.json', /\.json$/), 'home')
  assert.equal(nameFromKey('data/tombstones:blog.json', /\.json$/), null)
  assert.equal(nameFromKey('blog/Hello.mdx'), null)
  assert.equal(nameFromKey('blog/readme.txt'), null)
})

test('mapLimit keeps order and never exceeds the concurrency limit', async () => {
  let inFlight = 0
  let peak = 0
  const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n: number) => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, n))
    inFlight--
    return n * 10
  })
  assert.deepEqual(out, [50, 10, 40, 20, 30])
  assert.equal(peak, 2)
  assert.deepEqual(await mapLimit([], 4, async () => 1), [])
})
