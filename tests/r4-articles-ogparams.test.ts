/** /api/og parameters (C4): strict validation, and URLs built to match. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOgParams, OG_LIMITS } from '../lib/security/ogParams'
import { ogImageUrl, SITE_URL } from '../lib/schema'

const parse = (q: Record<string, string>) => parseOgParams(new URLSearchParams(q))

test('date must be a real YYYY-MM-DD', () => {
  assert.equal(parse({ date: '2026-05-30' }).date, '2026-05-30')
  assert.equal(parse({ date: '2026-02-30' }).date, '')
  assert.equal(parse({ date: '2026-5-3' }).date, '')
  assert.equal(parse({ date: '2026-05-30T00:00:00Z' }).date, '')
})

test('mins is an integer 1–99', () => {
  assert.equal(parse({ mins: '7' }).mins, 7)
  assert.equal(parse({ mins: '99' }).mins, 99)
  assert.equal(parse({ mins: '0' }).mins, null)
  assert.equal(parse({ mins: '100' }).mins, null)
  assert.equal(parse({ mins: '3.5' }).mins, null)
  assert.equal(parse({ mins: '-2' }).mins, null)
})

test('tags: at most three, each clamped to 24 chars', () => {
  const p = parse({ tags: `a,b,,c,d,${'x'.repeat(40)}` })
  assert.deepEqual(p.tags, ['a', 'b', 'c'])
  const long = parse({ tags: 'y'.repeat(40) }).tags[0]
  assert.equal(Array.from(long).length, OG_LIMITS.tag)
})

test('cover only accepts same-site PNG/JPEG uploads (no SSRF, no undecodable formats)', () => {
  assert.equal(parse({ cover: '/uploads/1780-photo.jpg' }).cover, '/uploads/1780-photo.jpg')
  assert.equal(parse({ cover: '/uploads/a.PNG' }).cover, '/uploads/a.PNG')
  for (const bad of [
    'https://evil.example/a.jpg',
    '//evil.example/a.jpg',
    '/uploads/../secret.jpg',
    '/uploads/a/b.jpg',
    '/uploads/.hidden.jpg',
    '/uploads/a.webp',
    '/uploads/a.jpg?x=1',
    '/images/a.jpg',
    'file:///etc/passwd',
  ]) {
    assert.equal(parse({ cover: bad }).cover, '', bad)
  }
})

test('lang, size and v are enumerations / digits', () => {
  assert.equal(parse({ lang: 'zh' }).lang, 'zh')
  assert.equal(parse({ lang: 'fr' }).lang, 'en')
  assert.equal(parse({ size: 'square' }).size, 'square')
  assert.equal(parse({ size: 'huge' }).size, 'default')
  assert.equal(parse({ v: '1780000000000' }).v, '1780000000000')
  assert.equal(parse({ v: '12a' }).v, '')
  assert.deepEqual(parseOgParams(new URLSearchParams()), {
    title: 'LUCIAN-DEV.COM',
    kind: 'page',
    subtitle: '',
    date: '',
    mins: null,
    tags: [],
    cover: '',
    lang: 'en',
    size: 'default',
    v: '',
  })
})

test('ogImageUrl emits only parameters the endpoint accepts', () => {
  const url = new URL(
    ogImageUrl({
      kind: 'blog',
      title: 'Post',
      lang: 'zh',
      size: 'square',
      date: '2026-05-30',
      mins: 6.4,
      tags: ['Edge AI', 'YOLO', 'Jetson', 'extra'],
      cover: '/uploads/c.jpg',
      v: 1780000000123,
    }),
  )
  assert.equal(url.origin + url.pathname, `${SITE_URL}/api/og`)
  const p = parseOgParams(url.searchParams)
  assert.equal(p.lang, 'zh')
  assert.equal(p.size, 'square')
  assert.equal(p.date, '2026-05-30')
  assert.equal(p.mins, 6)
  assert.deepEqual(p.tags, ['Edge AI', 'YOLO', 'Jetson'])
  assert.equal(p.cover, '/uploads/c.jpg')
  assert.equal(p.v, '1780000000123')
  // Unsupported covers and defaults are simply left out.
  const plain = new URL(ogImageUrl({ kind: 'work', title: 'W', cover: '/uploads/c.webp', lang: 'en' }))
  assert.deepEqual([...plain.searchParams.keys()].sort(), ['kind', 'title'])
})
