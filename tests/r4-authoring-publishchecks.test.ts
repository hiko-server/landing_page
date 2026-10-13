import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canPublish,
  findImages,
  internalTarget,
  isFilenameAlt,
  runPublishChecks,
  slugFromTitle,
  type PublishCheckInput,
} from '../components/Admin/shell/publishChecks'

const base = (over: Partial<PublishCheckInput> = {}): PublishCheckInput => ({
  title: 'Shipping a CMS without losing edits',
  description: 'How local drafts, If-Match and snapshots keep every edit safe in a one-person CMS.',
  body: 'Plain text.',
  slug: 'shipping-a-cms',
  cover: '',
  collection: 'blog',
  knownSlugs: { blog: ['other-post'], work: ['portfolio'] },
  siteHost: 'lucian-dev.com',
  ...over,
})

const byId = (input: PublishCheckInput, prefix: string) => runPublishChecks(input).filter((c) => c.id.startsWith(prefix))

test('a clean item passes and can be published', () => {
  const checks = runPublishChecks(base())
  assert.ok(checks.every((c) => c.level === 'ok'), JSON.stringify(checks))
  assert.equal(canPublish(checks), true)
})

test('title: over 70 characters warns, empty blocks', () => {
  assert.equal(byId(base({ title: 'x'.repeat(70) }), 'title')[0].level, 'ok')
  const long = byId(base({ title: 'x'.repeat(71) }), 'title')[0]
  assert.equal(long.level, 'warning')
  assert.equal(long.field, 'title')
  const empty = runPublishChecks(base({ title: '  ' }))
  assert.equal(empty.find((c) => c.id === 'title')?.level, 'error')
  assert.equal(canPublish(empty), false)
})

test('description: empty, under 50 and over 160 warn; 50–160 passes', () => {
  assert.equal(byId(base({ description: '' }), 'description')[0].level, 'warning')
  assert.equal(byId(base({ description: 'x'.repeat(49) }), 'description')[0].level, 'warning')
  assert.equal(byId(base({ description: 'x'.repeat(50) }), 'description')[0].level, 'ok')
  assert.equal(byId(base({ description: 'x'.repeat(160) }), 'description')[0].level, 'ok')
  assert.equal(byId(base({ description: 'x'.repeat(161) }), 'description')[0].level, 'warning')
})

test('images: empty alt, file-name alt and "image" warn with the line; code is ignored', () => {
  const body = [
    'Intro',
    '![](/uploads/a.png)',
    '![IMG_2041.JPG](/uploads/b.jpg)',
    '![Image](/uploads/c.webp)',
    '<Figure src="/uploads/d.png" alt="" caption="x" />',
    '![A team at a whiteboard](/uploads/e.png)',
    '```md',
    '![](/uploads/in-code.png)',
    '```',
    'and `![](/uploads/inline-code.png)` too',
  ].join('\n')
  const alts = byId(base({ body }), 'alt-')
  assert.deepEqual(
    alts.map((c) => c.line),
    [2, 3, 4, 5],
  )
  assert.ok(alts.every((c) => c.level === 'warning' && c.field === 'body'))
  assert.equal(findImages(body).length, 5)
  assert.equal(isFilenameAlt('photo.jpeg'), true)
  assert.equal(isFilenameAlt('A photo of a cat'), false)
})

test('remote images: https elsewhere offers import; own host and relative do not; http is insecure', () => {
  const body = [
    '![Chart](https://cdn.example.com/chart.png)',
    '![Logo](https://lucian-dev.com/uploads/logo.png)',
    '![Logo](https://www.lucian-dev.com/uploads/logo.png)',
    '![Old](http://old.example.com/a.png)',
    '![Local](/uploads/x.png)',
  ].join('\n')
  const remote = byId(base({ body, cover: 'https://images.example.org/cover.jpg' }), 'remote-')
  assert.deepEqual(
    remote.map((c) => [c.field, c.importUrl ?? null, c.line ?? null]),
    [
      ['body', 'https://cdn.example.com/chart.png', 1],
      ['body', null, 4],
      ['cover', 'https://images.example.org/cover.jpg', null],
    ],
  )
  assert.ok(remote.every((c) => c.level === 'warning'))
})

test('internal links: unknown /blog and /work slugs warn; known, own and absolute site links resolve', () => {
  const body = [
    'See [the other post](/blog/other-post) and [the portfolio](/work/portfolio#stack).',
    'Also [me](/blog/shipping-a-cms) and [abs](https://lucian-dev.com/blog/other-post/).',
    'Broken: [gone](/blog/deleted-post) and <a href="/work/missing">x</a>.',
    'External [link](https://example.com/blog/whatever) is ignored.',
  ].join('\n')
  const links = byId(base({ body }), 'link-')
  assert.deepEqual(
    links.map((c) => [c.label, c.line]),
    [
      ['Link to /blog/deleted-post goes nowhere', 3],
      ['Link to /work/missing goes nowhere', 3],
    ],
  )
  assert.equal(internalTarget('https://example.com/blog/x', 'lucian-dev.com'), null)
  assert.deepEqual(internalTarget('/work/a-b?x=1', 'lucian-dev.com'), { collection: 'work', slug: 'a-b' })
})

test('slug: empty or invalid blocks publishing', () => {
  assert.equal(canPublish(runPublishChecks(base({ slug: '' }))), false)
  assert.equal(canPublish(runPublishChecks(base({ slug: 'Bad Slug' }))), false)
})

test('slugFromTitle: ASCII words joined by "-", accents folded, max 64, empty for non-ASCII titles', () => {
  assert.equal(slugFromTitle('Hello, World! 2026'), 'hello-world-2026')
  assert.equal(slugFromTitle('Café crème — notes'), 'cafe-creme-notes')
  assert.equal(slugFromTitle('我的 Next.js 笔记'), 'next-js')
  assert.equal(slugFromTitle('我的第一篇文章'), '')
  const long = slugFromTitle('word '.repeat(40))
  assert.ok(long.length <= 64)
  assert.ok(!long.endsWith('-'))
  assert.equal(slugFromTitle('x'.repeat(80)), 'x'.repeat(64))
})
