import { test } from 'node:test'
import assert from 'node:assert/strict'
import { neighbours, relatedByTags, toArticleLink, type ArticleLink } from '../components/Article/collectionNav'
import { latestDate, isoDate, formatPostDate } from '../lib/postDate'

const link = (kind: 'blog' | 'work', slug: string, tags: string[]): ArticleLink => ({
  kind,
  slug,
  title: slug,
  permalink: `/${kind}/${slug}`,
  description: null,
  meta: null,
  lang: 'en',
  tags,
})

test('neighbours returns the items around a slug', () => {
  const list = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }]
  assert.deepEqual(neighbours(list, 'a'), { before: null, after: { slug: 'b' } })
  assert.deepEqual(neighbours(list, 'b'), { before: { slug: 'a' }, after: { slug: 'c' } })
  assert.deepEqual(neighbours(list, 'c'), { before: { slug: 'b' }, after: null })
  assert.deepEqual(neighbours(list, 'zzz'), { before: null, after: null })
})

test('relatedByTags ranks by shared tags across collections, excluding itself', () => {
  const pool = [
    link('blog', 'one', ['Edge AI']),
    link('blog', 'self', ['edge ai', 'YOLO']),
    link('work', 'self', ['Edge AI', 'YOLO', 'Jetson']),
    link('blog', 'none', ['Cooking']),
    link('work', 'two', ['yolo', ' Edge AI ']),
  ]
  const related = relatedByTags({ kind: 'blog', slug: 'self', tags: ['Edge AI', 'YOLO'] }, pool)
  assert.deepEqual(
    related.map((r) => `${r.kind}/${r.slug}`),
    ['work/self', 'work/two', 'blog/one'],
  )
  assert.deepEqual(relatedByTags({ kind: 'blog', slug: 'x', tags: [] }, pool), [])
  assert.equal(relatedByTags({ kind: 'blog', slug: 'self', tags: ['Edge AI'] }, pool, 1).length, 1)
})

test('toArticleLink maps blog tags / work tech and tolerates bad frontmatter', () => {
  const b = toArticleLink('blog', {
    slug: 's',
    permalink: '/blog/s',
    lang: 'zh-Hans',
    frontmatter: { title: ' T ', date: '2026-05-30', tags: ['A', 3, ''] },
  })
  assert.deepEqual(b, { kind: 'blog', slug: 's', title: 'T', permalink: '/blog/s', description: null, meta: '2026-05-30', lang: 'zh-Hans', tags: ['A'] })
  const w = toArticleLink('work', { slug: 'w', permalink: '/work/w', lang: 'en', frontmatter: { period: '2025', tech: 'nope' } })
  assert.equal(w.title, 'w')
  assert.equal(w.meta, '2025')
  assert.deepEqual(w.tags, [])
})

test('latestDate picks the newest of frontmatter dates and epoch-ms stamps', () => {
  assert.equal(latestDate(['2026-05-29', 1790134446571, 'garbage', null]), new Date(1790134446571).toISOString())
  assert.equal(latestDate(['2026-05-29', '2026-06-01']), '2026-06-01T00:00:00.000Z')
  assert.equal(latestDate([]), '')
  assert.equal(latestDate(['', undefined, 'x']), '')
})

test('isoDate / formatPostDate stay UTC-stable', () => {
  assert.equal(isoDate('2026-05-30'), '2026-05-30')
  assert.equal(isoDate(''), '')
  assert.equal(isoDate(2024), '2024-01-01')
  assert.equal(formatPostDate('2026-05-30'), 'May 30, 2026')
  assert.equal(formatPostDate('not a date'), 'not a date')
})
