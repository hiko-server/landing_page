import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caseStudySlug, chipList, matchCaseStudy, normalise, titleKeys } from '../components/LandingPage/projectMatch'

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

test('an owner-chosen caseStudy slug wins when it exists', () => {
  // Title alone would match nothing; the slug links it.
  assert.equal(matchCaseStudy({ title: 'Personal Portfolio & CV Management System', caseStudy: 'raku' }, works)?.slug, 'raku')
  // The slug beats a title that strictly matches a different case study.
  assert.equal(matchCaseStudy({ title: 'Carboy', caseStudy: 'swcs' }, works)?.slug, 'swcs')
  // "/work/<slug>" and stray case / slashes are accepted.
  assert.equal(matchCaseStudy({ title: '', caseStudy: ' /work/Project-Carboy/ ' }, works)?.slug, 'project-carboy')
  assert.equal(caseStudySlug('/work/raku/'), 'raku')
  assert.equal(caseStudySlug(7), '')
})

test('an unknown caseStudy slug is ignored and the strict title match applies', () => {
  assert.equal(matchCaseStudy({ title: 'Carboy', caseStudy: 'does-not-exist' }, works)?.slug, 'project-carboy')
  assert.equal(matchCaseStudy({ title: 'Smart Waste', caseStudy: 'nope' }, works), null)
  assert.equal(matchCaseStudy({ title: 'Carboy', caseStudy: '' }, works)?.slug, 'project-carboy')
  assert.equal(matchCaseStudy({ caseStudy: 'raku' }, []), null)
})
