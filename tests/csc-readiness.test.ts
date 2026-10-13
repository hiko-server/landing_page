/**
 * E9 — recruiter-readiness checks (lib/cvReadiness.ts): every check on a
 * small fixture, the text heuristics, fingerprints that survive reordering,
 * dismissals stored on the section (and pruned), and the counts the status
 * hub shows.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHECK_SEVERITY,
  fingerprint,
  hasMetric,
  isDismissed,
  partitionFindings,
  readinessSummary,
  runReadinessChecks,
  staleExpected,
  weakOpening,
  withDismissal,
  type ReadinessContext,
  type ReadinessFinding,
} from '../lib/cvReadiness'
import { publicCvDoc } from '../lib/cvVisibility'

const ctx: ReadinessContext = { now: '2026-10' }

const doc = () => ({
  en: [
    { sessionName: 'personalInformation', firstName: 'A', lastName: 'B', email: 'a@example.com', personalWebsite: 'example.com', introduction: 'Engineer who ships.' },
    {
      sessionName: 'workExperience',
      experiences: [
        {
          jobTitle: 'Engineer',
          companyName: 'Acme',
          startDate: '2024-01',
          endDate: '2025-06',
          features: [
            { description: 'Cut p95 latency by 40% for 2M users.' },
            { description: 'Participated in code reviews.' },
            { description: 'Will migrate the billing service to Go.' },
          ],
        },
        { jobTitle: 'Intern', companyName: 'Beta', startDate: '2023-06', endDate: '2023-01', features: [] },
      ],
    },
    {
      sessionName: 'education',
      educationExperience: [{ schoolName: 'Uni', degree: 'BSc candidate', startDate: '2020-09', endDate: '2024-06' }],
    },
    {
      sessionName: 'project',
      projectExperience: [
        { title: 'Carboy', startDate: '2023-01', endDate: '2023-06', description: 'Community app (expected launch 2025-03).', features: [{ description: 'Built the app.' }] },
        { title: 'Ghost', startDate: '2022-01', endDate: '2022-02', caseStudy: 'ghost', features: [{ description: 'Shipped 3 releases.' }] },
        { title: 'Smart Waste Classification System (SWCS)', isVisible: false, startDate: '2024-01', endDate: '2024-05' },
      ],
    },
    { sessionName: 'certification', certifications: [{ issuingOrganization: 'Org', CertificationList: [{ certificationName: 'Cert', credentialID: 'X1' }] }] },
    { sessionName: 'recommendations', items: [{ quote: 'Great', name: 'Pat', permission: false }] },
  ],
  zh: [
    { sessionName: 'personalInformation', firstName: 'A', lastName: 'B', email: 'other@example.com', introduction: '' },
    {
      sessionName: 'workExperience',
      experiences: [
        { jobTitle: '工程师', companyName: 'Acme', startDate: '2024-02', endDate: '2025-06', features: [{ description: '参与代码评审。' }] },
        { jobTitle: '实习', companyName: 'Beta', startDate: '2023-06', endDate: '2023-01', isVisible: false },
      ],
    },
  ],
})

const run = (d = doc(), extra: Partial<ReadinessContext> = {}) =>
  runReadinessChecks(d, {
    ...ctx,
    homeEmail: 'hi@example.org',
    caseStudies: [
      { slug: 'project-carboy', title: 'Carboy' },
      { slug: 'swcs', title: 'Smart Waste Classification System (SWCS)' },
      { slug: 'unlisted', title: 'An unlisted write-up' },
      { slug: 'ghost', title: 'Ghost', draft: true },
    ],
    ...extra,
  })

const find = (fs: ReadinessFinding[], check: string, lang?: string) => fs.filter((f) => f.check === check && (!lang || f.lang === lang))

test('every check fires on its fixture, with the right place to jump to', () => {
  const fs = run()
  // high
  assert.deepEqual(find(fs, 'date-order', 'en')[0].path, [1, 'experiences', 1, 'endDate'])
  const mismatch = find(fs, 'date-mismatch')
  assert.equal(mismatch.length, 1, 'only the aligned, visible entry with a different date')
  assert.match(mismatch[0].title, /EN 2024-01 · 中文 2024-02/)
  assert.equal(find(fs, 'email-mismatch').length, 2, 'EN vs 中文, and CV vs home page')
  assert.ok(find(fs, 'stale-expected').some((f) => /expected launch 2025-03/i.test(f.title)), 'expected date in the past')
  assert.ok(find(fs, 'stale-expected').some((f) => /in progress/.test(f.title)), 'degree still a candidate after it ended')
  assert.equal(find(fs, 'stale-tense', 'en').length, 1)
  assert.match(find(fs, 'case-study-missing')[0].title, /\/work\/ghost, which is a draft/)
  // medium
  assert.equal(find(fs, 'summary-missing', 'zh').length, 1)
  assert.equal(find(fs, 'summary-missing', 'en').length, 0)
  assert.equal(find(fs, 'thin-entry', 'en')[0].crumbs.at(-1), 'Intern')
  const weak = find(fs, 'weak-opening')
  assert.deepEqual(weak.map((f) => `${f.lang}:${f.title}`).sort(), ['en:Opens with “Participated in” and states no result', 'zh:Opens with “参与” and states no result'])
  assert.equal(find(fs, 'missing-date', 'en').filter((f) => f.path?.includes('issuedDate')).length, 1)
  // low
  assert.ok(find(fs, 'missing-link').some((f) => /credential ID but no link/.test(f.title)))
  assert.ok(find(fs, 'missing-link').some((f) => /matches the case study “Carboy”/.test(f.title)))
  assert.ok(find(fs, 'missing-link').some((f) => f.lang === 'zh' && /website/.test(f.title)))
  assert.deepEqual(find(fs, 'case-study-unlisted', 'en').map((f) => f.title), ['The case study “An unlisted write-up” is not on the EN CV'])
  assert.match(find(fs, 'hidden-referenced')[0].title, /hidden on the CV, but \/work\/swcs is published/)
  assert.match(find(fs, 'no-permission')[0].title, /from Pat is not shown/)
  // Hidden entries are not judged (the zh intern's bad dates).
  assert.equal(find(fs, 'date-order', 'zh').length, 0)
  // Severity ordering.
  const order = fs.map((f) => ['high', 'medium', 'low'].indexOf(f.severity))
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  for (const f of fs) assert.equal(f.severity, CHECK_SEVERITY[f.check])
})

test('few measurable results and an over-long A4 are reported once per language', () => {
  const d = doc()
  d.en[1] = {
    sessionName: 'workExperience',
    experiences: [{ jobTitle: 'Dev', companyName: 'C', startDate: '2024-01', endDate: 'Present', features: ['Built A.', 'Built B.', 'Built C.', 'Built D.', 'Grew revenue 20%.'].map((description) => ({ description })) }],
  } as never
  const fs = run(d, { pages: { en: 3, zh: 1 } })
  const low = find(fs, 'low-quantified', 'en')
  assert.equal(low.length, 1)
  assert.match(low[0].title, /^1 of 7 EN highlights/)
  assert.deepEqual(find(fs, 'too-long').map((f) => `${f.lang}:${f.title}:${f.path}`), ['en:The EN CV runs to 3 pages:null'])
})

test('text heuristics: weak openings, measurable results, stale "expected"', () => {
  assert.equal(weakOpening('Participated in on-site learning.'), 'Participated in')
  assert.equal(weakOpening('- Responsible for the API'), 'Responsible for')
  assert.equal(weakOpening('Gained practical experience in React'), 'Gained … experience')
  assert.equal(weakOpening('Gained 30% market share'), '', '"gained" with a result is not weak')
  assert.equal(weakOpening('获得全栈 Web 开发实践经验'), '获得 … 经验')
  assert.equal(weakOpening('获得来自 HKBU 的 HK$30,000 资金支持'), '', 'secured funding is an achievement')
  assert.equal(weakOpening('负责后端开发'), '负责')
  assert.equal(weakOpening('Led a team of 4'), '')
  for (const yes of ['Cut latency by 40%', 'Raised HK$30,000', 'Served 2M users', '18th worldwide', 'Top 5% intern', '3x faster', 'Saved 6 hours a week', '提升 30%', '服务 2000 名用户', '全球第18名', '前5%']) {
    assert.equal(hasMetric(yes), true, yes)
  }
  for (const no of ['Built with Next.js 13', 'Bluetooth 5.2 stack', 'IEEE Xtreme 19.0', 'Python 3 scripts', '使用 Next.js 13 开发']) assert.equal(hasMetric(no), false, no)
  assert.equal(staleExpected('MSc (Expected 2025)', '2026-10'), 'Expected 2025')
  assert.equal(staleExpected('MSc (Expected Jun 2027)', '2026-10'), '')
  assert.equal(staleExpected('expected 2026-09', '2026-10'), 'expected 2026-09')
  assert.equal(staleExpected('预计2025年6月毕业', '2026-10'), '预计2025年6')
  assert.equal(staleExpected('No date here', '2026-10'), '')
})

test('fingerprints follow content, not positions; dismissals live on the section and are pruned', () => {
  const d = doc()
  const fs = run(d)
  const weak = find(fs, 'weak-opening', 'en')[0]
  assert.equal(weak.id, `weak-opening:en:${fingerprint(`workExperience:Participated in code reviews.`)}`)
  // Reordering the highlights keeps the id.
  const reordered = doc()
  ;(reordered.en[1] as any).experiences[0].features.reverse()
  assert.ok(run(reordered).some((f) => f.id === weak.id))

  const live = new Set(fs.map((f) => f.id))
  const dismissed = withDismissal(d as any, weak, true, live)
  assert.deepEqual((dismissed.en[weak.sectionIdx] as any).readinessDismissed, [weak.id])
  assert.equal(d.en[weak.sectionIdx].hasOwnProperty('readinessDismissed'), false, 'immutable')
  assert.equal(isDismissed(dismissed, weak), true)
  const { open, dismissed: gone } = partitionFindings(dismissed, run(dismissed))
  assert.ok(gone.some((f) => f.id === weak.id))
  assert.ok(!open.some((f) => f.id === weak.id))
  assert.deepEqual(readinessSummary(dismissed, run(dismissed)).dismissed, 1)
  // Editing the bullet makes it a new finding.
  const edited = JSON.parse(JSON.stringify(dismissed))
  edited.en[1].experiences[0].features[1].description = 'Participated in design reviews.'
  assert.ok(partitionFindings(edited, run(edited)).open.some((f) => f.check === 'weak-opening' && f.lang === 'en'))
  // Restore removes it; stale fingerprints are pruned on the next change.
  const withStale = withDismissal(dismissed as any, { ...weak, id: 'gone:en:00000000' } as ReadinessFinding, true)
  const restored = withDismissal(withStale, weak, false, live)
  assert.equal('readinessDismissed' in (restored.en[weak.sectionIdx] as any), false)
  // The dismissed list never reaches a public view.
  assert.ok(!JSON.stringify(publicCvDoc(dismissed, 'any')).includes('readinessDismissed'))
})

test('a clean CV has nothing to flag; an empty one too', () => {
  const clean = {
    en: [
      { sessionName: 'personalInformation', email: 'a@example.com', personalWebsite: 'example.com', introduction: 'Hi.' },
      { sessionName: 'workExperience', experiences: [{ jobTitle: 'Dev', companyName: 'C', startDate: '2024-01', endDate: 'Present', features: [{ description: 'Cut costs 20%.' }] }] },
    ],
    zh: [],
  }
  assert.deepEqual(runReadinessChecks(clean, { now: '2026-10', homeEmail: 'A@example.com', caseStudies: [] }), [])
  assert.deepEqual(runReadinessChecks({ en: [], zh: [] }, ctx), [])
  assert.deepEqual(runReadinessChecks({} as never, ctx), [])
})
