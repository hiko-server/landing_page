/**
 * cv-docs E3: evidence links on the CV and in the vCard (lib/cvLinks.ts,
 * lib/vcard.ts) — GitHub / LinkedIn in the header (the CV's own value, else
 * Home → Socials, nothing for a hidden field, never WhatsApp), and the case
 * study / live / code links under projects (published case studies only,
 * never a draft slug), every href safe.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicSections } from '../lib/cvVisibility'
import { allEvidenceLinks, profileLinks, projectLinks, webHref, withEvidenceLinks, type CvWork } from '../lib/cvLinks'
import { buildVcard } from '../lib/vcard'
import { CV_SECTIONS } from '../lib/cvSections'

const socials = {
  github: 'https://github.com/example-owner',
  linkedin: 'https://www.linkedin.com/in/example-owner/',
  whatsapp: 'https://wa.me/85200000000',
}

const works: CvWork[] = [
  { slug: 'swcs', title: 'Smart Waste Classification System (SWCS)', link: 'https://swcs.example.org', repo: 'https://github.com/example/swcs' },
  { slug: 'carboy', title: 'Carboy' },
]

const pi = (extra: Record<string, unknown> = {}) => ({ sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li', personalWebsite: 'example.org', ...extra })
const projects = (items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({ sessionName: 'project', projectExperience: items, ...extra })

test('the registry offers GitHub / LinkedIn on Personal Info and live / repo URLs on projects (hideable, so the Studio edits them)', () => {
  const info = CV_SECTIONS.find((s) => s.sessionName === 'personalInformation')!
  for (const key of ['github', 'linkedin']) {
    const f = info.fields!.find((x) => x.key === key)
    assert.ok(f, key)
    assert.equal(f!.kind, 'url')
    assert.notEqual(f!.hideable, false)
  }
  const list = CV_SECTIONS.find((s) => s.sessionName === 'project')!.lists![0]
  for (const key of ['caseStudy', 'url', 'repo']) assert.ok(list.fields.find((f) => f.key === key), key)
  const blank = list.blank()
  assert.equal(blank.url, '')
  assert.equal(blank.repo, '')
})

test('profiles: the CV value wins, Home → Socials fills the gap, WhatsApp never appears', () => {
  const [own] = withEvidenceLinks(publicSections([pi({ github: 'https://github.com/own-handle' })], 'cv'), { socials })
  assert.deepEqual(
    profileLinks(own).map((p) => [p.label, p.href, p.text]),
    [
      ['GitHub', 'https://github.com/own-handle', 'github.com/own-handle'],
      ['LinkedIn', 'https://www.linkedin.com/in/example-owner/', 'linkedin.com/in/example-owner'],
    ],
  )
  assert.ok(!JSON.stringify(own).includes('wa.me'), 'no WhatsApp on the CV')
})

test('profiles: a hidden field stays empty — the Home link is not used for it', () => {
  const [hidden] = withEvidenceLinks(publicSections([pi({ github: 'https://github.com/own-handle', hiddenFields: ['github'] })], 'cv'), { socials })
  assert.deepEqual(profileLinks(hidden).map((p) => p.label), ['LinkedIn'])
  assert.ok(!JSON.stringify(hidden).includes('github.com'), 'neither the hidden value nor the fallback')
  const [hiddenEmpty] = withEvidenceLinks(publicSections([pi({ hiddenFields: ['linkedin'] })], 'cv'), { socials })
  assert.deepEqual(profileLinks(hiddenEmpty).map((p) => p.label), ['GitHub'])
})

test('profiles: unsafe or non-web URLs are dropped', () => {
  const [unsafe] = withEvidenceLinks(publicSections([pi({ github: 'javascript:alert(1)', linkedin: 'mailto:a@b.c' })], 'cv'), {
    socials: { github: 'data:text/html,x', linkedin: '//evil.example' },
  })
  assert.deepEqual(profileLinks(unsafe), [])
  assert.equal(webHref('github.com/x'), 'https://github.com/x')
  assert.equal(webHref('/work/x'), '')
})

test('projects: published case study by slug or strict title, its live / repo links as fallbacks', () => {
  const [section] = withEvidenceLinks(
    publicSections(
      [
        projects([
          { title: 'Edge sorter', caseStudy: 'swcs' },
          { title: 'Carboy', url: 'https://carboy.example.org' },
          { title: 'Unrelated thing' },
          { title: 'Draft one', caseStudy: 'not-published-draft' },
        ]),
      ],
      'cv',
    ),
    { works },
  )
  const rows = (section as any).projectExperience
  assert.equal(rows[0].caseStudy, 'swcs')
  assert.deepEqual(
    projectLinks(rows[0], 'en').map((l) => [l.kind, l.label, l.href, l.path ?? '']),
    [
      ['caseStudy', 'Case study', 'https://lucian-dev.com/work/swcs', '/work/swcs'],
      ['live', 'Live', 'https://swcs.example.org', ''],
      ['repo', 'Code', 'https://github.com/example/swcs', ''],
    ],
  )
  // Strict title match ("Carboy"), the CV's own live URL wins.
  assert.equal(rows[1].caseStudy, 'carboy')
  assert.deepEqual(projectLinks(rows[1], 'zh').map((l) => [l.label, l.href]), [
    ['案例', 'https://lucian-dev.com/work/carboy'],
    ['线上', 'https://carboy.example.org'],
  ])
  assert.deepEqual(projectLinks(rows[2], 'en'), [])
  assert.equal(rows[3].caseStudy, '', 'a draft (unpublished) slug never reaches the public payload')
})

test('projects: hidden caseStudy / url / repo fields stay empty, no fallback', () => {
  const [section] = withEvidenceLinks(
    publicSections([projects([{ title: 'Edge sorter', caseStudy: 'swcs', url: 'https://own.example.org', hiddenFields: ['caseStudy', 'url'] }])], 'cv'),
    { works },
  )
  const row = (section as any).projectExperience[0]
  assert.equal(row.caseStudy, '')
  assert.equal(row.url, '')
  // The case study is hidden, so nothing falls back to it either.
  assert.equal(row.repo, '')
  assert.deepEqual(projectLinks(row, 'en'), [])
  assert.ok(!JSON.stringify(section).includes('own.example.org'))
})

test('inputs are never mutated; other sections pass through', () => {
  const input = [pi(), projects([{ title: 'Edge sorter', caseStudy: 'swcs' }]), { sessionName: 'skill', languages: [] }]
  const before = JSON.stringify(input)
  const out = withEvidenceLinks(input, { works, socials })
  assert.equal(JSON.stringify(input), before)
  assert.equal(out[2], input[2])
  assert.equal(allEvidenceLinks(out).length, 2 + 3)
})

test('vCard: GitHub / LinkedIn as RFC 9554 SOCIALPROFILE plus the X-SOCIALPROFILE twin; only https URLs', () => {
  const card = buildVcard(pi(), null, {
    profiles: [
      { label: 'GitHub', href: 'https://github.com/example-owner' },
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/example-owner/' },
      { label: 'Evil', href: 'javascript:alert(1)' },
      { label: 'Plain', href: 'http://insecure.example' },
    ],
  })
  const lines = card.replace(/\r\n /g, '').split('\r\n')
  assert.ok(lines.includes('SOCIALPROFILE;SERVICE-TYPE=GitHub:https://github.com/example-owner'))
  assert.ok(lines.includes('X-SOCIALPROFILE;TYPE=github:https://github.com/example-owner'))
  assert.ok(lines.includes('SOCIALPROFILE;SERVICE-TYPE=LinkedIn:https://www.linkedin.com/in/example-owner/'))
  assert.ok(!card.includes('javascript:') && !card.includes('insecure.example'))
  assert.equal(lines.filter((l) => l.startsWith('SOCIALPROFILE')).length, 2)
})
