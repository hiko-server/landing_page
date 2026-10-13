import { test } from 'node:test'
import assert from 'node:assert/strict'
import { latestWriting, skillGroups, skillLevel } from '../components/LandingPage/projectMatch'
import { headlineWords, heroWordStyle } from '../components/LandingPage/heroReveal'

const post = (slug: string, date: string, extra: Record<string, unknown> = {}) => ({
  slug,
  readingMinutes: 4,
  lang: 'en',
  updatedAt: null,
  frontmatter: { title: `Post ${slug}`, description: `About ${slug}`, date },
  ...extra,
})
const work = (slug: string, updatedAt: number | null, extra: Record<string, unknown> = {}) => ({
  slug,
  readingMinutes: 6,
  lang: 'en',
  updatedAt,
  frontmatter: { title: `Work ${slug}` },
  ...extra,
})

test('latestWriting merges posts and case studies, newest first, capped', () => {
  const items = latestWriting(
    [post('a', '2026-05-29'), post('b', '2026-05-30')],
    [work('w', Date.UTC(2026, 5, 2)), work('old', Date.UTC(2025, 0, 1))],
    3,
  )
  assert.deepEqual(
    items.map((i) => [i.kind, i.href, i.date]),
    [
      ['work', '/work/w', '2026-06-02'],
      ['post', '/blog/b', '2026-05-30'],
      ['post', '/blog/a', '2026-05-29'],
    ],
  )
  assert.equal(items[1].title, 'Post b')
  assert.equal(items[1].description, 'About b')
  assert.equal(items[1].readingMinutes, 4)
})

test('latestWriting puts undated items last and keeps posts before case studies on a tie', () => {
  const items = latestWriting([post('p', '2026-01-01'), post('nodate', '')], [work('w', Date.UTC(2026, 0, 1)), work('none', null)], 10)
  assert.deepEqual(
    items.map((i) => i.href),
    ['/blog/p', '/work/w', '/blog/nodate', '/work/none'],
  )
  assert.equal(items[2].date, '')
})

test('latestWriting falls back to the slug as title, keeps the language and survives bad input', () => {
  const [item] = latestWriting([{ slug: 'zh-post', lang: 'zh-Hans', frontmatter: { date: '2026-02-02' } }], null)
  assert.equal(item.title, 'zh-post')
  assert.equal(item.lang, 'zh-Hans')
  assert.equal(item.readingMinutes, 0)
  assert.deepEqual(latestWriting(undefined, undefined), [])
  assert.deepEqual(latestWriting([post('a', '2026-01-01')], [], 0), [])
})

test('skillLevel keeps a one-word level inline and turns a sentence into a note', () => {
  assert.deepEqual(skillLevel('Proficient.'), { level: 'Proficient' })
  assert.deepEqual(skillLevel('Intermediate'), { level: 'Intermediate' })
  assert.deepEqual(skillLevel('Experienced in backend development.'), { note: 'Experienced in backend development.' })
  assert.deepEqual(skillLevel(''), {})
  assert.deepEqual(skillLevel(undefined), {})
})

test('skillGroups builds Core skills and the technical groups from the CV, never versions', () => {
  const section = {
    sessionName: 'skill',
    languages: [
      { language: 'Python', level: 'Proficient.' },
      { language: 'React', level: 'Experienced in React-based frontend and full-stack development.' },
      { language: '', level: 'Orphan level' },
      { language: 'python', level: 'Duplicate' },
    ],
    technical: [
      { name: 'Tools & Platforms', description: ['Git', 'Docker', '', 'git'] },
      { name: 'Empty group', description: [] },
      { name: '', description: ['NGINX'] },
    ],
  }
  assert.deepEqual(skillGroups(section), [
    {
      label: 'Core skills',
      items: [
        { name: 'Python', level: 'Proficient' },
        { name: 'React', note: 'Experienced in React-based frontend and full-stack development.' },
      ],
    },
    { label: 'Tools & Platforms', items: [{ name: 'Git' }, { name: 'Docker' }] },
    { label: 'Skills', items: [{ name: 'NGINX' }] },
  ])
})

test('skillGroups respects hidden entries and fields, and an absent section', () => {
  const section = {
    sessionName: 'skill',
    languages: [
      { language: 'C++', level: 'Intermediate.', isVisible: false },
      { language: 'Java', level: 'Familiar.', hiddenFields: ['level'] },
    ],
    technical: [{ name: 'Hidden', description: ['X'], isVisible: false }],
  }
  assert.deepEqual(skillGroups(section), [{ label: 'Core skills', items: [{ name: 'Java' }] }])
  assert.deepEqual(skillGroups(undefined), [])
  assert.deepEqual(skillGroups({ sessionName: 'skill' }), [])
})

test('headlineWords splits a Latin name and keeps a CJK name whole', () => {
  assert.deepEqual(headlineWords('  Li   Yanpei '), ['Li', 'Yanpei'])
  assert.deepEqual(headlineWords('李彦霈'), ['李彦霈'])
  assert.deepEqual(headlineWords(''), [])
  assert.deepEqual(headlineWords(null), [])
  assert.deepEqual(heroWordStyle(2), { '--i': 2 })
})
