import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chipList, matchCaseStudy, normalise, titleKeys } from '../components/LandingPage/projectMatch'

const works = [
  { slug: 'swcs', title: 'Smart Waste Classification System (SWCS)', tech: ['Edge AI', 'YOLO'] },
  { slug: 'project-carboy', title: 'Carboy' },
  { slug: 'raku', title: 'RAKU' },
]

test('normalise strips punctuation, case and accents', () => {
  assert.equal(normalise('  Café — Déjà-Vu (v2) '), 'cafe deja vu v2')
  assert.equal(normalise(42), '')
})

test('title keys cover the whole title, parentheticals and the name before a colon', () => {
  const keys = titleKeys('Project RAKU: AI Assistant Job Search System')
  assert.ok(keys.includes('raku'))
  assert.ok(keys.includes('raku ai assistant job search system'))
  assert.ok(keys.includes('ai assistant job search system'))
  assert.deepEqual(titleKeys('WeGreen AI (wegreen.ltd)').sort(), ['wegreen ai', 'wegreen ai wegreen ltd', 'wegreen ltd'])
  assert.deepEqual(titleKeys('AI'), [], 'keys shorter than 3 characters are ignored')
})

test('matches by slug, acronym or title — exactly', () => {
  assert.equal(matchCaseStudy('Project RAKU: AI Assistant Job Search System', works)?.slug, 'raku')
  assert.equal(matchCaseStudy('SWCS', works)?.slug, 'swcs')
  assert.equal(matchCaseStudy('Smart Waste Classification System', works)?.slug, 'swcs')
  assert.equal(matchCaseStudy('Carboy', works)?.slug, 'project-carboy')
})

test('never links on partial overlap', () => {
  assert.equal(matchCaseStudy('WeGreen AI (wegreen.ltd)', works), null)
  assert.equal(matchCaseStudy('Smart Waste', works), null)
  assert.equal(matchCaseStudy('Personal Portfolio & CV Management System', works), null)
  assert.equal(matchCaseStudy('', works), null)
  assert.equal(matchCaseStudy('Carboy', []), null)
  assert.equal(matchCaseStudy('Carboy', undefined), null)
})

test('chipList trims, de-duplicates and caps', () => {
  assert.deepEqual(chipList([' YOLO ', 'yolo', '', 3, 'Jetson']), ['YOLO', 'Jetson'])
  assert.deepEqual(chipList(['a', 'b', 'c'], 2), ['a', 'b'])
  assert.deepEqual(chipList(undefined), [])
})
