/**
 * CV Studio: case-study links resolve as /cv resolves them. The A4 preview
 * links a project's case study only when it is PUBLISHED (the slug the
 * owner typed, else a strict title match) — never a /work/<slug> that would
 * answer 404 — and the project editor says why a typed slug gets no link.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caseStudyFieldNote, publishedCaseStudies } from '../lib/caseStudyLinks'
import { projectLinks, withEvidenceLinks } from '../lib/cvLinks'
import { publicSections } from '../lib/cvVisibility'

const INDEX = [
  { slug: 'example-tracker', title: 'Example Tracker: a synthetic project' },
  { slug: 'draft-study', title: 'A Draft Study', draft: true },
]

const project = (caseStudy: string, title = 'Some Synthetic Project') => ({
  sessionName: 'project',
  headerName: 'Projects',
  projectExperience: [{ title, caseStudy, description: '', url: '', repo: '' }],
})

const caseLinks = (sections: any[]) =>
  sections.flatMap((s) => (s.sessionName === 'project' ? s.projectExperience.flatMap((p: unknown) => projectLinks(p)) : [])).filter((l) => l.kind === 'caseStudy')

test('the index narrows to published case studies; unknown stays unknown', () => {
  assert.deepEqual(publishedCaseStudies(INDEX), [{ slug: 'example-tracker', title: 'Example Tracker: a synthetic project' }])
  assert.equal(publishedCaseStudies(null), null)
  assert.deepEqual(publishedCaseStudies([]), [])
})

test('the preview links only a published case study (as /cv does): a slug with no case study, or a draft, links nothing', () => {
  const works = publishedCaseStudies(INDEX) || []
  const resolve = (doc: any[]) => caseLinks(withEvidenceLinks(publicSections(doc, 'cv'), { works }))
  assert.deepEqual(resolve([project('example-tracker')]).map((l) => l.path), ['/work/example-tracker'])
  assert.deepEqual(resolve([project('/work/example-tracker/')]).map((l) => l.path), ['/work/example-tracker'])
  assert.deepEqual(resolve([project('synthetic-missing-slug')]), [], 'no link to a page that does not exist')
  assert.deepEqual(resolve([project('draft-study')]), [], 'a draft is not public')
  // A title that matches a published case study links it, as on /cv.
  assert.deepEqual(resolve([project('', 'Example Tracker')]).map((l) => l.path), ['/work/example-tracker'])
  // Without the index (not loaded, or failed): no case-study links at all.
  assert.deepEqual(caseLinks(withEvidenceLinks(publicSections([project('example-tracker')], 'cv'), { works: [] })), [])
  // Before: the raw slug was linked.
  assert.deepEqual(caseLinks(publicSections([project('synthetic-missing-slug')], 'cv')).map((l) => l.path), ['/work/synthetic-missing-slug'])
})

test('the project editor names a slug that matches nothing (or a draft); nothing to say otherwise', () => {
  assert.equal(caseStudyFieldNote('synthetic-missing-slug', INDEX), 'No published case study at /work/synthetic-missing-slug, so the CV shows no link. Check the slug, or publish the case study.')
  assert.match(caseStudyFieldNote('/work/Draft-Study', INDEX), /^No published case study at \/work\/draft-study: it is still a draft/)
  assert.equal(caseStudyFieldNote('example-tracker', INDEX), '')
  assert.equal(caseStudyFieldNote('', INDEX), '')
  assert.equal(caseStudyFieldNote('anything', null), '', 'unknown index: no claim either way')
})
