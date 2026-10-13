import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicSections } from '../lib/cvVisibility'
import { buildNowSignals, escapeMarkdownText, signalSources, signalsToMarkdown } from '../lib/nowMarkdown'

/** A CV where the secret role is hidden three different ways. */
const cv = [
  {
    sessionName: 'workExperience',
    experiences: [
      { companyName: 'Visible Labs', jobTitle: 'Software Engineer', startDate: '2025-01', endDate: 'Present', location: 'Tokyo' },
      { companyName: 'Secret Corp', jobTitle: 'Stealth Advisor', startDate: '2025-03', endDate: 'Present', isVisible: false },
      { companyName: 'Hidden Index Inc', jobTitle: 'Ghost Role', startDate: '2025-02', endDate: 'Present' },
      { companyName: 'Past Co', jobTitle: 'Intern', startDate: '2020-01', endDate: '2020-06' },
    ],
    hiddenItems: { experiences: [2] },
  },
  {
    sessionName: 'education',
    educationExperience: [{ schoolName: 'Future University', degree: 'MSc', major: 'Computer Science', startDate: '2027-09', endDate: '2029-06' }],
  },
  { sessionName: 'project', showOnWebsite: false, projects: [{ name: 'Website-hidden project' }] },
]

const posts = [
  { permalink: '/blog/latest-post', frontmatter: { title: 'A post with *stars* and {braces}', description: 'Short <summary>', date: '2026-09-30' } },
]
const work = [{ permalink: '/work/case-study', frontmatter: { title: 'Case study', description: 'What I built', period: '2025 – 2026' } }]

const signals = () =>
  buildNowSignals({
    cvWebsiteEn: publicSections(cv, 'website'),
    manualCoding: { label: 'Building', project: 'Portfolio CMS', note: 'drafts & history' },
    posts,
    work,
    now: '2026-10',
  })

test('hidden CV entries never reach the /now markdown', () => {
  const md = signalsToMarkdown('now', signals())
  assert.ok(md.includes('Visible Labs'))
  assert.ok(!md.includes('Secret Corp'), 'isVisible:false entry')
  assert.ok(!md.includes('Stealth'))
  assert.ok(!md.includes('Hidden Index'), 'hiddenItems entry')
  assert.ok(!md.includes('Website-hidden'), 'section hidden on the website')
  assert.ok(!md.includes('Past Co'), 'past roles are not "now"')
})

test('one H2 per block, bullets, upcoming roles marked, links as absolute site paths', () => {
  const md = signalsToMarkdown('now', signals())
  assert.deepEqual(
    md.split('\n').filter((l) => l.startsWith('## ')),
    ['## Currently', '## Currently coding', '## Latest writing', '## Latest case study'],
  )
  assert.ok(md.includes('- **Software Engineer**, Visible Labs · Tokyo'))
  assert.ok(md.includes('- Next: **MSc, Computer Science**, Future University'))
  assert.ok(md.includes('- Building: **Portfolio CMS** — drafts & history'))
  const links = [...md.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
  assert.deepEqual(links, ['/blog/latest-post', '/work/case-study'])
  assert.ok(links.every((l) => l.startsWith('/') && !l.startsWith('//')))
})

test('text is escaped so it cannot become MDX JSX or an expression', () => {
  const md = signalsToMarkdown('now', signals())
  assert.ok(md.includes('A post with \\*stars\\* and \\{braces\\}'))
  assert.ok(md.includes('Short \\<summary\\>'))
  assert.equal(escapeMarkdownText('a_b [c] `d` | e\nf'), 'a\\_b \\[c\\] \\`d\\` \\| e f')
})

test('no signals → empty markdown and no sources', () => {
  const none = buildNowSignals({ cvWebsiteEn: [], manualCoding: null, posts: [], work: [], now: '2026-10' })
  assert.equal(signalsToMarkdown('now', none), '')
  assert.deepEqual(signalSources({ name: 'now', ...none }), [])
})

test('sources describe each real input', () => {
  const s = signalSources({ name: 'now', ...signals() })
  assert.equal(s.length, 4)
  assert.match(s[0], /public CV \(1 current, 1 upcoming roles\)/)
})

test('/uses markdown: an H2 per stack group with its hint and versioned bullets', () => {
  const md = signalsToMarkdown('uses', {
    groups: [
      { label: 'Framework', hint: 'Rendering and language', items: [{ name: 'Next.js', version: '15.5' }, { name: 'React', version: '18.3' }] },
      { label: 'Empty', hint: '', items: [] },
    ],
  })
  assert.equal(md, '## Framework\n\nRendering and language\n\n- Next.js 15.5\n- React 18.3\n')
})
