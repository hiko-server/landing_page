/**
 * cv-docs E2 / E5: the document model behind the downloadable CVs, the
 * plain-text CV and the JSON Resume (lib/cvExport). Same values as the A4
 * sheet (fields.ts accessors), dated file names, the "Updated" marker, ISO
 * dates without an end for running entries, full https URLs in text.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicSections } from '../lib/cvVisibility'
import { withEvidenceLinks } from '../lib/cvLinks'
import { buildCvModel, hasContent, modelStrings } from '../lib/cvExport/model'
import { monthLabel, monthOf, updatedLabel } from '../lib/cvExport/updated'
import { renderCvText, displayWidth } from '../lib/cvExport/text'
import { buildJsonResume, isoDate, languageOf, JSON_RESUME_SCHEMA } from '../lib/cvExport/jsonResume'
import { ALL_EXPORT_PATHS, EXPORT_PATHS, cvFileBase, cvFileName, inlineDisposition, isExportFormat } from '../lib/cvExport/files'

const NOW = '2026-10'
// 2026-10-13T00:35:19Z — 08:35 on 13 Oct in Hong Kong.
const SAVED = Date.UTC(2026, 9, 13, 0, 35, 19)

const cv = (lang: 'en' | 'zh' = 'en') =>
  withEvidenceLinks(
    publicSections(
      [
        {
          sessionName: 'personalInformation',
          firstName: lang === 'zh' ? '彦霈' : 'Yanpei',
          lastName: lang === 'zh' ? '李' : 'Li',
          nickName: 'Lucian',
          email: 'owner@example.test',
          phoneNumber: '+852 0000 0000',
          personalWebsite: 'example.org',
          address: 'Kowloon, Hong Kong',
          introduction: 'A hidden summary',
          hiddenFields: ['introduction'],
        },
        {
          sessionName: 'education',
          headerName: 'EDUCATION',
          educationExperience: [
            { schoolName: 'Uni A', schoolLocation: 'Hong Kong', degree: 'MSc in AI', major: 'AI', startDate: '2026-09', endDate: '2028-12', gpa: '' },
            { schoolName: 'Uni B', degree: 'BSc Computer Engineering', startDate: '2024-09', endDate: '2026-06', gpa: '3.6' },
          ],
        },
        {
          sessionName: 'workExperience',
          headerName: 'EXPERIENCE',
          experiences: [
            {
              jobTitle: 'CTO',
              companyName: 'Startup',
              companyURL: 'startup.example',
              location: 'Hong Kong',
              startDate: '2024-11',
              endDate: 'Present',
              jobDescription: 'Led the team.',
              features: [{ description: 'Built the product', furtherExplanation: ['in 6 months'] }],
              relatedSkills: ['Python', 'IoT'],
            },
          ],
        },
        {
          sessionName: 'project',
          headerName: 'PROJECTS',
          projectExperience: [{ title: 'Sorter', startDate: '2025-01', endDate: '2027-01', description: 'Edge AI.', caseStudy: 'swcs', features: [] }],
        },
        { sessionName: 'skill', headerName: 'SKILLS', languages: [{ language: 'Python', level: 'Proficient.' }], technical: [{ name: 'Tools', description: ['Docker', 'Git'] }] },
        { sessionName: 'extraSkill', headerName: 'LANGUAGES', points: ['Mandarin: Native', 'English: Fluent'] },
        { sessionName: 'certification', headerName: 'CERTS', isVisible: false, certifications: [{ issuingOrganization: 'X', CertificationList: [{ certificationName: 'Off the CV' }] }] },
      ],
      'cv',
    ),
    { works: [{ slug: 'swcs', title: 'SWCS', repo: 'https://github.com/example/swcs' }], socials: { github: 'https://github.com/example-owner' } },
  )

test('the "Updated" marker: Hong Kong month of the last save, EN and 中文', () => {
  assert.equal(monthOf(SAVED), '2026-10')
  assert.equal(monthOf(Date.UTC(2026, 8, 30, 17, 0, 0)), '2026-10', 'after 16:00 UTC on 30 Sep it is already October in Hong Kong')
  assert.equal(monthOf(0), '')
  assert.equal(monthLabel('2026-10', 'en'), 'October 2026')
  assert.equal(monthLabel('2026-10', 'zh'), '2026 年 10 月')
  assert.equal(updatedLabel('2026-10', 'en'), 'Updated October 2026')
  assert.equal(updatedLabel('2026-10', 'zh'), '更新于 2026 年 10 月')
  assert.equal(updatedLabel('', 'en'), '')
})

test('stable URLs, dated ASCII file names, inline disposition', () => {
  assert.deepEqual(EXPORT_PATHS.en, { pdf: '/cv.pdf', txt: '/cv.txt', json: '/cv.json' })
  assert.deepEqual(EXPORT_PATHS.zh, { pdf: '/cv/zh.pdf', txt: '/cv/zh.txt', json: '/cv/zh.json' })
  assert.equal(ALL_EXPORT_PATHS.length, 6)
  const pi = { firstName: 'Yánpei', lastName: 'Li' }
  assert.equal(cvFileBase(pi, 'en', '2026-10'), 'Li-Yanpei-CV-2026-10')
  assert.equal(cvFileBase(pi, 'zh', '2026-10'), 'Li-Yanpei-CV-zh-2026-10')
  assert.equal(cvFileBase({ firstName: 'Yanpei', lastName: 'Li', redacted: ['lastName', 'firstName'] }, 'en', '2026-10'), 'CV-2026-10', 'hidden name → neutral name')
  assert.equal(cvFileBase({ firstName: '彦霈', lastName: '李' }, 'en', ''), 'CV')
  assert.equal(cvFileName('Li-Yanpei-CV-2026-10', 'pdf'), 'Li-Yanpei-CV-2026-10.pdf')
  assert.equal(inlineDisposition('Li-Yanpei-CV-2026-10.pdf'), `inline; filename="Li-Yanpei-CV-2026-10.pdf"; filename*=UTF-8''Li-Yanpei-CV-2026-10.pdf`)
  assert.ok(isExportFormat('json') && !isExportFormat('html'))
})

test('model: the sheet’s values in CV order, hidden summary and off-CV sections absent, links resolved', () => {
  const m = buildCvModel(cv(), { lang: 'en', now: NOW, updatedAt: SAVED, canonical: 'https://lucian-dev.com/cv' })
  assert.equal(m.name, 'Lucian LI, Yanpei')
  assert.equal(m.summary, '', 'the hidden introduction is not in the model')
  assert.equal(m.contacts.email, 'owner@example.test')
  assert.deepEqual(m.contacts.profiles.map((p) => p.href), ['https://github.com/example-owner'])
  assert.deepEqual(m.sections.map((s) => s.id), ['education', 'workExperience', 'project', 'skill', 'extraSkill'])
  const edu = m.sections[0]
  assert.equal(edu.kind, 'entries')
  if (edu.kind === 'entries') {
    assert.deepEqual([edu.entries[0].title, edu.entries[0].subtitle, edu.entries[0].date], ['MSc in AI', 'Uni A, Hong Kong', 'Sep 2026 – Expected Dec 2028'])
    assert.equal(edu.entries[1].note, 'GPA: 3.6')
    assert.equal(edu.entries[1].anchor, 'cv-education-1')
  }
  const work = m.sections[1]
  if (work.kind === 'entries') {
    assert.equal(work.entries[0].date, 'Nov 2024 – Present')
    assert.equal(work.entries[0].subtitleHref, 'https://startup.example')
    assert.deepEqual(work.entries[0].bullets, [{ text: 'Built the product', sub: ['in 6 months'] }])
    assert.deepEqual(work.entries[0].tags, ['Python', 'IoT'])
  }
  const proj = m.sections[2]
  if (proj.kind === 'entries') {
    assert.equal(proj.entries[0].date, 'Jan 2025 – Present', 'a future end on a project reads "Present", like the sheet')
    assert.deepEqual(proj.entries[0].links.map((l) => l.kind), ['caseStudy', 'repo'])
  }
  assert.equal(m.updatedLabel, 'Updated October 2026')
  assert.deepEqual(m.keywords, ['Python', 'Docker', 'Git'])
  assert.ok(hasContent(m))
  const all = modelStrings(m).join('\n')
  for (const gone of ['A hidden summary', 'Off the CV', 'CERTS']) assert.ok(!all.includes(gone), gone)
})

test('model (中文): Chinese name order, nickname aside, Chinese joiners and dates', () => {
  const m = buildCvModel(cv('zh'), { lang: 'zh', now: NOW, updatedAt: SAVED, canonical: 'https://lucian-dev.com/cv/zh' })
  assert.equal(m.name, '李彦霈')
  assert.equal(m.nameAside, 'Lucian')
  const edu = m.sections[0]
  if (edu.kind === 'entries') {
    assert.equal(edu.entries[0].subtitle, 'Uni A，Hong Kong')
    assert.equal(edu.entries[0].date, '2026.09 – 预计 2028.12')
  }
  assert.equal(m.updatedLabel, '更新于 2026 年 10 月')
})

test('an empty or fully hidden CV has nothing to download', () => {
  const m = buildCvModel(publicSections([{ sessionName: 'personalInformation', firstName: 'A', lastName: 'B' }], 'cv'), { lang: 'en', now: NOW, canonical: '' })
  assert.equal(hasContent(m), false)
})

test('a CV whose only public content besides the name is papers still has its downloads (CORR-1)', () => {
  const papersOnly = (papers: unknown[]) =>
    buildCvModel(
      publicSections(
        [
          { sessionName: 'personalInformation', firstName: 'A', lastName: 'B' },
          { sessionName: 'publications', headerName: 'Publications', papers },
        ],
        'cv',
      ),
      { lang: 'en', now: NOW, canonical: '' },
    )
  assert.equal(hasContent(papersOnly([{ title: 'A paper', status: 'published', venue: 'J', date: '2025' }])), true)
  assert.equal(hasContent(papersOnly([{ title: 'Under review', status: 'under-review' }])), true, 'any status counts')
  // Papers that do not render (hidden, no status, no title) are not content.
  assert.equal(hasContent(papersOnly([{ title: 'Hidden', status: 'published', isVisible: false }, { title: 'No status', status: '' }, { title: '', status: 'published' }])), false)
})

test('plain text: headings with rules, "- " bullets, full https URLs, footer with the update and the live CV', () => {
  const text = renderCvText(buildCvModel(cv(), { lang: 'en', now: NOW, updatedAt: SAVED, canonical: 'https://lucian-dev.com/cv' }))
  const lines = text.split('\n')
  assert.equal(lines[0], 'Lucian LI, Yanpei')
  assert.ok(lines.includes('Phone: +852 0000 0000 | Email: owner@example.test'))
  assert.ok(lines.includes('https://example.org | https://github.com/example-owner'))
  assert.ok(lines.includes('EDUCATION') && lines.includes('---------'))
  assert.ok(lines.includes('- Built the product') && lines.includes('  - in 6 months'))
  assert.ok(lines.includes('Skills: Python, IoT'))
  assert.ok(lines.includes('Case study: https://lucian-dev.com/work/swcs'))
  assert.ok(lines.includes('Python: Proficient.') && lines.includes('Tools: Docker, Git'))
  assert.ok(lines.includes('- Mandarin: Native'))
  assert.equal(lines[lines.length - 2], 'Updated October 2026 · https://lucian-dev.com/cv')
  assert.ok(text.endsWith('\n') && !text.includes('\r'))
  assert.ok(!text.includes('A hidden summary'))
  assert.equal(displayWidth('教育ab'), 6)
})

test('plain text (中文): Chinese labels and punctuation', () => {
  const text = renderCvText(buildCvModel(cv('zh'), { lang: 'zh', now: NOW, updatedAt: SAVED, canonical: 'https://lucian-dev.com/cv/zh' }))
  assert.ok(text.startsWith('李彦霈 Lucian\n'))
  assert.ok(text.includes('电话：+852 0000 0000 | 邮箱：owner@example.test'))
  assert.ok(text.includes('技能：Python、IoT'))
  assert.ok(text.includes('更新于 2026 年 10 月 · https://lucian-dev.com/cv/zh'))
})

test('JSON Resume 1.0.0: basics, profiles, ISO dates, open ends omitted, languages split, meta', () => {
  const r: any = buildJsonResume(cv(), { lang: 'en', now: NOW, canonical: 'https://lucian-dev.com/cv.json', updatedAt: SAVED })
  assert.equal(r.$schema, JSON_RESUME_SCHEMA)
  assert.deepEqual(r.basics, {
    name: 'Li Yanpei (Lucian)',
    label: 'CTO',
    email: 'owner@example.test',
    phone: '+852 0000 0000',
    url: 'https://example.org',
    location: { address: 'Kowloon, Hong Kong' },
    profiles: [{ network: 'GitHub', username: 'example-owner', url: 'https://github.com/example-owner' }],
  })
  assert.deepEqual(r.work[0], {
    name: 'Startup',
    position: 'CTO',
    url: 'https://startup.example',
    location: 'Hong Kong',
    startDate: '2024-11',
    summary: 'Led the team.',
    highlights: ['Built the product: in 6 months'],
    keywords: ['Python', 'IoT'],
  })
  assert.equal(r.education[0].endDate, '2028-12', 'an expected graduation keeps its date')
  assert.equal(r.education[1].score, '3.6')
  assert.equal(r.projects[0].endDate, undefined, 'a running project has no end date')
  assert.equal(r.projects[0].url, 'https://lucian-dev.com/work/swcs')
  assert.equal(r.projects[0].repository, 'https://github.com/example/swcs')
  assert.deepEqual(r.skills, [{ name: 'Python', level: 'Proficient' }, { name: 'Tools', keywords: ['Docker', 'Git'] }])
  assert.deepEqual(r.languages, [{ language: 'Mandarin', fluency: 'Native' }, { language: 'English', fluency: 'Fluent' }])
  assert.deepEqual(r.meta, { canonical: 'https://lucian-dev.com/cv.json', version: 'v1.0.0', lastModified: '2026-10-13T00:35:19Z' })
  assert.equal(r.certificates, undefined, 'a section off the CV is not exported')
  assert.ok(!JSON.stringify(r).includes('A hidden summary'))
  // Every date matches the schema's iso8601 pattern.
  const dates = JSON.stringify(r).match(/"(startDate|endDate|date|releaseDate)":"[^"]*"/g) || []
  for (const d of dates) assert.match(d.split(':"')[1].slice(0, -1), /^([1-2][0-9]{3}-[0-1][0-9]-[0-3][0-9]|[1-2][0-9]{3}-[0-1][0-9]|[1-2][0-9]{3})$/)
})

test('JSON Resume helpers', () => {
  assert.equal(isoDate('2024-09-01'), '2024-09')
  assert.equal(isoDate('2024'), '2024')
  assert.equal(isoDate('Present'), '')
  assert.equal(isoDate('soon'), '')
  assert.deepEqual(languageOf('普通话：母语'), { language: '普通话', fluency: '母语' })
  assert.deepEqual(languageOf('Esperanto'), { language: 'Esperanto' })
})
