import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuzzyMatch, highlightSegments, rankItems } from '../components/Article/fuzzyMatch'

test('fuzzyMatch prefers exact > prefix > word start > substring > scattered', () => {
  const exact = fuzzyMatch('cv', 'CV')!.score
  const prefix = fuzzyMatch('cv', 'CV in 中文')!.score
  const word = fuzzyMatch('cv', 'Download CV (PDF)')!.score
  const scattered = fuzzyMatch('gh', 'GitHub')!.score
  assert.ok(exact > prefix && prefix > word && word > scattered)
  assert.deepEqual(fuzzyMatch('cv', 'Download CV (PDF)')!.indices, [9, 10])
})

test('fuzzyMatch finds scattered word-start matches and rejects noise', () => {
  assert.deepEqual(fuzzyMatch('gh', 'GitHub')!.indices, [0, 3])
  assert.deepEqual(fuzzyMatch('vsg', 'View source on GitHub')!.indices, [0, 5, 15])
  assert.equal(fuzzyMatch('xyz', 'GitHub'), null)
  assert.equal(fuzzyMatch('ab', 'a.................................b'), null)
  assert.deepEqual(fuzzyMatch('', 'x'), { score: 0, indices: [] })
  // A word-start jump is not taken when it would make the rest unmatchable.
  assert.deepEqual(fuzzyMatch('ab', 'xa-b a')!.indices, [1, 3])
  // CJK characters are word starts on their own.
  assert.ok(fuzzyMatch('中文', 'CV in 中文'))
})

test('rankItems requires every token, ranks best first and highlights label hits', () => {
  const items = [
    { label: 'Writing', keywords: 'blog posts essays' },
    { label: 'Download CV (PDF)', keywords: 'resume pdf print' },
    { label: 'CV', keywords: 'resume curriculum' },
    { label: 'CV in 中文', keywords: 'chinese zh resume' },
  ]
  const cv = rankItems(items, 'cv')
  assert.equal(cv[0].item.label, 'CV')
  assert.equal(cv.length, 3)
  const resumePdf = rankItems(items, 'resume pdf')
  assert.deepEqual(resumePdf.map((r) => r.item.label), ['Download CV (PDF)'])
  assert.deepEqual(rankItems(items, 'blog')[0].indices, [])
  const boosted = rankItems(items, 'cv', (it) => (it.label === 'CV in 中文' ? 100 : 0))
  assert.equal(boosted[0].item.label, 'CV in 中文')
  assert.equal(rankItems(items, '  ').length, items.length)
})

test('highlightSegments groups consecutive matches', () => {
  assert.deepEqual(highlightSegments('GitHub', [0, 3]), [
    { text: 'G', match: true },
    { text: 'it', match: false },
    { text: 'H', match: true },
    { text: 'ub', match: false },
  ])
  assert.deepEqual(highlightSegments('abc', []), [{ text: 'abc', match: false }])
  assert.deepEqual(highlightSegments('', []), [])
})
